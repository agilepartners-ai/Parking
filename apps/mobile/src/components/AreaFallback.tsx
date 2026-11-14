import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Text, View } from 'react-native';
import type { ParkingArea } from '@parkpay/shared';
import { radius, space, type as ty, useTheme } from '../theme';

/** Used where a real map is not available (web, or an Android build made without a Google Maps key). A distance-sorted list stands in. */
export default function AreaFallback({ areas, lat, lng, highlightId }: { areas: ParkingArea[]; lat: number; lng: number; highlightId?: string | null }) {
  const t = useTheme();
  const here = areas.find((a) => a.id === highlightId);
  return (
    <View style={{ flex: 1, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center', gap: 6, padding: space.xl, paddingBottom: space.xl + 16 }}>
      <View style={{ width: 56, height: 56, borderRadius: radius.card, backgroundColor: t.card, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="navigate" size={26} color={t.brand} />
      </View>
      <Text style={[ty.heading, { color: t.text, textAlign: 'center' }]} numberOfLines={1}>{here ? here.name : 'You are here'}</Text>
      <Text style={[ty.small, { color: t.muted, textAlign: 'center', fontVariant: ['tabular-nums'] }]}>{lat.toFixed(4)}, {lng.toFixed(4)}</Text>
      <Text style={{ color: t.muted, fontSize: 12, textAlign: 'center' }}>The map appears in app version 0.2.0 and later.</Text>
    </View>
  );
}
