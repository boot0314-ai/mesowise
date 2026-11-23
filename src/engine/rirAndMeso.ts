import { AgeTier, AthleteProfile, SafetyLevel } from '../types/models';

/**
 * Computes the Liftosaur RP v4.1 / RP Hypertrophy target RIR for a given week.
 * - Week 1 starts at 3 RIR (~RPE 7).
 * - Linearly ramps to 0 RIR (or 1 RIR when `jointSafeRirFloor` is enabled for older/injured lifters).
 * - Final week is always a Deload at 4 RIR.
 */
export function getWeekTargetRir(
  weekNumber: number,
  totalWeeks: number,
  profile: Pick<AthleteProfile, 'jointSafeRirFloor'>
): number {
  const safeTotal = Math.max(2, totalWeeks);
  if (weekNumber >= safeTotal) {
    return 4;
  }

  const finalAccumRir = profile.jointSafeRirFloor ? 1 : 0;
  const accumWeeks = safeTotal - 1;
  if (accumWeeks <= 1 || weekNumber <= 1) {
    return 3;
  }

  const progress = (weekNumber - 1) / (accumWeeks - 1);
  const rawRir = Math.round(3 - progress * (3 - finalAccumRir));
  return Math.max(finalAccumRir, Math.min(3, rawRir));
}

/**
 * Returns whether the given week number is the scheduled deload week.
 */
export function isDeloadWeek(weekNumber: number, totalWeeks: number): boolean {
  return weekNumber >= Math.max(2, totalWeeks);
}

/**
 * Adjusts base hypertrophy rep ranges upward for older lifters or joint-modified movements.
 * Evidence-based hypertrophy occurs across 5-30 reps when taken near failure; shifting into
 * 10-20+ reps cuts peak joint & tendon torque ~25-35% without sacrificing muscle growth.
 */
export function getAgeAdjustedRepRange(
  baseRange: { min: number; max: number },
  ageTier: AgeTier,
  exerciseRisk: SafetyLevel = 'safe'
): { min: number; max: number } {
  let shift = 0;

  if (ageTier === '50_64') {
    shift += 2;
  } else if (ageTier === '65_plus') {
    shift += 4;
  }

  if (exerciseRisk === 'modify') {
    shift += 2;
  } else if (exerciseRisk === 'caution' || exerciseRisk === 'avoid') {
    shift += 4;
  }

  // Avoid pushing already very-high-rep isolation exercises past reasonable ceilings
  if (baseRange.min >= 15 && shift > 2) {
    shift = 2;
  }

  const min = Math.min(22, baseRange.min + shift);
  const max = Math.min(30, Math.max(min + 3, baseRange.max + shift));

  return { min, max };
}
