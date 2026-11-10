import React from 'react';
import { ScrollView } from 'react-native';
import { DEMO_OUTSIDE_SPOT, DEMO_SPOTS, DEMO_STREET_SPOT } from '@parkpay/shared';
import { useApp } from '../state/AppState';
import { Body, Card, Chip, Label } from './ui';

/**
 * Testers are rarely standing in Toronto. This lets them "teleport" to the demo parking areas.
 * Choose "Real GPS" to use the phone's actual position.
 */
export default function TestLocation() {
  const { testSpot, setTestSpot, fix, locationDenied } = useApp();
  const spots = [...DEMO_SPOTS, DEMO_STREET_SPOT, DEMO_OUTSIDE_SPOT];
  return (
    <Card>
      <Label>Test location</Label>
      <Body muted style={{ fontSize: 13 }}>
        {testSpot ? `Pretending to be at ${testSpot.name}.` : fix ? `Using real GPS (${fix.lat.toFixed(4)}, ${fix.lng.toFixed(4)}).` : 'Waiting for GPS…'}
        {locationDenied && !testSpot ? ' Location permission is off.' : ''}
      </Body>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        <Chip icon="navigate" text="Real GPS" active={!testSpot} onPress={() => setTestSpot(null)} />
        {spots.map((s) => (
          <Chip key={s.name} text={s.name} active={testSpot?.name === s.name} onPress={() => setTestSpot({ name: s.name, lat: s.lat, lng: s.lng })} />
        ))}
      </ScrollView>
    </Card>
  );
}
