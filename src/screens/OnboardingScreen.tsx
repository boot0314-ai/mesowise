import {
  ArrowLeft,
  ArrowRight,
  Check,
  Dumbbell,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  AGE_TIER_LABELS,
  ALL_EQUIPMENT,
  ALL_JOINTS,
  EQUIPMENT_LABELS,
  JOINT_LABELS,
  JOINT_STATUS_LABELS,
} from '../data/constants';
import { MESO_TEMPLATES } from '../data/templates';
import { assessExerciseSafety } from '../engine/injuryAdvisor';
import {
  AgeTier,
  AthleteProfile,
  EquipmentType,
  ExerciseDefinition,
  JointRegion,
  JointStatus,
  MesoTemplate,
  WeightUnit,
} from '../types/models';

interface OnboardingScreenProps {
  initialProfile: AthleteProfile;
  allExercises: ExerciseDefinition[];
  onComplete: (
    profile: AthleteProfile,
    template: MesoTemplate,
    mesoName: string,
    totalWeeks: number
  ) => void;
}

const STATUS_CYCLE: JointStatus[] = ['healthy', 'sensitive', 'recovering', 'avoid'];

const STATUS_STYLE: Record<JointStatus, string> = {
  healthy: 'border-slate-700 bg-[#0B0E14] text-slate-300',
  sensitive: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
  recovering: 'border-orange-500/60 bg-orange-500/20 text-orange-200',
  avoid: 'border-rose-500/60 bg-rose-500/20 text-rose-200',
};

export function OnboardingScreen({
  initialProfile,
  allExercises,
  onComplete,
}: OnboardingScreenProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [profile, setProfile] = useState<AthleteProfile>(initialProfile);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('masters-upper-lower-4');
  const [mesoName, setMesoName] = useState<string>('Joint-Friendly Hypertrophy Block');
  const [totalWeeks, setTotalWeeks] = useState<number>(5);

  const selectedTemplate = useMemo(
    () => MESO_TEMPLATES.find((t) => t.id === selectedTemplateId) ?? MESO_TEMPLATES[0],
    [selectedTemplateId]
  );

  const byExerciseId = useMemo(
    () => new Map(allExercises.map((e) => [e.id, e])),
    [allExercises]
  );

  const cycleJointStatus = (joint: JointRegion) => {
    const current = profile.joints[joint].status;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length];
    setProfile((prev) => ({
      ...prev,
      joints: {
        ...prev.joints,
        [joint]: { ...prev.joints[joint], status: next },
      },
    }));
  };

  const toggleEquipment = (eq: EquipmentType) => {
    setProfile((prev) => {
      const exists = prev.equipment.includes(eq);
      const next = exists
        ? prev.equipment.filter((e) => e !== eq)
        : [...prev.equipment, eq];
      return { ...prev, equipment: next.length > 0 ? next : ['bodyweight'] };
    });
  };

  const applyEquipmentPreset = (preset: 'gym' | 'home_db' | 'minimal') => {
    const map: Record<'gym' | 'home_db' | 'minimal', EquipmentType[]> = {
      gym: ['machine', 'cable', 'dumbbell', 'barbell', 'smith', 'bodyweight'],
      home_db: ['dumbbell', 'cable', 'bodyweight', 'bands'],
      minimal: ['dumbbell', 'bodyweight', 'bands'],
    };
    setProfile((prev) => ({ ...prev, equipment: map[preset] }));
  };

  const flaggedJoints = ALL_JOINTS.filter((j) => profile.joints[j].status !== 'healthy');

  const templatePreview = useMemo(() => {
    return MESO_TEMPLATES.map((tpl) => {
      let autoSwaps = 0;
      let modified = 0;
      for (const day of tpl.days) {
        for (const slot of day.slots) {
          const def = byExerciseId.get(slot.exerciseId);
          if (!def) continue;
          const safety = assessExerciseSafety(def, profile);
          const hasEq = profile.equipment.includes(def.equipment);
          if (safety.level === 'avoid' || !hasEq) autoSwaps += 1;
          else if (safety.level === 'modify' || safety.level === 'caution') modified += 1;
        }
      }
      return { template: tpl, autoSwaps, modified };
    });
  }, [byExerciseId, profile]);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[460px] flex-col bg-[#0B0E14] px-4 pb-8 pt-6">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white">MesoWise</h1>
              <p className="text-[11px] text-slate-400">
                RP + Liftosaur v4.1 • Older-Lifter Science
              </p>
            </div>
          </div>
          <span className="rounded-full border border-[#1E2635] bg-[#141923] px-3 py-1 text-xs font-semibold text-slate-300 tabular-nums">
            Step {step} / 3
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-1.5">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-1.5 rounded-full transition-colors ${
                s <= step ? 'bg-emerald-500' : 'bg-[#1E2635]'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Step 1: Age & Training Guardrails */}
      {step === 1 && (
        <div className="flex-1 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-white">Age & Recovery Profile</h2>
            <p className="mt-1 text-xs text-slate-400">
              Adjusts weekly volume landmarks (MEV/MRV), rep targets, and tendon warm-ups automatically.
            </p>
          </div>

          <div className="space-y-2">
            {(Object.keys(AGE_TIER_LABELS) as AgeTier[]).map((tier) => {
              const info = AGE_TIER_LABELS[tier];
              const active = profile.ageTier === tier;
              return (
                <button
                  key={tier}
                  type="button"
                  onClick={() =>
                    setProfile((p) => ({
                      ...p,
                      ageTier: tier,
                      jointSafeRirFloor: tier === '50_64' || tier === '65_plus' ? true : p.jointSafeRirFloor,
                    }))
                  }
                  className={`flex w-full items-center justify-between rounded-2xl border p-3.5 text-left transition ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/12'
                      : 'border-[#1E2635] bg-[#141923]'
                  }`}
                >
                  <div>
                    <div className="text-sm font-bold text-white">{info.label}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{info.subtitle}</div>
                  </div>
                  {active && (
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-slate-950">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-[#1E2635] bg-[#141923] p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">Weight Units</span>
              <div className="flex rounded-xl border border-slate-700 bg-[#0B0E14] p-1">
                {(['lb', 'kg'] as WeightUnit[]).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setProfile((p) => ({ ...p, unit: u }))}
                    className={`min-w-[52px] rounded-lg px-3 py-1.5 text-xs font-bold uppercase ${
                      profile.unit === u
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-400'
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-[#1E2635] pt-3">
              <div>
                <div className="text-sm font-semibold text-white">Joint-Safe 1 RIR Floor</div>
                <div className="text-xs text-slate-400">
                  Caps peak accumulation at 1 RIR instead of grinding to 0 RIR failure.
                </div>
              </div>
              <input
                type="checkbox"
                checked={profile.jointSafeRirFloor}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, jointSafeRirFloor: e.target.checked }))
                }
                className="mt-1 h-5 w-5 accent-emerald-500"
              />
            </label>

            <label className="flex cursor-pointer items-start justify-between gap-3 border-t border-[#1E2635] pt-3">
              <div>
                <div className="text-sm font-semibold text-white">Tendon Warm-Up Ramp Sets</div>
                <div className="text-xs text-slate-400">
                  Auto-builds 50% / 70% / 85% ramp sets to warm synovial fluid & tendons.
                </div>
              </div>
              <input
                type="checkbox"
                checked={profile.includeWarmups}
                onChange={(e) =>
                  setProfile((p) => ({ ...p, includeWarmups: e.target.checked }))
                }
                className="mt-1 h-5 w-5 accent-emerald-500"
              />
            </label>
          </div>
        </div>
      )}

      {/* Step 2: Injury & Equipment */}
      {step === 2 && (
        <div className="flex-1 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-white">Injuries & Gym Gear</h2>
            <p className="mt-1 text-xs text-slate-400">
              Tap any joint to cycle <span className="text-slate-200">Healthy → Sensitive → Recovering → Avoid</span>. MesoWise will auto-adapt exercises and swap unsafe movements.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {ALL_JOINTS.map((joint) => {
              const entry = profile.joints[joint];
              return (
                <button
                  key={joint}
                  type="button"
                  onClick={() => cycleJointStatus(joint)}
                  className={`flex min-h-[58px] flex-col justify-between rounded-2xl border p-3 text-left transition active:scale-[0.98] ${STATUS_STYLE[entry.status]}`}
                >
                  <span className="text-sm font-bold">{JOINT_LABELS[joint]}</span>
                  <span className="text-[11px] font-medium opacity-90">
                    {JOINT_STATUS_LABELS[entry.status]}
                  </span>
                </button>
              );
            })}
          </div>

          {flaggedJoints.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-[#1E2635] bg-[#141923] p-3.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <ShieldAlert className="h-4 w-4" />
                Optional Injury Notes
              </div>
              {flaggedJoints.map((j) => (
                <div key={j} className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">
                    {JOINT_LABELS[j]} ({JOINT_STATUS_LABELS[profile.joints[j].status]})
                  </label>
                  <input
                    type="text"
                    value={profile.joints[j].notes}
                    placeholder={`e.g. mild ${JOINT_LABELS[j].toLowerCase()} tendonitis...`}
                    onChange={(e) =>
                      setProfile((p) => ({
                        ...p,
                        joints: {
                          ...p.joints,
                          [j]: { ...p.joints[j], notes: e.target.value },
                        },
                      }))
                    }
                    className="h-10 w-full rounded-xl border border-slate-700 bg-[#0B0E14] px-3 text-xs text-white placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="rounded-2xl border border-[#1E2635] bg-[#141923] p-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-sm font-bold text-white">
                <Dumbbell className="h-4 w-4 text-emerald-400" />
                Available Equipment
              </div>
            </div>
            <div className="mb-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyEquipmentPreset('gym')}
                className="rounded-lg border border-slate-700 bg-[#0B0E14] px-2.5 py-1 text-[11px] font-medium text-slate-300"
              >
                Full Gym
              </button>
              <button
                type="button"
                onClick={() => applyEquipmentPreset('home_db')}
                className="rounded-lg border border-slate-700 bg-[#0B0E14] px-2.5 py-1 text-[11px] font-medium text-slate-300"
              >
                DB + Cable
              </button>
              <button
                type="button"
                onClick={() => applyEquipmentPreset('minimal')}
                className="rounded-lg border border-slate-700 bg-[#0B0E14] px-2.5 py-1 text-[11px] font-medium text-slate-300"
              >
                DB + Bands
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_EQUIPMENT.map((eq) => {
                const active = profile.equipment.includes(eq);
                return (
                  <button
                    key={eq}
                    type="button"
                    onClick={() => toggleEquipment(eq)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      active
                        ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                        : 'border-slate-700 bg-[#0B0E14] text-slate-400'
                    }`}
                  >
                    {EQUIPMENT_LABELS[eq]}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Template */}
      {step === 3 && (
        <div className="flex-1 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-white">Choose Your Mesocycle</h2>
            <p className="mt-1 text-xs text-slate-400">
              Each block ramps from 3 RIR to {profile.jointSafeRirFloor ? '1 RIR' : '0 RIR'}, followed by an automatic deload week.
            </p>
          </div>

          <div className="space-y-2.5">
            {templatePreview.map(({ template, autoSwaps, modified }) => {
              const active = template.id === selectedTemplateId;
              return (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setSelectedTemplateId(template.id);
                    setMesoName(template.name);
                    setTotalWeeks(template.recommendedWeeks);
                  }}
                  className={`w-full rounded-2xl border p-3.5 text-left transition ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/12'
                      : 'border-[#1E2635] bg-[#141923]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-bold text-white">{template.name}</span>
                        {template.olderLifterFriendly && (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                            HIGH SFR
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {template.daysPerWeek} days/wk • {template.subtitle}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300">
                    {template.description}
                  </p>
                  {(autoSwaps > 0 || modified > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[11px]">
                      {autoSwaps > 0 && (
                        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-300">
                          {autoSwaps} exercise{autoSwaps > 1 ? 's' : ''} auto-swapped for your profile
                        </span>
                      )}
                      {modified > 0 && (
                        <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-sky-300">
                          {modified} tempo/rep guarded
                        </span>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-[#1E2635] bg-[#141923] p-4 space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Mesocycle Name
              </label>
              <input
                type="text"
                value={mesoName}
                onChange={(e) => setMesoName(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-700 bg-[#0B0E14] px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">
                  Meso Length (incl. final Deload week)
                </span>
                <span className="text-xs font-bold text-emerald-300 tabular-nums">
                  {totalWeeks} weeks ({totalWeeks - 1} build + 1 deload)
                </span>
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[4, 5, 6, 7, 8].map((w) => (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setTotalWeeks(w)}
                    className={`h-10 rounded-xl border text-xs font-bold tabular-nums ${
                      totalWeeks === w
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                        : 'border-slate-700 bg-[#0B0E14] text-slate-300'
                    }`}
                  >
                    {w}w
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Footer */}
      <div className="mt-6 flex gap-2.5">
        {step > 1 && (
          <button
            type="button"
            onClick={() => setStep((s) => (s === 3 ? 2 : 1))}
            className="flex h-12 items-center justify-center gap-1.5 rounded-2xl border border-slate-700 bg-[#141923] px-5 text-sm font-semibold text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>
        )}

        {step < 3 ? (
          <button
            type="button"
            onClick={() => setStep((s) => (s === 1 ? 2 : 3))}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-bold text-slate-950 active:scale-[0.98]"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              onComplete(
                { ...profile, onboardingComplete: true },
                selectedTemplate,
                mesoName,
                totalWeeks
              )
            }
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-bold text-slate-950 active:scale-[0.98]"
          >
            <Check className="h-4 w-4" />
            Build My Mesocycle
          </button>
        )}
      </div>
    </div>
  );
}
