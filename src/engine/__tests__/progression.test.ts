import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../data/constants';
import { BUILTIN_EXERCISES } from '../../data/exercises';
import { MuscleGroupFeedback, SessionExercise, SetLog } from '../../types/models';
import {
  calculateNextExercisePrescription,
  convertWeight,
  evaluateAutoDownSet,
  generateWarmupSets,
  roundToIncrement,
} from '../progression';

function makeSessionExercise(overrides: Partial<SessionExercise> = {}): SessionExercise {
  const baseSets: SetLog[] = [
    {
      id: 's1',
      setNumber: 1,
      targetWeight: 100,
      targetRepsMin: 10,
      targetRepsMax: 15,
      targetRir: 2,
      weight: 100,
      reps: 15,
      rir: 2,
      painScore: 0,
      completed: true,
    },
    {
      id: 's2',
      setNumber: 2,
      targetWeight: 100,
      targetRepsMin: 10,
      targetRepsMax: 15,
      targetRir: 2,
      weight: 100,
      reps: 14,
      rir: 2,
      painScore: 0,
      completed: true,
    },
  ];
  return {
    id: 'ex1',
    exerciseId: 'machine_chest_press',
    muscle: 'chest',
    progressionType: 'double',
    targetMinReps: 10,
    targetMaxReps: 15,
    increment: 5,
    startNumSets: 2,
    numSets: 2,
    lastWeight: 100,
    weightIncreasedThisWeek: false,
    sets: baseSets,
    ...overrides,
  };
}

describe('Progression, Pain-Monitoring Traffic Lights & Auto Down-Sets', () => {
  it('rounds and converts weights cleanly to increments', () => {
    expect(roundToIncrement(142.38, 2.5)).toBe(142.5);
    expect(roundToIncrement(67.4, 5)).toBe(65);
    expect(convertWeight(100, 'lb', 'kg', 2.5)).toBe(45);
  });

  it('bumps weight and defers positive setsModifier on double progression ceiling (Liftosaur v4.1 rule)', () => {
    const profile = createDefaultProfile();
    const prev = makeSessionExercise();
    const positiveFeedback: MuscleGroupFeedback = {
      muscle: 'chest',
      soreness: 1,
      pump: 2,
      workload: 0,
      jointPainMax: 0,
      v4Rating: 1,
      setsModifier: 1,
      rationale: 'Add 1 set',
    };

    const next = calculateNextExercisePrescription(prev, positiveFeedback, 2, profile);
    expect(next.targetWeight).toBe(105);
    expect(next.targetRepsSuggested).toBe(10);
    expect(next.weightIncreasedThisWeek).toBe(true);
    expect(next.numSets).toBe(2); // deferred +1 set because weight increased!
  });

  it('adds +1 rep when top set is below max rep ceiling and applies setsModifier', () => {
    const profile = createDefaultProfile();
    const prev = makeSessionExercise({
      sets: [
        {
          id: 's1',
          setNumber: 1,
          targetWeight: 100,
          targetRepsMin: 10,
          targetRepsMax: 15,
          targetRir: 2,
          weight: 100,
          reps: 12,
          rir: 2,
          painScore: 0,
          completed: true,
        },
      ],
    });
    const feedback: MuscleGroupFeedback = {
      muscle: 'chest',
      soreness: 1,
      pump: 2,
      workload: 1,
      jointPainMax: 0,
      v4Rating: 1,
      setsModifier: 1,
      rationale: 'Add 1 set',
    };

    const next = calculateNextExercisePrescription(prev, feedback, 2, profile);
    expect(next.targetWeight).toBe(100);
    expect(next.targetRepsSuggested).toBe(13);
    expect(next.weightIncreasedThisWeek).toBe(false);
    expect(next.numSets).toBe(3);
  });

  it('applies Amber traffic light (3-4/10 pain): holds load, shifts reps +3, enforces 3s eccentric', () => {
    const profile = createDefaultProfile();
    const prev = makeSessionExercise({
      sets: [
        {
          id: 's1',
          setNumber: 1,
          targetWeight: 100,
          targetRepsMin: 10,
          targetRepsMax: 15,
          targetRir: 2,
          weight: 100,
          reps: 15,
          rir: 2,
          painScore: 4,
          painJoint: 'shoulder',
          completed: true,
        },
      ],
    });

    const next = calculateNextExercisePrescription(prev, undefined, 2, profile);
    expect(next.targetWeight).toBe(100);
    expect(next.targetMinReps).toBe(13);
    expect(next.targetMaxReps).toBe(18);
    expect(next.eccentricOverride).toContain('3s');
  });

  it('applies Red traffic light (>=5/10 pain): reduces load 10% and cuts 1 set', () => {
    const profile = createDefaultProfile();
    const prev = makeSessionExercise({
      numSets: 3,
      sets: [
        {
          id: 's1',
          setNumber: 1,
          targetWeight: 100,
          targetRepsMin: 10,
          targetRepsMax: 15,
          targetRir: 2,
          weight: 100,
          reps: 10,
          rir: 2,
          painScore: 6,
          painJoint: 'shoulder',
          completed: true,
        },
      ],
    });

    const next = calculateNextExercisePrescription(prev, undefined, 2, profile);
    expect(next.targetWeight).toBe(90);
    expect(next.numSets).toBe(2);
    expect(next.coachNote).toContain('Swap');
  });

  it('triggers Auto Down-Set when reps dip below targetMinReps without severe pain', () => {
    const profile = { ...createDefaultProfile(), autoDownSetMode: true };
    const ex = makeSessionExercise({ targetMinReps: 10, targetMaxReps: 15, increment: 5 });

    const dippedSet: SetLog = {
      id: 's1',
      setNumber: 1,
      targetWeight: 100,
      targetRepsMin: 10,
      targetRepsMax: 15,
      targetRir: 2,
      weight: 100,
      reps: 8,
      rir: 1,
      painScore: 0,
      completed: true,
    };

    const downSet = evaluateAutoDownSet(dippedSet, ex, profile);
    expect(downSet).not.toBeNull();
    expect(downSet!.targetWeight).toBe(85);

    const painfulSet = { ...dippedSet, painScore: 5 };
    expect(evaluateAutoDownSet(painfulSet, ex, profile)).toBeNull();
  });

  it('generates 3 progressive tendon warm-up ramp sets for 50+ athletes', () => {
    const profile = createDefaultProfile(); // ageTier 50_64
    const press = BUILTIN_EXERCISES.find((e) => e.id === 'machine_chest_press')!;
    const warmups = generateWarmupSets(200, 5, press, profile);
    expect(warmups.map((w) => w.targetWeight)).toEqual([100, 140, 170]);
    expect(warmups.every((w) => w.isWarmup)).toBe(true);
  });
});
