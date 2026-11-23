import {
  AthleteProfile,
  JointRegion,
  Mesocycle,
  MuscleGroup,
  MuscleGroupFeedback,
} from '../types/models';
import { getAdaptedLandmarks } from './landmarks';

export interface FeedbackInput {
  muscle: MuscleGroup;
  soreness: 0 | 1 | 2 | 3;
  pump: 0 | 1 | 2 | 3;
  workload: 0 | 1 | 2 | 3;
  jointPainMax: number;
  painJoint?: JointRegion;
}

/**
 * Translates RP qualitative metrics (Soreness, Pump, Workload) + Joint Pain
 * into the Liftosaur RP v4.1 (-2 to +2) rating scale and setsModifier,
 * clamped within age- and joint-adapted MEV..MRV volume landmarks.
 */
export function computeFeedbackDecision(
  input: FeedbackInput,
  currentWeeklySets: number,
  profile: AthleteProfile
): MuscleGroupFeedback {
  const landmarks = getAdaptedLandmarks(input.muscle, profile);
  const isOlder = profile.ageTier === '50_64' || profile.ageTier === '65_plus';

  let v4Rating: -2 | -1 | 0 | 1 | 2 = 0;
  let desiredDelta = 0;
  let rationale = '';

  if (input.jointPainMax >= 5) {
    v4Rating = -2;
    desiredDelta = -1;
    rationale = `Joint pain (${input.jointPainMax}/10) triggered protection: cutting 1 set and recommending a high-SFR swap.`;
  } else if (input.jointPainMax >= 3) {
    v4Rating = -1;
    desiredDelta = 0;
    rationale = `Mild joint discomfort (${input.jointPainMax}/10): holding set volume steady and shifting to higher reps + slower eccentrics.`;
  } else if (input.workload === 3 || (input.soreness === 3 && input.workload >= 2)) {
    v4Rating = -2;
    desiredDelta = currentWeeklySets > landmarks.mrv ? -2 : -1;
    rationale = `Excessive systemic/local fatigue (workload ${input.workload}/3, soreness ${input.soreness}/3): trimming ${Math.abs(desiredDelta)} set(s) to restore recovery.`;
  } else if (input.soreness === 3 || input.workload === 2) {
    v4Rating = -1;
    desiredDelta = 0;
    rationale = 'Near recovery limit: holding weekly sets steady so tissues adapt before adding volume.';
  } else if (input.workload === 0 && input.soreness <= 1 && input.pump <= 1) {
    v4Rating = 2;
    desiredDelta = isOlder ? 1 : 2;
    rationale = isOlder
      ? 'Great recovery & low fatigue: adding +1 conservative set (older-lifter cap).'
      : 'Recovered effortlessly with minimal pump/soreness: adding +2 sets toward MAV.';
  } else if (input.workload <= 1 && input.soreness <= 1 && (input.pump >= 1 || input.workload === 0)) {
    v4Rating = 1;
    desiredDelta = 1;
    rationale = 'Solid recovery and stimulus: adding +1 set to keep progressive volume climbing.';
  } else {
    v4Rating = 0;
    desiredDelta = 0;
    rationale = 'Sweet-spot stimulus & recovery: keeping sets unchanged and progressing weight/reps.';
  }

  // Clamp sets within adapted landmarks (allow dipping to MV when injured or -2 overreached)
  const floorSets =
    input.jointPainMax >= 5 || v4Rating === -2
      ? Math.max(1, landmarks.mv)
      : Math.max(1, landmarks.mev);

  const clampedTarget = Math.max(
    floorSets,
    Math.min(landmarks.mrv, currentWeeklySets + desiredDelta)
  );
  const setsModifier = clampedTarget - currentWeeklySets;

  if (desiredDelta > 0 && setsModifier === 0 && currentWeeklySets >= landmarks.mrv) {
    rationale += ` Reached adapted MRV ceiling (${landmarks.mrv} sets/wk) — holding volume instead of overreaching.`;
  }

  return {
    muscle: input.muscle,
    soreness: input.soreness,
    pump: input.pump,
    workload: input.workload,
    jointPainMax: input.jointPainMax,
    painJoint: input.painJoint,
    v4Rating,
    setsModifier,
    rationale,
  };
}

/**
 * Checks recent accumulation sessions for systemic fatigue or joint flare-ups
 * to suggest an RP/v4.1 Recovery Session or Early Deload.
 */
export function shouldSuggestDeloadOrRecovery(
  meso: Mesocycle,
  profile: AthleteProfile
): { type: 'recovery_session' | 'early_deload'; reason: string } | null {
  const recentAccum = meso.sessions
    .filter((s) => s.status === 'completed' && !s.isDeload && !s.isRecoverySession)
    .slice(-4);

  if (recentAccum.length === 0) return null;

  let severeFlags = 0;
  let mildFlags = 0;
  let highPainSessions = 0;

  for (const session of recentAccum) {
    const feedbacks = Object.values(session.feedback);
    const hasSeverePain =
      feedbacks.some((f) => f.jointPainMax >= 5) ||
      session.exercises.some((ex) => ex.sets.some((set) => set.painScore >= 5));

    if (hasSeverePain) highPainSessions += 1;

    for (const fb of feedbacks) {
      if (fb.v4Rating <= -2 || fb.workload === 3) severeFlags += 1;
      else if (fb.v4Rating === -1 || fb.jointPainMax >= 3) mildFlags += 1;
    }
  }

  const isOlder = profile.ageTier === '50_64' || profile.ageTier === '65_plus';
  const earlyDeloadThreshold = isOlder ? 2 : 3;

  if (severeFlags >= earlyDeloadThreshold || highPainSessions >= 2) {
    return {
      type: 'early_deload',
      reason:
        highPainSessions >= 2
          ? 'Multiple recent sessions recorded 5+/10 joint pain. An early deload week will clear joint inflammation.'
          : 'Accumulated fatigue (-2 ratings / excessive workload) detected across recent muscles. Starting an early deload protects long-term gains.',
    };
  }

  if (mildFlags >= 3 || severeFlags >= 1 || highPainSessions === 1) {
    return {
      type: 'recovery_session',
      reason:
        'Elevated local fatigue or joint tenderness flagged recently. Consider converting today into a light Recovery Session (50% sets, 70% load, 4 RIR).',
    };
  }

  return null;
}
