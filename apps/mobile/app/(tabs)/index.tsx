import { Ionicons } from '@expo/vector-icons';
import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  billedMinutes,
  computeFeeCents,
  currentRateCents,
  describeRules,
  formatDuration,
  formatMoney,
  geometryCenter,
  haversineMeters,
  spacesLabel,
  type ParkingArea,
} from '@parkpay/shared';
import AreaMap, { hasRealMap } from '../../src/components/AreaMap';
import TestLocation from '../../src/components/TestLocation';
import DurationSheet from '../../src/components/DurationSheet';
import { Banner, Body, Button, Card, Chip, Divider, IconBadge, KV, Label, Pill, Row, SectionTitle, Skeleton, SkeletonCard, Spread } from '../../src/components/ui';
import { Enter, useToast } from '../../src/components/Motion';
import { confirmDialog, notify } from '../../src/lib/dialog';
import { askForLeaveWatch, shouldOfferLeaveWatch, startLeaveWatch } from '../../src/lib/background';
import { useRefresh } from '../../src/lib/useRefresh';
import { DEV_TOOLS } from '../../src/lib/flags';
import { IS_ADMIN_APP, IS_OFFICER_APP } from '../../src/lib/variant';
import { errorMessage, minutesUntilClose, useApp } from '../../src/state/AppState';
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

export default function ParkTab() {
  return IS_ADMIN_APP ? <Redirect href="/dashboard" /> : IS_OFFICER_APP ? <Redirect href="/officer" /> : <ParkScreen />;
}

function ParkScreen() {
  const t = useTheme();
  const router = useRouter();
  const { fix, areas, areasLoaded, areasError, sessionLoaded, currentArea, vehicles, vehiclesLoaded, activeSession, sessionArea, leftArea, movingFast, startParking, endParking, extendParking, busy, simulateLeaving, locationDenied, testSpot, mode, serverReachable, refreshAll, refreshLocation } = useApp();
  const refreshControl = useRefresh(refreshAll);
  const toast = useToast();
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [planned, setPlanned] = useState<number | null>(60);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  // What the map looks at: null follows the driver; tapping a nearby area moves the map there without moving the driver.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [recenter, setRecenter] = useState(0);
  const [locatingNow, setLocatingNow] = useState(false);

  const nearby = useMemo(() => {
    if (!fix) return [];
    return areas
      .filter((a) => a.level === 3)
      .map((a) => {
        const c = geometryCenter(a.geometry);
        return { a, c, d: haversineMeters(fix.lat, fix.lng, c.lat, c.lng) };
      })
      .sort((x, y) => x.d - y.d)
      .slice(0, 8);
  }, [areas, fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  const focus = focusId ? nearby.find((n) => n.a.id === focusId)?.c ?? null : null;

  async function locateMe() {
    setFocusId(null);
    setLocatingNow(true);
    try {
      await refreshLocation();
    } finally {
      setLocatingNow(false);
      setRecenter((n) => n + 1);
    }
  }
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
  const plannedLeft = activeSession?.planned_minutes ? activeSession.planned_minutes - usedMin : null;

  async function onStart() {
    if (!vehicleId) return;
    try {
      const s = await startParking(vehicleId, planned);
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

  async function onExtend(remaining: number | null) {
    setExtendOpen(false);
    try {
      const s = await extendParking(remaining);
      toast.show(s.planned_minutes ? 'Parking time updated' : 'No end time set. End it when you leave.');
    } catch (e) {
      notify('Could not change the time', errorMessage(e));
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
          <AreaMap areas={areas} lat={fix.lat} lng={fix.lng} highlightId={focusId ?? shown?.id} focus={focus} recenter={recenter} onPressArea={setFocusId} />
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: space.xl }}>
            <Skeleton w="100%" h={220} r={0} style={{ position: 'absolute', top: 0 }} />
            <IconBadge name={locating ? 'locate' : 'location-outline'} tone="muted" size={52} />
            <Text style={[ty.small, { color: t.text, textAlign: 'center' }]}>{locating ? 'Finding your location…' : 'Location is off. Turn it on in Settings.'}</Text>
          </View>
        )}
        {/* floating location chip (only over a real map; the list view has its own header) */}
        {hasRealMap ? <View pointerEvents="none" style={{ position: 'absolute', top: space.sm + 44, left: space.lg, right: space.lg, flexDirection: 'row' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8, shadowColor: t.shadow, shadowOpacity: 0.15, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}>
            <Ionicons name={currentArea ? 'navigate' : fix ? 'navigate-outline' : 'locate'} size={14} color={t.brand} />
            <Text style={{ color: t.text, fontWeight: '700', fontSize: 13, flexShrink: 1 }} numberOfLines={1}>
              {currentArea ? currentArea.name : fix ? 'No parking area here' : 'Finding you…'}
            </Text>
            {testSpot ? <Text style={{ color: t.muted, fontSize: 11, fontWeight: '700' }}>TEST SPOT</Text> : null}
          </View>
        </View> : null}
        {/* locate me: fresh GPS fix, map back on the driver */}
        {fix ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Find my location"
            onPress={() => void locateMe()}
            style={({ pressed }) => ({ position: 'absolute', right: space.lg, bottom: space.xl + 14, width: 48, height: 48, borderRadius: 24, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center', shadowColor: t.shadow, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4, transform: [{ scale: pressed ? 0.94 : 1 }] })}
          >
            <Ionicons name={locatingNow ? 'sync' : focusId ? 'locate-outline' : 'locate'} size={22} color={t.brand} />
          </Pressable>
        ) : null}
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

        {!activeSession ? <Nearby items={nearby} hereId={currentArea?.id ?? null} focusId={focusId} onPick={(id) => setFocusId((cur) => (cur === id ? null : id))} loading={!!fix && !areasLoaded} /> : null}

        {activeSession ? (
          <Enter key="live" style={{ gap: space.md }}>
            {movingFast && !leftArea ? <Banner tone="warn" icon="speedometer-outline" title="Driving with parking still running" text={`You are moving fast, but your session in ${activeSession.area_name} is still open. End it to stop paying.`} /> : null}
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
                right={plannedLeft != null ? <Pill tone={plannedLeft <= 10 ? 'warn' : 'onHero'} icon="timer-outline" text={plannedLeft > 0 ? `${formatDuration(plannedLeft)} planned left` : 'Planned time is up'} /> : remaining != null ? <Pill tone={remaining <= 15 ? 'warn' : 'onHero'} icon="timer-outline" text={remaining > 0 ? `${remaining} min left` : 'Max stay reached'} /> : <Pill tone="onHero" text="No time limit" />}
              />
              {limit ? (
                <View style={{ height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' }}>
                  <View style={{ height: 6, borderRadius: 3, width: `${Math.min(100, Math.round((usedMin / limit) * 100))}%`, backgroundColor: remaining != null && remaining <= 15 ? t.warn : t.brand }} />
                </View>
              ) : null}
              {sessionArea?.closing_time ? <Text style={{ color: t.heroMuted, fontSize: 13 }}>This area closes at {sessionArea.closing_time}.</Text> : null}
              <Button title="End parking and pay" icon="stop-circle" variant="inverse" onPress={onEnd} loading={busy} />
              {remaining == null || remaining > 1 ? (
                <Pressable accessibilityRole="button" onPress={() => setExtendOpen(true)} style={({ pressed }) => ({ alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
                  <Text style={{ color: t.heroText, fontWeight: '700', fontSize: 15 }}>{activeSession.planned_minutes ? 'Change my time' : 'Set a reminder time'}</Text>
                </Pressable>
              ) : null}
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
                {(() => {
                  const sp = spacesLabel(currentArea);
                  return sp ? (
                    <Row style={{ gap: 6 }}>
                      <Ionicons name={sp.full ? 'close-circle' : 'car'} size={16} color={sp.full ? t.danger : t.brand} />
                      <Text style={{ color: sp.full ? t.danger : t.brand, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{sp.full ? 'Full: every space is taken' : sp.text}</Text>
                    </Row>
                  ) : null;
                })()}
                {currentArea.max_stay_minutes || currentArea.closing_time ? (
                  <Text style={[ty.small, { color: t.muted }]}>
                    {[currentArea.max_stay_minutes ? `Maximum stay ${formatDuration(currentArea.max_stay_minutes)}` : null, currentArea.closing_time ? `Closes at ${currentArea.closing_time}${(minutesUntilClose(currentArea) ?? 999) <= 60 ? ` (in ${minutesUntilClose(currentArea)} min)` : ''}` : null].filter(Boolean).join(' · ')}
                  </Text>
                ) : null}
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
              <Label>How long</Label>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Choose how long you will park"
                onPress={() => setSheetOpen(true)}
                style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.brandSoft, borderRadius: radius.card, paddingHorizontal: space.lg, paddingVertical: 14, opacity: pressed ? 0.85 : 1 })}
              >
                <Row style={{ gap: 10 }}>
                  <Ionicons name="time-outline" size={22} color={t.brand} />
                  <Text style={{ color: t.text, fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{planned ? formatDuration(planned) : 'Until I end it'}</Text>
                </Row>
                <Row style={{ gap: 4 }}>
                  <Text style={{ color: t.brand, fontWeight: '700' }}>Change</Text>
                  <Ionicons name="chevron-forward" size={16} color={t.brand} />
                </Row>
              </Pressable>
              {currentArea.available === 0 ? <Banner tone="danger" icon="close-circle" title="This area is full right now" text="Every space is taken. Pick a nearby area with free spaces, or wait for a car to leave." /> : null}
              <Button title="Start parking" icon="play" onPress={onStart} loading={busy} disabled={!vehicleId || currentArea.available === 0} />
              <Text style={[ty.small, { color: t.muted, textAlign: 'center' }]}>You pay when you end, for the exact minutes used. The server keeps the time.</Text>
            </Card>
            <RateCard area={currentArea} />
          </Enter>
        ) : (
          <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
            <IconBadge name="map-outline" tone="warn" size={56} />
            <Text style={[ty.heading, { color: t.text }]}>{fix ? 'No parking area here' : locating ? 'Finding your location…' : 'Location is off'}</Text>
            <Text style={[ty.body, { color: t.muted, textAlign: 'center' }]}>
              {fix ? 'You are not inside a ParkPay parking area. The nearest ones are listed above; tap one to see it on the map.' : 'Turn on location so ParkPay can find the parking area you are in.'}
            </Text>
          </Card>
        )}
        {activeSession ? <Nearby items={nearby} hereId={sessionArea?.id ?? null} focusId={focusId} onPick={(id) => setFocusId((cur) => (cur === id ? null : id))} loading={false} /> : null}
        {DEV_TOOLS ? <TestLocation /> : null}
      </ScrollView>
      <DurationSheet
        visible={extendOpen}
        area={sessionArea}
        initial={plannedLeft != null && plannedLeft > 0 ? plannedLeft : 30}
        maxMinutes={remaining != null ? Math.max(5, remaining) : 24 * 60}
        title="How much longer?"
        onClose={() => setExtendOpen(false)}
        onConfirm={(m) => void onExtend(m)}
      />
      <DurationSheet
        visible={sheetOpen}
        area={currentArea}
        initial={planned}
        onClose={() => setSheetOpen(false)}
        onConfirm={(m) => {
          setPlanned(m);
          setSheetOpen(false);
        }}
      />
    </View>
  );
}

const dist = (m: number) => (m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / 1000).toFixed(1)} km`);

/** Nearest parking areas, closest first. Tapping one shows it on the map. */
function Nearby({ items, hereId, focusId, onPick, loading }: { items: { a: ParkingArea; d: number }[]; hereId: string | null; focusId: string | null; onPick: (id: string) => void; loading: boolean }) {
  const t = useTheme();
  if (!loading && items.length === 0) return null;
  return (
    <View style={{ gap: space.sm }}>
      <Text accessibilityRole="header" style={{ color: t.text, fontSize: 15, fontWeight: '800' }}>Nearby parking</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: 10 }}>
        {loading && items.length === 0
          ? [0, 1, 2].map((i) => <Skeleton key={i} w={176} h={84} r={radius.card} />)
          : items.map(({ a, d }) => {
              const here = a.id === hereId;
              const on = a.id === focusId;
              const rate = currentRateCents(a.plan, a.timezone, Date.now());
              const sp = spacesLabel(a);
              return (
                <Pressable
                  key={a.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`${a.name}, ${here ? 'you are here' : dist(d) + ' away'}, ${rate === 0 ? 'free right now' : formatMoney(rate, a.plan.currency) + ' per hour'}${sp ? ', ' + sp.text : ''}. Show on map.`}
                  onPress={() => onPick(a.id)}
                  style={({ pressed }) => ({ width: 176, gap: 6, padding: 12, borderRadius: radius.card, backgroundColor: t.card, borderWidth: 1.5, borderColor: on ? t.brand : here ? t.brandSoft : t.border, transform: [{ scale: pressed ? 0.97 : 1 }] })}
                >
                  <Row style={{ gap: 6 }}>
                    <Ionicons name={here ? 'navigate' : 'location-outline'} size={14} color={here ? t.brand : t.muted} />
                    <Text style={{ color: here ? t.brand : t.muted, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{here ? 'You are here' : dist(d)}</Text>
                  </Row>
                  <Text numberOfLines={1} style={{ color: t.text, fontSize: 15, fontWeight: '700' }}>{a.name}</Text>
                  <Text style={{ color: rate === 0 ? t.brand : t.text, fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{rate === 0 ? 'Free right now' : `${formatMoney(rate, a.plan.currency)} / h`}</Text>
                  {sp ? <Text style={{ color: sp.full ? t.danger : t.brand, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{sp.text}</Text> : null}
                </Pressable>
              );
            })}
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
