import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, ScrollView, Text, View } from 'react-native';
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
import AreaMap, { hasRealMap } from '../../src/components/AreaMap';
import TestLocation from '../../src/components/TestLocation';
import { Banner, Body, Button, Card, Chip, Divider, IconBadge, KV, Label, Pill, Row, SectionTitle, Skeleton, SkeletonCard, Spread } from '../../src/components/ui';
import { Enter, useToast } from '../../src/components/Motion';
import { confirmDialog, notify } from '../../src/lib/dialog';
import { askForLeaveWatch, shouldOfferLeaveWatch, startLeaveWatch } from '../../src/lib/background';
import { useRefresh } from '../../src/lib/useRefresh';
import { errorMessage, useApp } from '../../src/state/AppState';
import { radius, space, type as ty, useTheme } from '../../src/theme';

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

function LiveDot({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', width: 12, height: 12, borderRadius: 6, backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }] }} />
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
    </View>
  );
}

export default function ParkScreen() {
  const t = useTheme();
  const router = useRouter();
  const { fix, areas, areasLoaded, areasError, sessionLoaded, currentArea, vehicles, vehiclesLoaded, activeSession, sessionArea, leftArea, startParking, endParking, busy, simulateLeaving, locationDenied, testSpot, mode, serverReachable, refreshAll } = useApp();
  const refreshControl = useRefresh(refreshAll);
  const toast = useToast();
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
  const usedMin = activeSession ? Math.max(0, Math.floor((now - startedMs) / 60_000)) : 0;
  const remaining = limit ? limit - usedMin : null;

  async function onStart() {
    if (!vehicleId) return;
    try {
      const s = await startParking(vehicleId);
      toast.show(`Parking started at ${s.area_name}`);
      // Offer reminders once, in our own words, before Android sends the driver to system settings.
      if (await shouldOfferLeaveWatch()) {
        const yes = await confirmDialog(
          'Remind me if I drive away?',
          'ParkPay can nudge you to end parking when you leave the area, even with the app closed. Android will ask you to choose "Allow all the time". Your location is only used for this.',
          'Turn on',
        );
        if (yes && (await askForLeaveWatch()) && currentArea) void startLeaveWatch({ areaName: currentArea.name, geometry: currentArea.geometry });
      }
    } catch (e) {
      notify('Could not start parking', errorMessage(e));
    }
  }

  async function onEnd() {
    const body = estimate != null && sessionArea ? `Estimated charge: ${formatMoney(estimate, sessionArea.plan.currency)}. This is a test payment: no money moves.` : 'The exact fee is calculated when you end.';
    if (!(await confirmDialog('End parking and pay?', body, 'End and pay', true))) return;
    try {
      const done = await endParking();
      router.push({ pathname: '/receipt/[id]', params: { id: done.id } });
    } catch (e) {
      notify('Could not end parking', errorMessage(e));
    }
  }

  const locating = !fix && !locationDenied;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {/* map */}
      <SafeAreaView edges={['top']} style={{ height: 300 + 0, backgroundColor: t.border }}>
        {fix ? (
          <AreaMap areas={areas} lat={fix.lat} lng={fix.lng} highlightId={shown?.id} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: space.xl }}>
            <Skeleton w="100%" h={220} r={0} style={{ position: 'absolute', top: 0 }} />
            <IconBadge name={locating ? 'locate' : 'location-outline'} tone="muted" size={52} />
            <Text style={[ty.small, { color: t.text, textAlign: 'center' }]}>{locating ? 'Finding your location…' : 'Location is off. Pick a test spot below.'}</Text>
          </View>
        )}
        {/* floating location chip (only over a real map; the list view has its own header) */}
        {hasRealMap ? <View pointerEvents="none" style={{ position: 'absolute', top: space.sm + 44, left: space.lg, right: space.lg, flexDirection: 'row' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, shadowColor: t.shadow, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
            <Ionicons name={testSpot ? 'flask' : 'navigate'} size={14} color={t.brand} />
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>
              {testSpot ? testSpot.name : fix ? 'Real GPS' : 'Locating'}
            </Text>
          </View>
        </View> : null}
      </SafeAreaView>

      {/* sheet */}
      <ScrollView
        style={{ flex: 1, marginTop: -space.xl, backgroundColor: t.bg, borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet }}
        contentContainerStyle={{ padding: space.lg, gap: space.md, paddingBottom: 48 }}
        showsVerticalScrollIndicator={false}
        refreshControl={refreshControl}
      >
        <View style={{ alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 2 }} />

        {locationDenied && !testSpot ? (
          <Banner tone="warn" icon="location-outline" title="Location is off" text="ParkPay needs your location to find the parking area you are in. Turn it on in Settings, then pull down to refresh." action={<Button variant="secondary" size="sm" title="Open settings" onPress={() => void Linking.openSettings()} />} />
        ) : null}

        {mode === 'live' && serverReachable === false ? (
          <Banner tone="warn" title="Can't reach the server" text="Check your connection. Anything you do now may not save." />
        ) : null}
        {areasError ? <Banner tone="danger" title="Could not load parking areas" text={areasError} /> : null}

        {activeSession ? (
          <Enter key="live" style={{ gap: space.md }}>
            {leftArea ? <Banner tone="warn" icon="walk" title="Did you leave?" text={`You are no longer in ${activeSession.area_name}. End your session to stop the meter.`} /> : null}
            <Card tone="hero" style={{ gap: space.md, padding: space.xl }}>
              <Spread
                left={
                  <Row style={{ gap: 8 }}>
                    <LiveDot color={t.brand} />
                    <Text style={{ color: t.heroText, fontWeight: '700', fontSize: 14 }}>Parked</Text>
                  </Row>
                }
                right={<Pill tone="onHero" icon="car" text={activeSession.plate} />}
              />
              <View>
                <Text style={[ty.display, { color: t.heroText, fontVariant: ['tabular-nums'] }]}>{formatDuration(Math.max(0, mins))}</Text>
                <Text style={{ color: t.heroMuted, fontSize: 14, marginTop: 2 }} numberOfLines={1}>{activeSession.area_name}</Text>
              </View>
              <Divider />
              <Spread
                left={
                  <View>
                    <Text style={{ color: t.heroMuted, fontSize: 13 }}>Cost so far</Text>
                    <Text style={{ color: t.heroText, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.6 }}>
                      {estimate != null && sessionArea ? formatMoney(estimate, sessionArea.plan.currency) : '-'}
                    </Text>
                  </View>
                }
                right={remaining != null ? <Pill tone={remaining <= 15 ? 'warn' : 'onHero'} icon="timer-outline" text={remaining > 0 ? `${remaining} min left` : 'Max stay reached'} /> : <Pill tone="onHero" text="No time limit" />}
              />
              {limit ? (
                <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 3, width: `${Math.min(100, Math.round((usedMin / limit) * 100))}%`, backgroundColor: remaining != null && remaining <= 15 ? t.warn : t.brand }} />
                </View>
              ) : null}
              <Button title="End parking and pay" icon="stop-circle" variant="inverse" onPress={onEnd} loading={busy} />
            </Card>
            {sessionArea ? <RateCard area={sessionArea} /> : <SkeletonCard lines={3} />}
            {testSpot ? <Button variant="secondary" title="Demo: simulate driving away" icon="navigate" onPress={simulateLeaving} /> : null}
          </Enter>
        ) : (!areasLoaded && !!fix) || !sessionLoaded ? (
          <>
            <Card>
              <Skeleton w="30%" h={14} />
              <Skeleton w="75%" h={26} />
              <Skeleton w="50%" h={14} />
              <Skeleton h={52} r={radius.button} style={{ marginTop: 8 }} />
            </Card>
            <SkeletonCard lines={3} />
          </>
        ) : currentArea ? (
          <Enter key={currentArea.id} style={{ gap: space.md }}>
            <Card style={{ gap: space.md }}>
              <Spread left={<Pill text={currentArea.level === 3 ? 'Parking area' : 'City zone'} tone={currentArea.level === 3 ? 'brand' : 'info'} icon={currentArea.level === 3 ? 'pin' : 'business'} />} right={<Body muted style={ty.small}>{currentArea.operator_name}</Body>} />
              <View style={{ gap: 2 }}>
                <Text style={[ty.heading, { color: t.text, fontSize: 22 }]}>{currentArea.name}</Text>
                {(() => {
                  const rate = currentRateCents(currentArea.plan, currentArea.timezone, Date.now());
                  return (
                    <Row style={{ gap: 6, flexWrap: 'wrap' }}>
                      <Text style={{ color: rate === 0 ? t.brand : t.text, fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'], letterSpacing: -0.6 }}>
                        {rate === 0 ? 'Free right now' : formatMoney(rate, currentArea.plan.currency)}
                      </Text>
                      {rate === 0 ? null : <Text style={{ color: t.muted, fontSize: 15 }}>per hour now</Text>}
                    </Row>
                  );
                })()}
                {currentArea.max_stay_minutes ? <Text style={[ty.small, { color: t.muted }]}>Maximum stay {formatDuration(currentArea.max_stay_minutes)}</Text> : null}
              </View>
              <Divider />
              <Label>Vehicle</Label>
              {!vehiclesLoaded ? (
                <Skeleton w="55%" h={40} r={radius.pill} />
              ) : vehicles.length ? (
                <Row style={{ flexWrap: 'wrap' }}>
                  {vehicles.map((v) => (
                    <Chip key={v.id} icon="car" text={v.nickname ? `${v.plate} · ${v.nickname}` : v.plate} active={v.id === vehicleId} onPress={() => setVehicleId(v.id)} />
                  ))}
                </Row>
              ) : (
                <Button variant="secondary" title="Add your vehicle" icon="add" size="sm" onPress={() => router.push('/vehicles')} />
              )}
              <Button title="Start parking" icon="play" onPress={onStart} loading={busy} disabled={!vehicleId} />
              <Text style={[ty.small, { color: t.muted, textAlign: 'center' }]}>You pay when you end, for the exact minutes used. The server keeps the time.</Text>
            </Card>
            <RateCard area={currentArea} />
          </Enter>
        ) : (
          <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
            <IconBadge name="map-outline" tone="warn" size={56} />
            <Text style={[ty.heading, { color: t.text }]}>{fix ? 'No parking area here' : locating ? 'Finding your location…' : 'Location is off'}</Text>
            <Text style={[ty.body, { color: t.muted, textAlign: 'center' }]}>
              {fix ? 'You are outside every parking area. Move into a marked area, or pick a Toronto test spot below.' : 'Turn on location, or pick a Toronto test spot below to try the app.'}
            </Text>
          </Card>
        )}
        <TestLocation />
      </ScrollView>
    </View>
  );
}

function RateCard({ area }: { area: ParkingArea }) {
  const p = area.plan;
  return (
    <Card style={{ gap: space.sm }}>
      <SectionTitle>Rates</SectionTitle>
      <Label>{p.name}</Label>
      {describeRules(p).map((l) => (
        <Body key={l} style={{ fontVariant: ['tabular-nums'] }}>{l}</Body>
      ))}
      <Divider />
      <KV k="Free minutes" v={`${p.grace_minutes} min`} />
      <KV k="Minimum charge" v={formatMoney(p.min_charge_cents, p.currency)} />
      {p.daily_max_cents != null ? <KV k="Daily maximum" v={formatMoney(p.daily_max_cents, p.currency)} /> : null}
    </Card>
  );
}
