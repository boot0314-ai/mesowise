export type WeightUnit = 'lb' | 'kg';

export type AgeTier = 'under_35' | '35_49' | '50_64' | '65_plus';

export type JointRegion =
  | 'shoulder'
  | 'lower_back'
  | 'knee'
  | 'elbow'
  | 'wrist'
  | 'hip'
  | 'neck'
  | 'ankle';

export type JointStatus = 'healthy' | 'sensitive' | 'recovering' | 'avoid';

export interface JointEntry {
  status: JointStatus;
  notes: string;
  painBaseline: number;
}

export type EquipmentType =
  | 'barbell'
  | 'dumbbell'
  | 'cable'
  | 'machine'
  | 'smith'
  | 'bodyweight'
  | 'bands';

export type MuscleGroup =
  | 'chest'
  | 'back_lats'
  | 'back_upper'
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'side_delts'
  | 'rear_delts'
  | 'front_delts'
  | 'biceps'
  | 'triceps'
  | 'calves'
  | 'abs';

export type ProgressionType = 'double' | 'weight' | 'rep' | 'none';

export type AxialLoadLevel = 'none' | 'low' | 'moderate' | 'high';

export type MusclePriority = 'grow' | 'maintain' | 'low';

export interface ExerciseDefinition {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles: MuscleGroup[];
  equipment: EquipmentType;
  unilateral: boolean;
  defaultRepRange: {
    min: number;
    max: number;
  };
  defaultIncrementLb: number;
  defaultIncrementKg: number;
  /** Stimulus-to-Fatigue Ratio from 1 (poor) to 10 (elite local stimulus, low systemic/joint fatigue). */
  sfrScore: number;
  axialLoad: AxialLoadLevel;
  /** 0 = negligible, 1 = mild, 2 = moderate, 3 = high stress on joint */
  jointStress: Partial<Record<JointRegion, 0 | 1 | 2 | 3>>;
  /** Joints where 'recovering' or 'avoid' status triggers strong contraindication */
  contraindications: JointRegion[];
  swapGroup: string;
  eccentricCue: string;
  formNotes: string;
  isCustom?: boolean;
}

export interface DeloadConfig {
  weightRatio: number;
  repsRatio: number;
  setsRatio: number;
  dropLowPriority: boolean;
}

export interface AthleteProfile {
  unit: WeightUnit;
  ageTier: AgeTier;
  /** Caps final accumulation week at 1 RIR instead of 0 RIR to protect joints & CNS. */
  jointSafeRirFloor: boolean;
  joints: Record<JointRegion, JointEntry>;
  equipment: EquipmentType[];
  autoDownSetMode: boolean;
  includeWarmups: boolean;
  defaultRestSec: number;
  deloadConfig: DeloadConfig;
  onboardingComplete: boolean;
}

export interface SetLog {
  id: string;
  setNumber: number;
  isWarmup?: boolean;
  isDownSet?: boolean;
  side?: 'both' | 'left' | 'right';
  targetWeight: number;
  targetRepsMin: number;
  targetRepsMax: number;
  targetRir: number;
  weight: number | null;
  reps: number | null;
  rir: number | null;
  painScore: number;
  painJoint?: JointRegion;
  completed: boolean;
  completedAt?: string;
}

export interface MuscleGroupFeedback {
  muscle: MuscleGroup;
  /** 0: Never sore, 1: Mild healed fast, 2: Noticeable healed on time, 3: Still sore for next session */
  soreness: 0 | 1 | 2 | 3;
  /** 0: No pump, 1: Light pump, 2: Solid pump, 3: Huge skin-splitting pump */
  pump: 0 | 1 | 2 | 3;
  /** 0: Easy / Could do more, 1: Sweet spot, 2: Challenging, 3: Too much / Crushed */
  workload: 0 | 1 | 2 | 3;
  jointPainMax: number;
  painJoint?: JointRegion;
  /** Liftosaur v4.1 normalized feedback scale (-2 to +2) */
  v4Rating: -2 | -1 | 0 | 1 | 2;
  /** Resulting weekly set adjustment */
  setsModifier: number;
  rationale: string;
}

export interface SessionExercise {
  id: string;
  exerciseId: string;
  muscle: MuscleGroup;
  progressionType: ProgressionType;
  targetMinReps: number;
  targetMaxReps: number;
  increment: number;
  startNumSets: number;
  numSets: number;
  lastWeight: number | null;
  weightIncreasedThisWeek: boolean;
  sets: SetLog[];
  swappedFromId?: string;
  swapReason?: string;
  coachNote?: string;
  eccentricOverride?: string;
}

export interface WorkoutSession {
  id: string;
  mesoId: string;
  weekNumber: number;
  dayIndex: number;
  dayName: string;
  isDeload: boolean;
  isRecoverySession: boolean;
  stiffToday?: boolean;
  targetRir: number;
  status: 'planned' | 'in_progress' | 'completed';
  startedAt?: string;
  completedAt?: string;
  exercises: SessionExercise[];
  feedback: Record<string, MuscleGroupFeedback>;
}

export interface Mesocycle {
  id: string;
  name: string;
  templateId: string;
  totalWeeks: number;
  currentWeek: number;
  createdAt: string;
  status: 'active' | 'completed';
  musclePriorities: Partial<Record<MuscleGroup, MusclePriority>>;
  sessions: WorkoutSession[];
}

export interface PainEvent {
  id: string;
  timestamp: string;
  exerciseId: string;
  exerciseName: string;
  joint: JointRegion;
  painScore: number;
  weight: number | null;
  reps: number | null;
  actionTaken?: string;
}

export interface AppState {
  profile: AthleteProfile;
  customExercises: ExerciseDefinition[];
  mesocycles: Mesocycle[];
  activeMesoId: string | null;
  painHistory: PainEvent[];
}

export interface TemplateExerciseSlot {
  exerciseId: string;
  muscle: MuscleGroup;
  sets: number;
  progressionType: ProgressionType;
  repRange?: { min: number; max: number };
}

export interface TemplateDay {
  dayName: string;
  focusSummary: string;
  slots: TemplateExerciseSlot[];
}

export interface MesoTemplate {
  id: string;
  name: string;
  subtitle: string;
  daysPerWeek: number;
  recommendedWeeks: number;
  olderLifterFriendly: boolean;
  description: string;
  defaultPriorities: Partial<Record<MuscleGroup, MusclePriority>>;
  days: TemplateDay[];
}

export interface VolumeLandmarks {
  mv: number;
  mev: number;
  mav: number;
  mrv: number;
  scaleFactor: number;
  notes: string;
}

export type SafetyLevel = 'safe' | 'modify' | 'caution' | 'avoid';

export interface SafetyAssessment {
  level: SafetyLevel;
  score: number;
  affectedJoints: JointRegion[];
  reasons: string[];
  tempoCue: string;
  repRangeShift: number;
  romGuidance?: string;
  finisherTip?: string;
}

export interface SwapCandidate {
  exercise: ExerciseDefinition;
  safety: SafetyAssessment;
  rankScore: number;
  rationale: string;
}

export interface SessionBriefingItem {
  exerciseId: string;
  exerciseName: string;
  level: SafetyLevel;
  headline: string;
  detail: string;
  topSwap?: SwapCandidate;
}

export interface SessionBriefing {
  overallStatus: SafetyLevel;
  headline: string;
  items: SessionBriefingItem[];
  deloadPrompt: { type: 'recovery_session' | 'early_deload'; reason: string } | null;
}
