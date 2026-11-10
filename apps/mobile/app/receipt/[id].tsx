import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Share, Text, View } from 'react-native';
import { formatDuration, formatMoney, type ParkingSession } from '@parkpay/shared';
import { Body, Button, Card, Label, Pill, Screen } from '../../src/components/ui';
import { errorMessage, useApp } from '../../src/state/AppState';
import { useTheme } from '../../src/theme';

function Line({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Body muted>{k}</Body>
      <Body style={{ flexShrink: 1, textAlign: 'right' }}>{v}</Body>
    </View>
  );
}

export default function Receipt() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, areas } = useApp();
  const [s, setS] = useState<ParkingSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.sessions().then((all) => setS(all.find((x) => x.id === id) ?? null)).catch((e) => setError(errorMessage(e)));
  }, [api, id]);

  if (error) return <Screen><Card tone="danger"><Body>{error}</Body></Card></Screen>;
  if (!s) return <Screen><ActivityIndicator color={t.brand} /></Screen>;
  const area = areas.find((a) => a.id === s.area_id);
  const money = (c: number | null) => formatMoney(c ?? 0, s.currency);

  const text = [
    `ParkPay receipt ${s.receipt_no ?? ''}`,
    `${s.area_name} · plate ${s.plate}`,
    `${new Date(s.started_at).toLocaleString()} - ${s.ended_at ? new Date(s.ended_at).toLocaleString() : ''}`,
    `Duration: ${s.duration_minutes ? formatDuration(s.duration_minutes) : '-'}`,
    `Total: ${money(s.fee_cents)} (test payment, no money moved)`,
  ].join('\n');

  return (
    <Screen>
      <Card>
        <Pill text={s.status === 'completed' ? 'PAID (TEST)' : s.status.toUpperCase()} />
        <Text style={{ fontSize: 44, fontWeight: '800', color: t.text }}>{money(s.fee_cents)}</Text>
        <Body muted>{s.receipt_no}</Body>
      </Card>
      <Card>
        <Label>Details</Label>
        <Line k="Parking area" v={s.area_name} />
        {area ? <Line k="Operator" v={area.operator_name} /> : null}
        <Line k="Vehicle" v={s.plate} />
        <Line k="Started" v={new Date(s.started_at).toLocaleString()} />
        <Line k="Ended" v={s.ended_at ? new Date(s.ended_at).toLocaleString() : '-'} />
        <Line k="Time parked" v={s.duration_minutes ? formatDuration(s.duration_minutes) : '-'} />
        <Line k="Payment" v="Test payment (no money moved)" />
      </Card>
      <Body muted style={{ fontSize: 12 }}>The fee is calculated by the server from the time it recorded, using the area&apos;s published rates.</Body>
      <Button variant="secondary" icon="share-outline" title="Share receipt" onPress={() => Share.share({ message: text })} />
    </Screen>
  );
}
