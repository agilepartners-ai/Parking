import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, Text, View } from 'react-native';
import { formatMoney } from '@parkpay/shared';
import { adminApi, adminError, type ActiveSession, type OperatorArea, type Report } from '../../src/api/admin';
import { Banner, Card, Chip, Divider, Empty, Row, Screen, SectionTitle, SkeletonCard } from '../../src/components/ui';
import { space, type as ty, useTheme } from '../../src/theme';

const CUR = 'CAD';
const RANGES = [{ d: 1, label: '24 h' }, { d: 7, label: '7 days' }, { d: 30, label: '30 days' }, { d: 90, label: '90 days' }];

/** Admin dashboard: money, occupancy and tickets for the operator, refreshed every 30 seconds. */
export default function Dashboard() {
  const t = useTheme();
  const [days, setDays] = useState(7);
  const [report, setReport] = useState<Report | null>(null);
  const [active, setActive] = useState<ActiveSession[]>([]);
  const [areas, setAreas] = useState<OperatorArea[]>([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const [r, a, ar] = await Promise.all([adminApi.report(days), adminApi.activeSessions(), adminApi.areas()]);
      setReport(r);
      setActive(a);
      setAreas(ar.filter((x) => x.active && x.level === 3));
    } catch (e) {
      setError(adminError(e));
    }
  }, [days]);
  useEffect(() => {
    void load();
    const h = setInterval(() => void load(), 30_000);
    return () => clearInterval(h);
  }, [load]);

  const Stat = ({ label, value, note }: { label: string; value: string; note: string }) => (
    <Card style={{ flexBasis: '47%', flexGrow: 1, gap: 2 }}>
      <Text style={[ty.micro, { color: t.muted }]}>{label.toUpperCase()}</Text>
      <Text style={{ color: t.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5, fontVariant: ['tabular-nums'] }}>{value}</Text>
      <Text style={[ty.small, { color: t.muted }]}>{note}</Text>
    </Card>
  );
  const maxRev = Math.max(1, ...(report?.by_area.map((a) => a.revenue_cents) ?? [1]));

  return (
    <Screen
      title="Dashboard"
      subtitle="Your parking operation"
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Row style={{ flexWrap: 'wrap' }}>
        {RANGES.map((r) => <Chip key={r.d} text={r.label} active={days === r.d} onPress={() => setDays(r.d)} />)}
      </Row>
      {error ? <Banner tone="danger" title={error} /> : null}
      {!report ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Stat label="Parked now" value={String(report.active_now)} note="active sessions" />
            <Stat label="Revenue" value={formatMoney(report.revenue_cents, CUR)} note={`${report.sessions} completed sessions`} />
            <Stat label="Your payout" value={formatMoney(report.operator_payout_cents, CUR)} note={`after ${formatMoney(report.platform_fee_cents, CUR)} platform fee`} />
            <Stat label="Tickets" value={String(report.citations)} note={`${formatMoney(report.citation_cents, CUR)} in fines`} />
          </View>
          <SectionTitle>Occupancy now</SectionTitle>
          <Card style={{ gap: space.sm }}>
            {areas.length ? areas.map((a) => {
              const counted = a.total_spaces != null;
              const pct = counted ? Math.min(100, ((a.occupied ?? 0) / Math.max(1, a.total_spaces!)) * 100) : 0;
              const full = counted && (a.available ?? 0) === 0;
              return (
                <View key={a.id} style={{ gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={[ty.body, { color: t.text, fontWeight: '700', flex: 1 }]} numberOfLines={1}>{a.name}</Text>
                    <Text style={[ty.body, { color: full ? t.danger : t.text, fontWeight: full ? '800' : '400', fontVariant: ['tabular-nums'] }]}>
                      {counted ? `${a.occupied ?? 0} / ${a.total_spaces}${full ? ' · Full' : ''}` : `${a.occupied ?? 0} parked`}
                    </Text>
                  </Row>
                  {counted ? (
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: t.brandSoft }}>
                      <View style={{ height: 6, borderRadius: 3, width: `${Math.max(2, pct)}%`, backgroundColor: full ? t.danger : pct >= 85 ? t.warn : t.brand }} />
                    </View>
                  ) : <Text style={[ty.small, { color: t.muted }]}>Spaces not counted. Set them in Areas.</Text>}
                </View>
              );
            }) : <Text style={[ty.small, { color: t.muted }]}>No published parking areas.</Text>}
          </Card>
          <SectionTitle>Revenue by area</SectionTitle>
          <Card style={{ gap: space.sm }}>
            {report.by_area.length ? (
              report.by_area.map((a) => (
                <View key={a.area_name} style={{ gap: 4 }}>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={[ty.body, { color: t.text, fontWeight: '700', flex: 1 }]} numberOfLines={1}>{a.area_name}</Text>
                    <Text style={[ty.body, { color: t.text, fontVariant: ['tabular-nums'] }]}>{formatMoney(a.revenue_cents, CUR)}</Text>
                  </Row>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: t.brandSoft }}>
                    <View style={{ height: 6, borderRadius: 3, width: `${Math.max(2, (a.revenue_cents / maxRev) * 100)}%`, backgroundColor: t.brand }} />
                  </View>
                  <Text style={[ty.small, { color: t.muted }]}>{a.sessions} sessions</Text>
                </View>
              ))
            ) : (
              <Text style={[ty.small, { color: t.muted }]}>No completed sessions in this period.</Text>
            )}
          </Card>
          <SectionTitle>Parked now</SectionTitle>
          <Card>
            {active.length ? (
              active.map((s, i) => (
                <View key={s.session_id}>
                  {i ? <Divider /> : null}
                  <Row style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: t.text, fontWeight: '800', letterSpacing: 1 }}>{s.plate}</Text>
                      <Text style={[ty.small, { color: t.muted }]}>{s.area_name}</Text>
                    </View>
                    <Text style={[ty.small, { color: t.muted }]}>since {new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text>
                  </Row>
                </View>
              ))
            ) : (
              <Empty icon="car-outline" title="Nobody is parked" hint="Sessions appear here as drivers start parking." />
            )}
          </Card>
        </>
      )}
    </Screen>
  );
}
