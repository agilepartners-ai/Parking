import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { formatDuration, formatMoney, type ParkingSession } from '@parkpay/shared';
import { Banner, Body, Button, Card, Empty, IconBadge, Pill, Screen, SkeletonCard } from '../../src/components/ui';
import { errorMessage, useApp } from '../../src/state/AppState';
import { type as ty, useTheme } from '../../src/theme';

export default function HistoryScreen() {
  const t = useTheme();
  const router = useRouter();
  const { api } = useApp();
  const [items, setItems] = useState<ParkingSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await api.sessions());
    } catch (e) {
      setError(errorMessage(e));
      setItems((cur) => cur ?? []);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const done = (items ?? []).filter((s) => s.status === 'completed');
  const total = done.reduce((n, s) => n + (s.fee_cents ?? 0), 0);

  return (
    <Screen
      title="History"
      subtitle={items && items.length ? `${done.length} finished · ${formatMoney(total, items[0].currency)} total (test payments)` : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {error ? <Banner tone="danger" title="Could not load history" text={error} action={<Button size="sm" variant="secondary" title="Try again" onPress={load} style={{ marginTop: 8, alignSelf: 'flex-start' }} />} /> : null}
      {items === null ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </>
      ) : null}
      {items && items.length === 0 && !error ? <Empty icon="receipt-outline" title="No parking yet" hint="Your finished sessions and receipts will show up here." action={<Button size="sm" title="Start parking" onPress={() => router.navigate('/')} />} /> : null}
      {(items ?? []).map((s) => (
        <Pressable key={s.id} accessibilityRole="button" onPress={() => (s.status === 'completed' ? router.push({ pathname: '/receipt/[id]', params: { id: s.id } }) : router.navigate('/'))}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge name={s.status === 'completed' ? 'checkmark-done' : 'time'} tone={s.status === 'completed' ? 'brand' : 'info'} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[ty.body, { color: t.text, fontWeight: '700' }]} numberOfLines={1}>{s.area_name}</Text>
              <Text style={[ty.small, { color: t.muted }]} numberOfLines={1}>
                {new Date(s.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {s.plate}
                {s.duration_minutes ? ` · ${formatDuration(s.duration_minutes)}` : ''}
              </Text>
            </View>
            {s.status === 'completed' ? (
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatMoney(s.fee_cents ?? 0, s.currency)}</Text>
            ) : (
              <Pill text="Active" />
            )}
          </Card>
        </Pressable>
      ))}
      {items && items.length ? <Body muted style={{ textAlign: 'center', fontSize: 12 }}>Pull down to refresh</Body> : null}
    </Screen>
  );
}
