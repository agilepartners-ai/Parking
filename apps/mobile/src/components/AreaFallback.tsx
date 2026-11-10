import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { geometryCenter, haversineMeters, type ParkingArea } from '@parkpay/shared';
import { radius, space, type as ty, useTheme } from '../theme';

/** Used where a real map is not available (web, or an Android build made without a Google Maps key). A distance-sorted list stands in. */
export default function AreaFallback({ areas, lat, lng, highlightId }: { areas: ParkingArea[]; lat: number; lng: number; highlightId?: string | null }) {
  const t = useTheme();
  const rows = areas
    .filter((a) => a.level === 3)
    .map((a) => {
      const c = geometryCenter(a.geometry);
      return { a, d: c ? haversineMeters(lat, lng, c.lat, c.lng) : 0 };
    })
    .sort((x, y) => x.d - y.d)
    .slice(0, 4);
  return (
    <View style={{ flex: 1, backgroundColor: t.brandSoft, paddingTop: 56, paddingHorizontal: space.lg, paddingBottom: space.xl + 8, gap: 8, justifyContent: 'flex-end' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="map-outline" size={16} color={t.brand} />
        <Text style={[ty.small, { color: t.brand, fontWeight: '800' }]}>Nearby parking areas</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
        {rows.length === 0 ? <Text style={[ty.small, { color: t.muted }]}>None within range. Pick a test spot below.</Text> : null}
        {rows.map(({ a, d }) => {
          const hot = a.id === highlightId;
          return (
            <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: hot ? t.brand : t.card, borderRadius: radius.field, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Ionicons name={hot ? 'pin' : 'pin-outline'} size={16} color={hot ? t.brandText : t.brand} />
              <Text numberOfLines={1} style={{ flex: 1, color: hot ? t.brandText : t.text, fontWeight: '700', fontSize: 14 }}>{a.name}</Text>
              <Text style={{ color: hot ? t.brandText : t.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{hot ? 'You are here' : d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`}</Text>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
