import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  FastForward,
  Layers,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { MESO_TEMPLATES } from '../data/templates';
import { getWeekTargetRir, isDeloadWeek } from '../engine/rirAndMeso';
import { AthleteProfile, ExerciseDefinition, Mesocycle } from '../types/models';

interface MesoScreenProps {
  meso: Mesocycle | null;
  allMesocycles: Mesocycle[];
  profile: AthleteProfile;
  allExercises: ExerciseDefinition[];
  onAdvanceWeek: (forceDeload?: boolean) => void;
  onStartNextMeso: (completedMeso: Mesocycle) => void;
  onOpenMesoBuilder: () => void;
  onSelectMeso: (mesoId: string) => void;
  onJumpToWorkout: () => void;
}

export function MesoScreen({
  meso,
  allMesocycles,
  profile,
  allExercises,
  onAdvanceWeek,
  onStartNextMeso,
  onOpenMesoBuilder,
  onSelectMeso,
  onJumpToWorkout,
}: MesoScreenProps) {
  const byId = new Map(allExercises.map((e) => [e.id, e]));

  if (!meso) {
    return (
      <div className="space-y-4 pb-24">
        <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-6 text-center">
          <Layers className="mx-auto h-10 w-10 text-emerald-400" />
          <h2 className="mt-3 text-lg font-bold text-white">Build Your First Mesocycle</h2>
          <p className="mt-1 text-xs text-slate-400">
            Structure 4–8 weeks of progressive overload ending in an automated deload.
          </p>
          <button
            type="button"
            onClick={onOpenMesoBuilder}
            className="mt-4 h-11 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-slate-950"
          >
            Open Meso Builder
          </button>
        </div>
      </div>
    );
  }

  const weeks = Array.from({ length: meso.totalWeeks }, (_, i) => i + 1);
  const currentSessions = meso.sessions
    .filter((s) => s.weekNumber === meso.currentWeek)
    .sort((a, b) => a.dayIndex - b.dayIndex);

  const completedCount = currentSessions.filter((s) => s.status === 'completed').length;
  const isFinalWeek = meso.currentWeek >= meso.totalWeeks;
  const canLaunchNextMeso =
    isFinalWeek && currentSessions.every((s) => s.status === 'completed');

  const tpl =
    MESO_TEMPLATES.find((t) => t.id === meso.templateId) ?? MESO_TEMPLATES[0];

  return (
    <div className="space-y-4 pb-28">
      {/* Meso Header */}
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Active Mesocycle
            </div>
            <h1 className="mt-0.5 text-lg font-bold text-white">{meso.name}</h1>
            <p className="text-xs text-slate-400">
              {tpl.daysPerWeek} days/wk • Week {meso.currentWeek} of {meso.totalWeeks}
            </p>
          </div>

          <button
            type="button"
            onClick={onOpenMesoBuilder}
            className="flex h-10 items-center gap-1 rounded-xl border border-emerald-500/35 bg-emerald-500/15 px-3 text-xs font-bold text-emerald-300"
          >
            <Plus className="h-4 w-4" />
            New Meso
          </button>
        </div>

        {/* Week Timeline */}
        <div className="mt-4 grid grid-cols-5 gap-1.5 sm:grid-cols-6">
          {weeks.map((wk) => {
            const deload = isDeloadWeek(wk, meso.totalWeeks);
            const targetRir = getWeekTargetRir(wk, meso.totalWeeks, profile);
            const active = wk === meso.currentWeek;
            const past = wk < meso.currentWeek;

            return (
              <div
                key={wk}
                className={`rounded-2xl border p-2 text-center ${
                  active
                    ? 'border-emerald-500 bg-emerald-500/15'
                    : past
                      ? 'border-emerald-500/25 bg-[#0B0E14] opacity-80'
                      : 'border-[#1E2635] bg-[#0B0E14] opacity-60'
                }`}
              >
                <div className="text-[10px] font-bold uppercase text-slate-400">
                  {deload ? 'Deload' : `Wk ${wk}`}
                </div>
                <div className="mt-0.5 text-xs font-bold text-white tabular-nums">
                  {targetRir} RIR
                </div>
              </div>
            );
          })}
        </div>

        {/* Progression Controls */}
        <div className="mt-4 flex flex-wrap gap-2">
          {!isFinalWeek && (
            <button
              type="button"
              onClick={() => onAdvanceWeek(false)}
              className="flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-xs font-bold text-slate-950 active:scale-[0.98]"
            >
              <ArrowRight className="h-4 w-4" />
              Generate Week {meso.currentWeek + 1} ({completedCount}/{currentSessions.length} done)
            </button>
          )}

          {!isFinalWeek && (
            <button
              type="button"
              onClick={() => onAdvanceWeek(true)}
              className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 text-xs font-bold text-amber-300"
            >
              <FastForward className="h-3.5 w-3.5" />
              Early Deload
            </button>
          )}

          {isFinalWeek && (
            <button
              type="button"
              onClick={() => onStartNextMeso(meso)}
              className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-bold ${
                canLaunchNextMeso
                  ? 'bg-emerald-500 text-slate-950'
                  : 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
              }`}
            >
              <RefreshCw className="h-4 w-4" />
              Start Next Meso (Seeded at 87.5% Peak)
            </button>
          )}
        </div>
      </div>

      {/* Current Week Sessions */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-sm font-bold text-white">
            Week {meso.currentWeek} Schedule
          </h2>
          <span className="text-xs text-slate-400 tabular-nums">
            Target {getWeekTargetRir(meso.currentWeek, meso.totalWeeks, profile)} RIR
          </span>
        </div>

        {currentSessions.map((sess) => {
          const totalSets = sess.exercises.reduce((acc, ex) => acc + ex.numSets, 0);
          const done = sess.status === 'completed';
          return (
            <button
              key={sess.id}
              type="button"
              onClick={onJumpToWorkout}
              className="w-full rounded-2xl border border-[#1E2635] bg-[#141923] p-4 text-left transition hover:border-emerald-500/40"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{sess.dayName}</span>
                    {done && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                  </div>
                  <div className="mt-1 text-xs text-slate-400 tabular-nums">
                    {sess.exercises.length} exercises • {totalSets} working sets
                  </div>
                </div>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    done
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : sess.status === 'in_progress'
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'bg-slate-800 text-slate-300'
                  }`}
                >
                  {done ? 'Completed' : sess.status === 'in_progress' ? 'In Progress' : 'Planned'}
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {sess.exercises.map((ex) => {
                  const def = byId.get(ex.exerciseId);
                  return (
                    <span
                      key={ex.id}
                      className="rounded-lg border border-slate-800 bg-[#0B0E14] px-2 py-0.5 text-[11px] text-slate-300"
                    >
                      {def?.name ?? ex.exerciseId} ({ex.numSets}×)
                    </span>
                  );
                })}
              </div>
            </button>
          );
        })}
      </div>

      {/* Saved / Past Mesocycles */}
      {allMesocycles.length > 1 && (
        <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4">
          <div className="mb-2.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Calendar className="h-3.5 w-3.5" />
            All Mesocycles
          </div>
          <div className="space-y-2">
            {allMesocycles.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onSelectMeso(m.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left text-xs ${
                  m.id === meso.id
                    ? 'border-emerald-500/50 bg-emerald-500/10 text-white'
                    : 'border-slate-800 bg-[#0B0E14] text-slate-300'
                }`}
              >
                <span className="font-semibold">{m.name}</span>
                <span className="text-slate-400 tabular-nums">
                  Wk {m.currentWeek}/{m.totalWeeks}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
