import { Ionicons } from '@expo/vector-icons';
import React, { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
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
 *
 * Rendering rules (to keep the map still and smooth):
 *  - The visible region lives in a ref, not in state: panning and zooming never re-render the markers.
 *    Only the small zoom badge re-renders, and only when the rounded value changes.
 *  - Other operators' areas are built once per data change (memo), never per edit or pan.
 *  - Each marker captures its own bitmap once when it mounts or its content changes (Android draws custom
 *    markers into a bitmap), then stops tracking. A change to one corner never makes the others redraw.
 */

const SNAP_DP = 22; // a fingertip, not a mouse pointer
const ll = (p: Position): LatLng => ({ latitude: p[1], longitude: p[0] });
const pos = (c: LatLng): Position => [c.longitude, c.latitude];
const zoomOf = (r: Region, width: number) => Math.log2((360 * width) / (256 * Math.max(r.longitudeDelta, 1e-9)));
const mppOf = (r: Region, width: number) => (r.longitudeDelta * localFrame(r.latitude, r.longitude).mPerDegLng) / width;

export interface AreaEditorHandle {
  addAtCrosshair(): void;
  centerOn(lat: number, lng: number): void;
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
  onHint?: (text: string) => void;
}

/** Track view changes until the content has been drawn once, then stop (Android marker bitmaps). */
function useSettled(key: string): boolean {
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const h = setTimeout(() => setTracking(false), 500);
    return () => clearTimeout(h);
  }, [key]);
  return tracking;
}

const VertexMarker = memo(function VertexMarker(props: {
  index: number; at: Position; first: boolean; selected: boolean; flagged: boolean; danger: string;
  onPress: (i: number) => void; onDragStart: () => void; onDrag: (i: number, at: Position) => void; onDragEnd: (i: number, at: Position) => void;
}) {
  const { index, at, first, selected, flagged, danger } = props;
  const tracking = useSettled(`${first}:${selected}:${flagged}`);
  const size = first || selected ? 24 : 20;
  return (
    <Marker
      coordinate={ll(at)}
      anchor={{ x: 0.5, y: 0.5 }}
      draggable
      tracksViewChanges={tracking}
      onPress={() => props.onPress(index)}
      onDragStart={props.onDragStart}
      onDrag={(e) => props.onDrag(index, pos(e.nativeEvent.coordinate))}
      onDragEnd={(e) => props.onDragEnd(index, pos(e.nativeEvent.coordinate))}
    >
      <View style={{ width: size, height: size, borderRadius: 12, backgroundColor: flagged ? '#FFE3E3' : '#FFFFFF', borderWidth: 4, borderColor: flagged ? danger : first ? '#E07B00' : selected ? '#1E3A8A' : '#0B8F5A' }} />
    </Marker>
  );
});

const EdgeLabel = memo(function EdgeLabel(props: { index: number; at: Position; text: string; onPress: (i: number, at: Position) => void }) {
  const tracking = useSettled(props.text);
  return (
    <Marker coordinate={ll(props.at)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking} onPress={() => props.onPress(props.index, props.at)}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#0B8F5A' }}>
        <Ionicons name="add" size={12} color="#0B8F5A" />
        <Text style={{ fontSize: 11, fontWeight: '700', color: '#0D1B14' }}>{props.text}</Text>
      </View>
    </Marker>
  );
});

const PendingDot = memo(function PendingDot({ at }: { at: Position }) {
  const tracking = useSettled('p');
  return (
    <Marker coordinate={ll(at)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={tracking}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#fff', borderWidth: 4, borderColor: '#E07B00' }} />
    </Marker>
  );
});

/** Zoom badge: the only part that re-renders while the map moves. */
const ZoomBadge = memo(function ZoomBadge({ zoom, mpp, drawing, minZoom }: { zoom: number; mpp: number; drawing: boolean; minZoom: number }) {
  const ok = zoom >= minZoom;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 10, bottom: 10, backgroundColor: 'rgba(13,27,20,0.72)', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
      <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        Zoom {zoom.toFixed(1)} · 1 pt ≈ {fmtM(mpp)}{drawing ? (ok ? ' · ready' : ` · zoom to ${minZoom}+`) : ''}
      </Text>
    </View>
  );
});

function AreaEditorMap(p: Props, ref: React.Ref<AreaEditorHandle>) {
  const t = useTheme();
  const map = useRef<MapView>(null);
  const width = useRef(360);
  const latest = useRef(p);
  latest.current = p;

  const initialRegion = useRef<Region>(
    (() => {
      const v = p.state.vertices;
      if (v.length) {
        const lats = v.map((x) => x[1]), lngs = v.map((x) => x[0]);
        const dLat = Math.max(...lats) - Math.min(...lats), dLng = Math.max(...lngs) - Math.min(...lngs);
        return { latitude: (Math.max(...lats) + Math.min(...lats)) / 2, longitude: (Math.max(...lngs) + Math.min(...lngs)) / 2, latitudeDelta: Math.max(dLat * 2.2, 0.0015), longitudeDelta: Math.max(dLng * 2.2, 0.0015) };
      }
      return { latitude: p.initial.lat, longitude: p.initial.lng, latitudeDelta: 0.003, longitudeDelta: 0.003 };
    })(),
  ).current;
  const region = useRef<Region>(initialRegion);
  const [badge, setBadge] = useState(() => ({ zoom: zoomOf(initialRegion, 360), mpp: mppOf(initialRegion, 360) }));
  const [drag, setDrag] = useState<{ i: number; at: Position } | null>(null);
  const markerPressAt = useRef(0);
  const targets = useMemo(() => snapTargets(p.others.map((a) => a.geometry)), [p.others]);

  const measure = () => {
    const r = region.current;
    return { zoom: zoomOf(r, width.current), mpp: mppOf(r, width.current) };
  };

  function snapped(at: Position, mpp: number): Position {
    const { snapping, squareCorners, state } = latest.current;
    let pt = at;
    let kind = 'none';
    if (snapping) {
      const firstCorner = state.vertices[0] ? [state.vertices[0]] : [];
      const r = snapPoint(at, { vertices: [...targets.vertices, ...firstCorner], segments: targets.segments }, SNAP_DP * mpp);
      pt = r.point; kind = r.kind;
    }
    const v = state.vertices;
    if (kind === 'none' && squareCorners && v.length >= 2 && state.tool === 'polygon') pt = squareCorner(v[v.length - 2], v[v.length - 1], pt);
    return pt;
  }

  function place(at: Position) {
    const cur = latest.current;
    if (cur.state.closed) { cur.onSelect(null); return; }
    const { zoom, mpp } = measure();
    if (zoom < MIN_DRAW_ZOOM[cur.level]) { cur.onHint?.(`Zoom in to street level to place corners (1 point ≈ ${fmtM(mpp)} now).`); return; }
    cur.onHint?.('');
    cur.dispatch({ type: 'tap', at: snapped(at, mpp) });
  }

  useImperativeHandle(ref, () => ({
    addAtCrosshair: () => place([region.current.longitude, region.current.latitude]),
    centerOn: (lat, lng) => map.current?.animateToRegion({ latitude: lat, longitude: lng, latitudeDelta: 0.0018, longitudeDelta: 0.0018 }, 350),
  }));

  // stable handlers for the memoised markers
  const handlers = useMemo(() => ({
    vertexPress: (i: number) => {
      markerPressAt.current = Date.now();
      const { state, selected, dispatch, onSelect } = latest.current;
      if (i === 0 && !state.closed && state.vertices.length >= 3) dispatch({ type: 'close' });
      else onSelect(selected === i ? null : i);
    },
    dragStart: () => { markerPressAt.current = Date.now(); },
    drag: (i: number, at: Position) => setDrag({ i, at }),
    dragEnd: (i: number, at: Position) => {
      markerPressAt.current = Date.now();
      setDrag(null);
      const { state, snapping, dispatch } = latest.current;
      const rest = state.vertices.filter((_, j) => j !== i);
      const tol = SNAP_DP * mppOf(region.current, width.current);
      const to = snapping ? snapPoint(at, { vertices: [...targets.vertices, ...rest], segments: targets.segments }, tol).point : at;
      dispatch({ type: 'move', index: i, to });
    },
    insert: (i: number, at: Position) => { markerPressAt.current = Date.now(); latest.current.dispatch({ type: 'insert', after: i, at }); },
  }), [targets]);

  const { vertices, closed, pending, tool } = p.state;
  const shown = useMemo(() => (drag ? vertices.map((v, i) => (i === drag.i ? drag.at : v)) : vertices), [drag, vertices]);
  const report = useMemo(() => (shown.length >= 3 ? analyzeShape(shown, p.level) : null), [shown, p.level]);
  const bad = closed && report != null && !report.valid;
  // markings come from the committed outline, so a corner's look never changes in the middle of a drag
  const flagged = useMemo(() => {
    const r = vertices.length >= 3 ? analyzeShape(vertices, p.level) : null;
    return new Set(r?.issues.filter((i) => i.at).map((i) => `${i.at![0]},${i.at![1]}`));
  }, [vertices, p.level]);
  const stroke = bad ? t.danger : closed ? '#0B8F5A' : '#E07B00';

  const otherPolygons = useMemo(
    () =>
      p.others.flatMap((a) => {
        const polys = a.geometry.type === 'Polygon' ? [a.geometry.coordinates] : a.geometry.coordinates;
        return polys.map((poly, i) => (
          <Polygon key={`${a.id}-${i}`} coordinates={poly[0].map(ll)} strokeColor={a.level === 3 ? '#2F6FDE' : '#888888'} strokeWidth={a.level === 3 ? 2 : 1}
            fillColor={a.level === 3 ? 'rgba(47,111,222,0.14)' : 'rgba(136,136,136,0.04)'} lineDashPattern={a.level === 3 ? undefined : [6, 6]} tappable={false} />
        ));
      }),
    [p.others],
  );
  const mids = useMemo(() => (closed && vertices.length <= 60 ? midpoints(vertices) : []), [closed, vertices]);

  return (
    <View style={{ flex: 1 }} onLayout={(e: LayoutChangeEvent) => { width.current = e.nativeEvent.layout.width || 360; setBadge(measure()); }}>
      <MapView
        ref={map}
        provider={PROVIDER_DEFAULT}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        mapType={p.satellite ? 'hybrid' : 'standard'}
        onRegionChangeComplete={(r) => {
          region.current = r;
          const m = measure();
          // re-render only the badge, and only when what it shows changes
          setBadge((b) => (Math.abs(b.zoom - m.zoom) < 0.05 && Math.abs(b.mpp - m.mpp) / Math.max(b.mpp, 1e-9) < 0.02 ? b : m));
        }}
        onPress={(e: MapPressEvent) => {
          if (Date.now() - markerPressAt.current < 350) return; // the tap was on a marker
          place(pos(e.nativeEvent.coordinate));
        }}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        moveOnMarkerPress={false}
        userInterfaceStyle={t.dark ? 'dark' : 'light'}
      >
        {otherPolygons}

        {shown.length >= 3 && closed ? <Polygon coordinates={shown.map(ll)} strokeColor={stroke} strokeWidth={3} fillColor={bad ? 'rgba(201,59,59,0.22)' : 'rgba(11,143,90,0.24)'} tappable={false} /> : null}
        {shown.length >= 2 && !closed ? <Polyline coordinates={shown.map(ll)} strokeColor={stroke} strokeWidth={3} /> : null}
        {shown.length >= 3 && !closed ? <Polyline coordinates={[ll(shown[shown.length - 1]), ll(shown[0])]} strokeColor={stroke} strokeWidth={1.5} lineDashPattern={[6, 6]} /> : null}

        {/* edge handles: tap "+ length" to add a corner there; hidden while a corner is being dragged */}
        {!drag
          ? mids.map((m, i) => (
              <EdgeLabel key={`mid-${i}-${m[0]}-${m[1]}`} index={i} at={m} text={fmtM(distanceM(vertices[i], vertices[(i + 1) % vertices.length]))} onPress={handlers.insert} />
            ))
          : null}

        {vertices.map((v, i) => (
          <VertexMarker
            key={`v-${i}`}
            index={i}
            at={v}
            first={i === 0 && !closed}
            selected={p.selected === i}
            flagged={flagged.has(`${v[0]},${v[1]}`)}
            danger={t.danger}
            onPress={handlers.vertexPress}
            onDragStart={handlers.dragStart}
            onDrag={handlers.drag}
            onDragEnd={handlers.dragEnd}
          />
        ))}
        {tool === 'rectangle' ? pending.map((v, i) => <PendingDot key={`pend-${i}-${v[0]}-${v[1]}`} at={v} />) : null}
      </MapView>

      {/* centre crosshair for precise placement */}
      {!closed ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ position: 'absolute', width: 34, height: 2, backgroundColor: '#E07B00' }} />
            <View style={{ position: 'absolute', width: 2, height: 34, backgroundColor: '#E07B00' }} />
            <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#E07B00', backgroundColor: 'rgba(255,255,255,0.6)' }} />
          </View>
        </View>
      ) : null}

      <ZoomBadge zoom={badge.zoom} mpp={badge.mpp} drawing={!closed} minZoom={MIN_DRAW_ZOOM[p.level]} />
    </View>
  );
}

export default memo(forwardRef<AreaEditorHandle, Props>(AreaEditorMap));
