import * as Application from 'expo-application';
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
  /** Where the map should look. null = follow the driver. */
  focus?: { lat: number; lng: number } | null;
  /** Bump to snap back to the driver even if their position has not changed. */
  recenter?: number;
  onPressArea?: (id: string) => void;
}

const toCoords = (ring: Position[]) => ring.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));

// Android standalone builds crash if the Google Maps SDK has no API key, so show a list instead.
// (Expo Go ships its own key; iOS uses Apple Maps and needs none.)
// The key is baked into the native app from version 0.2.0 on. Older installs can still receive this
// JavaScript, so the installed app version is checked as well as the config flag.
function nativeHasMapsKey(): boolean {
  try {
    const [maj = 0, min = 0] = (Application.nativeApplicationVersion ?? '0.0.0').split('.').map(Number);
    return maj > 0 || min >= 2;
  } catch {
    return false;
  }
}
const mapsAvailable =
  Platform.OS !== 'android' ||
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient ||
  (!!(Constants.expoConfig?.extra as { hasMapsKey?: boolean } | undefined)?.hasMapsKey && nativeHasMapsKey());

export const hasRealMap = mapsAvailable;

/** Native map: parking areas as coloured polygons, the driver as a pin. */
export default function AreaMap(props: Props) {
  return mapsAvailable ? <NativeMap {...props} /> : <AreaFallback {...props} />;
}

function NativeMap({ areas, lat, lng, highlightId, focus, recenter, onPressArea }: Props) {
  const t = useTheme();
  const ref = useRef<MapView>(null);

  const at = focus ?? { lat, lng };
  useEffect(() => {
    ref.current?.animateToRegion({ latitude: at.lat, longitude: at.lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }, 400);
  }, [at.lat, at.lng, recenter]);

  return (
    <MapView
      ref={ref}
      provider={PROVIDER_DEFAULT}
      style={{ flex: 1 }}
      initialRegion={{ latitude: lat, longitude: lng, latitudeDelta: 0.006, longitudeDelta: 0.006 }}
      showsUserLocation={false}
      showsMyLocationButton={false}
      showsCompass={false}
      toolbarEnabled={false}
      mapPadding={{ top: 0, right: 0, bottom: 28, left: 0 }}
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
                tappable={!!onPressArea}
                onPress={() => onPressArea?.(a.id)}
              />
            );
          });
        })}
      <Marker coordinate={{ latitude: lat, longitude: lng }} title="You are here" pinColor={t.brand} />
    </MapView>
  );
}
