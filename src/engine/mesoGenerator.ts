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
import { getMaxSessionSetsPerMuscle, getMaxSetsPerExercise } from './landmarks';
import {
  calculateNextExercisePrescription,
  generateWarmupSets,
  NextExercisePrescription,
} from './progression';
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

  if (deload) {
    const deloadSessions = refSessions.map((refSession) =>
      buildDeloadSession(refSession, profile, meso, allExercises)
    );
    return {
      ...meso,
      currentWeek: nextWeek,
      sessions: [...meso.sessions, ...deloadSessions],
    };
  }

  const maxSessionSets = getMaxSessionSetsPerMuscle(profile);
  const maxPerEx = getMaxSetsPerExercise(profile);

  interface DraftSlot {
    sessionIdx: number;
    exIdx: number;
    prevEx: SessionExercise;
    def: ExerciseDefinition | undefined;
    prescription: NextExercisePrescription;
    safetyScore: number;
  }

  // Latest feedback per muscle across the week's sessions determines weekly sets budget
  const muscleBudget = new Map<MuscleGroup, number>();
  for (const sess of refSessions) {
    for (const [muscleKey, fb] of Object.entries(sess.feedback)) {
      if (fb) {
        muscleBudget.set(muscleKey as MuscleGroup, fb.setsModifier);
      }
    }
  }

  // First pass: calculate baseline weight/rep progressions & pain guardrails without multiplying weekly setsModifier
  const draftsBySession: DraftSlot[][] = refSessions.map((refSession, sessionIdx) =>
    refSession.exercises.map((prevEx, exIdx) => {
      const def = byId.get(prevEx.exerciseId);
      const fb = refSession.feedback[prevEx.muscle];
      const neutralFb = fb ? { ...fb, setsModifier: 0 } : undefined;
      const prescription = calculateNextExercisePrescription(
        prevEx,
        neutralFb,
        nextTargetRir,
        profile,
        def
      );
      const painReduction = Math.max(0, prevEx.numSets - prescription.numSets);
      if (painReduction > 0) {
        const curBudget = muscleBudget.get(prevEx.muscle) ?? 0;
        if (curBudget < 0) {
          muscleBudget.set(prevEx.muscle, Math.min(0, curBudget + painReduction));
        }
      }
      const safety = def ? assessExerciseSafety(def, profile) : undefined;
      return {
        sessionIdx,
        exIdx,
        prevEx,
        def,
        prescription,
        safetyScore: safety?.score ?? 80,
      };
    })
  );

  // Enforce per-session junk-volume cap per muscle before distributing weekly feedback budget
  for (const sessionDrafts of draftsBySession) {
    const byMuscle = new Map<MuscleGroup, DraftSlot[]>();
    for (const slot of sessionDrafts) {
      const list = byMuscle.get(slot.prevEx.muscle) ?? [];
      list.push(slot);
      byMuscle.set(slot.prevEx.muscle, list);
    }
    for (const [, slots] of byMuscle) {
      let sum = slots.reduce((acc, s) => acc + s.prescription.numSets, 0);
      if (sum > maxSessionSets) {
        const trimOrder = [...slots].sort(
          (a, b) => (a.def?.sfrScore ?? 8) - (b.def?.sfrScore ?? 8)
        );
        while (sum > maxSessionSets) {
          const target = trimOrder.find((s) => s.prescription.numSets > 1);
          if (!target) break;
          target.prescription.numSets -= 1;
          sum -= 1;
        }
      }
    }
  }

  const getSessionMuscleSets = (sessionIdx: number, muscle: MuscleGroup): number =>
    draftsBySession[sessionIdx]
      .filter((s) => s.prevEx.muscle === muscle)
      .reduce((acc, s) => acc + s.prescription.numSets, 0);

  // Second pass: distribute each muscle's weekly setsModifier budget once across the week
  const allDrafts = draftsBySession.flat();
  for (const [muscle, initialBudget] of muscleBudget.entries()) {
    let budget = initialBudget;
    const muscleSlots = allDrafts.filter((s) => s.prevEx.muscle === muscle);

    if (budget > 0) {
      let addedAny = false;
      while (budget > 0) {
        const eligible = muscleSlots
          .filter(
            (s) =>
              !s.prescription.weightIncreasedThisWeek &&
              s.prescription.numSets < maxPerEx &&
              getSessionMuscleSets(s.sessionIdx, muscle) < maxSessionSets
          )
          .sort((a, b) => {
            const sfrDiff = (b.def?.sfrScore ?? 8) - (a.def?.sfrScore ?? 8);
            if (Math.abs(sfrDiff) > 0.01) return sfrDiff;
            return a.prescription.numSets - b.prescription.numSets;
          });

        if (eligible.length === 0) break;
        const best = eligible[0];
        best.prescription.numSets += 1;
        best.prescription.coachNote +=
          ' Added +1 set from recovery feedback (prioritized highest-SFR movement).';
        addedAny = true;
        budget -= 1;
      }

      if (!addedAny && muscleSlots.some((s) => s.prescription.weightIncreasedThisWeek)) {
        const bumped = muscleSlots.find((s) => s.prescription.weightIncreasedThisWeek);
        if (bumped) {
          bumped.prescription.coachNote +=
            ' Volume addition deferred because weight bumped this week.';
        }
      }
    } else if (budget < 0) {
      while (budget < 0) {
        const trimmable = muscleSlots
          .filter((s) => s.prescription.numSets > 1)
          .sort((a, b) => {
            const safetyDiff = a.safetyScore - b.safetyScore;
            if (safetyDiff !== 0) return safetyDiff;
            return (a.def?.sfrScore ?? 8) - (b.def?.sfrScore ?? 8);
          });

        if (trimmable.length === 0) break;
        const target = trimmable[0];
        target.prescription.numSets -= 1;
        target.prescription.coachNote +=
          ' Trimmed 1 set from workload/recovery feedback.';
        budget += 1;
      }
    }
  }

  // Third pass: materialize next week's sessions
  const newWeekSessions: WorkoutSession[] = refSessions.map((refSession, sessionIdx) => {
    const exercises: SessionExercise[] = draftsBySession[sessionIdx].map(
      ({ prevEx, def, prescription }) => {
        const warmups =
          def && prescription.targetWeight > 0
            ? generateWarmupSets(prescription.targetWeight, prevEx.increment, def, profile)
            : [];

        const workingSets: SetLog[] = Array.from(
          { length: prescription.numSets },
          (_, idx) => ({
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
          })
        );

        return {
          ...prevEx,
          id: makeId('ex'),
          targetMinReps: prescription.targetMinReps,
          targetMaxReps: prescription.targetMaxReps,
          numSets: prescription.numSets,
          lastWeight:
            prescription.targetWeight > 0 ? prescription.targetWeight : prevEx.lastWeight,
          weightIncreasedThisWeek: prescription.weightIncreasedThisWeek,
          sets: [...warmups, ...workingSets],
          eccentricOverride: prescription.eccentricOverride,
          coachNote: prescription.coachNote,
        };
      }
    );

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
