import { X } from 'lucide-react';
import { useState } from 'react';
import { ALL_JOINTS, JOINT_LABELS } from '../data/constants';
import { JointRegion } from '../types/models';

interface PainPickerModalProps {
  initialScore: number;
  initialJoint?: JointRegion;
  suggestedJoints: JointRegion[];
  onSave: (painScore: number, joint?: JointRegion) => void;
  onClose: () => void;
}

export function PainPickerModal({
  initialScore,
  initialJoint,
  suggestedJoints,
  onSave,
  onClose,
}: PainPickerModalProps) {
  const [score, setScore] = useState<number>(initialScore);
  const [joint, setJoint] = useState<JointRegion>(
    initialJoint ?? suggestedJoints[0] ?? 'shoulder'
  );

  const orderedJoints = Array.from(new Set([...suggestedJoints, ...ALL_JOINTS]));

  const trafficInfo =
    score <= 2
      ? {
          color: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30',
          text: 'Green (0–2/10): Safe to progress weight & reps normally.',
        }
      : score <= 4
        ? {
            color: 'text-amber-300 bg-amber-500/15 border-amber-500/30',
            text: 'Amber (3–4/10): Hold load, shift reps higher, and use 3s controlled eccentrics.',
          }
        : {
            color: 'text-rose-300 bg-rose-500/15 border-rose-500/30',
            text: 'Red (5+/10): Stop pushing load—cut weight/sets or swap to a joint-friendly variation.',
          };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-xs sm:items-center">
      <div className="w-full max-w-[440px] rounded-t-3xl border border-[#1E2635] bg-[#141923] p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-white">Joint Pain Check (0–10)</h3>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-300"
            aria-label="Close pain picker"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-6 gap-2">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((val) => {
            const active = score === val;
            const tone =
              val <= 2
                ? active
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                  : 'bg-[#0B0E14] text-emerald-300 border-slate-700'
                : val <= 4
                  ? active
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-[#0B0E14] text-amber-300 border-slate-700'
                  : active
                    ? 'bg-rose-500 text-white border-rose-400'
                    : 'bg-[#0B0E14] text-rose-300 border-slate-700';

            return (
              <button
                key={val}
                type="button"
                onClick={() => setScore(val)}
                className={`flex h-11 items-center justify-center rounded-xl border text-sm font-bold tabular-nums transition active:scale-95 ${tone}`}
              >
                {val}
              </button>
            );
          })}
        </div>

        <div className={`mt-3 rounded-xl border p-3 text-xs ${trafficInfo.color}`}>
          {trafficInfo.text}
        </div>

        {score > 0 && (
          <div className="mt-4">
            <div className="mb-1.5 text-xs font-medium text-slate-400">Which joint?</div>
            <div className="flex flex-wrap gap-1.5">
              {orderedJoints.map((j) => (
                <button
                  key={j}
                  type="button"
                  onClick={() => setJoint(j)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                    joint === j
                      ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                      : 'border-slate-700 bg-[#0B0E14] text-slate-300'
                  }`}
                >
                  {JOINT_LABELS[j]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={() => onSave(0, undefined)}
            className="h-12 flex-1 rounded-xl border border-slate-700 bg-slate-800/80 text-sm font-semibold text-slate-200"
          >
            Clear (0/10)
          </button>
          <button
            type="button"
            onClick={() => onSave(score, score > 0 ? joint : undefined)}
            className="h-12 flex-1 rounded-xl bg-emerald-500 text-sm font-bold text-slate-950 active:scale-[0.98]"
          >
            Save Pain Rating
          </button>
        </div>
      </div>
    </div>
  );
}
