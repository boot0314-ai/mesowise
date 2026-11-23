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
});
