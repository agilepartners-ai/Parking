import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { fmtM2, formatMoney, geometryAreaM2 } from '@parkpay/shared';
import { adminApi, adminError, type OperatorArea } from '../../src/api/admin';
import { Banner, Button, Card, Empty, Pill, Screen, SkeletonCard } from '../../src/components/ui';
import { space, type as ty, useTheme } from '../../src/theme';

/** Areas list: open one to reshape it on the map and change its rates, or draw a new one. */
export default function Areas() {
  const t = useTheme();
  const router = useRouter();
  const [areas, setAreas] = useState<OperatorArea[] | null>(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async () => {
    try {
      setError('');
      setAreas(await adminApi.areas());
    } catch (e) {
      setError(adminError(e));
    }
  }, []);
  // fresh list every time the tab comes back into view (for example after saving in the editor)
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <Screen
      title="Areas"
      subtitle="Draw parking areas and set their rates"
      right={<Button title="New" icon="add" size="sm" onPress={() => router.push('/area/new')} />}
      refreshControl={<RefreshControl refreshing={refreshing} tintColor={t.brand} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
    >
      {error ? <Banner tone="danger" title={error} /> : null}
      {!areas ? (
        <>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </>
      ) : areas.length === 0 ? (
        <Empty icon="map-outline" title="No areas yet" hint="Draw your first parking area on the map." action={<Button title="Draw an area" icon="add" onPress={() => router.push('/area/new')} />} />
      ) : (
        areas.map((a) => {
          const top = a.plan.rules.reduce((m, r) => Math.max(m, r.price_per_hour_cents), 0);
          return (
            <Pressable key={a.id} onPress={() => router.push(`/area/${a.id}`)} accessibilityRole="button" accessibilityLabel={`Open ${a.name}`}>
              {({ pressed }) => (
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, opacity: pressed ? 0.8 : 1 }}>
                  <View style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: a.level === 3 ? t.infoSoft : t.bg }}>
                    <Ionicons name={a.level === 3 ? 'map' : 'globe-outline'} size={20} color={a.level === 3 ? t.info : t.muted} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[ty.body, { color: t.text, fontWeight: '800' }]} numberOfLines={1}>{a.name}</Text>
                    <Text style={[ty.small, { color: t.muted }]} numberOfLines={1}>
                      {a.level === 3 ? 'Parking area' : 'City zone'} · {fmtM2(geometryAreaM2(a.geometry))}
                      {top ? ` · up to ${formatMoney(top, 'CAD')}/h` : ''}
                    </Text>
                  </View>
                  <Pill text={a.active ? 'Published' : 'Draft'} tone={a.active ? 'brand' : 'muted'} />
                </Card>
              )}
            </Pressable>
          );
        })
      )}
    </Screen>
  );
}
