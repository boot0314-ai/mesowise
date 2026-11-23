import { Check, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { ALL_MUSCLES, MUSCLE_LABELS } from '../data/constants';
import { MESO_TEMPLATES } from '../data/templates';
import { MesoTemplate, MuscleGroup, MusclePriority } from '../types/models';

interface MesoBuilderModalProps {
  onCreate: (
    template: MesoTemplate,
    name: string,
    totalWeeks: number,
    priorities: Partial<Record<MuscleGroup, MusclePriority>>
  ) => void;
  onClose: () => void;
}

const PRIORITY_CYCLE: MusclePriority[] = ['grow', 'maintain', 'low'];

export function MesoBuilderModal({ onCreate, onClose }: MesoBuilderModalProps) {
  const [templateId, setTemplateId] = useState<string>(MESO_TEMPLATES[0].id);
  const selected = MESO_TEMPLATES.find((t) => t.id === templateId) ?? MESO_TEMPLATES[0];

  const [name, setName] = useState<string>(selected.name);
  const [totalWeeks, setTotalWeeks] = useState<number>(selected.recommendedWeeks);
  const [priorities, setPriorities] = useState<Partial<Record<MuscleGroup, MusclePriority>>>(
    selected.defaultPriorities
  );

  const handleSelectTemplate = (tpl: MesoTemplate) => {
    setTemplateId(tpl.id);
    setName(tpl.name);
    setTotalWeeks(tpl.recommendedWeeks);
    setPriorities({ ...tpl.defaultPriorities });
  };

  const cyclePriority = (m: MuscleGroup) => {
    const cur = priorities[m] ?? 'maintain';
    const next = PRIORITY_CYCLE[(PRIORITY_CYCLE.indexOf(cur) + 1) % PRIORITY_CYCLE.length];
    setPriorities((prev) => ({ ...prev, [m]: next }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 backdrop-blur-xs sm:items-center">
      <div className="flex max-h-[90vh] w-full max-w-[460px] flex-col rounded-t-3xl border border-[#1E2635] bg-[#141923] shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[#1E2635] px-5 py-4">
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <Sparkles className="h-3.5 w-3.5" />
              Mesocycle Builder
            </div>
            <h3 className="text-base font-bold text-white">Start New Training Block</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-300"
            aria-label="Close meso builder"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300">Select Template</label>
            {MESO_TEMPLATES.map((tpl) => {
              const active = tpl.id === templateId;
              return (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => handleSelectTemplate(tpl)}
                  className={`w-full rounded-2xl border p-3 text-left ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/12'
                      : 'border-slate-800 bg-[#0B0E14]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white">{tpl.name}</span>
                    <span className="text-[11px] font-semibold text-slate-400">
                      {tpl.daysPerWeek}d/wk
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">{tpl.subtitle}</p>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 rounded-2xl border border-slate-800 bg-[#0B0E14] p-3.5">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Block Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-700 bg-[#141923] px-3 text-sm text-white focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between text-xs">
                <span className="text-slate-400">Length (includes final Deload)</span>
                <span className="font-bold text-emerald-300 tabular-nums">{totalWeeks} weeks</span>
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
                        : 'border-slate-700 bg-[#141923] text-slate-300'
                    }`}
                  >
                    {w}w
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-400">
                Tip: 4–5 weeks (3–4 build + 1 deload) is optimal for Masters tendon recovery.
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Muscle Priorities (tap to cycle)
              </span>
              <span className="text-[11px] text-slate-500">
                Low priority skipped on Deload
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_MUSCLES.map((m) => {
                const prio = priorities[m] ?? 'maintain';
                const tone =
                  prio === 'grow'
                    ? 'border-emerald-500/45 bg-emerald-500/15 text-emerald-300'
                    : prio === 'maintain'
                      ? 'border-slate-700 bg-[#0B0E14] text-slate-300'
                      : 'border-slate-800 bg-slate-900/50 text-slate-500';
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => cyclePriority(m)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${tone}`}
                  >
                    {MUSCLE_LABELS[m]}: {prio}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-t border-[#1E2635] p-4">
          <button
            type="button"
            onClick={() => onCreate(selected, name, totalWeeks, priorities)}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-sm font-bold text-slate-950"
          >
            <Check className="h-4 w-4" />
            Create Mesocycle
          </button>
        </div>
      </div>
    </div>
  );
}
