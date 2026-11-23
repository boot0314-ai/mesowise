import { JOINT_LABELS } from '../data/constants';
import {
  AthleteProfile,
  ExerciseDefinition,
  JointRegion,
  PainEvent,
  SafetyAssessment,
  SafetyLevel,
  SessionBriefing,
  SessionBriefingItem,
  SwapCandidate,
  WorkoutSession,
} from '../types/models';

const LEVEL_RANK: Record<SafetyLevel, number> = {
  safe: 0,
  modify: 1,
  caution: 2,
  avoid: 3,
};

const AXIAL_PENALTY: Record<ExerciseDefinition['axialLoad'], number> = {
  none: 0,
  low: 4,
  moderate: 10,
  high: 20,
};

function elevateLevel(current: SafetyLevel, next: SafetyLevel): SafetyLevel {
  return LEVEL_RANK[next] > LEVEL_RANK[current] ? next : current;
}

/**
 * Evaluates an exercise against the athlete's joint/injury profile, age tier,
 * and recent logged pain events.
 */
export function assessExerciseSafety(
  exercise: ExerciseDefinition,
  profile: AthleteProfile,
  recentPainEvents: PainEvent[] = []
): SafetyAssessment {
  let level: SafetyLevel = 'safe';
  let penalty = 0;
  const affectedSet = new Set<JointRegion>();
  const reasons: string[] = [];

  const allJoints = Object.keys(exercise.jointStress) as JointRegion[];

  for (const joint of allJoints) {
    const stress = exercise.jointStress[joint] ?? 0;
    if (stress === 0) continue;

    const entry = profile.joints[joint];
    if (!entry || entry.status === 'healthy') continue;

    const isContra = exercise.contraindications.includes(joint);
    const label = JOINT_LABELS[joint];

    if (entry.status === 'avoid') {
      if (stress >= 2 || isContra) {
        level = elevateLevel(level, 'avoid');
        penalty += 60;
        affectedSet.add(joint);
        reasons.push(`${label} marked Avoid — high joint stress (${stress}/3).`);
      } else if (stress === 1) {
        level = elevateLevel(level, 'caution');
        penalty += 25;
        affectedSet.add(joint);
        reasons.push(`${label} marked Avoid — mild stress; monitor closely.`);
      }
    } else if (entry.status === 'recovering') {
      if (stress >= 3 || isContra) {
        level = elevateLevel(level, 'avoid');
        penalty += 50;
        affectedSet.add(joint);
        reasons.push(`${label} is Recovering — contraindicated movement pattern.`);
      } else if (stress === 2) {
        level = elevateLevel(level, 'caution');
        penalty += 28;
        affectedSet.add(joint);
        reasons.push(`${label} is Recovering — moderate joint torque; higher reps/tempo advised.`);
      } else if (stress === 1) {
        level = elevateLevel(level, 'modify');
        penalty += 10;
        affectedSet.add(joint);
        reasons.push(`${label} is Recovering — use 3s controlled eccentric.`);
      }
    } else if (entry.status === 'sensitive') {
      if (stress >= 3 || isContra) {
        level = elevateLevel(level, 'caution');
        penalty += 30;
        affectedSet.add(joint);
        reasons.push(`${label} is Sensitive — high joint stress (${stress}/3); swap recommended.`);
      } else if (stress === 2) {
        level = elevateLevel(level, 'modify');
        penalty += 14;
        affectedSet.add(joint);
        reasons.push(`${label} is Sensitive — shift reps higher & slow the negative.`);
      }
    }
  }

  // Recent logged pain history check (last 14 days / all passed events)
  const matchingPain = recentPainEvents.filter(
    (ev) => ev.exerciseId === exercise.id && ev.painScore >= 3
  );
  if (matchingPain.length > 0) {
    const maxPain = Math.max(...matchingPain.map((p) => p.painScore));
    const latest = matchingPain[matchingPain.length - 1];
    affectedSet.add(latest.joint);

    if (maxPain >= 5 && matchingPain.length >= 2) {
      level = elevateLevel(level, 'avoid');
      penalty += 45;
      reasons.push(`Repeated ${maxPain}/10 pain logged recently on ${JOINT_LABELS[latest.joint]}.`);
    } else if (maxPain >= 5) {
      level = elevateLevel(level, 'caution');
      penalty += 30;
      reasons.push(`Recent ${maxPain}/10 ${JOINT_LABELS[latest.joint]} pain logged — consider high-SFR swap.`);
    } else {
      level = elevateLevel(level, 'modify');
      penalty += 12;
      reasons.push(`Recent mild (${maxPain}/10) discomfort — hold load & favor 3s eccentric.`);
    }
  }

  // Older lifter axial-load advisory
  const isOlder = profile.ageTier === '50_64' || profile.ageTier === '65_plus';
  if (isOlder && exercise.axialLoad === 'high') {
    level = elevateLevel(level, 'modify');
    penalty += 15;
    reasons.push('High spinal/axial fatigue — machines or supported variations give better SFR 50+.');
  } else if (profile.ageTier === '65_plus' && exercise.axialLoad === 'moderate') {
    penalty += 8;
    reasons.push('Moderate axial load — prioritize strict bracing and controlled tempo.');
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - penalty - AXIAL_PENALTY[exercise.axialLoad] * 0.4)));
  const repRangeShift = level === 'caution' || level === 'avoid' ? 4 : level === 'modify' ? 2 : 0;
  const tempoCue =
    level === 'safe'
      ? exercise.eccentricCue
      : `3s controlled eccentric — ${exercise.eccentricCue}`;

  return {
    level,
    score,
    affectedJoints: Array.from(affectedSet),
    reasons,
    tempoCue,
    repRangeShift,
  };
}

/**
 * Recommends the safest, highest-SFR alternative exercises from the user's available equipment.
 */
export function recommendJointFriendlySwaps(
  currentExercise: ExerciseDefinition,
  allExercises: ExerciseDefinition[],
  profile: AthleteProfile,
  painJoint?: JointRegion,
  limit = 5,
  recentPainEvents: PainEvent[] = []
): SwapCandidate[] {
  const candidates: SwapCandidate[] = [];

  for (const ex of allExercises) {
    if (ex.id === currentExercise.id) continue;
    if (!profile.equipment.includes(ex.equipment)) continue;

    // Match same swapGroup or same primaryMuscle
    const sameSwapGroup = ex.swapGroup === currentExercise.swapGroup;
    const sameMuscle = ex.primaryMuscle === currentExercise.primaryMuscle;
    if (!sameSwapGroup && !sameMuscle) continue;

    const safety = assessExerciseSafety(ex, profile, recentPainEvents);
    if (safety.level === 'avoid') continue;

    let rankScore = 0;
    if (sameSwapGroup) rankScore += 30;
    if (sameMuscle) rankScore += 15;

    // Safety level weight
    if (safety.level === 'safe') rankScore += 35;
    else if (safety.level === 'modify') rankScore += 15;
    else rankScore -= 10;

    // Prioritize unloading the flagged joint specifically
    if (painJoint) {
      const targetStress = ex.jointStress[painJoint] ?? 0;
      const currentStress = currentExercise.jointStress[painJoint] ?? 0;
      rankScore += (3 - targetStress) * 18;
      if (targetStress < currentStress) {
        rankScore += 12;
      }
    }

    // Also reward low stress on all non-healthy joints in profile
    for (const [jointKey, entry] of Object.entries(profile.joints) as [JointRegion, AthleteProfile['joints'][JointRegion]][]) {
      if (entry.status !== 'healthy') {
        const s = ex.jointStress[jointKey] ?? 0;
        rankScore += (3 - s) * 8;
      }
    }

    // SFR & axial fatigue efficiency
    rankScore += ex.sfrScore * 5;
    if (ex.axialLoad === 'none') rankScore += 16;
    else if (ex.axialLoad === 'low') rankScore += 10;
    else if (ex.axialLoad === 'moderate') rankScore += 2;
    else rankScore -= 12;

    const rationaleParts: string[] = [];
    if (painJoint) {
      const targetStress = ex.jointStress[painJoint] ?? 0;
      const currentStress = currentExercise.jointStress[painJoint] ?? 0;
      if (targetStress < currentStress) {
        rationaleParts.push(
          `Drops ${JOINT_LABELS[painJoint].toLowerCase()} stress (${currentStress}/3 → ${targetStress}/3)`
        );
      } else if (targetStress === 0) {
        rationaleParts.push(`Zero ${JOINT_LABELS[painJoint].toLowerCase()} stress`);
      }
    }
    rationaleParts.push(`SFR ${ex.sfrScore.toFixed(1)}/10`);
    if (ex.axialLoad === 'none') {
      rationaleParts.push('no spinal/axial load');
    }

    candidates.push({
      exercise: ex,
      safety,
      rankScore: Math.round(rankScore),
      rationale: rationaleParts.join(' • '),
    });
  }

  candidates.sort((a, b) => b.rankScore - a.rankScore);
  return candidates.slice(0, limit);
}

/**
 * Generates an actionable Science Coach briefing for a workout session.
 */
export function generateSessionBriefing(
  session: WorkoutSession,
  allExercises: ExerciseDefinition[],
  profile: AthleteProfile,
  painHistory: PainEvent[],
  deloadPrompt: SessionBriefing['deloadPrompt'] = null
): SessionBriefing {
  const byId = new Map(allExercises.map((e) => [e.id, e]));
  const items: SessionBriefingItem[] = [];
  let overallStatus: SafetyLevel = 'safe';

  for (const slot of session.exercises) {
    const def = byId.get(slot.exerciseId);
    if (!def) continue;

    const assessment = assessExerciseSafety(def, profile, painHistory);
    overallStatus = elevateLevel(overallStatus, assessment.level);

    if (assessment.level !== 'safe') {
      const swaps = recommendJointFriendlySwaps(
        def,
        allExercises,
        profile,
        assessment.affectedJoints[0],
        1,
        painHistory
      );
      items.push({
        exerciseId: def.id,
        exerciseName: def.name,
        level: assessment.level,
        headline:
          assessment.level === 'avoid'
            ? `Swap recommended for ${def.name}`
            : assessment.level === 'caution'
              ? `Joint caution on ${def.name}`
              : `Modified tempo & rep guard on ${def.name}`,
        detail: assessment.reasons.join(' '),
        topSwap: swaps[0],
      });
    }
  }

  let headline = 'All planned exercises look joint-friendly for your profile.';
  if (session.isDeload) {
    headline = 'Deload week: submaximal loads & half-volume to clear systemic fatigue.';
  } else if (session.isRecoverySession) {
    headline = 'Recovery session active: light 70% load & 4 RIR to restore readiness.';
  } else if (overallStatus === 'avoid' || overallStatus === 'caution') {
    headline = `${items.length} exercise${items.length > 1 ? 's' : ''} flagged for your joint profile — high-SFR swaps ready.`;
  } else if (overallStatus === 'modify') {
    headline = 'Older-lifter & joint tempo protections active (controlled eccentrics & moderate-high reps).';
  }

  return {
    overallStatus,
    headline,
    items,
    deloadPrompt,
  };
}
