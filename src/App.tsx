import {
  Activity,
  BookOpen,
  Calendar,
  Dumbbell,
  User,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { MesoBuilderModal } from './components/MesoBuilderModal';
import { RestTimerBar } from './components/RestTimerBar';
import { BUILTIN_EXERCISES } from './data/exercises';
import { MESO_TEMPLATES } from './data/templates';
import { generateNextMesocycle } from './engine/deload';
import { advanceToNextWeek, createMesocycleFromTemplate } from './engine/mesoGenerator';
import { CoachScreen } from './screens/CoachScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { MesoScreen } from './screens/MesoScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { WorkoutScreen } from './screens/WorkoutScreen';
import {
  createInitialAppState,
  loadAppState,
  saveAppState,
} from './storage/db';
import {
  AppState,
  AthleteProfile,
  ExerciseDefinition,
  Mesocycle,
  MesoTemplate,
  MuscleGroup,
  MusclePriority,
  PainEvent,
  WorkoutSession,
} from './types/models';
import {
  releaseWakeLock,
  requestWakeLock,
  triggerRestCompleteFeedback,
} from './utils/device';

type TabId = 'workout' | 'meso' | 'coach' | 'library' | 'profile';

export function App() {
  const [appState, setAppState] = useState<AppState | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>('workout');
  const [showMesoBuilder, setShowMesoBuilder] = useState(false);

  // Wake Lock state
  const [wakeLockEnabled, setWakeLockEnabled] = useState(false);

  // Rest timer state
  const [restRemaining, setRestRemaining] = useState<number | null>(null);
  const [restTotal, setRestTotal] = useState<number>(120);
  const [restPaused, setRestPaused] = useState<boolean>(false);

  // Load persisted state from IndexedDB / localStorage
  useEffect(() => {
    void loadAppState().then((loaded) => {
      setAppState(loaded);
    });
  }, []);

  // Auto-save on state changes
  useEffect(() => {
    if (!appState) return;
    void saveAppState(appState);
  }, [appState]);

  // Countdown tick for rest timer
  useEffect(() => {
    if (restRemaining === null || restPaused) return;
    if (restRemaining <= 0) {
      triggerRestCompleteFeedback();
      setRestRemaining(null);
      return;
    }
    const id = window.setInterval(() => {
      setRestRemaining((prev) => (prev === null ? null : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [restRemaining, restPaused]);

  const allExercises = useMemo(() => {
    if (!appState) return BUILTIN_EXERCISES;
    return [...BUILTIN_EXERCISES, ...appState.customExercises];
  }, [appState]);

  const activeMeso = useMemo(() => {
    if (!appState || !appState.activeMesoId) return null;
    return appState.mesocycles.find((m) => m.id === appState.activeMesoId) ?? null;
  }, [appState]);

  if (!appState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0B0E14] text-sm text-slate-400">
        Loading MesoWise...
      </div>
    );
  }

  const handleToggleWakeLock = async () => {
    if (wakeLockEnabled) {
      await releaseWakeLock();
      setWakeLockEnabled(false);
    } else {
      const ok = await requestWakeLock();
      setWakeLockEnabled(ok || !wakeLockEnabled);
    }
  };

  const handleCompleteOnboarding = (
    profile: AthleteProfile,
    template: MesoTemplate,
    mesoName: string,
    totalWeeks: number
  ) => {
    const newMeso = createMesocycleFromTemplate(
      template,
      { name: mesoName, totalWeeks },
      allExercises,
      profile,
      appState.painHistory
    );
    setAppState((prev) =>
      prev
        ? {
            ...prev,
            profile,
            mesocycles: [newMeso, ...prev.mesocycles],
            activeMesoId: newMeso.id,
          }
        : prev
    );
    setActiveTab('workout');
  };

  const handleUpdateActiveMeso = (updater: (meso: Mesocycle) => Mesocycle) => {
    if (!activeMeso) return;
    setAppState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        mesocycles: prev.mesocycles.map((m) =>
          m.id === activeMeso.id ? updater(m) : m
        ),
      };
    });
  };

  const handleUpdateSession = (updatedSession: WorkoutSession) => {
    handleUpdateActiveMeso((meso) => ({
      ...meso,
      sessions: meso.sessions.map((s) =>
        s.id === updatedSession.id ? updatedSession : s
      ),
    }));
  };

  const handleAdvanceWeek = (forceDeload = false) => {
    handleUpdateActiveMeso((meso) =>
      advanceToNextWeek(meso, allExercises, appState.profile, forceDeload)
    );
  };

  const handleStartNextMeso = (completedMeso: Mesocycle) => {
    const tpl =
      MESO_TEMPLATES.find((t) => t.id === completedMeso.templateId) ??
      MESO_TEMPLATES[0];
    const nextMeso = generateNextMesocycle(
      completedMeso,
      tpl,
      allExercises,
      appState.profile
    );
    setAppState((prev) =>
      prev
        ? {
            ...prev,
            mesocycles: prev.mesocycles
              .map((m) =>
                m.id === completedMeso.id ? { ...m, status: 'completed' as const } : m
              )
              .concat(nextMeso),
            activeMesoId: nextMeso.id,
          }
        : prev
    );
    setActiveTab('workout');
  };

  const handleCreateMeso = (
    template: MesoTemplate,
    name: string,
    totalWeeks: number,
    priorities: Partial<Record<MuscleGroup, MusclePriority>>
  ) => {
    const newMeso = createMesocycleFromTemplate(
      template,
      { name, totalWeeks, musclePriorities: priorities },
      allExercises,
      appState.profile,
      appState.painHistory
    );
    setAppState((prev) =>
      prev
        ? {
            ...prev,
            mesocycles: [newMeso, ...prev.mesocycles],
            activeMesoId: newMeso.id,
          }
        : prev
    );
    setShowMesoBuilder(false);
    setActiveTab('workout');
  };

  const handleApplyGlobalSwap = (
    oldExerciseId: string,
    replacement: ExerciseDefinition,
    reason: string
  ) => {
    const newInc =
      appState.profile.unit === 'lb'
        ? replacement.defaultIncrementLb
        : replacement.defaultIncrementKg;
    handleUpdateActiveMeso((meso) => ({
      ...meso,
      sessions: meso.sessions.map((sess) => {
        if (sess.weekNumber !== meso.currentWeek || sess.status === 'completed') {
          return sess;
        }
        return {
          ...sess,
          exercises: sess.exercises.map((ex) =>
            ex.exerciseId === oldExerciseId
              ? {
                  ...ex,
                  exerciseId: replacement.id,
                  muscle: replacement.primaryMuscle,
                  targetMinReps: replacement.defaultRepRange.min,
                  targetMaxReps: replacement.defaultRepRange.max,
                  increment: newInc,
                  swappedFromId: oldExerciseId,
                  swapReason: reason,
                  coachNote: `Swapped to ${replacement.name}: ${reason}`,
                  sets: ex.sets
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
                            targetRepsMin: replacement.defaultRepRange.min,
                            targetRepsMax: replacement.defaultRepRange.max,
                            painScore: 0,
                          }
                    ),
                }
              : ex
          ),
        };
      }),
    }));
  };

  if (!appState.profile.onboardingComplete) {
    return (
      <OnboardingScreen
        initialProfile={appState.profile}
        allExercises={allExercises}
        onComplete={handleCompleteOnboarding}
      />
    );
  }

  const navItems: { id: TabId; label: string; icon: typeof Dumbbell }[] = [
    { id: 'workout', label: 'Workout', icon: Dumbbell },
    { id: 'meso', label: 'Meso', icon: Calendar },
    { id: 'coach', label: 'Coach', icon: Activity },
    { id: 'library', label: 'Library', icon: BookOpen },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <div className="mx-auto min-h-screen w-full max-w-[460px] bg-[#0B0E14] px-3.5 pt-3">
      {activeTab === 'workout' && (
        <WorkoutScreen
          meso={activeMeso}
          profile={appState.profile}
          allExercises={allExercises}
          painHistory={appState.painHistory}
          wakeLockEnabled={wakeLockEnabled}
          onToggleWakeLock={() => void handleToggleWakeLock()}
          onUpdateSession={handleUpdateSession}
          onRecordPainEvent={(ev: PainEvent) =>
            setAppState((prev) =>
              prev ? { ...prev, painHistory: [...prev.painHistory, ev] } : prev
            )
          }
          onStartRestTimer={(sec) => {
            setRestTotal(sec);
            setRestRemaining(sec);
            setRestPaused(false);
          }}
          onAdvanceWeek={handleAdvanceWeek}
          onOpenMesoBuilder={() => setShowMesoBuilder(true)}
        />
      )}

      {activeTab === 'meso' && (
        <MesoScreen
          meso={activeMeso}
          allMesocycles={appState.mesocycles}
          profile={appState.profile}
          allExercises={allExercises}
          onAdvanceWeek={handleAdvanceWeek}
          onStartNextMeso={handleStartNextMeso}
          onOpenMesoBuilder={() => setShowMesoBuilder(true)}
          onSelectMeso={(id) =>
            setAppState((prev) => (prev ? { ...prev, activeMesoId: id } : prev))
          }
          onJumpToWorkout={() => setActiveTab('workout')}
        />
      )}

      {activeTab === 'coach' && (
        <CoachScreen
          meso={activeMeso}
          profile={appState.profile}
          allExercises={allExercises}
          painHistory={appState.painHistory}
          onApplyGlobalSwap={handleApplyGlobalSwap}
          onTriggerEarlyDeload={() => {
            handleAdvanceWeek(true);
            setActiveTab('workout');
          }}
        />
      )}

      {activeTab === 'library' && (
        <LibraryScreen
          allExercises={allExercises}
          profile={appState.profile}
          painHistory={appState.painHistory}
          onAddCustomExercise={(ex) =>
            setAppState((prev) =>
              prev
                ? { ...prev, customExercises: [...prev.customExercises, ex] }
                : prev
            )
          }
        />
      )}

      {activeTab === 'profile' && (
        <ProfileScreen
          appState={appState}
          onUpdateProfile={(profile) =>
            setAppState((prev) => (prev ? { ...prev, profile } : prev))
          }
          onImportState={(imported) => setAppState(imported)}
          onResetAll={() => {
            void releaseWakeLock();
            setAppState(createInitialAppState());
          }}
        />
      )}

      {/* Sticky Rest Timer */}
      {restRemaining !== null && (
        <RestTimerBar
          remainingSec={restRemaining}
          totalSec={restTotal}
          paused={restPaused}
          onAdjust={(delta) =>
            setRestRemaining((prev) => Math.max(5, (prev ?? 0) + delta))
          }
          onTogglePause={() => setRestPaused((p) => !p)}
          onSkip={() => setRestRemaining(null)}
        />
      )}

      {/* Bottom 5-Tab Navigation */}
      <nav
        aria-label="Primary Navigation"
        className="safe-bottom fixed bottom-0 left-1/2 z-40 w-full max-w-[460px] -translate-x-1/2 border-t border-[#1E2635] bg-[#0B0E14]/95 px-2 pt-1.5 backdrop-blur-md"
      >
        <div className="grid grid-cols-5">
          {navItems.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`flex h-13 flex-col items-center justify-center gap-0.5 rounded-xl transition ${
                  active ? 'text-emerald-400' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="text-[10px] font-semibold">{label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {showMesoBuilder && (
        <MesoBuilderModal
          onCreate={handleCreateMeso}
          onClose={() => setShowMesoBuilder(false)}
        />
      )}
    </div>
  );
}

export default App;
