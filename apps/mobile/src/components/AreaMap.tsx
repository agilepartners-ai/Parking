import Constants, { ExecutionEnvironment } from 'expo-constants';
import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import MapView, { Marker, Polygon, PROVIDER_DEFAULT } from 'react-native-maps';
import type { ParkingArea, Position } from '@parkpay/shared';
import { useTheme } from '../theme';
import AreaFallback from './AreaFallback';

interface Props {
  areas: ParkingArea[];
  lat: number;
  lng: number;
  highlightId?: string | null;
}

const toCoords = (ring: Position[]) => ring.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

// Android standalone builds crash if the Google Maps SDK has no API key, so show a list instead.
// (Expo Go ships its own key; iOS uses Apple Maps and needs none.)
const mapsAvailable =
  Platform.OS !== 'android' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  !!(Constants.expoConfig?.extra as { hasMapsKey?: boolean } | undefined)?.hasMapsKey;

export const hasRealMap = mapsAvailable;

/** Native map: parking areas as coloured polygons, the driver as a pin. */
export default function AreaMap(props: Props) {
  return mapsAvailable ? <NativeMap {...props} /> : <AreaFallback {...props} />;
}

function NativeMap({ areas, lat, lng, highlightId }: Props) {
  const t = useTheme();
  const ref = useRef<MapView>(null);

  useEffect(() => {
    ref.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 400);
  }, [lat, lng]);

  return (
    <MapView
      ref={ref}
      provider={PROVIDER_DEFAULT}
      style={{ flex: 1 }}
      initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
      showsUserLocation={false}
      userInterfaceStyle={t.dark ? 'dark' : 'light'}
    >
      {areas
        .filter((a) => a.level === 3)
        .flatMap((a) => {
          const polys = a.geometry.type === 'Polygon' ? [a.geometry.coordinates] : a.geometry.coordinates;
          return polys.map((p, i) => {
            const hot = a.id === highlightId;
            return (
              <Polygon
                key={`${a.id}-${i}`}
                coordinates={toCoords(p[0])}
                strokeColor={hot ? t.brand : '#2F6FDE'}
                fillColor={hot ? 'rgba(11,143,90,0.30)' : 'rgba(47,111,222,0.18)'}
                strokeWidth={hot ? 3 : 2}
              />
            );
          });
        })}
      <Marker coordinate={{ latitude: lat, longitude: lng }} title="You are here" pinColor={t.brand} />
    </MapView>
  );
}
