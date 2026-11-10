import React from 'react';
import { Text, View } from 'react-native';
import type { ParkingArea } from '@parkpay/shared';
import { useTheme } from '../theme';

/** Used where a real map is not available (web, or an Android build made without a Google Maps key). */
export default function AreaFallback({ areas, lat, lng, highlightId }: { areas: ParkingArea[]; lat: number; lng: number; highlightId?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.brandSoft, padding: 16, gap: 6, justifyContent: 'center' }}>
      <Text style={{ color: t.text, fontWeight: '800' }}>Map not available in this build</Text>
      <Text style={{ color: t.muted }}>You are at {lat.toFixed(5)}, {lng.toFixed(5)}</Text>
      {areas.filter((a) => a.level === 3).map((a) => (
        <Text key={a.id} style={{ color: a.id === highlightId ? t.brand : t.text, fontWeight: a.id === highlightId ? '800' : '400' }}>
          {a.id === highlightId ? '● ' : '○ '}{a.name}
        </Text>
      ))}
    </View>
  );
}
