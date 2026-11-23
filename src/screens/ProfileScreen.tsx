import {
  Download,
  Dumbbell,
  RotateCcw,
  ShieldAlert,
  Smartphone,
  Upload,
} from 'lucide-react';
import { ChangeEvent, useRef, useState } from 'react';
import {
  AGE_TIER_LABELS,
  ALL_EQUIPMENT,
  ALL_JOINTS,
  EQUIPMENT_LABELS,
  JOINT_LABELS,
  JOINT_STATUS_LABELS,
} from '../data/constants';
import { exportStateJson, importStateJson } from '../storage/db';
import {
  AgeTier,
  AppState,
  AthleteProfile,
  EquipmentType,
  JointRegion,
  JointStatus,
  WeightUnit,
} from '../types/models';
import { usePwaInstall } from '../utils/device';

interface ProfileScreenProps {
  appState: AppState;
  onUpdateProfile: (profile: AthleteProfile) => void;
  onImportState: (imported: AppState) => void;
  onResetAll: () => void;
}

const STATUS_CYCLE: JointStatus[] = ['healthy', 'sensitive', 'recovering', 'avoid'];

const STATUS_TONE: Record<JointStatus, string> = {
  healthy: 'border-slate-700 bg-[#0B0E14] text-slate-300',
  sensitive: 'border-amber-500/50 bg-amber-500/15 text-amber-300',
  recovering: 'border-orange-500/60 bg-orange-500/20 text-orange-200',
  avoid: 'border-rose-500/60 bg-rose-500/20 text-rose-200',
};

export function ProfileScreen({
  appState,
  onUpdateProfile,
  onImportState,
  onResetAll,
}: ProfileScreenProps) {
  const { profile } = appState;
  const { canInstall, isInstalled, promptInstall } = usePwaInstall();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const cycleJoint = (joint: JointRegion) => {
    const cur = profile.joints[joint].status;
    const next = STATUS_CYCLE[(STATUS_CYCLE.indexOf(cur) + 1) % STATUS_CYCLE.length];
    onUpdateProfile({
      ...profile,
      joints: {
        ...profile.joints,
        [joint]: { ...profile.joints[joint], status: next },
      },
    });
  };

  const toggleEquipment = (eq: EquipmentType) => {
    const exists = profile.equipment.includes(eq);
    const next = exists
      ? profile.equipment.filter((e) => e !== eq)
      : [...profile.equipment, eq];
    onUpdateProfile({
      ...profile,
      equipment: next.length > 0 ? next : ['bodyweight'],
    });
  };

  const handleDownloadBackup = () => {
    const json = exportStateJson(appState);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mesowise-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg('Backup JSON downloaded.');
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const restored = importStateJson(text);
      onImportState(restored);
      setStatusMsg('Backup restored successfully.');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to import backup.');
    }
    e.target.value = '';
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Pixel 8 Pro PWA Install Card */}
      <div className="rounded-3xl border border-emerald-500/35 bg-[#141923] p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            <Smartphone className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-white">Pixel 8 Pro Offline PWA</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {isInstalled
                ? 'Installed and running in standalone offline mode.'
                : 'Install to your Android home screen for full-screen gym mode & offline storage.'}
            </p>
            {canInstall && (
              <button
                type="button"
                onClick={() => void promptInstall()}
                className="mt-2.5 h-10 rounded-xl bg-emerald-500 px-4 text-xs font-bold text-slate-950"
              >
                Install App to Home Screen
              </button>
            )}
            {!canInstall && !isInstalled && (
              <p className="mt-2 text-[11px] text-slate-300">
                In Chrome on Pixel 8 Pro: tap <strong>⋮</strong> →{' '}
                <strong>Add to Home screen</strong> / <strong>Install app</strong>.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Age & Unit Settings */}
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4 space-y-4">
        <h2 className="text-sm font-bold text-white">Age Tier & Training Guardrails</h2>

        <div>
          <label className="mb-1.5 block text-xs text-slate-400">Age / Recovery Tier</label>
          <select
            value={profile.ageTier}
            onChange={(e) =>
              onUpdateProfile({ ...profile, ageTier: e.target.value as AgeTier })
            }
            className="h-11 w-full rounded-xl border border-slate-700 bg-[#0B0E14] px-3 text-sm font-medium text-white"
          >
            {(Object.keys(AGE_TIER_LABELS) as AgeTier[]).map((tier) => (
              <option key={tier} value={tier}>
                {AGE_TIER_LABELS[tier].label} — {AGE_TIER_LABELS[tier].subtitle}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200">Weight Units</span>
          <div className="flex rounded-xl border border-slate-700 bg-[#0B0E14] p-1">
            {(['lb', 'kg'] as WeightUnit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => onUpdateProfile({ ...profile, unit: u })}
                className={`min-w-[48px] rounded-lg px-3 py-1 text-xs font-bold uppercase ${
                  profile.unit === u ? 'bg-emerald-500 text-slate-950' : 'text-slate-400'
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-200">Default Rest Timer</span>
          <select
            value={profile.defaultRestSec}
            onChange={(e) =>
              onUpdateProfile({ ...profile, defaultRestSec: Number(e.target.value) })
            }
            className="h-9 rounded-xl border border-slate-700 bg-[#0B0E14] px-2.5 text-xs font-semibold text-white"
          >
            {[60, 90, 120, 150, 180].map((s) => (
              <option key={s} value={s}>
                {s}s ({Math.floor(s / 60)}:{(s % 60).toString().padStart(2, '0')})
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center justify-between gap-2 text-xs text-slate-200">
          <span>Joint-Safe 1 RIR Floor (no 0 RIR failure)</span>
          <input
            type="checkbox"
            checked={profile.jointSafeRirFloor}
            onChange={(e) =>
              onUpdateProfile({ ...profile, jointSafeRirFloor: e.target.checked })
            }
            className="h-5 w-5 accent-emerald-500"
          />
        </label>

        <label className="flex items-center justify-between gap-2 text-xs text-slate-200">
          <span>Auto Down-Set Mode (v4.1 drop sets)</span>
          <input
            type="checkbox"
            checked={profile.autoDownSetMode}
            onChange={(e) =>
              onUpdateProfile({ ...profile, autoDownSetMode: e.target.checked })
            }
            className="h-5 w-5 accent-emerald-500"
          />
        </label>

        <label className="flex items-center justify-between gap-2 text-xs text-slate-200">
          <span>Tendon Ramp-Up Warm-Up Sets</span>
          <input
            type="checkbox"
            checked={profile.includeWarmups}
            onChange={(e) =>
              onUpdateProfile({ ...profile, includeWarmups: e.target.checked })
            }
            className="h-5 w-5 accent-emerald-500"
          />
        </label>
      </div>

      {/* Injury & Joint Profile */}
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <ShieldAlert className="h-4 w-4 text-amber-400" />
          Injury & Joint Profile (tap to cycle)
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ALL_JOINTS.map((joint) => {
            const entry = profile.joints[joint];
            return (
              <button
                key={joint}
                type="button"
                onClick={() => cycleJoint(joint)}
                className={`flex min-h-[54px] flex-col justify-between rounded-2xl border p-3 text-left ${STATUS_TONE[entry.status]}`}
              >
                <span className="text-xs font-bold">{JOINT_LABELS[joint]}</span>
                <span className="text-[11px] opacity-90">
                  {JOINT_STATUS_LABELS[entry.status]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Equipment */}
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Dumbbell className="h-4 w-4 text-emerald-400" />
          Gym Equipment Available
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
                    ? 'border-emerald-500/45 bg-emerald-500/20 text-emerald-300'
                    : 'border-slate-700 bg-[#0B0E14] text-slate-400'
                }`}
              >
                {EQUIPMENT_LABELS[eq]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Deload Ratios */}
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4 space-y-3">
        <h2 className="text-sm font-bold text-white">Deload Ratios (Liftosaur v4.1)</h2>
        <div className="grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl border border-slate-800 bg-[#0B0E14] p-2.5">
            <label className="text-[11px] text-slate-400">Load %</label>
            <input
              type="number"
              value={Math.round(profile.deloadConfig.weightRatio * 100)}
              onChange={(e) =>
                onUpdateProfile({
                  ...profile,
                  deloadConfig: {
                    ...profile.deloadConfig,
                    weightRatio: Math.max(0.3, Math.min(0.9, Number(e.target.value) / 100)),
                  },
                })
              }
              className="mt-1 h-9 w-full rounded-lg border border-slate-700 bg-[#141923] px-2 text-center font-bold text-white tabular-nums"
            />
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#0B0E14] p-2.5">
            <label className="text-[11px] text-slate-400">Reps %</label>
            <input
              type="number"
              value={Math.round(profile.deloadConfig.repsRatio * 100)}
              onChange={(e) =>
                onUpdateProfile({
                  ...profile,
                  deloadConfig: {
                    ...profile.deloadConfig,
                    repsRatio: Math.max(0.4, Math.min(1, Number(e.target.value) / 100)),
                  },
                })
              }
              className="mt-1 h-9 w-full rounded-lg border border-slate-700 bg-[#141923] px-2 text-center font-bold text-white tabular-nums"
            />
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#0B0E14] p-2.5">
            <label className="text-[11px] text-slate-400">Sets %</label>
            <input
              type="number"
              value={Math.round(profile.deloadConfig.setsRatio * 100)}
              onChange={(e) =>
                onUpdateProfile({
                  ...profile,
                  deloadConfig: {
                    ...profile.deloadConfig,
                    setsRatio: Math.max(0.25, Math.min(1, Number(e.target.value) / 100)),
                  },
                })
              }
              className="mt-1 h-9 w-full rounded-lg border border-slate-700 bg-[#141923] px-2 text-center font-bold text-white tabular-nums"
            />
          </div>
        </div>
        <label className="flex items-center justify-between text-xs text-slate-300">
          <span>Drop low-priority isolation muscles during Deload</span>
          <input
            type="checkbox"
            checked={profile.deloadConfig.dropLowPriority}
            onChange={(e) =>
              onUpdateProfile({
                ...profile,
                deloadConfig: {
                  ...profile.deloadConfig,
                  dropLowPriority: e.target.checked,
                },
              })
            }
            className="h-5 w-5 accent-emerald-500"
          />
        </label>
      </div>

      {/* Offline Data Backup */}
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4 space-y-3">
        <h2 className="text-sm font-bold text-white">Offline Data Backup</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleDownloadBackup}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-[#0B0E14] text-xs font-semibold text-white"
          >
            <Download className="h-4 w-4 text-emerald-400" />
            Export JSON
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-11 items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-[#0B0E14] text-xs font-semibold text-white"
          >
            <Upload className="h-4 w-4 text-sky-400" />
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => void handleFileChange(e)}
          />
        </div>
        <button
          type="button"
          onClick={onResetAll}
          className="flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-xs font-semibold text-rose-300"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset Profile & Re-run Onboarding
        </button>
        {statusMsg && (
          <p className="text-center text-xs font-medium text-emerald-300">{statusMsg}</p>
        )}
      </div>
    </div>
  );
}
