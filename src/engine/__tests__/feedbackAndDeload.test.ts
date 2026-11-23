import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../data/constants';
import { BUILTIN_EXERCISES } from '../../data/exercises';
import { MESO_TEMPLATES } from '../../data/templates';
import {
  buildDeloadSession,
  buildRecoverySession,
  generateNextMesocycle,
} from '../deload';
import { computeFeedbackDecision, shouldSuggestDeloadOrRecovery } from '../feedback';
import { advanceToNextWeek, createMesocycleFromTemplate } from '../mesoGenerator';

describe('Feedback Engine, Deload Automation & Meso Lifecycle', () => {
  it('computes v4.1 ratings and caps volume increases conservatively for 50+ lifters', () => {
    const profile = createDefaultProfile(); // 50_64

    const easyDecision = computeFeedbackDecision(
      { muscle: 'chest', soreness: 0, pump: 1, workload: 0, jointPainMax: 0 },
      8,
      profile
    );
    expect(easyDecision.v4Rating).toBe(2);
    expect(easyDecision.setsModifier).toBe(1); // Older lifter capped at +1 instead of +2

    const painDecision = computeFeedbackDecision(
      {
        muscle: 'chest',
        soreness: 1,
        pump: 2,
        workload: 1,
        jointPainMax: 6,
        painJoint: 'shoulder',
      },
      10,
      profile
    );
    expect(painDecision.v4Rating).toBe(-2);
    expect(painDecision.setsModifier).toBe(-1);
  });

  it('builds a deload session using configured ratios and drops low-priority isolation muscles', () => {
    const profile = createDefaultProfile();
    const tpl = MESO_TEMPLATES.find((t) => t.id === 'masters-upper-lower-4')!;
    const meso = createMesocycleFromTemplate(
      tpl,
      {
        totalWeeks: 5,
        musclePriorities: { chest: 'grow', side_delts: 'grow', biceps: 'low', triceps: 'low' },
      },
      BUILTIN_EXERCISES,
      profile
    );

    const day0 = meso.sessions[0];
    // Simulate 100 lb working weights
    day0.exercises.forEach((ex) => {
      ex.lastWeight = 100;
      ex.numSets = 4;
    });

    const deloadSession = buildDeloadSession(day0, profile, meso, BUILTIN_EXERCISES);
    expect(deloadSession.isDeload).toBe(true);
    expect(deloadSession.targetRir).toBe(4);
    expect(deloadSession.exercises.some((e) => e.muscle === 'biceps')).toBe(false);
    expect(deloadSession.exercises[0].numSets).toBe(2); // 4 * 0.50
    expect(deloadSession.exercises[0].sets[0].targetWeight).toBe(60); // 100 * 0.60
  });

  it('auto-swaps avoided exercises when creating a meso and advances weeks cleanly', () => {
    const profile = createDefaultProfile();
    profile.joints.shoulder = { status: 'avoid', notes: 'Rotator tear', painBaseline: 4 };
    profile.joints.lower_back = { status: 'avoid', notes: 'Lumbar stenosis', painBaseline: 4 };

    const ppl = MESO_TEMPLATES.find((t) => t.id === 'rp-ppl-3')!;
    const meso = createMesocycleFromTemplate(
      ppl,
      { totalWeeks: 4 },
      BUILTIN_EXERCISES,
      profile
    );

    const allIds = meso.sessions.flatMap((s) => s.exercises.map((e) => e.exerciseId));
    expect(allIds).not.toContain('barbell_bench_press');
    expect(allIds).not.toContain('barbell_back_squat');

    // Mark week 1 complete with weights logged and advance through week 4 deload
    meso.sessions.forEach((sess) => {
      sess.status = 'completed';
      sess.exercises.forEach((ex) => {
        ex.sets.forEach((s) => {
          s.weight = 100;
          s.reps = ex.targetMaxReps;
          s.rir = 2;
          s.completed = true;
        });
      });
    });

    const week2 = advanceToNextWeek(meso, BUILTIN_EXERCISES, profile);
    expect(week2.currentWeek).toBe(2);
    expect(week2.sessions.some((s) => s.weekNumber === 2)).toBe(true);

    const earlyDeload = advanceToNextWeek(week2, BUILTIN_EXERCISES, profile, true);
    expect(earlyDeload.currentWeek).toBe(4);
    expect(earlyDeload.sessions.filter((s) => s.weekNumber === 4).every((s) => s.isDeload)).toBe(true);
  });

  it('converts a session into a Recovery Session and detects early deload triggers', () => {
    const profile = createDefaultProfile();
    const tpl = MESO_TEMPLATES[0];
    const meso = createMesocycleFromTemplate(
      tpl,
      { totalWeeks: 5 },
      BUILTIN_EXERCISES,
      profile
    );

    meso.sessions[0].exercises[0].lastWeight = 100;
    meso.sessions[0].exercises[0].numSets = 4;
    const recovery = buildRecoverySession(meso.sessions[0], BUILTIN_EXERCISES);
    expect(recovery.isRecoverySession).toBe(true);
    expect(recovery.targetRir).toBe(4);
    expect(recovery.exercises[0].sets[0].targetWeight).toBe(70);
    expect(recovery.exercises[0].numSets).toBe(2);

    // Trigger early deload detection
    meso.sessions[0].status = 'completed';
    meso.sessions[0].feedback.chest = {
      muscle: 'chest',
      soreness: 3,
      pump: 1,
      workload: 3,
      jointPainMax: 5,
      v4Rating: -2,
      setsModifier: -1,
      rationale: 'Fatigue',
    };
    meso.sessions[1].status = 'completed';
    meso.sessions[1].feedback.quads = {
      muscle: 'quads',
      soreness: 3,
      pump: 1,
      workload: 3,
      jointPainMax: 5,
      v4Rating: -2,
      setsModifier: -1,
      rationale: 'Fatigue',
    };

    const prompt = shouldSuggestDeloadOrRecovery(meso, profile);
    expect(prompt?.type).toBe('early_deload');
  });

  it('seeds next mesocycle Week 1 weights at ~87.5% of peak accumulation weight', () => {
    const profile = createDefaultProfile();
    const tpl = MESO_TEMPLATES[0];
    const meso = createMesocycleFromTemplate(
      tpl,
      { totalWeeks: 5 },
      BUILTIN_EXERCISES,
      profile
    );

    const firstEx = meso.sessions[0].exercises[0];
    firstEx.sets.forEach((s) => {
      if (!s.isWarmup) {
        s.weight = 200;
        s.reps = 12;
        s.completed = true;
      }
    });

    const nextMeso = generateNextMesocycle(meso, tpl, BUILTIN_EXERCISES, profile);
    const seededFirstEx = nextMeso.sessions[0].exercises[0];
    expect(seededFirstEx.lastWeight).toBe(175); // 200 * 0.875 = 175
  });

  it('distributes weekly setsModifier once to highest-SFR exercise and caps per-session junk volume', () => {
    const profile = createDefaultProfile(); // 50_64 -> max 6 sets/session per muscle
    const tpl = MESO_TEMPLATES.find((t) => t.id === 'masters-upper-lower-4')!;
    const meso = createMesocycleFromTemplate(
      tpl,
      { totalWeeks: 5 },
      BUILTIN_EXERCISES,
      profile
    );

    // Upper A has machine_chest_press (SFR 9.4, 3 sets); Upper B has machine_incline_press (SFR 9.5, 3 sets)
    meso.sessions[0].status = 'completed';
    meso.sessions[0].exercises[0].sets.forEach((s) => {
      s.weight = 120;
      s.reps = 12; // below ceiling so weight does not bump
      s.rir = 2;
      s.completed = true;
    });
    meso.sessions[2].status = 'completed';
    meso.sessions[2].exercises[0].sets.forEach((s) => {
      s.weight = 110;
      s.reps = 12;
      s.rir = 2;
      s.completed = true;
    });
    // Also simulate a single-session over-prescription for quads (8 sets > cap 6)
    meso.sessions[1].exercises.find((e) => e.muscle === 'quads')!.numSets = 8;

    const chestFeedback = {
      muscle: 'chest' as const,
      soreness: 0 as const,
      pump: 2 as const,
      workload: 0 as const,
      jointPainMax: 0,
      v4Rating: 1 as const,
      setsModifier: 1,
      rationale: 'Add +1 chest set',
    };
    meso.sessions[0].feedback.chest = chestFeedback;
    meso.sessions[2].feedback.chest = chestFeedback;

    const week2 = advanceToNextWeek(meso, BUILTIN_EXERCISES, profile);
    const w2Sessions = week2.sessions.filter((s) => s.weekNumber === 2);

    const w2UpperAChest = w2Sessions[0].exercises.find((e) => e.muscle === 'chest')!;
    const w2UpperBChest = w2Sessions[2].exercises.find((e) => e.muscle === 'chest')!;
    // Total weekly chest sets went from 3+3=6 to 7 (+1 budget allocated once, favoring higher SFR Upper B)
    expect(w2UpperAChest.numSets + w2UpperBChest.numSets).toBe(7);
    expect(w2UpperBChest.numSets).toBe(4);
    expect(w2UpperAChest.numSets).toBe(3);

    // Single-session quad sets capped at 6 for 50_64
    const w2Quads = w2Sessions[1].exercises.find((e) => e.muscle === 'quads')!;
    expect(w2Quads.numSets).toBe(6);
  });
});
