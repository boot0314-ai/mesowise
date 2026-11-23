import { AgeTier, AthleteProfile, JointRegion, MuscleGroup, VolumeLandmarks } from '../types/models';

interface BaseLandmark {
  mv: number;
  mev: number;
  mav: number;
  mrv: number;
  supportingJoints: JointRegion[];
}

const BASE_LANDMARKS: Record<MuscleGroup, BaseLandmark> = {
  chest: { mv: 4, mev: 8, mav: 14, mrv: 20, supportingJoints: ['shoulder', 'elbow'] },
  back_lats: { mv: 4, mev: 8, mav: 14, mrv: 22, supportingJoints: ['shoulder', 'elbow'] },
  back_upper: { mv: 4, mev: 6, mav: 12, mrv: 18, supportingJoints: ['lower_back', 'shoulder'] },
  quads: { mv: 4, mev: 6, mav: 12, mrv: 18, supportingJoints: ['knee', 'lower_back'] },
  hamstrings: { mv: 4, mev: 6, mav: 12, mrv: 16, supportingJoints: ['lower_back', 'hip'] },
  glutes: { mv: 2, mev: 4, mav: 10, mrv: 16, supportingJoints: ['hip', 'lower_back'] },
  side_delts: { mv: 4, mev: 8, mav: 16, mrv: 24, supportingJoints: ['shoulder'] },
  rear_delts: { mv: 2, mev: 6, mav: 12, mrv: 20, supportingJoints: ['shoulder'] },
  front_delts: { mv: 0, mev: 2, mav: 8, mrv: 12, supportingJoints: ['shoulder'] },
  biceps: { mv: 4, mev: 6, mav: 14, mrv: 20, supportingJoints: ['elbow', 'wrist'] },
  triceps: { mv: 4, mev: 6, mav: 12, mrv: 18, supportingJoints: ['elbow', 'shoulder'] },
  calves: { mv: 4, mev: 6, mav: 12, mrv: 16, supportingJoints: ['ankle'] },
  abs: { mv: 0, mev: 4, mav: 12, mrv: 18, supportingJoints: ['lower_back'] },
};

const AGE_VOLUME_SCALE: Record<AgeTier, number> = {
  under_35: 1.0,
  '35_49': 0.9,
  '50_64': 0.8,
  '65_plus': 0.72,
};

/**
 * Computes age- and joint-adapted Renaissance Periodization volume landmarks
 * (MV, MEV, MAV, MRV in working sets per week) for a muscle group.
 */
export function getAdaptedLandmarks(
  muscle: MuscleGroup,
  profile: AthleteProfile
): VolumeLandmarks {
  const base = BASE_LANDMARKS[muscle];
  const ageScale = AGE_VOLUME_SCALE[profile.ageTier];

  let jointScale = 1.0;
  const jointReasons: string[] = [];

  for (const joint of base.supportingJoints) {
    const status = profile.joints[joint]?.status ?? 'healthy';
    if (status === 'avoid') {
      jointScale = Math.min(jointScale, 0.65);
      jointReasons.push(`${joint.replace('_', ' ')} (avoid)`);
    } else if (status === 'recovering') {
      jointScale = Math.min(jointScale, 0.78);
      jointReasons.push(`${joint.replace('_', ' ')} (recovering)`);
    } else if (status === 'sensitive') {
      jointScale = Math.min(jointScale, 0.9);
      jointReasons.push(`${joint.replace('_', ' ')} (sensitive)`);
    }
  }

  const combinedScale = Number((ageScale * jointScale).toFixed(2));

  const mv = base.mv === 0 ? 0 : Math.max(2, Math.round(base.mv * Math.max(0.75, ageScale)));
  const mev = Math.max(mv, Math.round(base.mev * combinedScale));
  const mav = Math.max(mev + 2, Math.round(base.mav * combinedScale));
  const mrv = Math.max(mav + 2, Math.round(base.mrv * combinedScale));

  const parts: string[] = [];
  if (ageScale < 1) {
    parts.push(`${Math.round(ageScale * 100)}% age recovery scaling`);
  }
  if (jointReasons.length > 0) {
    parts.push(`capped for ${jointReasons.join(', ')}`);
  }

  return {
    mv,
    mev,
    mav,
    mrv,
    scaleFactor: combinedScale,
    notes:
      parts.length > 0
        ? `Adapted landmarks (${parts.join('; ')}).`
        : 'Standard RP hypertrophy landmarks.',
  };
}

const MAX_SESSION_SETS_BY_AGE: Record<AgeTier, number> = {
  under_35: 10,
  '35_49': 8,
  '50_64': 6,
  '65_plus': 5,
};

/**
 * Returns the maximum productive working sets per muscle in a single session
 * before local tendon/connective-tissue inflammation outpaces hypertrophic stimulus.
 */
export function getMaxSessionSetsPerMuscle(
  profile: Pick<AthleteProfile, 'ageTier'>
): number {
  return MAX_SESSION_SETS_BY_AGE[profile.ageTier];
}

/**
 * Returns the per-exercise working set cap for safe progressive volume.
 */
export function getMaxSetsPerExercise(
  profile: Pick<AthleteProfile, 'ageTier'>
): number {
  return profile.ageTier === '50_64' || profile.ageTier === '65_plus' ? 5 : 6;
}
