import {
  AthleteProfile,
  ExerciseDefinition,
  Mesocycle,
  MesoTemplate,
  MuscleGroup,
  MusclePriority,
  PainEvent,
  SessionExercise,
  SetLog,
  WorkoutSession,
} from '../types/models';
import { buildDeloadSession } from './deload';
import { assessExerciseSafety, recommendJointFriendlySwaps } from './injuryAdvisor';
import { calculateNextExercisePrescription, generateWarmupSets } from './progression';
import { getAgeAdjustedRepRange, getWeekTargetRir, isDeloadWeek } from './rirAndMeso';

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface CreateMesoOptions {
  name?: string;
  totalWeeks?: number;
  musclePriorities?: Partial<Record<MuscleGroup, MusclePriority>>;
}

/**
 * Generates a brand-new Mesocycle (Week 1 sessions) from a template, automatically
 * adapting rep ranges for age tier and auto-swapping any 'avoid' or unavailable-equipment
 * exercises to the highest-SFR joint-friendly alternative.
 */
export function createMesocycleFromTemplate(
  template: MesoTemplate,
  options: CreateMesoOptions,
  allExercises: ExerciseDefinition[],
  profile: AthleteProfile,
  painHistory: PainEvent[] = []
): Mesocycle {
  const byId = new Map(allExercises.map((e) => [e.id, e]));
  const totalWeeks = Math.max(4, Math.min(8, options.totalWeeks ?? template.recommendedWeeks));
  const mesoId = makeId('meso');
  const week1Rir = getWeekTargetRir(1, totalWeeks, profile);
  const priorities = { ...template.defaultPriorities, ...(options.musclePriorities ?? {}) };

  const sessions: WorkoutSession[] = template.days.map((day, dayIndex) => {
    const exercises: SessionExercise[] = [];

    for (const slot of day.slots) {
      const originalDef = byId.get(slot.exerciseId);
      if (!originalDef) continue;

      let chosenDef = originalDef;
      let swappedFromId: string | undefined;
      let swapReason: string | undefined;

      const originalSafety = assessExerciseSafety(originalDef, profile, painHistory);
      const hasEquipment = profile.equipment.includes(originalDef.equipment);

      if (originalSafety.level === 'avoid' || !hasEquipment) {
        const swaps = recommendJointFriendlySwaps(
          originalDef,
          allExercises,
          profile,
          originalSafety.affectedJoints[0],
          1,
          painHistory
        );
        if (swaps[0]) {
          chosenDef = swaps[0].exercise;
          swappedFromId = originalDef.id;
          swapReason = !hasEquipment
            ? `Auto-swapped for equipment (${originalDef.name} → ${chosenDef.name}).`
            : `Joint guard auto-swapped ${originalDef.name} → ${chosenDef.name} (${swaps[0].rationale}).`;
        }
      }

      const chosenSafety = assessExerciseSafety(chosenDef, profile, painHistory);
      const baseRange = slot.repRange ?? chosenDef.defaultRepRange;
      const adjRange = getAgeAdjustedRepRange(baseRange, profile.ageTier, chosenSafety.level);
      const increment =
        profile.unit === 'lb' ? chosenDef.defaultIncrementLb : chosenDef.defaultIncrementKg;

      const sets: SetLog[] = Array.from({ length: slot.sets }, (_, idx) => ({
        id: makeId('set'),
        setNumber: idx + 1,
        side: chosenDef.unilateral ? 'both' : 'both',
        targetWeight: 0,
        targetRepsMin: adjRange.min,
        targetRepsMax: adjRange.max,
        targetRir: week1Rir,
        weight: null,
        reps: null,
        rir: null,
        painScore: 0,
        completed: false,
      }));

      exercises.push({
        id: makeId('ex'),
        exerciseId: chosenDef.id,
        muscle: slot.muscle,
        progressionType: slot.progressionType,
        targetMinReps: adjRange.min,
        targetMaxReps: adjRange.max,
        increment,
        startNumSets: slot.sets,
        numSets: slot.sets,
        lastWeight: null,
        weightIncreasedThisWeek: false,
        sets,
        swappedFromId,
        swapReason,
        eccentricOverride: chosenSafety.level !== 'safe' ? chosenSafety.tempoCue : undefined,
        coachNote:
          swapReason ??
          (chosenSafety.reasons[0] || `Week 1 baseline: find comfortable weight for ${adjRange.min}-${adjRange.max} reps @ ${week1Rir} RIR.`),
      });
    }

    return {
      id: makeId('sess'),
      mesoId,
      weekNumber: 1,
      dayIndex,
      dayName: day.dayName,
      isDeload: false,
      isRecoverySession: false,
      targetRir: week1Rir,
      status: 'planned',
      exercises,
      feedback: {},
    };
  });

  return {
    id: mesoId,
    name: options.name?.trim() || template.name,
    templateId: template.id,
    totalWeeks,
    currentWeek: 1,
    createdAt: new Date().toISOString(),
    status: 'active',
    musclePriorities: priorities,
    sessions,
  };
}

/**
 * Generates the next week of sessions (accumulation or scheduled deload)
 * from the current week's completed workouts and feedback ratings.
 */
export function advanceToNextWeek(
  meso: Mesocycle,
  allExercises: ExerciseDefinition[],
  profile: AthleteProfile,
  forceDeload = false
): Mesocycle {
  const byId = new Map(allExercises.map((e) => [e.id, e]));
  const nextWeek = forceDeload ? meso.totalWeeks : Math.min(meso.totalWeeks, meso.currentWeek + 1);
  const deload = forceDeload || isDeloadWeek(nextWeek, meso.totalWeeks);
  const nextTargetRir = getWeekTargetRir(nextWeek, meso.totalWeeks, profile);

  // Grab the latest session per dayIndex from the current week (or latest prior week)
  const latestByDay = new Map<number, WorkoutSession>();
  for (const sess of meso.sessions) {
    if (sess.weekNumber <= meso.currentWeek) {
      const prev = latestByDay.get(sess.dayIndex);
      if (!prev || sess.weekNumber > prev.weekNumber) {
        latestByDay.set(sess.dayIndex, sess);
      }
    }
  }

  const refSessions = Array.from(latestByDay.values()).sort((a, b) => a.dayIndex - b.dayIndex);

  const newWeekSessions: WorkoutSession[] = refSessions.map((refSession) => {
    if (deload) {
      return buildDeloadSession(refSession, profile, meso, allExercises);
    }

    const exercises: SessionExercise[] = refSession.exercises.map((prevEx) => {
      const def = byId.get(prevEx.exerciseId);
      const fb = refSession.feedback[prevEx.muscle];
      const prescription = calculateNextExercisePrescription(
        prevEx,
        fb,
        nextTargetRir,
        profile,
        def
      );

      const warmups =
        def && prescription.targetWeight > 0
          ? generateWarmupSets(prescription.targetWeight, prevEx.increment, def, profile)
          : [];

      const workingSets: SetLog[] = Array.from({ length: prescription.numSets }, (_, idx) => ({
        id: makeId('set'),
        setNumber: idx + 1,
        side: def?.unilateral ? 'both' : 'both',
        targetWeight: prescription.targetWeight,
        targetRepsMin: prescription.targetMinReps,
        targetRepsMax: prescription.targetMaxReps,
        targetRir: nextTargetRir,
        weight: prescription.targetWeight > 0 ? prescription.targetWeight : null,
        reps: null,
        rir: null,
        painScore: 0,
        completed: false,
      }));

      return {
        ...prevEx,
        id: makeId('ex'),
        targetMinReps: prescription.targetMinReps,
        targetMaxReps: prescription.targetMaxReps,
        numSets: prescription.numSets,
        lastWeight: prescription.targetWeight > 0 ? prescription.targetWeight : prevEx.lastWeight,
        weightIncreasedThisWeek: prescription.weightIncreasedThisWeek,
        sets: [...warmups, ...workingSets],
        eccentricOverride: prescription.eccentricOverride,
        coachNote: prescription.coachNote,
      };
    });

    return {
      id: makeId('sess'),
      mesoId: meso.id,
      weekNumber: nextWeek,
      dayIndex: refSession.dayIndex,
      dayName: refSession.dayName.replace(/\s*\(Deload\)$/, ''),
      isDeload: false,
      isRecoverySession: false,
      targetRir: nextTargetRir,
      status: 'planned',
      exercises,
      feedback: {},
    };
  });

  return {
    ...meso,
    currentWeek: nextWeek,
    sessions: [...meso.sessions, ...newWeekSessions],
  };
}
