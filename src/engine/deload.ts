import {
  AthleteProfile,
  ExerciseDefinition,
  Mesocycle,
  MesoTemplate,
  SessionExercise,
  SetLog,
  WorkoutSession,
} from '../types/models';
import { getAgeAdjustedRepRange, getWeekTargetRir } from './rirAndMeso';
import { assessExerciseSafety, recommendJointFriendlySwaps } from './injuryAdvisor';
import { generateWarmupSets, roundToIncrement } from './progression';

function makeId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function createWorkingSetsForPrescription(
  numSets: number,
  targetWeight: number,
  minReps: number,
  maxReps: number,
  targetRir: number,
  unilateral: boolean
): SetLog[] {
  const sets: SetLog[] = [];
  for (let i = 0; i < numSets; i++) {
    sets.push({
      id: makeId('set'),
      setNumber: i + 1,
      side: unilateral ? 'both' : 'both',
      targetWeight,
      targetRepsMin: minReps,
      targetRepsMax: maxReps,
      targetRir,
      weight: targetWeight > 0 ? targetWeight : null,
      reps: null,
      rir: null,
      painScore: 0,
      completed: false,
    });
  }
  return sets;
}

/**
 * Generates a structured Deload session from the latest reference session using
 * Liftosaur v4.1 / RP deload ratios (weightRatio, repsRatio, setsRatio, dropLowPriority).
 */
export function buildDeloadSession(
  referenceSession: WorkoutSession,
  profile: AthleteProfile,
  meso: Pick<Mesocycle, 'id' | 'totalWeeks' | 'musclePriorities'>,
  allExercises: ExerciseDefinition[]
): WorkoutSession {
  const { weightRatio, repsRatio, setsRatio, dropLowPriority } = profile.deloadConfig;
  const byId = new Map(allExercises.map((e) => [e.id, e]));

  let filteredExercises = referenceSession.exercises;
  if (dropLowPriority) {
    const kept = referenceSession.exercises.filter(
      (ex) => meso.musclePriorities[ex.muscle] !== 'low'
    );
    if (kept.length >= 2) {
      filteredExercises = kept;
    }
  }

  const deloadExercises: SessionExercise[] = filteredExercises.map((ex) => {
    const def = byId.get(ex.exerciseId);
    const completedWorking = ex.sets.filter((s) => !s.isWarmup && !s.isDownSet && s.completed);
    const baseWeight =
      completedWorking[0]?.weight ??
      ex.lastWeight ??
      ex.sets.find((s) => !s.isWarmup)?.targetWeight ??
      0;

    const deloadWeight = roundToIncrement(baseWeight * weightRatio, ex.increment);
    const deloadSets = Math.max(1, Math.round(ex.numSets * setsRatio));
    const deloadMinReps = Math.max(5, Math.round(ex.targetMinReps * repsRatio));
    const deloadMaxReps = Math.max(deloadMinReps + 2, Math.round(ex.targetMaxReps * repsRatio));

    const working = createWorkingSetsForPrescription(
      deloadSets,
      deloadWeight,
      deloadMinReps,
      deloadMaxReps,
      4,
      def?.unilateral ?? false
    );

    const warmups =
      def && deloadWeight > 0
        ? generateWarmupSets(deloadWeight, ex.increment, def, {
            ...profile,
            includeWarmups: false, // Deload loads are already light
          })
        : [];

    return {
      ...ex,
      id: makeId('ex'),
      targetMinReps: deloadMinReps,
      targetMaxReps: deloadMaxReps,
      numSets: deloadSets,
      weightIncreasedThisWeek: false,
      sets: [...warmups, ...working],
      coachNote: `Deload (${Math.round(weightRatio * 100)}% load, ${Math.round(setsRatio * 100)}% sets @ 4 RIR) — focus on smooth movement & recovery.`,
    };
  });

  return {
    id: makeId('sess'),
    mesoId: meso.id,
    weekNumber: meso.totalWeeks,
    dayIndex: referenceSession.dayIndex,
    dayName: `${referenceSession.dayName} (Deload)`,
    isDeload: true,
    isRecoverySession: false,
    targetRir: 4,
    status: 'planned',
    exercises: deloadExercises,
    feedback: {},
  };
}

/**
 * Converts a session into a Liftosaur v4.1 Recovery Session on demand:
 * 50% sets, 70% working weight, 4 RIR.
 */
export function buildRecoverySession(
  session: WorkoutSession,
  allExercises: ExerciseDefinition[]
): WorkoutSession {
  const byId = new Map(allExercises.map((e) => [e.id, e]));

  const updatedExercises: SessionExercise[] = session.exercises.map((ex) => {
    const def = byId.get(ex.exerciseId);
    const baseWeight =
      ex.lastWeight ?? ex.sets.find((s) => !s.isWarmup)?.targetWeight ?? 0;
    const recoveryWeight = roundToIncrement(baseWeight * 0.7, ex.increment);
    const recoverySetsCount = Math.max(1, Math.round(ex.numSets * 0.5));
    const working = createWorkingSetsForPrescription(
      recoverySetsCount,
      recoveryWeight,
      ex.targetMinReps,
      ex.targetMaxReps,
      4,
      def?.unilateral ?? false
    );

    return {
      ...ex,
      numSets: recoverySetsCount,
      sets: working,
      coachNote: 'Recovery Session: 70% load, 50% sets, crisp technique at 4 RIR.',
    };
  });

  return {
    ...session,
    isRecoverySession: true,
    targetRir: 4,
    status: 'in_progress',
    exercises: updatedExercises,
  };
}

/**
 * Generates a fresh Mesocycle seeded from a completed Mesocycle:
 * - Preserves user's chosen joint-friendly exercise swaps per dayIndex/slot.
 * - Seeds Week 1 starting weights at 87.5% of peak accumulation working weights
 *   so Week 1 naturally lands around 3 RIR.
 */
export function generateNextMesocycle(
  completedMeso: Mesocycle,
  template: MesoTemplate,
  allExercises: ExerciseDefinition[],
  profile: AthleteProfile
): Mesocycle {
  const byId = new Map(allExercises.map((e) => [e.id, e]));

  // Find peak accumulation weight achieved per exerciseId
  const peakWeights = new Map<string, number>();
  for (const sess of completedMeso.sessions) {
    if (sess.isDeload || sess.isRecoverySession) continue;
    for (const ex of sess.exercises) {
      for (const set of ex.sets) {
        if (set.isWarmup || set.isDownSet || !set.completed) continue;
        if (set.weight !== null && set.weight > 0) {
          const prevPeak = peakWeights.get(ex.exerciseId) ?? 0;
          if (set.weight > prevPeak) {
            peakWeights.set(ex.exerciseId, set.weight);
          }
        }
      }
    }
  }

  // Extract latest exercise lineup per dayIndex from last accumulation week
  const latestByDay = new Map<number, WorkoutSession>();
  for (const sess of completedMeso.sessions) {
    if (sess.isDeload) continue;
    const prev = latestByDay.get(sess.dayIndex);
    if (!prev || sess.weekNumber > prev.weekNumber) {
      latestByDay.set(sess.dayIndex, sess);
    }
  }

  const mesoId = makeId('meso');
  const week1Rir = getWeekTargetRir(1, completedMeso.totalWeeks, profile);

  const daySessions: WorkoutSession[] = Array.from(latestByDay.values())
    .sort((a, b) => a.dayIndex - b.dayIndex)
    .map((refSess) => {
      const exercises: SessionExercise[] = refSess.exercises.map((prevEx) => {
        let def = byId.get(prevEx.exerciseId);
        let swappedFromId: string | undefined;
        let swapReason: string | undefined;

        if (def) {
          const safety = assessExerciseSafety(def, profile);
          if (safety.level === 'avoid') {
            const swaps = recommendJointFriendlySwaps(
              def,
              allExercises,
              profile,
              safety.affectedJoints[0],
              1
            );
            if (swaps[0]) {
              swappedFromId = def.id;
              swapReason = `Auto-swapped from ${def.name}: ${swaps[0].rationale}`;
              def = swaps[0].exercise;
            }
          }
        }

        const fallbackRange = def?.defaultRepRange ?? {
          min: prevEx.targetMinReps,
          max: prevEx.targetMaxReps,
        };
        const safety = def ? assessExerciseSafety(def, profile) : undefined;
        const adjRange = getAgeAdjustedRepRange(
          fallbackRange,
          profile.ageTier,
          safety?.level ?? 'safe'
        );

        const increment = def
          ? profile.unit === 'lb'
            ? def.defaultIncrementLb
            : def.defaultIncrementKg
          : prevEx.increment;

        const peak = peakWeights.get(def?.id ?? prevEx.exerciseId) ?? 0;
        const seededWeight =
          peak > 0 ? roundToIncrement(peak * 0.875, increment) : 0;

        const numSets = Math.max(2, prevEx.startNumSets);
        const warmups =
          def && seededWeight > 0
            ? generateWarmupSets(seededWeight, increment, def, profile)
            : [];
        const working = createWorkingSetsForPrescription(
          numSets,
          seededWeight,
          adjRange.min,
          adjRange.max,
          week1Rir,
          def?.unilateral ?? false
        );

        return {
          id: makeId('ex'),
          exerciseId: def?.id ?? prevEx.exerciseId,
          muscle: def?.primaryMuscle ?? prevEx.muscle,
          progressionType: prevEx.progressionType,
          targetMinReps: adjRange.min,
          targetMaxReps: adjRange.max,
          increment,
          startNumSets: numSets,
          numSets,
          lastWeight: seededWeight > 0 ? seededWeight : null,
          weightIncreasedThisWeek: false,
          sets: [...warmups, ...working],
          swappedFromId,
          swapReason,
          coachNote:
            seededWeight > 0
              ? `New meso Week 1 seeded at 87.5% of previous peak (${seededWeight} ${profile.unit}) @ ${week1Rir} RIR.`
              : `Establish starting weight at ${week1Rir} RIR.`,
        };
      });

      return {
        id: makeId('sess'),
        mesoId,
        weekNumber: 1,
        dayIndex: refSess.dayIndex,
        dayName: refSess.dayName.replace(/\s*\(Deload\)$/, ''),
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
    name: `${template.name} — Block 2`,
    templateId: completedMeso.templateId,
    totalWeeks: completedMeso.totalWeeks,
    currentWeek: 1,
    createdAt: new Date().toISOString(),
    status: 'active',
    musclePriorities: { ...completedMeso.musclePriorities },
    sessions: daySessions,
  };
}
