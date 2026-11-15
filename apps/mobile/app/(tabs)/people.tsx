import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, RefreshControl, Text, View } from 'react-native';
import { adminApi, adminError, type StaffRow } from '../../src/api/admin';
import { Banner, Button, Card, Chip, Divider, Field, Pill, Row, Screen, SectionTitle, SkeletonCard } from '../../src/components/ui';
import { notify } from '../../src/lib/dialog';
import { useApp } from '../../src/state/AppState';
import { space, type as ty, useTheme } from '../../src/theme';

const ROLE: Record<string, string> = { driver: 'Driver', officer: 'Officer', operator_admin: 'Operator admin', platform_admin: 'Platform admin' };

/** People & roles: give officer (or, for platform admins, operator admin) access by email, change or remove it. */
export default function People() {
  const t = useTheme();
  const { user } = useApp();
  const isPlatform = user?.role === 'platform_admin';
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [ops, setOps] = useState<{ id: string; name: string }[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'officer' | 'operator_admin'>('officer');
  const [opId, setOpId] = useState<string>(user?.operator_id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      setRows(await adminApi.staff());
    } catch (e) {
      setError(adminError(e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (isPlatform) adminApi.operators().then((o) => { setOps(o); setOpId((c) => c || o[0]?.id || ''); }).catch(() => undefined);
  }, [isPlatform]);

  async function change(who: string, to: string, operator: string | null): Promise<boolean> {
    setBusy(true);
    try {
      await adminApi.setRole(who, to, operator);
      notify('Done', to === 'driver' ? `${who} no longer has staff access.` : `${who} is now ${ROLE[to].toLowerCase()}. They see it the next time they open the app.`);
      await load();
      return true;
    } catch (e) {
      notify('Could not change', adminError(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  function pick(u: StaffRow) {
    Alert.alert(u.full_name || u.email, `Now: ${ROLE[u.role] ?? u.role}`, [
      { text: 'Officer', onPress: () => void change(u.email, 'officer', u.operator_id) },
      ...(isPlatform ? [{ text: 'Operator admin', onPress: () => void change(u.email, 'operator_admin', u.operator_id) }] : []),
      { text: 'Remove access', style: 'destructive' as const, onPress: () => void change(u.email, 'driver', u.operator_id) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }

  return (
    <Screen
      title="People"
      subtitle="Who can enforce and manage"
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      <Card style={{ gap: space.md }}>
        <Text style={[ty.heading, { color: t.text, fontSize: 17 }]}>Give someone access</Text>
        <Text style={[ty.small, { color: t.muted }]}>They create an account first (officers in ParkPay Enforce). Then type their email here.</Text>
        <Field label="Their email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="person@example.com" />
        <Row style={{ flexWrap: 'wrap' }}>
          <Chip text="Officer" active={role === 'officer'} onPress={() => setRole('officer')} icon="shield-checkmark-outline" />
          {isPlatform ? <Chip text="Operator admin" active={role === 'operator_admin'} onPress={() => setRole('operator_admin')} icon="briefcase-outline" /> : null}
        </Row>
        {isPlatform && ops.length > 1 ? (
          <Row style={{ flexWrap: 'wrap' }}>
            {ops.map((o) => <Chip key={o.id} text={o.name} active={opId === o.id} onPress={() => setOpId(o.id)} />)}
          </Row>
        ) : null}
        <Button
          title="Give access"
          icon="person-add"
          loading={busy}
          disabled={!email.includes('@') || busy}
          onPress={async () => { if (await change(email.trim().toLowerCase(), role, isPlatform ? opId || null : null)) setEmail(''); }}
        />
      </Card>
      {error ? <Banner tone="danger" title={error} /> : null}
      <SectionTitle>Who has access</SectionTitle>
      {!rows ? (
        <SkeletonCard lines={3} />
      ) : (
        <Card>
          {rows.length === 0 ? (
            <Text style={[ty.small, { color: t.muted }]}>Nobody has staff access yet.</Text>
          ) : (
            rows.map((u, i) => {
              const locked = u.is_me || u.role === 'platform_admin' || (!isPlatform && u.role === 'operator_admin');
              return (
                <View key={u.id}>
                  {i ? <Divider /> : null}
                  <Pressable disabled={locked || busy} onPress={() => pick(u)} accessibilityRole="button" accessibilityLabel={`Change role of ${u.full_name}`}>
                    <Row style={{ paddingVertical: 8, gap: space.sm }}>
                      <View style={{ flex: 1 }}>
                        <Text style={[ty.body, { color: t.text, fontWeight: '700' }]} numberOfLines={1}>{u.full_name}{u.is_me ? ' (you)' : ''}</Text>
                        <Text style={[ty.small, { color: t.muted }]} numberOfLines={1}>{u.email}{isPlatform && u.operator_name ? ` · ${u.operator_name}` : ''}</Text>
                      </View>
                      <Pill text={ROLE[u.role] ?? u.role} tone={u.role === 'officer' ? 'info' : 'brand'} icon={locked ? undefined : 'chevron-down'} />
                    </Row>
                  </Pressable>
                </View>
              );
            })
          )}
        </Card>
      )}
    </Screen>
  );
}
