import { describe, expect, it } from 'vitest';
import { DEMO_AREAS, billedMinutes, computeFeeCents, findArea, splitFee } from '../src';

const TZ = 'America/Toronto';
const city = DEMO_AREAS.find((a) => a.name === 'City Hall Lot')!;
const king = DEMO_AREAS.find((a) => a.name === 'King West Street Zone')!;
const general = DEMO_AREAS.find((a) => a.level === 2)!;

// Toronto is UTC-5 in January (EST) and UTC-4 in July (EDT).
const toronto = (iso: string, offset: string) => Date.parse(`${iso}${offset}`);

describe('computeFeeCents', () => {
  it('charges 2 hours at $4.00/h on a Tuesday', () => {
    const s = toronto('2027-01-05T10:00:00', '-05:00'); // Tue
    const e = toronto('2027-01-05T12:00:00', '-05:00');
    expect(computeFeeCents(city.plan, TZ, s, e)).toBe(800);
  });

  it('is free inside the grace period', () => {
    const s = toronto('2027-01-05T10:00:00', '-05:00');
    expect(computeFeeCents(city.plan, TZ, s, s + 5 * 60_000)).toBe(0);
  });

  it('charges per started minute and rounds up', () => {
    const s = toronto('2027-01-05T10:00:30', '-05:00');
    const e = toronto('2027-01-05T10:06:00', '-05:00'); // touches minutes 10:00..10:05 = 6 minutes
    // 6 min * 400/60 = 40 cents, but the minimum charge is 100
    expect(billedMinutes(s, e)).toBe(6);
    expect(computeFeeCents(city.plan, TZ, s, e)).toBe(100);
  });

  it('applies the minimum charge on Sunday at $2.00/h', () => {
    const s = toronto('2027-01-10T10:00:00', '-05:00'); // Sun
    expect(computeFeeCents(city.plan, TZ, s, s + 10 * 60_000)).toBe(100);
  });

  it('caps at the daily maximum', () => {
    const s = toronto('2027-01-05T08:00:00', '-05:00');
    const e = toronto('2027-01-05T23:59:00', '-05:00'); // 16h * 4.00 = 64.00, cap 20.00
    expect(computeFeeCents(city.plan, TZ, s, e)).toBe(2000);
  });

  it('is free outside the tariff hours (night, no rule)', () => {
    const s = toronto('2027-01-05T02:00:00', '-05:00');
    expect(computeFeeCents(city.plan, TZ, s, s + 3 * 3_600_000)).toBe(100); // min charge only
  });

  it('switches rate across a rule boundary', () => {
    // King West weekday: 18:00-19:00 at 6.00, 19:00-20:00 at 3.00
    const s = toronto('2027-01-05T18:00:00', '-05:00');
    const e = toronto('2027-01-05T20:00:00', '-05:00');
    expect(computeFeeCents(king.plan, TZ, s, e)).toBe(900);
  });

  it('uses the operator time zone, not UTC (and handles DST)', () => {
    // 10:00-11:00 Toronto in July is 14:00-15:00 UTC
    const s = Date.parse('2027-07-06T14:00:00Z');
    expect(computeFeeCents(king.plan, TZ, s, s + 3_600_000)).toBe(600);
  });

  it('does not drift with floating point (1 hour at $1.00/h is exactly 100)', () => {
    const plan = { ...general.plan, min_charge_cents: 0, daily_max_cents: null, grace_minutes: 0, rules: [{ days_of_week: [1, 2, 3, 4, 5, 6, 7], start_time: '00:00', end_time: '24:00', price_per_hour_cents: 100, priority: 0 }] };
    const s = Date.parse('2027-01-05T15:00:00Z');
    expect(computeFeeCents(plan, TZ, s, s + 3_600_000)).toBe(100);
  });
});

describe('splitFee', () => {
  it('takes 8% and rounds the platform share down', () => {
    expect(splitFee(800, 800)).toEqual({ serviceFeeCents: 64, operatorPayoutCents: 736 });
    expect(splitFee(101, 800)).toEqual({ serviceFeeCents: 8, operatorPayoutCents: 93 });
  });
});

describe('findArea', () => {
  it('prefers the most specific level', () => {
    expect(findArea(DEMO_AREAS, 43.6526, -79.3832)?.name).toBe('City Hall Lot');
  });
  it('falls back to the general zone', () => {
    expect(findArea(DEMO_AREAS, 43.67, -79.35)?.name).toBe('Toronto General Zone');
  });
  it('returns null outside every area', () => {
    expect(findArea(DEMO_AREAS, 43.45, -80.5)).toBeNull();
  });
});

import { currentRateCents, describeRules, formatDays } from '../src';
describe('rate helpers', () => {
  it('finds the rate in force now (operator time)', () => {
    const tue10 = Date.parse('2027-01-05T10:00:00-05:00');
    expect(currentRateCents(city.plan, TZ, tue10)).toBe(400);
    expect(currentRateCents(city.plan, TZ, Date.parse('2027-01-05T03:00:00-05:00'))).toBe(0);
  });
  it('formats days and rules', () => {
    expect(formatDays([1, 2, 3, 4, 5])).toBe('Mon-Fri');
    expect(formatDays([6, 7])).toBe('Sat, Sun');
    expect(formatDays([1, 2, 3, 4, 5, 6, 7])).toBe('Daily');
    expect(describeRules(city.plan)[0]).toContain('Mon-Sat 08:00-24:00');
  });
});
