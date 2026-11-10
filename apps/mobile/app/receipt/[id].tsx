import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Share, Text, View } from 'react-native';
import { formatDuration, formatMoney, type ParkingSession } from '@parkpay/shared';
import { Enter, Pop } from '../../src/components/Motion';
import { Banner, Body, Button, Card, Divider, IconBadge, KV, Pill, Screen, Skeleton } from '../../src/components/ui';
import { errorMessage, useApp } from '../../src/state/AppState';
import { space, type as ty, useTheme } from '../../src/theme';

export default function Receipt() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, areas } = useApp();
  const [s, setS] = useState<ParkingSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .sessions()
      .then((all) => {
        const hit = all.find((x) => x.id === id);
        if (hit) setS(hit);
        else setError('This receipt could not be found.');
      })
      .catch((e) => setError(errorMessage(e)));
  }, [api, id]);

  if (error) return <Screen scroll={false}><Banner tone="danger" title="Could not open receipt" text={error} /></Screen>;
  if (!s)
    return (
      <Screen>
        <Card style={{ alignItems: 'center', gap: space.md, paddingVertical: space.xl }}>
          <Skeleton w={56} h={56} r={18} />
          <Skeleton w="40%" h={40} />
          <Skeleton w="30%" h={14} />
        </Card>
        <Card><Skeleton h={14} /><Skeleton h={14} /><Skeleton h={14} /><Skeleton w="70%" h={14} /></Card>
      </Screen>
    );

  const area = areas.find((a) => a.id === s.area_id);
  const money = (c: number | null) => formatMoney(c ?? 0, s.currency);
  const paid = s.status === 'completed';

  const text = [
    `ParkPay receipt ${s.receipt_no ?? ''}`,
    `${s.area_name} · plate ${s.plate}`,
    `${new Date(s.started_at).toLocaleString()} - ${s.ended_at ? new Date(s.ended_at).toLocaleString() : ''}`,
    `Duration: ${s.duration_minutes ? formatDuration(s.duration_minutes) : '-'}`,
    `Total: ${money(s.fee_cents)} (test payment, no money moved)`,
  ].join('\n');

  return (
    <Screen>
      <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xl }}>
        <Pop><IconBadge name={paid ? 'checkmark-circle' : 'time'} tone={paid ? 'brand' : 'info'} size={64} /></Pop>
        <Pill center text={paid ? 'Paid (test payment)' : s.status} tone={paid ? 'brand' : 'info'} />
        <Text style={[ty.display, { color: t.text, fontVariant: ['tabular-nums'] }]}>{money(s.fee_cents)}</Text>
        <Text style={[ty.small, { color: t.muted }]}>{s.receipt_no}</Text>
      </Card>
      <Enter i={2} style={{ gap: space.md }}>
      <Card style={{ gap: space.md }}>
        <KV k="Parking area" v={s.area_name} />
        {area ? <KV k="Operator" v={area.operator_name} /> : null}
        <KV k="Vehicle" v={s.plate} />
        <Divider />
        <KV k="Started" v={new Date(s.started_at).toLocaleString()} />
        <KV k="Ended" v={s.ended_at ? new Date(s.ended_at).toLocaleString() : '-'} />
        <KV k="Time parked" v={s.duration_minutes ? formatDuration(s.duration_minutes) : '-'} />
        <Divider />
        <KV k="Total" v={money(s.fee_cents)} strong />
      </Card>
      </Enter>
      <Body muted style={{ fontSize: 12, textAlign: 'center' }}>The server calculated this fee from the time it recorded, using the area&apos;s published rates. No money moved.</Body>
      <View>
        <Button variant="secondary" icon="share-outline" title="Share receipt" onPress={() => Share.share({ message: text })} />
      </View>
    </Screen>
  );
}
