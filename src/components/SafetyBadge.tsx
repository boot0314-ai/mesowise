import { AlertTriangle, CheckCircle2, ShieldAlert, Sparkles } from 'lucide-react';
import { SafetyLevel } from '../types/models';

export function SafetyBadge({ level }: { level: SafetyLevel }) {
  switch (level) {
    case 'safe':
      return (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-emerald-500/25 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
          <CheckCircle2 className="h-3 w-3" />
          Joint Safe
        </span>
      );
    case 'modify':
      return (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-sky-500/25 bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-300">
          <Sparkles className="h-3 w-3" />
          Tempo / Rep Guard
        </span>
      );
    case 'caution':
      return (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-amber-500/25 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          Joint Caution
        </span>
      );
    case 'avoid':
      return (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-rose-500/30 bg-rose-500/15 px-2 py-0.5 text-[11px] font-medium text-rose-300">
          <ShieldAlert className="h-3 w-3" />
          Swap Advised
        </span>
      );
  }
}

export function SfrBadge({ score }: { score: number }) {
  const color =
    score >= 9
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'
      : score >= 7.5
        ? 'bg-slate-700/60 text-slate-200 border-slate-600/50'
        : 'bg-amber-500/15 text-amber-300 border-amber-500/25';

  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium tabular-nums ${color}`}
    >
      SFR {score.toFixed(1)}
    </span>
  );
}
