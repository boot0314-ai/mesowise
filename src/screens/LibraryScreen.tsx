import { Plus, Search, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SafetyBadge, SfrBadge } from '../components/SafetyBadge';
import {
  ALL_EQUIPMENT,
  ALL_JOINTS,
  ALL_MUSCLES,
  EQUIPMENT_LABELS,
  JOINT_LABELS,
  MUSCLE_LABELS,
} from '../data/constants';
import { assessExerciseSafety } from '../engine/injuryAdvisor';
import {
  AthleteProfile,
  EquipmentType,
  ExerciseDefinition,
  JointRegion,
  MuscleGroup,
  PainEvent,
} from '../types/models';

interface LibraryScreenProps {
  allExercises: ExerciseDefinition[];
  profile: AthleteProfile;
  painHistory: PainEvent[];
  onAddCustomExercise: (exercise: ExerciseDefinition) => void;
}

export function LibraryScreen({
  allExercises,
  profile,
  painHistory,
  onAddCustomExercise,
}: LibraryScreenProps) {
  const [query, setQuery] = useState('');
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | 'all'>('all');
  const [equipFilter, setEquipFilter] = useState<EquipmentType | 'all'>('all');
  const [safeOnly, setSafeOnly] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Custom exercise form state
  const [customName, setCustomName] = useState('');
  const [customMuscle, setCustomMuscle] = useState<MuscleGroup>('chest');
  const [customEquip, setCustomEquip] = useState<EquipmentType>('machine');
  const [customMinReps, setCustomMinReps] = useState(10);
  const [customMaxReps, setCustomMaxReps] = useState(15);
  const [customUnilateral, setCustomUnilateral] = useState(false);
  const [customCue, setCustomCue] = useState('3s controlled eccentric, smooth contraction');
  const [customStressJoint, setCustomStressJoint] = useState<JointRegion | 'none'>('none');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allExercises
      .map((ex) => ({
        ex,
        safety: assessExerciseSafety(ex, profile, painHistory),
      }))
      .filter(({ ex, safety }) => {
        if (q && !ex.name.toLowerCase().includes(q)) return false;
        if (muscleFilter !== 'all' && ex.primaryMuscle !== muscleFilter) return false;
        if (equipFilter !== 'all' && ex.equipment !== equipFilter) return false;
        if (safeOnly && (safety.level === 'avoid' || safety.level === 'caution')) {
          return false;
        }
        return true;
      })
      .sort((a, b) => b.ex.sfrScore - a.ex.sfrScore);
  }, [allExercises, profile, painHistory, query, muscleFilter, equipFilter, safeOnly]);

  const handleSaveCustom = () => {
    if (!customName.trim()) return;
    const def: ExerciseDefinition = {
      id: `custom_${Date.now()}`,
      name: customName.trim(),
      primaryMuscle: customMuscle,
      secondaryMuscles: [],
      equipment: customEquip,
      unilateral: customUnilateral,
      defaultRepRange: {
        min: Math.max(4, customMinReps),
        max: Math.max(customMinReps + 2, customMaxReps),
      },
      defaultIncrementLb: 5,
      defaultIncrementKg: 2.5,
      sfrScore: customEquip === 'machine' || customEquip === 'cable' ? 9.0 : 8.2,
      axialLoad: 'none',
      jointStress:
        customStressJoint !== 'none' ? { [customStressJoint]: 1 } : {},
      contraindications: [],
      swapGroup: `custom_${customMuscle}`,
      eccentricCue: customCue.trim() || '3s controlled eccentric',
      formNotes: 'Custom user exercise.',
      isCustom: true,
    };
    onAddCustomExercise(def);
    setCustomName('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-4 pb-28">
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Exercise Library</h1>
            <p className="text-xs text-slate-400">
              {filtered.length} movements sorted by Stimulus-to-Fatigue Ratio
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex h-10 items-center gap-1 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-slate-950"
          >
            <Plus className="h-4 w-4" />
            Add Custom
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search machines, cables, exercises..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-11 w-full rounded-xl border border-slate-700 bg-[#0B0E14] pl-9 pr-3 text-sm text-white placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={muscleFilter}
            onChange={(e) => setMuscleFilter(e.target.value as MuscleGroup | 'all')}
            aria-label="Filter by muscle group"
            className="h-9 rounded-xl border border-slate-700 bg-[#0B0E14] px-2.5 text-xs font-medium text-slate-200"
          >
            <option value="all">All Muscles</option>
            {ALL_MUSCLES.map((m) => (
              <option key={m} value={m}>
                {MUSCLE_LABELS[m]}
              </option>
            ))}
          </select>

          <select
            value={equipFilter}
            onChange={(e) => setEquipFilter(e.target.value as EquipmentType | 'all')}
            aria-label="Filter by equipment"
            className="h-9 rounded-xl border border-slate-700 bg-[#0B0E14] px-2.5 text-xs font-medium text-slate-200"
          >
            <option value="all">All Gear</option>
            {ALL_EQUIPMENT.map((eq) => (
              <option key={eq} value={eq}>
                {EQUIPMENT_LABELS[eq]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setSafeOnly((s) => !s)}
            className={`flex h-9 items-center gap-1.5 rounded-xl border px-3 text-xs font-semibold ${
              safeOnly
                ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                : 'border-slate-700 bg-[#0B0E14] text-slate-300'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Safe for My Joints
          </button>
        </div>
      </div>

      <div className="space-y-2.5">
        {filtered.map(({ ex, safety }) => {
          const jointTags = (Object.keys(ex.jointStress) as JointRegion[]).filter(
            (j) => (ex.jointStress[j] ?? 0) >= 2
          );
          return (
            <div
              key={ex.id}
              className="rounded-2xl border border-[#1E2635] bg-[#141923] p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                    {MUSCLE_LABELS[ex.primaryMuscle]} • {EQUIPMENT_LABELS[ex.equipment]}
                  </div>
                  <h2 className="mt-0.5 text-sm font-bold text-white">{ex.name}</h2>
                </div>
                <SfrBadge score={ex.sfrScore} />
              </div>

              <div className="mt-2 flex flex-wrap gap-1.5">
                <SafetyBadge level={safety.level} />
                <span className="rounded-full border border-slate-700 bg-[#0B0E14] px-2 py-0.5 text-[11px] text-slate-300">
                  Axial: {ex.axialLoad}
                </span>
                {jointTags.map((j) => (
                  <span
                    key={j}
                    className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-300"
                  >
                    {JOINT_LABELS[j]} {ex.jointStress[j]}/3
                  </span>
                ))}
              </div>

              <p className="mt-2 text-xs text-slate-300">
                <span className="font-semibold text-slate-200">Cue:</span> {ex.eccentricCue}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{ex.formNotes}</p>
            </div>
          );
        })}
      </div>

      {/* Add Custom Exercise Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-xs sm:items-center">
          <div className="w-full max-w-[460px] rounded-t-3xl border border-[#1E2635] bg-[#141923] p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Add Custom Exercise</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-300"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Exercise Name</label>
                <input
                  type="text"
                  placeholder="e.g. Prime Plate-Loaded Chest Press"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-[#0B0E14] px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Primary Muscle</label>
                  <select
                    value={customMuscle}
                    onChange={(e) => setCustomMuscle(e.target.value as MuscleGroup)}
                    className="h-10 w-full rounded-xl border border-slate-700 bg-[#0B0E14] px-2.5 text-xs text-white"
                  >
                    {ALL_MUSCLES.map((m) => (
                      <option key={m} value={m}>
                        {MUSCLE_LABELS[m]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Equipment</label>
                  <select
                    value={customEquip}
                    onChange={(e) => setCustomEquip(e.target.value as EquipmentType)}
                    className="h-10 w-full rounded-xl border border-slate-700 bg-[#0B0E14] px-2.5 text-xs text-white"
                  >
                    {ALL_EQUIPMENT.map((eq) => (
                      <option key={eq} value={eq}>
                        {EQUIPMENT_LABELS[eq]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Min Reps</label>
                  <input
                    type="number"
                    value={customMinReps}
                    onChange={(e) => setCustomMinReps(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-slate-700 bg-[#0B0E14] px-3 text-sm text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">Max Reps</label>
                  <input
                    type="number"
                    value={customMaxReps}
                    onChange={(e) => setCustomMaxReps(Number(e.target.value))}
                    className="h-10 w-full rounded-xl border border-slate-700 bg-[#0B0E14] px-3 text-sm text-white"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Primary Joint Involved (optional)
                </label>
                <select
                  value={customStressJoint}
                  onChange={(e) => setCustomStressJoint(e.target.value as JointRegion | 'none')}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-[#0B0E14] px-2.5 text-xs text-white"
                >
                  <option value="none">None / Minimal</option>
                  {ALL_JOINTS.map((j) => (
                    <option key={j} value={j}>
                      {JOINT_LABELS[j]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs text-slate-400">Eccentric Cue</label>
                <input
                  type="text"
                  value={customCue}
                  onChange={(e) => setCustomCue(e.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-700 bg-[#0B0E14] px-3 text-xs text-white"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={customUnilateral}
                  onChange={(e) => setCustomUnilateral(e.target.checked)}
                  className="h-4 w-4 accent-emerald-500"
                />
                Unilateral (Left / Right tracking)
              </label>
            </div>

            <button
              type="button"
              onClick={handleSaveCustom}
              className="mt-5 h-12 w-full rounded-2xl bg-emerald-500 text-sm font-bold text-slate-950"
            >
              Save Exercise
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
