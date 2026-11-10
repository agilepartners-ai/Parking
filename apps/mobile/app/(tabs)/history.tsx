import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { formatDuration, formatMoney, type ParkingSession } from '@parkpay/shared';
import { Body, Card, Empty, H1, Pill, Spread } from '../../src/components/ui';
import { errorMessage, useApp } from '../../src/state/AppState';
import { useTheme } from '../../src/theme';

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
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const total = (items ?? []).filter((s) => s.status === 'completed').reduce((n, s) => n + (s.fee_cents ?? 0), 0);

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <H1>History</H1>
        {error ? <Card tone="danger"><Body>{error}</Body></Card> : null}
        {items && items.length > 0 ? <Body muted>{items.length} sessions · {formatMoney(total, items[0].currency)} total</Body> : null}
        {items && items.length === 0 ? <Empty icon="receipt-outline" title="No parking yet" hint="Your finished sessions and receipts appear here." /> : null}
        {(items ?? []).map((s) => (
          <Pressable key={s.id} onPress={() => (s.status === 'completed' ? router.push({ pathname: '/receipt/[id]', params: { id: s.id } }) : router.navigate('/'))}>
            <Card>
              <Spread
                left={<Text style={{ color: t.text, fontSize: 16, fontWeight: '700', flexShrink: 1 }}>{s.area_name}</Text>}
                right={s.status === 'completed' ? <Text style={{ color: t.text, fontSize: 16, fontWeight: '800' }}>{formatMoney(s.fee_cents ?? 0, s.currency)}</Text> : <Pill text="ACTIVE" />}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Body muted>{new Date(s.started_at).toLocaleString()}</Body>
                <Body muted>{s.plate}{s.duration_minutes ? ` · ${formatDuration(s.duration_minutes)}` : ''}</Body>
              </View>
            </Card>
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}
