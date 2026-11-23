import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { useMemo } from 'react';
import { JOINT_LABELS, JOINT_STATUS_LABELS, MUSCLE_LABELS } from '../data/constants';
import { shouldSuggestDeloadOrRecovery } from '../engine/feedback';
import { assessExerciseSafety, recommendJointFriendlySwaps } from '../engine/injuryAdvisor';
import { getAdaptedLandmarks } from '../engine/landmarks';
import {
  AthleteProfile,
  ExerciseDefinition,
  JointRegion,
  Mesocycle,
  MuscleGroup,
  PainEvent,
} from '../types/models';

interface CoachScreenProps {
  meso: Mesocycle | null;
  profile: AthleteProfile;
  allExercises: ExerciseDefinition[];
  painHistory: PainEvent[];
  onApplyGlobalSwap: (oldExerciseId: string, replacement: ExerciseDefinition, reason: string) => void;
  onTriggerEarlyDeload: () => void;
}

export function CoachScreen({
  meso,
  profile,
  allExercises,
  painHistory,
  onApplyGlobalSwap,
  onTriggerEarlyDeload,
}: CoachScreenProps) {
  const byId = useMemo(
    () => new Map(allExercises.map((e) => [e.id, e])),
    [allExercises]
  );

  const currentWeekSessions = useMemo(() => {
    if (!meso) return [];
    return meso.sessions.filter((s) => s.weekNumber === meso.currentWeek);
  }, [meso]);

  // Weekly volume per trained muscle
  const volumeRows = useMemo(() => {
    const counts = new Map<MuscleGroup, number>();
    for (const sess of currentWeekSessions) {
      for (const ex of sess.exercises) {
        counts.set(ex.muscle, (counts.get(ex.muscle) ?? 0) + ex.numSets);
      }
    }
    return Array.from(counts.entries()).map(([muscle, sets]) => ({
      muscle,
      sets,
      landmarks: getAdaptedLandmarks(muscle, profile),
    }));
  }, [currentWeekSessions, profile]);

  // Average SFR & flagged high-axial / risky exercises in current week
  const { avgSfr, swapOpportunities } = useMemo(() => {
    let sfrSum = 0;
    let sfrCount = 0;
    const flagged = new Map<
      string,
      {
        def: ExerciseDefinition;
        reason: string;
        swap: ExerciseDefinition;
        swapRationale: string;
      }
    >();

    for (const sess of currentWeekSessions) {
      for (const ex of sess.exercises) {
        const def = byId.get(ex.exerciseId);
        if (!def) continue;
        sfrSum += def.sfrScore;
        sfrCount += 1;

        const safety = assessExerciseSafety(def, profile, painHistory);
        const isOlder = profile.ageTier === '50_64' || profile.ageTier === '65_plus';
        const needsBetterSfr =
          safety.level === 'avoid' ||
          safety.level === 'caution' ||
          (isOlder && def.axialLoad === 'high');

        if (needsBetterSfr && !flagged.has(def.id)) {
          const candidates = recommendJointFriendlySwaps(
            def,
            allExercises,
            profile,
            safety.affectedJoints[0],
            1,
            painHistory
          );
          if (candidates[0] && candidates[0].exercise.sfrScore >= def.sfrScore) {
            flagged.set(def.id, {
              def,
              reason:
                safety.reasons[0] ??
                'High spinal/axial fatigue — a supported variation gives better stimulus per unit fatigue.',
              swap: candidates[0].exercise,
              swapRationale: candidates[0].rationale,
            });
          }
        }
      }
    }

    return {
      avgSfr: sfrCount > 0 ? sfrSum / sfrCount : 0,
      swapOpportunities: Array.from(flagged.values()),
    };
  }, [currentWeekSessions, byId, allExercises, profile, painHistory]);

  const deloadAdvice = useMemo(
    () => (meso ? shouldSuggestDeloadOrRecovery(meso, profile) : null),
    [meso, profile]
  );

  const activeJoints = (Object.keys(profile.joints) as JointRegion[]).filter(
    (j) => profile.joints[j].status !== 'healthy'
  );

  return (
    <div className="space-y-4 pb-28">
      {/* Hero Summary */}
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
          <Sparkles className="h-4 w-4" />
          Evidence-Based Science Coach
        </div>
        <h1 className="mt-1 text-lg font-bold text-white">
          Hypertrophy & Joint Longevity Radar
        </h1>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-[#1E2635] bg-[#0B0E14] p-3">
            <div className="text-[11px] text-slate-400">Avg Meso SFR</div>
            <div className="mt-0.5 text-lg font-bold text-emerald-300 tabular-nums">
              {avgSfr > 0 ? `${avgSfr.toFixed(1)}/10` : '—'}
            </div>
          </div>
          <div className="rounded-2xl border border-[#1E2635] bg-[#0B0E14] p-3">
            <div className="text-[11px] text-slate-400">Flagged Joints</div>
            <div className="mt-0.5 text-lg font-bold text-amber-300 tabular-nums">
              {activeJoints.length}
            </div>
          </div>
          <div className="rounded-2xl border border-[#1E2635] bg-[#0B0E14] p-3">
            <div className="text-[11px] text-slate-400">Pain Events</div>
            <div className="mt-0.5 text-lg font-bold text-white tabular-nums">
              {painHistory.length}
            </div>
          </div>
        </div>
      </div>

      {/* Actionable Science Recommendations */}
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <Activity className="h-4 w-4 text-emerald-400" />
          Coach Recommendations
        </div>

        {deloadAdvice && (
          <div className="rounded-2xl border border-amber-500/45 bg-amber-500/12 p-3.5 text-xs">
            <div className="font-bold text-amber-300">
              {deloadAdvice.type === 'early_deload'
                ? 'Early Deload Recommended'
                : 'Recovery Session Suggested'}
            </div>
            <p className="mt-1 text-slate-200">{deloadAdvice.reason}</p>
            {deloadAdvice.type === 'early_deload' && (
              <button
                type="button"
                onClick={onTriggerEarlyDeload}
                className="mt-2.5 rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-bold text-slate-950"
              >
                Start Deload Week Now
              </button>
            )}
          </div>
        )}

        {swapOpportunities.map((item) => (
          <div
            key={item.def.id}
            className="rounded-2xl border border-slate-800 bg-[#0B0E14] p-3.5 text-xs"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-bold text-white">
                  Upgrade SFR: {item.def.name} → {item.swap.name}
                </div>
                <p className="mt-1 text-slate-400">{item.reason}</p>
                <p className="mt-1 text-emerald-300">{item.swapRationale}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                onApplyGlobalSwap(item.def.id, item.swap, item.swapRationale)
              }
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-bold text-emerald-300"
            >
              <ArrowRightLeft className="h-3.5 w-3.5" />
              Apply Swap Across Week {meso?.currentWeek}
            </button>
          </div>
        ))}

        {/* Masters / Older Lifter Evidence-Based Science Tips */}
        <div className="rounded-2xl border border-slate-800 bg-[#0B0E14] p-3.5 text-xs space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Older-Lifter Hypertrophy Best Practices Active
          </div>
          <ul className="list-disc space-y-1.5 pl-4 text-slate-300">
            <li>
              <strong>Equivalent Growth at Moderate Loads:</strong> Working in 10–20+ rep ranges near 1–2 RIR triggers equal hypertrophy to heavy 5-rep sets while cutting peak tendon & joint shear by ~25–35%.
            </li>
            <li>
              <strong>3-Second Controlled Eccentrics:</strong> Slowing negatives strengthens collagen tendon remodeling and lowers acute tear risk.
            </li>
            <li>
              <strong>Anabolic Resistance Nutrition Tip:</strong> Aim for ~0.40–0.50 g/kg high-leucine protein per meal (3–4 feedings/day) and 48–72h between heavy sessions for the same joint chain.
            </li>
          </ul>
        </div>
      </div>

      {/* Weekly Volume Landmarks */}
      {volumeRows.length > 0 && (
        <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4 space-y-3">
          <div>
            <h2 className="text-sm font-bold text-white">
              Adapted Weekly Volume Landmarks
            </h2>
            <p className="text-[11px] text-slate-400">
              Scaled for your age tier & active joint statuses (MEV → MAV → MRV sets/week).
            </p>
          </div>

          <div className="space-y-3">
            {volumeRows.map(({ muscle, sets, landmarks }) => {
              const maxBar = Math.max(landmarks.mrv + 2, sets);
              const pct = Math.min(100, (sets / maxBar) * 100);
              const mevPct = (landmarks.mev / maxBar) * 100;
              const mrvPct = (landmarks.mrv / maxBar) * 100;

              const statusColor =
                sets > landmarks.mrv
                  ? 'bg-rose-500'
                  : sets >= landmarks.mev
                    ? 'bg-emerald-500'
                    : 'bg-amber-400';

              return (
                <div key={muscle} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white">
                      {MUSCLE_LABELS[muscle]}
                    </span>
                    <span className="text-slate-300 tabular-nums">
                      <strong>{sets}</strong> sets{' '}
                      <span className="text-slate-500">
                        (MEV {landmarks.mev} • MAV {landmarks.mav} • MRV {landmarks.mrv})
                      </span>
                    </span>
                  </div>
                  <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-[#0B0E14]">
                    <div
                      className={`h-full rounded-full transition-all ${statusColor}`}
                      style={{ width: `${pct}%` }}
                    />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-slate-400/70"
                      style={{ left: `${mevPct}%` }}
                      title={`MEV ${landmarks.mev}`}
                    />
                    <div
                      className="absolute top-0 h-full w-0.5 bg-rose-400/80"
                      style={{ left: `${mrvPct}%` }}
                      title={`MRV ${landmarks.mrv}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Joint Flags & Pain Log */}
      <div className="rounded-3xl border border-[#1E2635] bg-[#141923] p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-white">
          <AlertTriangle className="h-4 w-4 text-amber-400" />
          Joint Health & Pain History
        </div>

        {activeJoints.length === 0 ? (
          <p className="text-xs text-slate-400">
            All joints currently marked Healthy. Tap any joint in Profile if flare-ups occur.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {activeJoints.map((j) => (
              <span
                key={j}
                className="rounded-full border border-amber-500/40 bg-amber-500/15 px-3 py-1 text-xs font-semibold text-amber-200"
              >
                {JOINT_LABELS[j]}: {JOINT_STATUS_LABELS[profile.joints[j].status]}
              </span>
            ))}
          </div>
        )}

        {painHistory.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {painHistory.slice(-5).reverse().map((ev) => (
              <div
                key={ev.id}
                className="flex items-center justify-between rounded-xl border border-slate-800 bg-[#0B0E14] px-3 py-2 text-xs"
              >
                <div>
                  <div className="font-semibold text-white">{ev.exerciseName}</div>
                  <div className="text-[11px] text-slate-400">
                    {JOINT_LABELS[ev.joint]} • {ev.actionTaken ?? 'Logged'}
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 font-bold tabular-nums ${
                    ev.painScore >= 5
                      ? 'bg-rose-500/20 text-rose-300'
                      : 'bg-amber-500/20 text-amber-300'
                  }`}
                >
                  {ev.painScore}/10
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
