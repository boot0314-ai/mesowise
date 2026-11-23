import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../data/constants';
import { BUILTIN_EXERCISES } from '../../data/exercises';
import {
  assessExerciseSafety,
  optimizeSessionOrderForJoints,
  recommendJointFriendlySwaps,
} from '../injuryAdvisor';

const byId = new Map(BUILTIN_EXERCISES.map((e) => [e.id, e]));

describe('Injury Advisor & High-SFR Swap Ranking', () => {
  it('flags high-stress barbell exercises as avoid when matching joint is recovering/avoid', () => {
    const profile = createDefaultProfile();
    profile.joints.lower_back = { status: 'recovering', notes: 'Disc flare', painBaseline: 3 };
    profile.joints.shoulder = { status: 'avoid', notes: 'Labrum tear', painBaseline: 4 };

    const squat = byId.get('barbell_back_squat')!;
    const bench = byId.get('barbell_bench_press')!;
    const machineRow = byId.get('chest_supported_machine_row')!;
    const legCurl = byId.get('seated_leg_curl')!;

    expect(assessExerciseSafety(squat, profile).level).toBe('avoid');
    expect(assessExerciseSafety(bench, profile).level).toBe('avoid');
    expect(assessExerciseSafety(machineRow, profile).level).toBe('caution');
    expect(assessExerciseSafety(legCurl, profile).level).toBe('safe');

    // When only lower_back is recovering, chest-supported row (lower_back: 0) is completely safe
    const lowerBackOnly = createDefaultProfile();
    lowerBackOnly.joints.lower_back = { status: 'recovering', notes: '', painBaseline: 3 };
    expect(assessExerciseSafety(machineRow, lowerBackOnly).level).toBe('safe');
  });

  it('elevates safety caution when recent high pain events exist on an exercise', () => {
    const profile = createDefaultProfile();
    const legExt = byId.get('seated_leg_extension')!;

    const safeBaseline = assessExerciseSafety(legExt, profile, []);
    expect(safeBaseline.level).toBe('safe');

    const afterPain = assessExerciseSafety(legExt, profile, [
      {
        id: 'p1',
        timestamp: new Date().toISOString(),
        exerciseId: legExt.id,
        exerciseName: legExt.name,
        joint: 'knee',
        painScore: 6,
        weight: 120,
        reps: 12,
      },
    ]);
    expect(afterPain.level).toBe('caution');
  });

  it('ranks joint-friendly high-SFR swaps above risky alternatives and respects equipment', () => {
    const profile = createDefaultProfile();
    profile.joints.lower_back = { status: 'avoid', notes: '', painBaseline: 3 };
    profile.equipment = ['machine', 'cable', 'dumbbell'];

    const barbellRow = byId.get('barbell_bent_over_row')!;
    const swaps = recommendJointFriendlySwaps(
      barbellRow,
      BUILTIN_EXERCISES,
      profile,
      'lower_back',
      5
    );

    expect(swaps.length).toBeGreaterThan(0);
    expect(swaps[0].exercise.id).toBe('chest_supported_machine_row');
    expect(swaps.every((s) => profile.equipment.includes(s.exercise.equipment))).toBe(true);
    expect(swaps.every((s) => s.safety.level !== 'avoid')).toBe(true);
  });

  it('provides lengthened vs pain-free active ROM guidance and moves leg curls before leg press for joint warming', () => {
    const profile = createDefaultProfile(); // 50_64
    const cableFly = byId.get('cable_fly_seated')!;
    const safeAssess = assessExerciseSafety(cableFly, profile);
    expect(safeAssess.romGuidance).toContain('Lengthened-tension');
    expect(safeAssess.finisherTip).toContain('Myo-reps');

    profile.joints.knee = { status: 'sensitive', notes: 'Patellar ache', painBaseline: 2 };
    const legExt = byId.get('seated_leg_extension')!;
    const flaggedAssess = assessExerciseSafety(legExt, profile);
    expect(flaggedAssess.romGuidance).toContain('Pain-free active ROM');

    const reordered = optimizeSessionOrderForJoints(
      [
        {
          id: 'e1',
          exerciseId: 'leg_press_45',
          muscle: 'quads',
          progressionType: 'double',
          targetMinReps: 12,
          targetMaxReps: 18,
          increment: 10,
          startNumSets: 3,
          numSets: 3,
          lastWeight: 200,
          weightIncreasedThisWeek: false,
          sets: [],
        },
        {
          id: 'e2',
          exerciseId: 'seated_leg_curl',
          muscle: 'hamstrings',
          progressionType: 'double',
          targetMinReps: 12,
          targetMaxReps: 18,
          increment: 5,
          startNumSets: 3,
          numSets: 3,
          lastWeight: 100,
          weightIncreasedThisWeek: false,
          sets: [],
        },
      ],
      BUILTIN_EXERCISES,
      profile
    );

    expect(reordered.changed).toBe(true);
    expect(reordered.exercises.map((e) => e.exerciseId)).toEqual([
      'seated_leg_curl',
      'leg_press_45',
    ]);
  });
});
