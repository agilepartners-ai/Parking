import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Text, View, type LayoutChangeEvent } from 'react-native';
import MapView, { Marker, Polygon, Polyline, PROVIDER_DEFAULT, type LatLng, type MapPressEvent, type Region } from 'react-native-maps';
import {
  MIN_DRAW_ZOOM, analyzeShape, distanceM, fmtM, localFrame, midpoints, snapPoint, snapTargets, squareCorner,
  type EditorAction, type EditorState, type ParkingArea, type Position,
} from '@parkpay/shared';
import { useTheme } from '../theme';

/**
 * Touch map editor for the ParkPay Admin app. Same rules as the web console: all geometry goes through the
 * shared engine (@parkpay/shared/geometry), this file only turns touches into editor actions.
 *
 * Two ways to place a corner:
 *  - tap the map (fast), or
 *  - pan the map so the centre crosshair sits on the spot and press "Add corner" (precise: your finger
 *    never hides the point you are placing).
 * Both snap to nearby corners/edges of other areas within SNAP_DP screen points, converted to metres at the
 * current zoom, and can square the corner to the previous edge.
 */

const SNAP_DP = 22; // a fingertip, not a mouse pointer
const ll = (p: Position): LatLng => ({ latitude: p[1], longitude: p[0] });
const pos = (c: LatLng): Position => [c.longitude, c.latitude];

export interface AreaEditorHandle {
  addAtCrosshair(): void;
  centerOn(lat: number, lng: number, zoomDelta?: number): void;
}

interface Props {
  others: ParkingArea[];
  state: EditorState;
  dispatch: (a: EditorAction) => void;
  level: 2 | 3;
  snapping: boolean;
  squareCorners: boolean;
  satellite: boolean;
  selected: number | null;
  onSelect: (i: number | null) => void;
  initial: { lat: number; lng: number };
  onZoom?: (z: { zoom: number; mpp: number; canDraw: boolean }) => void;
  onHint?: (text: string) => void;
}

export default forwardRef<AreaEditorHandle, Props>(function AreaEditorMap(p, ref) {
  const t = useTheme();
  const map = useRef<MapView>(null);
  const [width, setWidth] = useState(360);
  const [region, setRegion] = useState<Region>(() => {
    const v = p.state.vertices;
    if (v.length) {
      const lats = v.map((x) => x[1]), lngs = v.map((x) => x[0]);
      const dLat = Math.max(...lats) - Math.min(...lats), dLng = Math.max(...lngs) - Math.min(...lngs);
      return { latitude: (Math.max(...lats) + Math.min(...lats)) / 2, longitude: (Math.max(...lngs) + Math.min(...lngs)) / 2, latitudeDelta: Math.max(dLat * 2.2, 0.0015), longitudeDelta: Math.max(dLng * 2.2, 0.0015) };
    }
    return { latitude: p.initial.lat, longitude: p.initial.lng, latitudeDelta: 0.003, longitudeDelta: 0.003 };
  });
  const [drag, setDrag] = useState<{ i: number; at: Position } | null>(null);
  const markerPressAt = useRef(0);
  const targets = useMemo(() => snapTargets(p.others.map((a) => a.geometry)), [p.others]);

  // zoom and ground resolution from the visible region: Google/Apple maps use 256-point tiles
  const zoom = Math.log2((360 * width) / (256 * Math.max(region.longitudeDelta, 1e-9)));
  const mpp = (region.longitudeDelta * localFrame(region.latitude, region.longitude).mPerDegLng) / width;
  const canDraw = zoom >= MIN_DRAW_ZOOM[p.level];

  function snapped(at: Position): Position {
    let pt = at;
    let kind: string = 'none';
    if (p.snapping) {
      const firstCorner = p.state.vertices[0] ? [p.state.vertices[0]] : [];
      const r = snapPoint(at, { vertices: [...targets.vertices, ...firstCorner], segments: targets.segments }, SNAP_DP * mpp);
      pt = r.point; kind = r.kind;
    }
    const v = p.state.vertices;
    if (kind === 'none' && p.squareCorners && v.length >= 2 && p.state.tool === 'polygon') pt = squareCorner(v[v.length - 2], v[v.length - 1], pt);
    return pt;
  }

  function place(at: Position) {
    if (p.state.closed) { p.onSelect(null); return; }
    if (!canDraw) { p.onHint?.(`Zoom in to street level to place corners (1 point ≈ ${fmtM(mpp)} now).`); return; }
    p.onHint?.('');
    p.dispatch({ type: 'tap', at: snapped(at) });
  }

  useImperativeHandle(ref, () => ({
    addAtCrosshair: () => place([region.longitude, region.latitude]),
    centerOn: (lat, lng) => map.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.0018, longitudeDelta: 0.0018 }, 350),
  }));

  function onMapPress(e: MapPressEvent) {
    if (Date.now() - markerPressAt.current < 350) return; // the tap was on a corner marker
    place(pos(e.nativeEvent.coordinate));
  }

  const { vertices, closed, pending, tool } = p.state;
  const shown = drag ? vertices.map((v, i) => (i === drag.i ? drag.at : v)) : vertices;
  const report = shown.length >= 3 ? analyzeShape(shown, p.level) : null;
  const bad = closed && report != null && !report.valid;
  // markings come from the committed outline, so a marker's look (and React key) never changes mid-drag
  const committed = vertices.length >= 3 ? analyzeShape(vertices, p.level) : null;
  const flagged = new Set(committed?.issues.filter((i) => i.at).map((i) => `${i.at![0]},${i.at![1]}`));
  const stroke = bad ? t.danger : closed ? '#0B8F5A' : '#E07B00';

  // Android draws a custom marker into a bitmap. With tracksViewChanges off from the start, the snapshot is taken
  // before the text has laid out and the label stays blank. Track for a moment after every change, then stop
  // (tracking all the time costs frame rate on long outlines).
  const [track, setTrack] = useState(true);
  const lookKey = `${vertices.length}:${closed}:${p.selected}:${[...flagged].join('|')}:${vertices.map((v) => v.join(',')).join(';')}`;
  useEffect(() => {
    setTrack(true);
    const h = setTimeout(() => setTrack(false), 800);
    return () => clearTimeout(h);
  }, [lookKey]);

  return (
    <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width || 360)}>
      <MapView
        ref={map}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={region}
        mapType={p.satellite ? 'hybrid' : 'standard'}
        onRegionChangeComplete={(r) => {
          setRegion(r);
          const z = Math.log2((360 * width) / (256 * Math.max(r.longitudeDelta, 1e-9)));
          const m = (r.longitudeDelta * localFrame(r.latitude, r.longitude).mPerDegLng) / width;
          p.onZoom?.({ zoom: z, mpp: m, canDraw: z >= MIN_DRAW_ZOOM[p.level] });
        }}
        onPress={onMapPress}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        userInterfaceStyle={t.dark ? 'dark' : 'light'}
      >
        {p.others.flatMap((a) => {
          const polys = a.geometry.type === 'Polygon' ? [a.geometry.coordinates] : a.geometry.coordinates;
          return polys.map((poly, i) => (
            <Polygon key={`${a.id}-${i}`} coordinates={poly[0].map(ll)} strokeColor={a.level === 3 ? '#2F6FDE' : '#888888'} strokeWidth={a.level === 3 ? 2 : 1}
              fillColor={a.level === 3 ? 'rgba(47,111,222,0.14)' : 'rgba(136,136,136,0.04)'} lineDashPattern={a.level === 3 ? undefined : [6, 6]} tappable={false} />
          ));
        })}

        {shown.length >= 3 && closed ? <Polygon coordinates={shown.map(ll)} strokeColor={stroke} strokeWidth={3} fillColor={bad ? 'rgba(201,59,59,0.22)' : 'rgba(11,143,90,0.24)'} tappable={false} /> : null}
        {shown.length >= 2 && !closed ? <Polyline coordinates={shown.map(ll)} strokeColor={stroke} strokeWidth={3} /> : null}
        {shown.length >= 3 && !closed ? <Polyline coordinates={[ll(shown[shown.length - 1]), ll(shown[0])]} strokeColor={stroke} strokeWidth={1.5} lineDashPattern={[6, 6]} /> : null}

        {/* edge handles: tap "+" to add a corner there; each shows the edge length */}
        {closed && !drag && shown.length <= 60
          ? midpoints(shown).map((m, i) => (
              <Marker key={`mid-${i}-${m[0]}-${m[1]}`} coordinate={ll(m)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track}
                onPress={() => { markerPressAt.current = Date.now(); p.dispatch({ type: 'insert', after: i, at: m }); }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#0B8F5A' }}>
                  <Ionicons name="add" size={12} color="#0B8F5A" />
                  <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D1B14' }}>{fmtM(distanceM(shown[i], shown[(i + 1) % shown.length]))}</Text>
                </View>
              </Marker>
            ))
          : null}

        {shown.map((v, i) => {
          const first = i === 0 && !closed;
          const sel = p.selected === i;
          const flag = flagged.has(`${vertices[i]?.[0]},${vertices[i]?.[1]}`);
          return (
            <Marker
              key={`v-${i}-${sel}-${flag}-${first}`}
              coordinate={ll(v)}
              anchor={{ x: 0.5, y: 0.5 }}
              draggable
              tracksViewChanges={track}
              onPress={() => {
                markerPressAt.current = Date.now();
                if (first && vertices.length >= 3) p.dispatch({ type: 'close' });
                else p.onSelect(sel ? null : i);
              }}
              onDragStart={() => { markerPressAt.current = Date.now(); }}
              onDrag={(e) => setDrag({ i, at: pos(e.nativeEvent.coordinate) })}
              onDragEnd={(e) => {
                markerPressAt.current = Date.now();
                setDrag(null);
                const rest = vertices.filter((_, j) => j !== i);
                const at = pos(e.nativeEvent.coordinate);
                const r = p.snapping ? snapPoint(at, { vertices: [...targets.vertices, ...rest], segments: targets.segments }, SNAP_DP * mpp).point : at;
                p.dispatch({ type: 'move', index: i, to: r });
              }}
            >
              <View style={{
                width: first ? 24 : sel ? 24 : 20, height: first ? 24 : sel ? 24 : 20, borderRadius: 12, backgroundColor: flag ? '#FFE3E3' : '#FFFFFF',
                borderWidth: 4, borderColor: flag ? t.danger : first ? '#E07B00' : sel ? '#1E3A8A' : '#0B8F5A',
              }} />
            </Marker>
          );
        })}
        {tool === 'rectangle'
          ? pending.map((v, i) => (
              <Marker key={`pend-${i}`} coordinate={ll(v)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={track}>
                <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', borderWidth: 4, borderColor: '#E07B00' }} />
              </Marker>
            ))
          : null}
      </MapView>

      {/* centre crosshair for precise placement */}
      {!closed ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', width: 34, height: 2, backgroundColor: canDraw ? '#E07B00' : '#888' }} />
            <View style={{ position: 'absolute', width: 2, height: 34, backgroundColor: canDraw ? '#E07B00' : '#888' }} />
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: canDraw ? '#E07B00' : '#888', backgroundColor: 'rgba(255,255,255,0.6)' }} />
          </View>
        </View>
      ) : null}

      <View pointerEvents="none" style={{ position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(13,27,20,0.72)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
        <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
          Zoom {zoom.toFixed(1)} · 1 pt ≈ {fmtM(mpp)}{!closed ? (canDraw ? ' · ready' : ` · zoom to ${MIN_DRAW_ZOOM[p.level]}+`) : ''}
        </Text>
      </View>
    </View>
  );
});
