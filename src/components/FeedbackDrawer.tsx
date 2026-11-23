import { Check, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { MUSCLE_LABELS } from '../data/constants';
import { computeFeedbackDecision } from '../engine/feedback';
import {
  AthleteProfile,
  JointRegion,
  MuscleGroup,
  MuscleGroupFeedback,
} from '../types/models';

interface FeedbackDrawerProps {
  muscle: MuscleGroup;
  currentWeeklySets: number;
  initialJointPainMax: number;
  initialPainJoint?: JointRegion;
  existingFeedback?: MuscleGroupFeedback;
  profile: AthleteProfile;
  onSave: (feedback: MuscleGroupFeedback) => void;
  onClose: () => void;
}

const SORENESS_OPTS: { value: 0 | 1 | 2 | 3; label: string }[] = [
  { value: 0, label: 'None' },
  { value: 1, label: 'Healed fast' },
  { value: 2, label: 'On time' },
  { value: 3, label: 'Still sore' },
];

const PUMP_OPTS: { value: 0 | 1 | 2 | 3; label: string }[] = [
  { value: 0, label: 'Low' },
  { value: 1, label: 'Light' },
  { value: 2, label: 'Good' },
  { value: 3, label: 'Huge' },
];

const WORKLOAD_OPTS: { value: 0 | 1 | 2 | 3; label: string }[] = [
  { value: 0, label: 'Easy' },
  { value: 1, label: 'Sweet spot' },
  { value: 2, label: 'Hard' },
  { value: 3, label: 'Too much' },
];

export function FeedbackDrawer({
  muscle,
  currentWeeklySets,
  initialJointPainMax,
  initialPainJoint,
  existingFeedback,
  profile,
  onSave,
  onClose,
}: FeedbackDrawerProps) {
  const [soreness, setSoreness] = useState<0 | 1 | 2 | 3>(existingFeedback?.soreness ?? 1);
  const [pump, setPump] = useState<0 | 1 | 2 | 3>(existingFeedback?.pump ?? 2);
  const [workload, setWorkload] = useState<0 | 1 | 2 | 3>(existingFeedback?.workload ?? 1);
  const [jointPainMax, setJointPainMax] = useState<number>(
    existingFeedback?.jointPainMax ?? initialJointPainMax
  );

  const preview = computeFeedbackDecision(
    {
      muscle,
      soreness,
      pump,
      workload,
      jointPainMax,
      painJoint: initialPainJoint,
    },
    currentWeeklySets,
    profile
  );

  const badgeTone =
    preview.v4Rating > 0
      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/35'
      : preview.v4Rating === 0
        ? 'bg-sky-500/20 text-sky-300 border-sky-500/35'
        : 'bg-amber-500/20 text-amber-300 border-amber-500/35';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-xs sm:items-center">
      <div className="max-h-[90vh] w-full max-w-[460px] overflow-y-auto rounded-t-3xl border border-[#1E2635] bg-[#141923] p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
              RP / Liftosaur v4.1 Feedback
            </div>
            <h3 className="mt-0.5 text-lg font-bold text-white">
              {MUSCLE_LABELS[muscle]} Recovery & Stimulus
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-300"
            aria-label="Close feedback drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Prior Soreness (heading into today)
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {SORENESS_OPTS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSoreness(opt.value)}
                  className={`h-11 rounded-xl border px-1 text-xs font-semibold transition ${
                    soreness === opt.value
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-[#0B0E14] text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Target Muscle Pump
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {PUMP_OPTS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPump(opt.value)}
                  className={`h-11 rounded-xl border px-1 text-xs font-semibold transition ${
                    pump === opt.value
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-[#0B0E14] text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Workload & Fatigue Tolerance
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {WORKLOAD_OPTS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setWorkload(opt.value)}
                  className={`h-11 rounded-xl border px-1 text-xs font-semibold transition ${
                    workload === opt.value
                      ? 'border-emerald-500 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-[#0B0E14] text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-slate-300">
                Max Joint Discomfort Logged
              </label>
              <span className="text-xs font-bold text-slate-200 tabular-nums">
                {jointPainMax}/10
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={jointPainMax}
              onChange={(e) => setJointPainMax(Number(e.target.value))}
              className="w-full accent-emerald-500"
            />
          </div>

          <div className="rounded-2xl border border-[#1E2635] bg-[#0B0E14] p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                Next Week Engine Decision
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold tabular-nums ${badgeTone}`}>
                  v4.1 Rating {preview.v4Rating > 0 ? `+${preview.v4Rating}` : preview.v4Rating}
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-800 px-2.5 py-0.5 text-xs font-bold text-white tabular-nums">
                  {preview.setsModifier > 0
                    ? `+${preview.setsModifier} set`
                    : preview.setsModifier < 0
                      ? `${preview.setsModifier} set`
                      : 'Keep sets'}
                </span>
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-300">{preview.rationale}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSave(preview)}
          className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-bold text-slate-950 active:scale-[0.98]"
        >
          <Check className="h-4 w-4" />
          Save {MUSCLE_LABELS[muscle]} Feedback
        </button>
      </div>
    </div>
  );
}
