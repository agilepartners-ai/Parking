import React from 'react';
import { Text, View } from 'react-native';
import type { ParkingArea } from '@parkpay/shared';
import { useTheme } from '../theme';

/** Web fallback (react-native-maps is native only): shows the position and the nearby areas as text. */
export default function AreaMap({ areas, lat, lng, highlightId }: { areas: ParkingArea[]; lat: number; lng: number; highlightId?: string | null }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.brandSoft, padding: 16, gap: 6, justifyContent: 'center' }}>
      <Text style={{ color: t.text, fontWeight: '800' }}>Map is shown in the iOS and Android apps</Text>
      <Text style={{ color: t.muted }}>You are at {lat.toFixed(5)}, {lng.toFixed(5)}</Text>
      {areas.filter((a) => a.level === 3).map((a) => (
        <Text key={a.id} style={{ color: a.id === highlightId ? t.brand : t.text, fontWeight: a.id === highlightId ? '800' : '400' }}>
          {a.id === highlightId ? '● ' : '○ '}{a.name}
        </Text>
      ))}
    </View>
  );
}
