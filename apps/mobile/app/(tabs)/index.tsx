import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  billedMinutes,
  computeFeeCents,
  currentRateCents,
  describeRules,
  formatDuration,
  formatMoney,
  type ParkingArea,
} from '@parkpay/shared';
import AreaMap from '../../src/components/AreaMap';
import TestLocation from '../../src/components/TestLocation';
import { Body, Button, Card, Chip, Label, Pill, Row, Spread } from '../../src/components/ui';
import { confirmDialog, notify } from '../../src/lib/dialog';
import { errorMessage, useApp } from '../../src/state/AppState';
import { useTheme } from '../../src/theme';

function useNow(intervalMs: number, enabled: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!enabled) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
  return now;
}

export default function ParkScreen() {
  const t = useTheme();
  const router = useRouter();
  const { fix, areas, currentArea, vehicles, activeSession, sessionArea, leftArea, startParking, endParking, busy, simulateLeaving, locationDenied, testSpot } = useApp();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const now = useNow(1000, !!activeSession);

  useEffect(() => {
    if (!vehicleId || !vehicles.some((v) => v.id === vehicleId)) setVehicleId((vehicles.find((v) => v.is_default) ?? vehicles[0])?.id ?? null);
  }, [vehicles, vehicleId]);

  const shown: ParkingArea | null = activeSession ? sessionArea : currentArea;
  const startedMs = activeSession ? Date.parse(activeSession.started_at) : 0;
  const mins = activeSession ? billedMinutes(startedMs, now) : 0;
  const estimate = useMemo(
    () => (activeSession && sessionArea ? computeFeeCents(sessionArea.plan, sessionArea.timezone, startedMs, now) : null),
    [activeSession, sessionArea, startedMs, now],
  );
  const limit = activeSession?.max_stay_minutes ?? null;
  const remaining = limit ? limit - Math.floor((now - startedMs) / 60_000) : null;

  async function onStart() {
    if (!vehicleId) return;
    try {
      await startParking(vehicleId);
    } catch (e) {
      notify('Could not start parking', errorMessage(e));
    }
  }

  async function onEnd() {
    const body = estimate != null && sessionArea ? `Estimated charge: ${formatMoney(estimate, sessionArea.plan.currency)}. This is a test payment: no money moves.` : 'The exact fee is calculated when you end.';
    if (!(await confirmDialog('End parking and pay?', body, 'End & pay', true))) return;
    try {
      const done = await endParking();
      router.push({ pathname: '/receipt/[id]', params: { id: done.id } });
    } catch (e) {
      notify('Could not end parking', errorMessage(e));
    }
  }

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ height: 240, backgroundColor: t.border }}>
        {fix ? <AreaMap areas={areas} lat={fix.lat} lng={fix.lng} highlightId={shown?.id} /> : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <Body muted>{locationDenied ? 'Location permission is off. Pick a test spot below.' : 'Finding your location…'}</Body>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
        {activeSession ? (
          <>
            {leftArea ? (
              <Card tone="warn">
                <Body bold>Did you leave?</Body>
                <Body>You are no longer in {activeSession.area_name}. End your session to stop the meter.</Body>
              </Card>
            ) : null}
            <Card tone="brand">
              <Spread left={<Pill text="PARKED" />} right={<Body muted>{activeSession.plate}</Body>} />
              <Text style={{ fontSize: 40, fontWeight: '800', color: t.text, fontVariant: ['tabular-nums'] }}>
                {formatDuration(Math.max(0, mins))}
              </Text>
              <Body bold>{activeSession.area_name}</Body>
              <Row style={{ flexWrap: 'wrap' }}>
                {estimate != null && sessionArea ? <Pill tone="info" text={`So far ${formatMoney(estimate, sessionArea.plan.currency)}`} /> : <Pill tone="muted" text="Fee shown when you end" />}
                {remaining != null ? <Pill tone={remaining <= 15 ? 'warn' : 'muted'} text={remaining > 0 ? `${remaining} min left` : 'Max stay reached'} /> : null}
              </Row>
              <Button title="End parking & pay" icon="stop-circle" variant="danger" onPress={onEnd} loading={busy} style={{ marginTop: 8 }} />
            </Card>
            {sessionArea ? <RateCard area={sessionArea} /> : null}
            {testSpot ? <Button variant="secondary" title="Demo: simulate driving away" icon="navigate" onPress={simulateLeaving} /> : null}
          </>
        ) : currentArea ? (
          <>
            <Card>
              <Spread left={<Pill text={currentArea.level === 3 ? 'PARKING AREA' : 'CITY ZONE'} tone={currentArea.level === 3 ? 'brand' : 'info'} />} right={<Body muted>{currentArea.operator_name}</Body>} />
              <Text style={{ fontSize: 22, fontWeight: '800', color: t.text }}>{currentArea.name}</Text>
              <Body muted>
                Now: {formatMoney(currentRateCents(currentArea.plan, currentArea.timezone, Date.now()), currentArea.plan.currency)}/h
                {currentArea.max_stay_minutes ? `  •  max stay ${formatDuration(currentArea.max_stay_minutes)}` : ''}
              </Body>
            </Card>
            <Card>
              <Label>Vehicle</Label>
              {vehicles.length ? (
                <Row style={{ flexWrap: 'wrap' }}>
                  {vehicles.map((v) => (
                    <Chip key={v.id} text={v.nickname ? `${v.plate} · ${v.nickname}` : v.plate} active={v.id === vehicleId} onPress={() => setVehicleId(v.id)} />
                  ))}
                </Row>
              ) : (
                <>
                  <Body muted>Add your car to start parking.</Body>
                  <Button variant="secondary" title="Add a vehicle" icon="add" onPress={() => router.push('/vehicles')} />
                </>
              )}
              <Button title="Start parking" icon="play" onPress={onStart} loading={busy} disabled={!vehicleId} style={{ marginTop: 6 }} />
              <Body muted style={{ fontSize: 12 }}>You pay when you end, for the exact minutes used. The server keeps the time, not your phone.</Body>
            </Card>
            <RateCard area={currentArea} />
          </>
        ) : (
          <Card tone="warn">
            <Body bold>No parking area here</Body>
            <Body>
              {fix ? 'You are outside every parking area this operator manages. ' : ''}Move into a marked area, or choose a Toronto test spot below to try the app.
            </Body>
          </Card>
        )}
        <TestLocation />
      </ScrollView>
    </SafeAreaView>
  );
}

function RateCard({ area }: { area: ParkingArea }) {
  const p = area.plan;
  return (
    <Card>
      <Label>Rates ({area.plan.name})</Label>
      {describeRules(p).map((l) => (
        <Body key={l} style={{ fontVariant: ['tabular-nums'] }}>{l}</Body>
      ))}
      <Body muted style={{ fontSize: 13 }}>
        First {p.grace_minutes} min free · minimum {formatMoney(p.min_charge_cents, p.currency)}
        {p.daily_max_cents != null ? ` · daily max ${formatMoney(p.daily_max_cents, p.currency)}` : ''}
      </Body>
    </Card>
  );
}
