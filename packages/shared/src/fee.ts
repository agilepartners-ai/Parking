import type { RatePlan } from './types';

/**
 * Fee engine. Mirrors the SQL function compute_fee_cents() in supabase/migrations.
 * Keep the two in step: tests/fee.test.ts and supabase/tests/run.mjs use the same cases.
 *
 * Rules
 *  - Time is charged per STARTED minute (10:00:30 -> 10:03:00 is 3 minutes).
 *  - Each minute uses the highest-priority rule active at that minute in the OPERATOR's local time.
 *    No matching rule = that minute is free.
 *  - A stay no longer than grace_minutes is free.
 *  - The daily maximum applies per started 24h block, then the minimum charge is applied.
 *  - All maths is on integers: sum(price_per_hour_cents) over minutes, divided by 60, rounded UP.
 */

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = dtfCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    dtfCache.set(timeZone, f);
  }
  return f;
}

const ISO_DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** ISO weekday (1-7) and minutes since local midnight, for an instant in a time zone. */
export function localParts(ms: number, timeZone: string): { dow: number; minuteOfDay: number } {
  const parts = formatter(timeZone).formatToParts(new Date(ms));
  let dow = 1;
  let h = 0;
  let m = 0;
  for (const p of parts) {
    if (p.type === 'weekday') dow = ISO_DOW[p.value] ?? 1;
    else if (p.type === 'hour') h = parseInt(p.value, 10) % 24;
    else if (p.type === 'minute') m = parseInt(p.value, 10);
  }
  return { dow, minuteOfDay: h * 60 + m };
}

/** "HH:MM" or "HH:MM:SS" (including "24:00") to minutes since midnight. */
export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':');
  return parseInt(h, 10) * 60 + parseInt(m ?? '0', 10);
}

export function computeFeeCents(plan: RatePlan, timeZone: string, startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  if (endMs - startMs <= plan.grace_minutes * 60_000) return 0;

  const rules = plan.rules.map((r) => ({
    days: r.days_of_week,
    from: timeToMinutes(r.start_time),
    to: timeToMinutes(r.end_time),
    price: r.price_per_hour_cents,
    priority: r.priority,
  }));

  let sum = 0;
  let minutes = 0;
  const first = Math.floor(startMs / 60_000) * 60_000;
  for (let t = first; t < endMs; t += 60_000) {
    minutes += 1;
    const { dow, minuteOfDay } = localParts(t, timeZone);
    let best: { price: number; priority: number } | null = null;
    for (const r of rules) {
      if (r.days.includes(dow) && minuteOfDay >= r.from && minuteOfDay < r.to) {
        if (!best || r.priority > best.priority) best = r;
      }
    }
    if (best) sum += best.price;
  }

  let fee = Math.ceil(sum / 60);
  if (plan.daily_max_cents != null) {
    const days = Math.max(1, Math.ceil(minutes / 1440));
    fee = Math.min(fee, plan.daily_max_cents * days);
  }
  return Math.max(fee, plan.min_charge_cents);
}

/** Platform cut and operator payout. Integer maths, platform share rounds down (as in SQL). */
export function splitFee(feeCents: number, serviceFeeBps: number): { serviceFeeCents: number; operatorPayoutCents: number } {
  const serviceFeeCents = Math.floor((feeCents * serviceFeeBps) / 10_000);
  return { serviceFeeCents, operatorPayoutCents: feeCents - serviceFeeCents };
}

/** Minutes charged for a stay, rounded up (display only). */
export function billedMinutes(startMs: number, endMs: number): number {
  if (endMs <= startMs) return 0;
  return Math.floor((endMs - 1) / 60_000) - Math.floor(startMs / 60_000) + 1;
}

export function formatMoney(cents: number, currency = 'CAD', locale = 'en-CA'): string {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  return `${h} h ${m.toString().padStart(2, '0')} min`;
}

/** Rate (cents per hour) in force at an instant, in the operator's local time. 0 = free right now. */
export function currentRateCents(plan: RatePlan, timeZone: string, atMs: number): number {
  const { dow, minuteOfDay } = localParts(atMs, timeZone);
  let best: { price: number; priority: number } | null = null;
  for (const r of plan.rules) {
    if (r.days_of_week.includes(dow) && minuteOfDay >= timeToMinutes(r.start_time) && minuteOfDay < timeToMinutes(r.end_time)) {
      if (!best || r.priority > best.priority) best = { price: r.price_per_hour_cents, priority: r.priority };
    }
  }
  return best ? best.price : 0;
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Mon-Fri" / "Sat, Sun" / "Daily" */
export function formatDays(days: number[]): string {
  const d = [...new Set(days)].sort((a, b) => a - b);
  if (d.length === 7) return 'Daily';
  const ranges: string[] = [];
  let i = 0;
  while (i < d.length) {
    let j = i;
    while (j + 1 < d.length && d[j + 1] === d[j] + 1) j++;
    ranges.push(j - i >= 2 ? `${DAY_NAMES[d[i] - 1]}-${DAY_NAMES[d[j] - 1]}` : d.slice(i, j + 1).map((x) => DAY_NAMES[x - 1]).join(', '));
    i = j + 1;
  }
  return ranges.join(', ');
}

/** Human readable tariff lines, e.g. "Mon-Sat 08:00-24:00  $4.00/h". */
export function describeRules(plan: RatePlan): string[] {
  return plan.rules.map(
    (r) => `${formatDays(r.days_of_week)} ${r.start_time}-${r.end_time}  ${formatMoney(r.price_per_hour_cents, plan.currency)}/h`,
  );
}
