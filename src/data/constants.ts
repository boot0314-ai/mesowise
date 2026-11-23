import {
  AgeTier,
  AthleteProfile,
  EquipmentType,
  JointRegion,
  JointStatus,
  MuscleGroup,
} from '../types/models';

export const MUSCLE_LABELS: Record<MuscleGroup, string> = {
  chest: 'Chest',
  back_lats: 'Back (Lats)',
  back_upper: 'Upper Back',
  quads: 'Quads',
  hamstrings: 'Hamstrings',
  glutes: 'Glutes',
  side_delts: 'Side Delts',
  rear_delts: 'Rear Delts',
  front_delts: 'Front Delts',
  biceps: 'Biceps',
  triceps: 'Triceps',
  calves: 'Calves',
  abs: 'Abs / Core',
};

export const JOINT_LABELS: Record<JointRegion, string> = {
  shoulder: 'Shoulders',
  lower_back: 'Lower Back',
  knee: 'Knees',
  elbow: 'Elbows',
  wrist: 'Wrists',
  hip: 'Hips',
  neck: 'Neck / Cervical',
  ankle: 'Ankles',
};

export const JOINT_STATUS_LABELS: Record<JointStatus, string> = {
  healthy: 'Healthy',
  sensitive: 'Sensitive',
  recovering: 'Recovering',
  avoid: 'Avoid Stress',
};

export const EQUIPMENT_LABELS: Record<EquipmentType, string> = {
  barbell: 'Barbell',
  dumbbell: 'Dumbbells',
  cable: 'Cables',
  machine: 'Machines',
  smith: 'Smith Machine',
  bodyweight: 'Bodyweight',
  bands: 'Bands',
};

export const AGE_TIER_LABELS: Record<AgeTier, { label: string; subtitle: string }> = {
  under_35: { label: 'Under 35', subtitle: 'Standard RP volume landmarks & recovery' },
  '35_49': { label: '35 – 49', subtitle: 'Mild recovery buffer (~90% volume ceiling)' },
  '50_64': { label: '50 – 64 (Masters)', subtitle: 'Joint-protective rep shifts & ~80% volume ceiling' },
  '65_plus': { label: '65+ (Senior Longevity)', subtitle: 'High-SFR bias, tendon warm-ups & ~72% volume ceiling' },
};

export const ALL_JOINTS: JointRegion[] = [
  'shoulder',
  'lower_back',
  'knee',
  'elbow',
  'wrist',
  'hip',
  'neck',
  'ankle',
];

export const ALL_EQUIPMENT: EquipmentType[] = [
  'machine',
  'cable',
  'dumbbell',
  'barbell',
  'smith',
  'bodyweight',
  'bands',
];

export const ALL_MUSCLES: MuscleGroup[] = [
  'chest',
  'back_lats',
  'back_upper',
  'quads',
  'hamstrings',
  'glutes',
  'side_delts',
  'rear_delts',
  'front_delts',
  'biceps',
  'triceps',
  'calves',
  'abs',
];

export function createDefaultProfile(): AthleteProfile {
  return {
    unit: 'lb',
    ageTier: '50_64',
    jointSafeRirFloor: true,
    joints: {
      shoulder: { status: 'healthy', notes: '', painBaseline: 0 },
      lower_back: { status: 'healthy', notes: '', painBaseline: 0 },
      knee: { status: 'healthy', notes: '', painBaseline: 0 },
      elbow: { status: 'healthy', notes: '', painBaseline: 0 },
      wrist: { status: 'healthy', notes: '', painBaseline: 0 },
      hip: { status: 'healthy', notes: '', painBaseline: 0 },
      neck: { status: 'healthy', notes: '', painBaseline: 0 },
      ankle: { status: 'healthy', notes: '', painBaseline: 0 },
    },
    equipment: ['machine', 'cable', 'dumbbell', 'barbell', 'smith', 'bodyweight'],
    autoDownSetMode: true,
    includeWarmups: true,
    defaultRestSec: 120,
    deloadConfig: {
      weightRatio: 0.6,
      repsRatio: 0.7,
      setsRatio: 0.5,
      dropLowPriority: true,
    },
    onboardingComplete: false,
  };
}
