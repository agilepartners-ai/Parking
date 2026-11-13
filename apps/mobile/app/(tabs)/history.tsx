import { Enter } from '../../src/components/Motion';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { formatDuration, formatMoney, type Citation, type ParkingSession } from '@parkpay/shared';
import { Banner, Body, Button, Card, Empty, IconBadge, Pill, Screen, SkeletonCard } from '../../src/components/ui';
import { useToast } from '../../src/components/Motion';
import { confirmDialog, notify } from '../../src/lib/dialog';
import { errorMessage, useApp } from '../../src/state/AppState';
import { type as ty, useTheme } from '../../src/theme';

export default function HistoryScreen() {
  const t = useTheme();
  const router = useRouter();
  const { api } = useApp();
  const [items, setItems] = useState<ParkingSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Citation[]>([]);
  const [paying, setPaying] = useState<string | null>(null);
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      setItems(await api.sessions());
      api.myCitations().then(setTickets).catch(() => undefined);
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

  async function pay(c: Citation) {
    if (!(await confirmDialog('Pay this ticket?', `${formatMoney(c.fine_cents, c.currency)} for ${c.reason}. This is a test payment: no money moves.`, 'Pay'))) return;
    setPaying(c.id);
    try {
      await api.payCitation(c.id);
      toast.show('Ticket paid');
      await load();
    } catch (e) {
      notify('Could not pay', errorMessage(e));
    } finally {
      setPaying(null);
    }
  }

  const done = (items ?? []).filter((s) => s.status === 'completed' || s.status === 'expired');
  const total = done.reduce((n, s) => n + (s.fee_cents ?? 0), 0);

  return (
    <Screen
      title="History"
      subtitle={items && items.length ? `${done.length} finished · ${formatMoney(total, items[0].currency)} total (test payments)` : undefined}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {error ? <Banner tone="danger" title="Could not load history" text={error} action={<Button size="sm" variant="secondary" title="Try again" onPress={load} style={{ marginTop: 8, alignSelf: 'flex-start' }} />} /> : null}
      {tickets.map((c) => (
        <Card key={c.id} tone={c.status === 'issued' ? 'warn' : undefined} style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge name="document-text" tone={c.status === 'issued' ? 'warn' : 'muted'} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[ty.body, { color: t.text, fontWeight: '700' }]} numberOfLines={1}>Ticket · {c.plate}</Text>
              <Text style={[ty.small, { color: t.muted }]} numberOfLines={2}>{c.reason}{c.area_name ? ` · ${c.area_name}` : ''} · {new Date(c.issued_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
            </View>
            <Text style={{ color: t.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatMoney(c.fine_cents, c.currency)}</Text>
          </View>
          {c.status === 'issued' ? <Button size="sm" title="Pay ticket" icon="card" loading={paying === c.id} onPress={() => pay(c)} /> : <Pill text={c.status === 'paid' ? 'Paid' : c.status ?? ''} tone="muted" />}
        </Card>
      ))}
      {items === null ? (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </>
      ) : null}
      {items && items.length === 0 && !error && tickets.length === 0 ? <Empty icon="receipt-outline" title="No parking yet" hint="Your finished sessions and receipts will show up here." action={<Button size="sm" title="Start parking" onPress={() => router.navigate('/')} />} /> : null}
      {(items ?? []).map((s, i) => (
        <Enter key={s.id} i={i}>
        <Pressable accessibilityRole="button" onPress={() => (s.status !== 'active' ? router.push({ pathname: '/receipt/[id]', params: { id: s.id } }) : router.navigate('/'))}>
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <IconBadge name={s.status === 'completed' ? 'checkmark-done' : s.status === 'expired' ? 'alarm' : 'time'} tone={s.status === 'completed' ? 'brand' : s.status === 'expired' ? 'warn' : 'info'} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[ty.body, { color: t.text, fontWeight: '700' }]} numberOfLines={1}>{s.area_name}</Text>
              <Text style={[ty.small, { color: t.muted }]} numberOfLines={1}>
                {new Date(s.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {s.plate}
                {s.duration_minutes ? ` · ${formatDuration(s.duration_minutes)}` : ''}
                {s.status === 'expired' ? ' · closed at the time limit' : ''}
              </Text>
            </View>
            {s.status !== 'active' ? (
              <Text style={{ color: t.text, fontSize: 17, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{formatMoney(s.fee_cents ?? 0, s.currency)}</Text>
            ) : (
              <Pill text="Active" />
            )}
          </Card>
        </Pressable>
        </Enter>
      ))}
      {items && items.length ? <Body muted style={{ textAlign: 'center', fontSize: 12 }}>Pull down to refresh</Body> : null}
    </Screen>
  );
}
