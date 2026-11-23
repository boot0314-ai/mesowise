import {
  AthleteProfile,
  ExerciseDefinition,
  MuscleGroupFeedback,
  SessionExercise,
  SetLog,
} from '../types/models';

export interface DownSetSuggestion {
  targetWeight: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetRir: number;
  reason: string;
}

export interface NextExercisePrescription {
  targetMinReps: number;
  targetMaxReps: number;
  targetRepsSuggested: number;
  targetWeight: number;
  numSets: number;
  weightIncreasedThisWeek: boolean;
  eccentricOverride?: string;
  coachNote: string;
}

/**
 * Rounds weight cleanly to the nearest configured increment (e.g. 2.5 lb or 1.25 kg)
 * with no floating-point drift.
 */
export function roundToIncrement(weight: number, increment: number): number {
  if (!Number.isFinite(weight) || weight <= 0) return 0;
  const safeInc = increment > 0 ? increment : 2.5;
  const rounded = Math.round(weight / safeInc) * safeInc;
  return Number(rounded.toFixed(2));
}

/**
 * Converts a weight between lb and kg and rounds cleanly to the target increment.
 */
export function convertWeight(
  weight: number,
  fromUnit: 'lb' | 'kg',
  toUnit: 'lb' | 'kg',
  increment: number
): number {
  if (weight <= 0 || fromUnit === toUnit) {
    return roundToIncrement(weight, increment);
  }
  const raw = fromUnit === 'lb' ? weight / 2.20462262 : weight * 2.20462262;
  return roundToIncrement(raw, increment);
}

/**
 * Generates tendon-friendly progressive ramp-up warm-up sets before working sets.
 * Older lifters and high-axial/compound movements receive 3 progressive sets;
 * isolations receive 1-2 light primer sets.
 */
export function generateWarmupSets(
  workingWeight: number,
  increment: number,
  exercise: Pick<ExerciseDefinition, 'axialLoad' | 'unilateral'>,
  profile: Pick<AthleteProfile, 'ageTier' | 'includeWarmups'>
): SetLog[] {
  if (!profile.includeWarmups || workingWeight <= 0) {
    return [];
  }

  const isOlder = profile.ageTier === '50_64' || profile.ageTier === '65_plus';
  const useThreeWarmups = isOlder || exercise.axialLoad !== 'none';

  const scheme = useThreeWarmups
    ? [
        { pct: 0.5, reps: 8, rir: 5 },
        { pct: 0.7, reps: 4, rir: 4 },
        { pct: 0.85, reps: 2, rir: 3 },
      ]
    : [
        { pct: 0.6, reps: 6, rir: 5 },
        { pct: 0.8, reps: 3, rir: 4 },
      ];

  const warmups: SetLog[] = [];
  let prevWeight = -1;

  scheme.forEach((step, idx) => {
    const w = roundToIncrement(workingWeight * step.pct, increment);
    if (w <= 0 || w >= workingWeight || w === prevWeight) return;
    prevWeight = w;

    warmups.push({
      id: `wu-${idx + 1}-${Math.random().toString(36).slice(2, 7)}`,
      setNumber: idx + 1,
      isWarmup: true,
      side: exercise.unilateral ? 'left' : 'both',
      targetWeight: w,
      targetRepsMin: step.reps,
      targetRepsMax: step.reps,
      targetRir: step.rir,
      weight: w,
      reps: step.reps,
      rir: step.rir,
      painScore: 0,
      completed: false,
    });
  });

  return warmups;
}

/**
 * Reverse-engineered Liftosaur RP v4.1 + Older-Lifter Pain-Monitoring progression engine.
 *
 * Traffic-light rules:
 * - Green (pain <= 2): Standard double/weight/rep progression. Never increases weight and sets simultaneously.
 * - Amber (pain 3-4): Holds weight, shifts rep target +3 higher to drop peak joint torque, enforces 3s eccentric, caps sets.
 * - Red (pain >= 5): Cuts weight by 10%, drops 1 set, and flags a high-SFR joint-friendly swap.
 */
export function calculateNextExercisePrescription(
  prevExercise: SessionExercise,
  feedback: MuscleGroupFeedback | undefined,
  nextTargetRir: number,
  _profile: Pick<AthleteProfile, 'ageTier' | 'autoDownSetMode'>,
  _exerciseDef?: ExerciseDefinition
): NextExercisePrescription {
  const workingSets = prevExercise.sets.filter((s) => !s.isWarmup && !s.isDownSet);
  const completedSets = workingSets.filter((s) => s.completed);

  const painFromSets = workingSets.reduce((max, s) => Math.max(max, s.painScore || 0), 0);
  const effectivePain = Math.max(painFromSets, feedback?.jointPainMax ?? 0);

  const baseWeight =
    completedSets.find((s) => s.weight !== null && s.weight > 0)?.weight ??
    prevExercise.lastWeight ??
    workingSets[0]?.targetWeight ??
    0;

  const avgReps =
    completedSets.length > 0
      ? Math.round(
          completedSets.reduce((sum, s) => sum + (s.reps ?? prevExercise.targetMinReps), 0) /
            completedSets.length
        )
      : prevExercise.targetMinReps;

  const topReps =
    completedSets.length > 0
      ? Math.max(...completedSets.map((s) => s.reps ?? 0))
      : prevExercise.targetMinReps;

  const rirEntries = completedSets
    .map((s) => s.rir)
    .filter((r): r is number => r !== null && Number.isFinite(r));
  const avgRir =
    rirEntries.length > 0
      ? rirEntries.reduce((sum, r) => sum + r, 0) / rirEntries.length
      : null;

  const firstTargetRir = workingSets[0]?.targetRir ?? 2;
  const rirMet = avgRir === null || avgRir <= firstTargetRir + 1;

  // RED LIGHT: Acute joint pain >= 5/10
  if (effectivePain >= 5) {
    const reducedWeight =
      baseWeight > 0
        ? roundToIncrement(baseWeight * 0.9, prevExercise.increment)
        : 0;
    const reducedSets = Math.max(1, prevExercise.numSets - 1);

    return {
      targetMinReps: Math.min(22, prevExercise.targetMinReps + 2),
      targetMaxReps: Math.min(30, prevExercise.targetMaxReps + 2),
      targetRepsSuggested: Math.min(25, prevExercise.targetMinReps + 2),
      targetWeight: reducedWeight,
      numSets: reducedSets,
      weightIncreasedThisWeek: false,
      eccentricOverride: '3s controlled eccentric — stop well short of pain',
      coachNote: `Pain alert (${effectivePain}/10): load reduced 10%, volume cut 1 set. Use Swap to switch to a joint-friendly high-SFR movement.`,
    };
  }

  // AMBER LIGHT: Mild discomfort 3-4/10
  if (effectivePain >= 3) {
    const shiftedMin = Math.min(22, prevExercise.targetMinReps + 3);
    const shiftedMax = Math.min(30, Math.max(shiftedMin + 3, prevExercise.targetMaxReps + 3));

    return {
      targetMinReps: shiftedMin,
      targetMaxReps: shiftedMax,
      targetRepsSuggested: shiftedMin,
      targetWeight: roundToIncrement(baseWeight, prevExercise.increment),
      numSets: prevExercise.numSets,
      weightIncreasedThisWeek: false,
      eccentricOverride: '3s controlled eccentric (pain guard)',
      coachNote: `Mild joint discomfort (${effectivePain}/10): weight held steady, rep range shifted upward (+3) with 3s eccentric to cut peak joint torque.`,
    };
  }

  // GREEN LIGHT: Normal RP / Liftosaur v4.1 Progression
  let nextWeight = roundToIncrement(baseWeight, prevExercise.increment);
  let nextMin = prevExercise.targetMinReps;
  let nextMax = prevExercise.targetMaxReps;
  let nextSuggested = prevExercise.targetMinReps;
  let weightIncreased = false;
  let note = `Match or beat last session at ${nextTargetRir} RIR.`;

  if (completedSets.length === 0) {
    // No logged sets yet: preserve target cleanly
    return {
      targetMinReps: nextMin,
      targetMaxReps: nextMax,
      targetRepsSuggested: nextMin,
      targetWeight: nextWeight,
      numSets: prevExercise.numSets,
      weightIncreasedThisWeek: false,
      coachNote: `Target ${nextTargetRir} RIR using controlled tempo.`,
    };
  }

  if (prevExercise.progressionType === 'double') {
    if (baseWeight > 0 && topReps >= prevExercise.targetMaxReps && rirMet) {
      nextWeight = roundToIncrement(baseWeight + prevExercise.increment, prevExercise.increment);
      nextSuggested = nextMin;
      weightIncreased = true;
      note = `Hit ceiling (${topReps} reps) — weight bumped +${prevExercise.increment}; reset reps to ${nextMin}.`;
    } else {
      nextSuggested = Math.min(nextMax, Math.max(nextMin, avgReps + 1));
      note = `Hold ${nextWeight} and beat ${avgReps} reps (target ${nextSuggested} @ ${nextTargetRir} RIR).`;
    }
  } else if (prevExercise.progressionType === 'weight') {
    if (baseWeight > 0 && topReps >= prevExercise.targetMinReps && rirMet) {
      nextWeight = roundToIncrement(baseWeight + prevExercise.increment, prevExercise.increment);
      nextSuggested = nextMin;
      weightIncreased = true;
      note = `Linear progression: weight increased +${prevExercise.increment}.`;
    } else {
      nextSuggested = Math.min(nextMax, Math.max(nextMin, avgReps + 1));
      note = `Build back to ${nextMin} reps before adding load.`;
    }
  } else if (prevExercise.progressionType === 'rep') {
    nextSuggested = Math.min(30, avgReps + 1);
    if (nextSuggested > nextMax) {
      nextMax = nextSuggested;
    }
    note = `Rep progression: aim for ${nextSuggested} reps at ${nextWeight}.`;
  }

  // Apply Liftosaur v4.1 setsModifier, blocking simultaneous weight + set jump
  const rawModifier = feedback?.setsModifier ?? 0;
  let effectiveModifier = rawModifier;
  if (weightIncreased && rawModifier > 0) {
    effectiveModifier = 0;
    note += ' Volume addition deferred because weight bumped this week.';
  } else if (rawModifier > 0) {
    note += ` Added +${rawModifier} set from recovery feedback.`;
  } else if (rawModifier < 0) {
    note += ` Reduced ${Math.abs(rawModifier)} set from workload/recovery feedback.`;
  }

  const nextNumSets = Math.max(1, Math.min(8, prevExercise.numSets + effectiveModifier));

  return {
    targetMinReps: nextMin,
    targetMaxReps: nextMax,
    targetRepsSuggested: nextSuggested,
    targetWeight: nextWeight,
    numSets: nextNumSets,
    weightIncreasedThisWeek: weightIncreased,
    eccentricOverride: prevExercise.eccentricOverride,
    coachNote: note,
  };
}

/**
 * Liftosaur v4.1 AUTO_DOWN_SET_MODE:
 * When a working set falls below the hypertrophy rep floor (`targetMinReps`) without severe pain,
 * suggests a 15% drop-set to keep mechanical tension high with lower joint load.
 */
export function evaluateAutoDownSet(
  completedSet: SetLog,
  exercise: Pick<SessionExercise, 'targetMinReps' | 'targetMaxReps' | 'increment'>,
  profile: Pick<AthleteProfile, 'autoDownSetMode'>
): DownSetSuggestion | null {
  if (!profile.autoDownSetMode) return null;
  if (completedSet.isWarmup || completedSet.isDownSet || !completedSet.completed) return null;
  if (completedSet.painScore >= 4) return null;
  if (completedSet.weight === null || completedSet.weight <= 0) return null;
  if (completedSet.reps === null || completedSet.reps >= exercise.targetMinReps) return null;

  const downWeight = roundToIncrement(completedSet.weight * 0.85, exercise.increment);
  if (downWeight <= 0 || downWeight >= completedSet.weight) return null;

  return {
    targetWeight: downWeight,
    targetRepsMin: exercise.targetMinReps,
    targetRepsMax: Math.min(30, exercise.targetMinReps + 4),
    targetRir: completedSet.targetRir,
    reason: `Reps (${completedSet.reps}) dipped below your ${exercise.targetMinReps}-rep floor. Drop ~15% to ${downWeight} for a joint-friendly back-off set.`,
  };
}
