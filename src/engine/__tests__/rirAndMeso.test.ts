import { describe, expect, it } from 'vitest';
import { createDefaultProfile } from '../../data/constants';
import { getAdaptedLandmarks } from '../landmarks';
import { getAgeAdjustedRepRange, getWeekTargetRir, isDeloadWeek } from '../rirAndMeso';

describe('RIR Ramp & Age-Adapted Volume Landmarks', () => {
  it('ramps RIR from 3 down to 1 when jointSafeRirFloor is enabled, finishing with 4 RIR deload', () => {
    const profile = { ...createDefaultProfile(), jointSafeRirFloor: true };
    expect(getWeekTargetRir(1, 5, profile)).toBe(3);
    expect(getWeekTargetRir(2, 5, profile)).toBe(2);
    expect(getWeekTargetRir(3, 5, profile)).toBe(2);
    expect(getWeekTargetRir(4, 5, profile)).toBe(1);
    expect(getWeekTargetRir(5, 5, profile)).toBe(4);
    expect(isDeloadWeek(5, 5)).toBe(true);
    expect(isDeloadWeek(4, 5)).toBe(false);
  });

  it('ramps down to 0 RIR on peak accumulation week when jointSafeRirFloor is disabled', () => {
    const profile = { ...createDefaultProfile(), jointSafeRirFloor: false };
    expect(getWeekTargetRir(1, 5, profile)).toBe(3);
    expect(getWeekTargetRir(2, 5, profile)).toBe(2);
    expect(getWeekTargetRir(3, 5, profile)).toBe(1);
    expect(getWeekTargetRir(4, 5, profile)).toBe(0);
    expect(getWeekTargetRir(5, 5, profile)).toBe(4);
  });

  it('shifts base rep ranges upward for older lifters and joint-modified exercises', () => {
    expect(getAgeAdjustedRepRange({ min: 6, max: 10 }, 'under_35', 'safe')).toEqual({
      min: 6,
      max: 10,
    });
    expect(getAgeAdjustedRepRange({ min: 6, max: 10 }, '50_64', 'safe')).toEqual({
      min: 8,
      max: 12,
    });
    expect(getAgeAdjustedRepRange({ min: 6, max: 10 }, '65_plus', 'caution')).toEqual({
      min: 14,
      max: 18,
    });
  });

  it('scales volume landmarks downward for age tier and recovering joints', () => {
    const young = { ...createDefaultProfile(), ageTier: 'under_35' as const };
    const mastersWithShoulder = {
      ...createDefaultProfile(),
      ageTier: '50_64' as const,
    };
    mastersWithShoulder.joints.shoulder = {
      status: 'recovering',
      notes: 'Rotator cuff',
      painBaseline: 2,
    };

    const youngChest = getAdaptedLandmarks('chest', young);
    const mastersChest = getAdaptedLandmarks('chest', mastersWithShoulder);

    expect(youngChest.mrv).toBe(20);
    expect(mastersChest.mrv).toBeLessThan(youngChest.mrv);
    expect(mastersChest.mev).toBeLessThanOrEqual(youngChest.mev);
    expect(mastersChest.notes).toContain('shoulder');
  });
});
