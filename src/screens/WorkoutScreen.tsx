import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowRightLeft,
  ArrowUp,
  BatteryCharging,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Sun,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { FeedbackDrawer } from '../components/FeedbackDrawer';
import { PainPickerModal } from '../components/PainPickerModal';
import { SafetyBadge, SfrBadge } from '../components/SafetyBadge';
import { SwapDrawer } from '../components/SwapDrawer';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../data/constants';
import { buildRecoverySession } from '../engine/deload';
import { shouldSuggestDeloadOrRecovery } from '../engine/feedback';
import {
  assessExerciseSafety,
  generateSessionBriefing,
  needsJointWarmingReorder,
  optimizeSessionOrderForJoints,
} from '../engine/injuryAdvisor';
import {
  evaluateAutoDownSet,
  generateWarmupSets,
  getRecommendedRestSeconds,
} from '../engine/progression';
import { getAgeAdjustedRepRange } from '../engine/rirAndMeso';
import {
  AthleteProfile,
  ExerciseDefinition,
  JointRegion,
  Mesocycle,
  MuscleGroup,
  PainEvent,
  SessionExercise,
  SetLog,
  WorkoutSession,
} from '../types/models';

interface WorkoutScreenProps {
  meso: Mesocycle | null;
  profile: AthleteProfile;
  allExercises: ExerciseDefinition[];
  painHistory: PainEvent[];
  wakeLockEnabled: boolean;
  onToggleWakeLock: () => void;
  onUpdateSession: (updatedSession: WorkoutSession) => void;
  onRecordPainEvent: (event: PainEvent) => void;
  onStartRestTimer: (seconds: number) => void;
  onAdvanceWeek: (forceDeload?: boolean) => void;
  onOpenMesoBuilder: () => void;
}

export function WorkoutScreen({
  meso,
  profile,
  allExercises,
  painHistory,
  wakeLockEnabled,
  onToggleWakeLock,
  onUpdateSession,
  onRecordPainEvent,
  onStartRestTimer,
  onAdvanceWeek,
  onOpenMesoBuilder,
}: WorkoutScreenProps) {
  const byId = useMemo(
    () => new Map(allExercises.map((e) => [e.id, e])),
    [allExercises]
  );

  const weekSessions = useMemo(() => {
    if (!meso) return [];
    return meso.sessions
      .filter((s) => s.weekNumber === meso.currentWeek)
      .sort((a, b) => a.dayIndex - b.dayIndex);
  }, [meso]);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [briefingOpen, setBriefingOpen] = useState<boolean>(true);
  const [expandedWarmups, setExpandedWarmups] = useState<Record<string, boolean>>({});
  const [swapTarget, setSwapTarget] = useState<{
    sessionExerciseId: string;
    exercise: ExerciseDefinition;
    painJoint?: JointRegion;
  } | null>(null);
  const [painTarget, setPainTarget] = useState<{
    sessionExerciseId: string;
    setId: string;
    initialScore: number;
    initialJoint?: JointRegion;
    suggestedJoints: JointRegion[];
  } | null>(null);
  const [feedbackMuscle, setFeedbackMuscle] = useState<MuscleGroup | null>(null);

  const activeSession = useMemo(() => {
    if (weekSessions.length === 0) return null;
    if (selectedSessionId) {
      const found = weekSessions.find((s) => s.id === selectedSessionId);
      if (found) return found;
    }
    return weekSessions.find((s) => s.status !== 'completed') ?? weekSessions[0];
  }, [weekSessions, selectedSessionId]);

  const deloadPrompt = useMemo(
    () => (meso ? shouldSuggestDeloadOrRecovery(meso, profile) : null),
    [meso, profile]
  );

  const briefing = useMemo(() => {
    if (!activeSession) return null;
    return generateSessionBriefing(
      activeSession,
      allExercises,
      profile,
      painHistory,
      deloadPrompt
    );
  }, [activeSession, allExercises, profile, painHistory, deloadPrompt]);

  const reorderHint = useMemo(() => {
    if (!activeSession) return { recommended: false, summary: '' };
    return needsJointWarmingReorder(activeSession, allExercises, profile);
  }, [activeSession, allExercises, profile]);

  if (!meso || !activeSession) {
    return (
      <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
        <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-6">
          <Sparkles className="mx-auto h-10 w-10 text-emerald-400" />
          <h2 className="mt-3 text-lg font-bold text-white">No Active Mesocycle</h2>
          <p className="mt-1 text-xs text-slate-400">
            Create a joint-friendly mesocycle block to start logging workouts.
          </p>
          <button
            type="button"
            onClick={onOpenMesoBuilder}
            className="mt-4 h-11 rounded-xl bg-emerald-500 px-5 text-sm font-bold text-slate-950"
          >
            Create Mesocycle
          </button>
        </div>
      </div>
    );
  }

  const allWeekCompleted = weekSessions.every((s) => s.status === 'completed');

  const updateExercise = (
    sessionExerciseId: string,
    updater: (ex: SessionExercise) => SessionExercise
  ) => {
    const updated: WorkoutSession = {
      ...activeSession,
      status: activeSession.status === 'planned' ? 'in_progress' : activeSession.status,
      startedAt: activeSession.startedAt ?? new Date().toISOString(),
      exercises: activeSession.exercises.map((ex) =>
        ex.id === sessionExerciseId ? updater(ex) : ex
      ),
    };
    onUpdateSession(updated);
  };

  const updateSet = (
    sessionExerciseId: string,
    setId: string,
    patch: Partial<SetLog>
  ) => {
    updateExercise(sessionExerciseId, (ex) => ({
      ...ex,
      sets: ex.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
    }));
  };

  const toggleSetComplete = (ex: SessionExercise, set: SetLog, def: ExerciseDefinition) => {
    const nextCompleted = !set.completed;
    const fillWeight =
      set.weight ?? (set.targetWeight > 0 ? set.targetWeight : ex.lastWeight ?? 0);
    const fillReps = set.reps ?? set.targetRepsMin;
    const fillRir = set.rir ?? set.targetRir;

    updateSet(ex.id, set.id, {
      completed: nextCompleted,
      weight: fillWeight,
      reps: fillReps,
      rir: fillRir,
      completedAt: nextCompleted ? new Date().toISOString() : undefined,
    });

    if (nextCompleted && !set.isWarmup) {
      onStartRestTimer(getRecommendedRestSeconds(def, profile));
    }
  };

  const toggleStiffToday = () => {
    const nextStiff = !activeSession.stiffToday;
    const baseRir = activeSession.targetRir;
    const bufferedRir = nextStiff ? Math.min(4, baseRir + 1) : baseRir;

    onUpdateSession({
      ...activeSession,
      stiffToday: nextStiff,
      exercises: activeSession.exercises.map((ex) => ({
        ...ex,
        sets: ex.sets.map((s) =>
          s.completed || s.isWarmup ? s : { ...s, targetRir: bufferedRir }
        ),
      })),
    });
  };

  const moveExercise = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= activeSession.exercises.length) return;
    const reordered = [...activeSession.exercises];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(nextIdx, 0, moved);
    onUpdateSession({
      ...activeSession,
      exercises: reordered,
    });
  };

  const applyJointWarmingOrder = () => {
    const result = optimizeSessionOrderForJoints(
      activeSession.exercises,
      allExercises,
      profile
    );
    if (!result.changed) return;
    onUpdateSession({
      ...activeSession,
      exercises: result.exercises,
    });
  };

  const addDownSetFor = (ex: SessionExercise, afterSet: SetLog) => {
    const suggestion = evaluateAutoDownSet(afterSet, ex, profile);
    if (!suggestion) return;
    const workingCount = ex.sets.filter((s) => !s.isWarmup).length;
    const newSet: SetLog = {
      id: `ds-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      setNumber: workingCount + 1,
      isDownSet: true,
      side: afterSet.side ?? 'both',
      targetWeight: suggestion.targetWeight,
      targetRepsMin: suggestion.targetRepsMin,
      targetRepsMax: suggestion.targetRepsMax,
      targetRir: suggestion.targetRir,
      weight: suggestion.targetWeight,
      reps: null,
      rir: null,
      painScore: 0,
      completed: false,
    };
    updateExercise(ex.id, (cur) => ({
      ...cur,
      sets: [...cur.sets, newSet],
    }));
  };

  const applyAmberPainGuard = (ex: SessionExercise) => {
    const shiftedMin = Math.min(22, ex.targetMinReps + 3);
    const shiftedMax = Math.min(30, ex.targetMaxReps + 3);
    updateExercise(ex.id, (cur) => ({
      ...cur,
      targetMinReps: shiftedMin,
      targetMaxReps: shiftedMax,
      eccentricOverride: '3s controlled eccentric (pain guard)',
      coachNote:
        'Amber Pain Guard applied: load held steady, rep targets shifted +3 higher with 3s eccentric.',
      sets: cur.sets.map((s) =>
        s.completed
          ? s
          : { ...s, targetRepsMin: shiftedMin, targetRepsMax: shiftedMax }
      ),
    }));
  };

  const generateWarmupsFromFirstSet = (ex: SessionExercise, def: ExerciseDefinition) => {
    const firstWorking = ex.sets.find((s) => !s.isWarmup);
    const refWeight = firstWorking?.weight ?? firstWorking?.targetWeight ?? 0;
    if (refWeight <= 0) return;

    const warmups = generateWarmupSets(refWeight, ex.increment, def, {
      ...profile,
      includeWarmups: true,
    });
    updateExercise(ex.id, (cur) => ({
      ...cur,
      sets: [...warmups, ...cur.sets.filter((s) => !s.isWarmup)],
    }));
    setExpandedWarmups((prev) => ({ ...prev, [ex.id]: true }));
  };

  const handleSwapExercise = (
    sessionExerciseId: string,
    replacement: ExerciseDefinition,
    reason: string
  ) => {
    const safety = assessExerciseSafety(replacement, profile, painHistory);
    const adjRange = getAgeAdjustedRepRange(
      replacement.defaultRepRange,
      profile.ageTier,
      safety.level
    );
    const newInc =
      profile.unit === 'lb'
        ? replacement.defaultIncrementLb
        : replacement.defaultIncrementKg;

    updateExercise(sessionExerciseId, (cur) => ({
      ...cur,
      exerciseId: replacement.id,
      muscle: replacement.primaryMuscle,
      targetMinReps: adjRange.min,
      targetMaxReps: adjRange.max,
      increment: newInc,
      swappedFromId: cur.exerciseId,
      swapReason: reason,
      eccentricOverride:
        safety.level !== 'safe' ? safety.tempoCue : replacement.eccentricCue,
      coachNote: `Swapped to ${replacement.name}: ${reason}`,
      sets: cur.sets
        .filter((s) => !s.isWarmup)
        .map((s, idx) =>
          s.completed
            ? s
            : {
                ...s,
                setNumber: idx + 1,
                side: replacement.unilateral ? 'both' : 'both',
                targetWeight: 0,
                weight: null,
                targetRepsMin: adjRange.min,
                targetRepsMax: adjRange.max,
                painScore: 0,
              }
        ),
    }));
    setSwapTarget(null);
  };

  const handleFinishWorkout = () => {
    const finished: WorkoutSession = {
      ...activeSession,
      status: 'completed',
      completedAt: new Date().toISOString(),
    };
    onUpdateSession(finished);
  };

  // Track last exercise index per muscle so we show Feedback pill cleanly at the end of each muscle group
  const lastIndexByMuscle = new Map<MuscleGroup, number>();
  activeSession.exercises.forEach((ex, idx) => {
    lastIndexByMuscle.set(ex.muscle, idx);
  });

  const weeklySetsForMuscle = (muscle: MuscleGroup): number => {
    let total = 0;
    for (const s of weekSessions) {
      for (const ex of s.exercises) {
        if (ex.muscle === muscle) {
          total += ex.numSets;
        }
      }
    }
    return total;
  };

  const maxPainForMuscleInSession = (muscle: MuscleGroup): { max: number; joint?: JointRegion } => {
    let max = 0;
    let joint: JointRegion | undefined;
    for (const ex of activeSession.exercises) {
      if (ex.muscle !== muscle) continue;
      for (const s of ex.sets) {
        if ((s.painScore || 0) > max) {
          max = s.painScore;
          joint = s.painJoint;
        }
      }
    }
    return { max, joint };
  };

  return (
    <div className="space-y-4 pb-28">
      {/* Top Session Header */}
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-[11px] font-bold text-emerald-300 tabular-nums">
                Week {meso.currentWeek} of {meso.totalWeeks}
              </span>
              <span className="rounded-full border border-slate-700 bg-[#0B0E14] px-2.5 py-0.5 text-[11px] font-bold text-slate-200 tabular-nums">
                Target {activeSession.stiffToday ? Math.min(4, activeSession.targetRir + 1) : activeSession.targetRir} RIR
              </span>
              {activeSession.isDeload && (
                <span className="rounded-full bg-sky-500/20 px-2.5 py-0.5 text-[11px] font-bold text-sky-300">
                  Deload
                </span>
              )}
              {activeSession.isRecoverySession && (
                <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
                  Recovery
                </span>
              )}
              {!activeSession.isDeload &&
                !activeSession.isRecoverySession &&
                activeSession.status !== 'completed' && (
                  <button
                    type="button"
                    onClick={toggleStiffToday}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
                      activeSession.stiffToday
                        ? 'border-sky-400/60 bg-sky-500/20 text-sky-200'
                        : 'border-slate-700 bg-[#0B0E14] text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {activeSession.stiffToday ? 'Stiff Today (+1 RIR On)' : 'Stiff Today (+1 RIR)'}
                  </button>
                )}
            </div>
            <h1 className="mt-2 text-lg font-bold text-white">{activeSession.dayName}</h1>
            <p className="text-xs text-slate-400">{meso.name}</p>
            {activeSession.stiffToday && (
              <p className="mt-1.5 rounded-xl border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-200">
                Readiness buffer active: stopping 1 extra rep shy of failure protects tendons while preserving ~95% hypertrophy stimulus.
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={onToggleWakeLock}
              className={`flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-semibold ${
                wakeLockEnabled
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                  : 'border-slate-700 bg-[#0B0E14] text-slate-400'
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              {wakeLockEnabled ? 'Awake On' : 'Keep Awake'}
            </button>
            {!activeSession.isDeload &&
              !activeSession.isRecoverySession &&
              activeSession.status !== 'completed' && (
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSession(buildRecoverySession(activeSession, allExercises))
                  }
                  className="flex h-8 items-center gap-1 rounded-xl border border-slate-700 bg-[#0B0E14] px-2.5 text-[11px] font-medium text-slate-300 hover:border-amber-500/40"
                >
                  <BatteryCharging className="h-3.5 w-3.5 text-amber-400" />
                  Recovery Day
                </button>
              )}
          </div>
        </div>

        {/* Day Selector Tabs */}
        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1">
          {weekSessions.map((sess, idx) => {
            const selected = sess.id === activeSession.id;
            const done = sess.status === 'completed';
            return (
              <button
                key={sess.id}
                type="button"
                onClick={() => setSelectedSessionId(sess.id)}
                className={`flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold ${
                  selected
                    ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300'
                    : done
                      ? 'border-emerald-500/25 bg-[#0B0E14] text-emerald-400/80'
                      : 'border-slate-800 bg-[#0B0E14] text-slate-400'
                }`}
              >
                {done && <Check className="h-3 w-3" />}
                Day {idx + 1}
              </button>
            );
          })}
        </div>
      </div>

      {/* Week Completed Banner */}
      {allWeekCompleted && (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-500/12 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-emerald-300">
                Week {meso.currentWeek} Complete!
              </div>
              <p className="mt-0.5 text-xs text-slate-200">
                {meso.currentWeek < meso.totalWeeks
                  ? 'Ready to compute Week ' + (meso.currentWeek + 1) + ' prescriptions from your logs & feedback.'
                  : 'Final deload complete! Open Mesocycle tab to launch your next seeded block.'}
              </p>
            </div>
            {meso.currentWeek < meso.totalWeeks && (
              <button
                type="button"
                onClick={() => onAdvanceWeek(false)}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 text-xs font-bold text-slate-950"
              >
                Next Week
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Science Coach Briefing */}
      {briefing && (
        <div className="rounded-2xl border border-[#1E2635] bg-[#141923]">
          <button
            type="button"
            onClick={() => setBriefingOpen((o) => !o)}
            className="flex w-full items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 shrink-0 text-emerald-400" />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Science Coach Briefing
                </div>
                <div className="text-xs text-slate-200">{briefing.headline}</div>
              </div>
            </div>
            {briefingOpen ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>

          {briefingOpen &&
            (briefing.items.length > 0 || briefing.deloadPrompt || reorderHint.recommended) && (
            <div className="space-y-2 border-t border-[#1E2635] px-4 py-3">
              {reorderHint.recommended && (
                <div className="rounded-xl border border-sky-500/35 bg-sky-500/12 p-3 text-xs text-sky-100">
                  <div className="flex items-center gap-1.5 font-bold text-sky-300">
                    <ShieldCheck className="h-4 w-4" />
                    Joint-Warming Order Available
                  </div>
                  <p className="mt-1 text-slate-300">{reorderHint.summary}</p>
                  <button
                    type="button"
                    onClick={applyJointWarmingOrder}
                    className="mt-2 rounded-lg bg-sky-500 px-3 py-1.5 text-[11px] font-bold text-slate-950"
                  >
                    Pre-Warm Order (Move Isolation/Curl First)
                  </button>
                </div>
              )}
              {briefing.deloadPrompt && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/12 p-3 text-xs text-amber-200">
                  <div className="font-bold">Fatigue / Joint Check</div>
                  <p className="mt-1">{briefing.deloadPrompt.reason}</p>
                  <div className="mt-2 flex gap-2">
                    {briefing.deloadPrompt.type === 'recovery_session' ? (
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateSession(buildRecoverySession(activeSession, allExercises))
                        }
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-slate-950"
                      >
                        Switch to Recovery Session
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onAdvanceWeek(true)}
                        className="rounded-lg bg-amber-500 px-3 py-1.5 text-[11px] font-bold text-slate-950"
                      >
                        Trigger Early Deload Week
                      </button>
                    )}
                  </div>
                </div>
              )}

              {briefing.items.map((item) => {
                const slot = activeSession.exercises.find(
                  (e) => e.exerciseId === item.exerciseId
                );
                return (
                  <div
                    key={item.exerciseId}
                    className="rounded-xl border border-slate-800 bg-[#0B0E14] p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-white">{item.headline}</span>
                      <SafetyBadge level={item.level} />
                    </div>
                    <p className="mt-1 text-slate-400">{item.detail}</p>
                    {item.topSwap && slot && (
                      <button
                        type="button"
                        onClick={() =>
                          handleSwapExercise(
                            slot.id,
                            item.topSwap!.exercise,
                            item.topSwap!.rationale
                          )
                        }
                        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/35 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300"
                      >
                        <ArrowRightLeft className="h-3 w-3" />
                        Swap → {item.topSwap.exercise.name} ({item.topSwap.rationale})
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Exercise Cards */}
      <div className="space-y-4">
        {activeSession.exercises.map((ex, exIndex) => {
          const def = byId.get(ex.exerciseId);
          if (!def) return null;

          const safety = assessExerciseSafety(def, profile, painHistory);
          const warmups = ex.sets.filter((s) => s.isWarmup);
          const workingSets = ex.sets.filter((s) => !s.isWarmup);
          const showWarmups = expandedWarmups[ex.id] ?? false;

          const maxPainSet = workingSets.reduce<SetLog | null>(
            (best, cur) => (!best || cur.painScore > best.painScore ? cur : best),
            null
          );
          const maxPain = maxPainSet?.painScore ?? 0;

          const lastCompletedSet = [...workingSets].reverse().find((s) => s.completed);
          const downSetHint = lastCompletedSet
            ? evaluateAutoDownSet(lastCompletedSet, ex, profile)
            : null;
          const alreadyHasDownSet = workingSets.some((s) => s.isDownSet && !s.completed);

          const isLastOfMuscle = lastIndexByMuscle.get(ex.muscle) === exIndex;
          const existingFeedback = activeSession.feedback[ex.muscle];

          return (
            <div key={ex.id} className="space-y-2.5">
              <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4">
                {/* Exercise Header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
                        {MUSCLE_LABELS[ex.muscle]}
                      </span>
                      <span className="text-[11px] text-slate-500">•</span>
                      <span className="text-[11px] text-slate-400">
                        {EQUIPMENT_LABELS[def.equipment]}
                      </span>
                      {def.unilateral && (
                        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                          L/R
                        </span>
                      )}
                    </div>
                    <h2 className="mt-1 text-base font-bold text-white">{def.name}</h2>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      disabled={exIndex === 0}
                      onClick={() => moveExercise(exIndex, -1)}
                      aria-label={`Move ${def.name} up`}
                      className="flex h-10 w-8 items-center justify-center rounded-xl border border-slate-800 bg-[#0B0E14] text-slate-400 disabled:opacity-30"
                    >
                      <ArrowUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={exIndex === activeSession.exercises.length - 1}
                      onClick={() => moveExercise(exIndex, 1)}
                      aria-label={`Move ${def.name} down`}
                      className="flex h-10 w-8 items-center justify-center rounded-xl border border-slate-800 bg-[#0B0E14] text-slate-400 disabled:opacity-30"
                    >
                      <ArrowDown className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSwapTarget({
                          sessionExerciseId: ex.id,
                          exercise: def,
                          painJoint: safety.affectedJoints[0] ?? maxPainSet?.painJoint,
                        })
                      }
                      className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-slate-700 bg-[#0B0E14] px-3 text-xs font-semibold text-slate-200 hover:border-emerald-500/40 active:scale-95"
                    >
                      <ArrowRightLeft className="h-3.5 w-3.5 text-emerald-400" />
                      Swap
                    </button>
                  </div>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <SfrBadge score={def.sfrScore} />
                  <SafetyBadge level={safety.level} />
                  <span className="rounded-full border border-slate-700 bg-[#0B0E14] px-2 py-0.5 text-[11px] text-slate-300 tabular-nums">
                    {ex.targetMinReps}–{ex.targetMaxReps} reps
                  </span>
                </div>

                <p className="mt-2 text-xs text-slate-400">
                  <span className="font-semibold text-slate-300">Tempo:</span>{' '}
                  {ex.eccentricOverride ?? def.eccentricCue}
                </p>

                {safety.romGuidance && (
                  <p className="mt-1 text-[11px] text-slate-400">
                    <span className="font-semibold text-slate-300">ROM:</span>{' '}
                    {safety.romGuidance}
                  </p>
                )}

                {safety.finisherTip && (
                  <p className="mt-1 text-[11px] text-emerald-300/90">
                    {safety.finisherTip}
                  </p>
                )}

                {ex.coachNote && (
                  <div className="mt-2 rounded-xl border border-slate-800 bg-[#0B0E14] px-3 py-2 text-xs text-slate-300">
                    {ex.coachNote}
                  </div>
                )}

                {/* Warmup Toggle */}
                <div className="mt-3 flex items-center justify-between">
                  {warmups.length > 0 ? (
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedWarmups((prev) => ({
                          ...prev,
                          [ex.id]: !showWarmups,
                        }))
                      }
                      className="flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-slate-200"
                    >
                      <Flame className="h-3.5 w-3.5 text-amber-400" />
                      {showWarmups ? 'Hide' : 'Show'} {warmups.length} Ramp-Up Warm-Up Sets
                    </button>
                  ) : (
                    profile.includeWarmups &&
                    (workingSets[0]?.weight ?? workingSets[0]?.targetWeight ?? 0) > 0 && (
                      <button
                        type="button"
                        onClick={() => generateWarmupsFromFirstSet(ex, def)}
                        className="flex items-center gap-1.5 text-xs font-medium text-emerald-400"
                      >
                        <Flame className="h-3.5 w-3.5" />
                        Generate Tendon Warm-Up Sets
                      </button>
                    )
                  )}
                </div>

                {showWarmups && warmups.length > 0 && (
                  <div className="mt-2 space-y-1.5 rounded-2xl border border-slate-800 bg-[#0B0E14] p-2.5">
                    {warmups.map((wu) => (
                      <div
                        key={wu.id}
                        className="flex items-center justify-between gap-2 text-xs"
                      >
                        <span className="font-medium text-amber-300">
                          Warm-Up {wu.setNumber}
                        </span>
                        <span className="text-slate-300 tabular-nums">
                          {wu.targetWeight} {profile.unit} × {wu.targetRepsMin} reps
                        </span>
                        <button
                          type="button"
                          onClick={() => toggleSetComplete(ex, wu, def)}
                          className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
                            wu.completed
                              ? 'border-emerald-500 bg-emerald-500 text-slate-950'
                              : 'border-slate-700 bg-slate-900 text-slate-400'
                          }`}
                          aria-label={`Complete warmup ${wu.setNumber}`}
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Working Sets Table */}
                <div className="mt-3 space-y-2">
                  <div className="grid grid-cols-[36px_1fr_64px_54px_46px_44px] items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    <span>Set</span>
                    <span>{profile.unit}</span>
                    <span>Reps</span>
                    <span>RIR</span>
                    <span>Pain</span>
                    <span className="text-center">Done</span>
                  </div>

                  {workingSets.map((set, idx) => {
                    const painTone =
                      set.painScore >= 5
                        ? 'border-rose-500/60 bg-rose-500/20 text-rose-300'
                        : set.painScore >= 3
                          ? 'border-amber-500/60 bg-amber-500/20 text-amber-300'
                          : 'border-slate-700 bg-[#0B0E14] text-slate-400';

                    return (
                      <div
                        key={set.id}
                        className={`rounded-2xl border p-1.5 transition ${
                          set.completed
                            ? 'border-emerald-500/35 bg-emerald-500/8'
                            : 'border-[#1E2635] bg-[#0B0E14]'
                        }`}
                      >
                        <div className="mb-1 flex items-center justify-between px-1.5 text-[11px] text-slate-400 tabular-nums">
                          <span>
                            {set.isDownSet ? 'Drop Set' : `Target:`}{' '}
                            {set.targetWeight > 0 ? `${set.targetWeight} ${profile.unit}` : 'Pick weight'} ×{' '}
                            {set.targetRepsMin}–{set.targetRepsMax} @ {set.targetRir} RIR
                          </span>
                          {def.unilateral && (
                            <button
                              type="button"
                              onClick={() =>
                                updateSet(ex.id, set.id, {
                                  side:
                                    set.side === 'both'
                                      ? 'left'
                                      : set.side === 'left'
                                        ? 'right'
                                        : 'both',
                                })
                              }
                              className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-300"
                            >
                              {set.side === 'left'
                                ? 'L side'
                                : set.side === 'right'
                                  ? 'R side'
                                  : 'L+R'}
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-[36px_1fr_64px_54px_46px_44px] items-center gap-1.5">
                          <div className="flex h-11 items-center justify-center rounded-xl bg-slate-900 text-xs font-bold text-slate-300 tabular-nums">
                            {set.isDownSet ? 'D' : idx + 1}
                          </div>

                          <input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            placeholder={set.targetWeight > 0 ? String(set.targetWeight) : '0'}
                            value={set.weight ?? ''}
                            onChange={(e) =>
                              updateSet(ex.id, set.id, {
                                weight: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            aria-label={`Set ${idx + 1} weight`}
                            className="h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-[#141923] px-2 text-center text-sm font-bold text-white tabular-nums focus:border-emerald-500 focus:outline-none"
                          />

                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder={String(set.targetRepsMin)}
                            value={set.reps ?? ''}
                            onChange={(e) =>
                              updateSet(ex.id, set.id, {
                                reps: e.target.value === '' ? null : Number(e.target.value),
                              })
                            }
                            aria-label={`Set ${idx + 1} reps`}
                            className="h-11 w-full min-w-0 rounded-xl border border-slate-700 bg-[#141923] px-1 text-center text-sm font-bold text-white tabular-nums focus:border-emerald-500 focus:outline-none"
                          />

                          <select
                            value={set.rir ?? set.targetRir}
                            onChange={(e) =>
                              updateSet(ex.id, set.id, { rir: Number(e.target.value) })
                            }
                            aria-label={`Set ${idx + 1} RIR`}
                            className="h-11 w-full rounded-xl border border-slate-700 bg-[#141923] px-1 text-center text-xs font-bold text-slate-200 tabular-nums focus:border-emerald-500 focus:outline-none"
                          >
                            {[0, 1, 2, 3, 4, 5].map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>

                          <button
                            type="button"
                            onClick={() =>
                              setPainTarget({
                                sessionExerciseId: ex.id,
                                setId: set.id,
                                initialScore: set.painScore,
                                initialJoint: set.painJoint,
                                suggestedJoints:
                                  (Object.keys(def.jointStress) as JointRegion[]).filter(
                                    (j) => (def.jointStress[j] ?? 0) > 0
                                  ),
                              })
                            }
                            aria-label={`Set ${idx + 1} joint pain`}
                            className={`flex h-11 items-center justify-center rounded-xl border text-xs font-bold tabular-nums ${painTone}`}
                          >
                            {set.painScore}
                          </button>

                          <button
                            type="button"
                            onClick={() => toggleSetComplete(ex, set, def)}
                            aria-label={`Complete set ${idx + 1}`}
                            className={`flex h-11 items-center justify-center rounded-xl border transition active:scale-95 ${
                              set.completed
                                ? 'border-emerald-400 bg-emerald-500 text-slate-950'
                                : 'border-slate-700 bg-[#141923] text-slate-400 hover:text-white'
                            }`}
                          >
                            <Check className="h-5 w-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Extra Set button */}
                <button
                  type="button"
                  onClick={() => {
                    const nextNum = workingSets.length + 1;
                    const last = workingSets[workingSets.length - 1];
                    updateExercise(ex.id, (cur) => ({
                      ...cur,
                      numSets: cur.numSets + 1,
                      sets: [
                        ...cur.sets,
                        {
                          id: `set-${Date.now()}`,
                          setNumber: nextNum,
                          side: def.unilateral ? 'both' : 'both',
                          targetWeight: last?.targetWeight ?? 0,
                          targetRepsMin: ex.targetMinReps,
                          targetRepsMax: ex.targetMaxReps,
                          targetRir: activeSession.targetRir,
                          weight: last?.weight ?? null,
                          reps: null,
                          rir: null,
                          painScore: 0,
                          completed: false,
                        },
                      ],
                    }));
                  }}
                  className="mt-2.5 flex h-9 w-full items-center justify-center gap-1 rounded-xl border border-dashed border-slate-700 text-xs font-medium text-slate-400 hover:border-slate-500 hover:text-slate-200"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Working Set
                </button>

                {/* Auto Down-Set Suggestion */}
                {downSetHint && !alreadyHasDownSet && (
                  <div className="mt-3 rounded-2xl border border-sky-500/40 bg-sky-500/12 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-xs text-sky-200">
                        <span className="font-bold">Auto Down-Set (v4.1):</span>{' '}
                        {downSetHint.reason}
                      </div>
                      <button
                        type="button"
                        onClick={() => addDownSetFor(ex, lastCompletedSet!)}
                        className="shrink-0 rounded-xl bg-sky-500 px-3 py-1.5 text-xs font-bold text-slate-950"
                      >
                        + Add Drop Set
                      </button>
                    </div>
                  </div>
                )}

                {/* Traffic-Light Pain Alerts */}
                {maxPain >= 5 && (
                  <div className="mt-3 rounded-2xl border border-rose-500/50 bg-rose-500/15 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 text-xs text-rose-200">
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                        <div>
                          <span className="font-bold">Red Pain Alert ({maxPain}/10):</span>{' '}
                          Stop adding load. Switch immediately to a lower-torque, high-SFR variation.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setSwapTarget({
                            sessionExerciseId: ex.id,
                            exercise: def,
                            painJoint: maxPainSet?.painJoint,
                          })
                        }
                        className="shrink-0 rounded-xl bg-rose-500 px-3 py-1.5 text-xs font-bold text-white"
                      >
                        Swap Now
                      </button>
                    </div>
                  </div>
                )}

                {maxPain >= 3 && maxPain <= 4 && (
                  <div className="mt-3 rounded-2xl border border-amber-500/45 bg-amber-500/12 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2 text-xs text-amber-200">
                        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                        <div>
                          <span className="font-bold">Amber Caution ({maxPain}/10):</span>{' '}
                          Hold weight steady, shift reps +3 higher & slow eccentric to 3s.
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => applyAmberPainGuard(ex)}
                        className="shrink-0 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950"
                      >
                        Apply Rep Shift
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Post-Muscle-Group Feedback Button */}
              {isLastOfMuscle && (
                <button
                  type="button"
                  onClick={() => setFeedbackMuscle(ex.muscle)}
                  className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                    existingFeedback
                      ? 'border-emerald-500/35 bg-emerald-500/10'
                      : 'border-[#1E2635] bg-[#141923] hover:border-emerald-500/40'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-white">
                      {MUSCLE_LABELS[ex.muscle]} Post-Workout Feedback
                    </div>
                    <div className="text-[11px] text-slate-400">
                      {existingFeedback
                        ? existingFeedback.rationale
                        : 'Rate soreness, pump & workload to autoregulate next week sets'}
                    </div>
                  </div>
                  <span
                    className={`ml-2 shrink-0 rounded-full px-2.5 py-1 text-xs font-bold tabular-nums ${
                      existingFeedback
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'bg-slate-800 text-slate-200'
                    }`}
                  >
                    {existingFeedback
                      ? `v4.1 ${existingFeedback.v4Rating > 0 ? `+${existingFeedback.v4Rating}` : existingFeedback.v4Rating}`
                      : 'Rate →'}
                  </span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Finish Workout Button */}
      <button
        type="button"
        onClick={handleFinishWorkout}
        className={`flex h-13 w-full items-center justify-center gap-2 rounded-2xl text-sm font-bold transition active:scale-[0.99] ${
          activeSession.status === 'completed'
            ? 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
            : 'bg-emerald-500 text-slate-950'
        }`}
      >
        <Check className="h-5 w-5" />
        {activeSession.status === 'completed'
          ? 'Session Completed (Tap to Update)'
          : 'Finish Workout'}
      </button>

      {/* Modals */}
      {swapTarget && (
        <SwapDrawer
          currentExercise={swapTarget.exercise}
          allExercises={allExercises}
          profile={profile}
          painHistory={painHistory}
          initialPainJoint={swapTarget.painJoint}
          onSelectSwap={(rep, reason) =>
            handleSwapExercise(swapTarget.sessionExerciseId, rep, reason)
          }
          onClose={() => setSwapTarget(null)}
        />
      )}

      {painTarget && (
        <PainPickerModal
          initialScore={painTarget.initialScore}
          initialJoint={painTarget.initialJoint}
          suggestedJoints={painTarget.suggestedJoints}
          onSave={(score, joint) => {
            updateSet(painTarget.sessionExerciseId, painTarget.setId, {
              painScore: score,
              painJoint: joint,
            });
            if (score >= 3 && joint) {
              const exSlot = activeSession.exercises.find(
                (e) => e.id === painTarget.sessionExerciseId
              );
              const def = exSlot ? byId.get(exSlot.exerciseId) : undefined;
              const setObj = exSlot?.sets.find((s) => s.id === painTarget.setId);
              if (exSlot && def) {
                onRecordPainEvent({
                  id: `pain-${Date.now()}`,
                  timestamp: new Date().toISOString(),
                  exerciseId: def.id,
                  exerciseName: def.name,
                  joint,
                  painScore: score,
                  weight: setObj?.weight ?? null,
                  reps: setObj?.reps ?? null,
                  actionTaken: score >= 5 ? 'Flagged for high-SFR swap' : 'Amber rep/tempo guard',
                });
              }
            }
            setPainTarget(null);
          }}
          onClose={() => setPainTarget(null)}
        />
      )}

      {feedbackMuscle && (
        <FeedbackDrawer
          muscle={feedbackMuscle}
          currentWeeklySets={weeklySetsForMuscle(feedbackMuscle)}
          initialJointPainMax={maxPainForMuscleInSession(feedbackMuscle).max}
          initialPainJoint={maxPainForMuscleInSession(feedbackMuscle).joint}
          existingFeedback={activeSession.feedback[feedbackMuscle]}
          profile={profile}
          onSave={(fb) => {
            onUpdateSession({
              ...activeSession,
              feedback: {
                ...activeSession.feedback,
                [feedbackMuscle]: fb,
              },
            });
            setFeedbackMuscle(null);
          }}
          onClose={() => setFeedbackMuscle(null)}
        />
      )}
    </div>
  );
}
