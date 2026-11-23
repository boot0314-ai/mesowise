import { ArrowRightLeft, ShieldCheck, X } from 'lucide-react';
import { useState } from 'react';
import { EQUIPMENT_LABELS, JOINT_LABELS, MUSCLE_LABELS } from '../data/constants';
import { recommendJointFriendlySwaps } from '../engine/injuryAdvisor';
import {
  AthleteProfile,
  ExerciseDefinition,
  JointRegion,
  PainEvent,
} from '../types/models';
import { SafetyBadge, SfrBadge } from './SafetyBadge';

interface SwapDrawerProps {
  currentExercise: ExerciseDefinition;
  allExercises: ExerciseDefinition[];
  profile: AthleteProfile;
  painHistory: PainEvent[];
  initialPainJoint?: JointRegion;
  onSelectSwap: (replacement: ExerciseDefinition, reason: string) => void;
  onClose: () => void;
}

export function SwapDrawer({
  currentExercise,
  allExercises,
  profile,
  painHistory,
  initialPainJoint,
  onSelectSwap,
  onClose,
}: SwapDrawerProps) {
  const [focusJoint, setFocusJoint] = useState<JointRegion | undefined>(initialPainJoint);

  const flaggedJoints = (Object.keys(profile.joints) as JointRegion[]).filter(
    (j) => profile.joints[j].status !== 'healthy'
  );

  const candidates = recommendJointFriendlySwaps(
    currentExercise,
    allExercises,
    profile,
    focusJoint,
    8,
    painHistory
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs sm:items-center">
      <div className="flex max-h-[86vh] w-full max-w-[460px] flex-col rounded-t-3xl border border-[#1E2635] bg-[#141923] shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between border-b border-[#1E2635] px-5 py-4">
          <div className="pr-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Smart High-SFR Exercise Swap
            </div>
            <h3 className="mt-1 text-base font-bold text-white">
              Replace {currentExercise.name}
            </h3>
            <p className="text-xs text-slate-400">
              Ranked by joint safety, Stimulus-to-Fatigue Ratio, and your available gym gear.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-800 text-slate-300"
            aria-label="Close swap drawer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {(flaggedJoints.length > 0 || initialPainJoint) && (
          <div className="border-b border-[#1E2635] px-5 py-2.5">
            <div className="mb-1.5 text-[11px] font-medium text-slate-400">
              Prioritize relieving joint:
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setFocusJoint(undefined)}
                className={`rounded-full px-3 py-1 text-xs font-medium border ${
                  !focusJoint
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-700 bg-slate-800/70 text-slate-300'
                }`}
              >
                All Joints
              </button>
              {Array.from(
                new Set([
                  ...(initialPainJoint ? [initialPainJoint] : []),
                  ...flaggedJoints,
                ])
              ).map((joint) => (
                <button
                  key={joint}
                  type="button"
                  onClick={() => setFocusJoint(joint)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border ${
                    focusJoint === joint
                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : 'border-slate-700 bg-slate-800/70 text-slate-300'
                  }`}
                >
                  {JOINT_LABELS[joint]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 space-y-2.5 overflow-y-auto p-4">
          {candidates.length === 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-[#0B0E14] p-4 text-center text-sm text-slate-400">
              No safe swaps matched your current equipment filter. Enable more equipment in Profile or add a custom machine in Exercise Library.
            </div>
          ) : (
            candidates.map((cand) => (
              <button
                key={cand.exercise.id}
                type="button"
                onClick={() => onSelectSwap(cand.exercise, cand.rationale)}
                className="w-full rounded-2xl border border-[#1E2635] bg-[#0B0E14] p-3.5 text-left transition hover:border-emerald-500/45 active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold text-white">{cand.exercise.name}</div>
                    <div className="mt-0.5 text-xs text-slate-400">
                      {MUSCLE_LABELS[cand.exercise.primaryMuscle]} •{' '}
                      {EQUIPMENT_LABELS[cand.exercise.equipment]} •{' '}
                      {cand.exercise.defaultRepRange.min}-{cand.exercise.defaultRepRange.max} base reps
                    </div>
                  </div>
                  <SfrBadge score={cand.exercise.sfrScore} />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <SafetyBadge level={cand.safety.level} />
                  {cand.exercise.axialLoad === 'none' && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-300">
                      <ShieldCheck className="h-3 w-3" />
                      Zero Axial Load
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs text-slate-300">{cand.rationale}</p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Tempo cue: {cand.exercise.eccentricCue}
                </p>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
