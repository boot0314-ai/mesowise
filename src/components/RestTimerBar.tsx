import { Minus, Pause, Play, Plus, Timer, X } from 'lucide-react';

interface RestTimerBarProps {
  remainingSec: number;
  totalSec: number;
  paused: boolean;
  onAdjust: (deltaSec: number) => void;
  onTogglePause: () => void;
  onSkip: () => void;
}

function formatTime(sec: number): string {
  const safe = Math.max(0, Math.floor(sec));
  const mins = Math.floor(safe / 60);
  const rem = safe % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export function RestTimerBar({
  remainingSec,
  totalSec,
  paused,
  onAdjust,
  onTogglePause,
  onSkip,
}: RestTimerBarProps) {
  const pct = totalSec > 0 ? Math.max(0, Math.min(100, (remainingSec / totalSec) * 100)) : 0;

  return (
    <div className="fixed bottom-[70px] left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-[440px] -translate-x-1/2 rounded-2xl border border-emerald-500/35 bg-[#141923]/95 p-3 shadow-2xl backdrop-blur-md">
      <div className="mb-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full bg-emerald-500 transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-400">
            <Timer className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
              Rest Timer
            </div>
            <div className="text-xl font-bold leading-none text-white tabular-nums">
              {formatTime(remainingSec)}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onAdjust(-15)}
            className="flex h-10 min-w-[46px] items-center justify-center gap-0.5 rounded-xl border border-slate-700 bg-slate-800/80 px-2 text-xs font-semibold text-slate-200 active:scale-95"
            aria-label="Subtract 15 seconds"
          >
            <Minus className="h-3.5 w-3.5" />
            15s
          </button>
          <button
            type="button"
            onClick={() => onAdjust(30)}
            className="flex h-10 min-w-[46px] items-center justify-center gap-0.5 rounded-xl border border-slate-700 bg-slate-800/80 px-2 text-xs font-semibold text-slate-200 active:scale-95"
            aria-label="Add 30 seconds"
          >
            <Plus className="h-3.5 w-3.5" />
            30s
          </button>
          <button
            type="button"
            onClick={onTogglePause}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-800/80 text-slate-200 active:scale-95"
            aria-label={paused ? 'Resume timer' : 'Pause timer'}
          >
            {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-slate-400 hover:text-white active:scale-95"
            aria-label="Skip rest timer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
