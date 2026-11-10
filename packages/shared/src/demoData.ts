import type { ParkingArea, Position, RateRule } from './types';

/**
 * Demo data for Toronto (CAD). ILLUSTRATIVE RATES ONLY - not real Toronto Parking Authority prices.
 * This file is the single source of truth: `npm run seed:gen` writes supabase/seed.sql from it,
 * and the app's offline demo mode reads it directly.
 */

export const DEMO_OPERATOR = {
  id: '00000000-0000-4000-8000-0000000000a0',
  name: 'Demo Parking Authority',
  country: 'CA',
  timezone: 'America/Toronto',
  currency: 'CAD',
  service_fee_bps: 800, // 8% platform fee
};

const ALL_DAYS = [1, 2, 3, 4, 5, 6, 7];
const WEEKDAYS = [1, 2, 3, 4, 5];

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;

function box(lat: number, lng: number, dLat: number, dLng: number): Position[][] {
  return [
    [
      [r6(lng - dLng), r6(lat - dLat)],
      [r6(lng + dLng), r6(lat - dLat)],
      [r6(lng + dLng), r6(lat + dLat)],
      [r6(lng - dLng), r6(lat + dLat)],
      [r6(lng - dLng), r6(lat - dLat)],
    ],
  ];
}

function rule(days: number[], from: string, to: string, price: number, priority = 0): RateRule {
  return { days_of_week: days, start_time: from, end_time: to, price_per_hour_cents: price, priority };
}

interface DemoSpec {
  id: string;
  planId: string;
  name: string;
  level: 1 | 2 | 3;
  centre: { lat: number; lng: number };
  half: { dLat: number; dLng: number };
  maxStay: number | null;
  plan: { name: string; min: number; dailyMax: number | null; grace: number; rules: RateRule[] };
}

const SPECS: DemoSpec[] = [
  {
    id: '00000000-0000-4000-8000-0000000000b1',
    planId: '00000000-0000-4000-8000-0000000000c1',
    name: 'Toronto General Zone',
    level: 2,
    centre: { lat: 43.65, lng: -79.4 },
    half: { dLat: 0.06, dLng: 0.12 },
    maxStay: null,
    plan: {
      name: 'City general rate',
      min: 100,
      dailyMax: 1200,
      grace: 5,
      rules: [rule(ALL_DAYS, '00:00', '24:00', 150)],
    },
  },
  {
    id: '00000000-0000-4000-8000-0000000000b2',
    planId: '00000000-0000-4000-8000-0000000000c2',
    name: 'City Hall Lot',
    level: 3,
    centre: { lat: 43.6526, lng: -79.3832 },
    half: { dLat: 0.0007, dLng: 0.001 },
    maxStay: 480,
    plan: {
      name: 'City Hall Lot rate',
      min: 100,
      dailyMax: 2000,
      grace: 5,
      rules: [rule([1, 2, 3, 4, 5, 6], '08:00', '24:00', 400), rule([7], '00:00', '24:00', 200)],
    },
  },
  {
    id: '00000000-0000-4000-8000-0000000000b3',
    planId: '00000000-0000-4000-8000-0000000000c3',
    name: 'King West Street Zone',
    level: 3,
    centre: { lat: 43.6445, lng: -79.3955 },
    half: { dLat: 0.0007, dLng: 0.001 },
    maxStay: 180,
    plan: {
      name: 'King West rate',
      min: 150,
      dailyMax: null,
      grace: 5,
      rules: [rule(WEEKDAYS, '07:00', '19:00', 600), rule(WEEKDAYS, '19:00', '24:00', 300), rule([6, 7], '09:00', '24:00', 300)],
    },
  },
  {
    id: '00000000-0000-4000-8000-0000000000b4',
    planId: '00000000-0000-4000-8000-0000000000c4',
    name: 'Harbourfront Lot',
    level: 3,
    centre: { lat: 43.6385, lng: -79.3815 },
    half: { dLat: 0.0007, dLng: 0.001 },
    maxStay: null,
    plan: {
      name: 'Harbourfront rate',
      min: 200,
      dailyMax: 2500,
      grace: 10,
      rules: [rule(ALL_DAYS, '08:00', '22:00', 500)],
    },
  },
  {
    id: '00000000-0000-4000-8000-0000000000b5',
    planId: '00000000-0000-4000-8000-0000000000c5',
    name: 'Kensington Market Street Zone',
    level: 3,
    centre: { lat: 43.6547, lng: -79.4005 },
    half: { dLat: 0.0006, dLng: 0.0009 },
    maxStay: 120,
    plan: {
      name: 'Kensington rate',
      min: 100,
      dailyMax: null,
      grace: 5,
      rules: [rule([1, 2, 3, 4, 5, 6], '09:00', '18:00', 300)],
    },
  },
];

export const DEMO_AREAS: ParkingArea[] = SPECS.map((s) => ({
  id: s.id,
  name: s.name,
  level: s.level,
  operator_id: DEMO_OPERATOR.id,
  operator_name: DEMO_OPERATOR.name,
  timezone: DEMO_OPERATOR.timezone,
  service_fee_bps: DEMO_OPERATOR.service_fee_bps,
  max_stay_minutes: s.maxStay,
  geometry: { type: 'Polygon', coordinates: box(s.centre.lat, s.centre.lng, s.half.dLat, s.half.dLng) },
  plan: {
    id: s.planId,
    name: s.plan.name,
    currency: DEMO_OPERATOR.currency,
    min_charge_cents: s.plan.min,
    daily_max_cents: s.plan.dailyMax,
    grace_minutes: s.plan.grace,
    rules: s.plan.rules,
  },
}));

/** Spots a tester can "teleport" to when they are not physically in Toronto. */
export const DEMO_SPOTS = DEMO_AREAS.filter((a) => a.level === 3).map((a) => {
  const ring = (a.geometry as { coordinates: Position[][] }).coordinates[0];
  const lat = (ring[0][1] + ring[2][1]) / 2;
  const lng = (ring[0][0] + ring[2][0]) / 2;
  return { name: a.name, lat, lng };
});

/** A point inside the general zone but outside every lot (to show the level-2 fallback). */
export const DEMO_STREET_SPOT = { name: 'Elsewhere in Toronto (general zone)', lat: 43.67, lng: -79.35 };
/** A point outside every area (to show "no parking area here"). */
export const DEMO_OUTSIDE_SPOT = { name: 'Outside Toronto (no area)', lat: 43.45, lng: -80.5 };

export const DEMO_PLATE_FOR_OFFICER = 'ABCD123';
