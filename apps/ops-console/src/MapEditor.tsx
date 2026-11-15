import L from 'leaflet';
import { useEffect, useRef, useState } from 'react';
import {
  MIN_DRAW_ZOOM, analyzeShape, fmtM, metersPerPixel, midpoints, snapPoint, snapTargets, squareCorner,
  type EditorAction, type EditorState, type ParkingArea, type Position, type SnapTargets,
} from '@parkpay/shared';

/**
 * Map editor for parking areas.
 *
 * All shape rules live in @parkpay/shared/geometry (the same engine the ParkPay Admin app uses). This file only
 * turns pointer events into editor actions:
 *   click map          -> snap (corner first, then edge, within SNAP_PX screen pixels) -> 'tap'
 *   drag a corner      -> live preview while dragging, snap on release -> 'move'
 *   click an edge dot  -> 'insert' a corner there
 *   right-click corner -> 'remove'
 * Layers are split so the other areas are drawn once per data change, and the shape being edited is redrawn on
 * its own; nothing is torn down while a corner is being dragged, and the view never jumps while you edit.
 */

interface Props {
  areas: ParkingArea[];
  editingId: string | null; // the area whose outline is in the editor (drawn by the editor, not the area layer)
  level: 2 | 3;
  state: EditorState;
  dispatch: (a: EditorAction) => void;
  active: boolean; // an area is open in the editor
  onSelect: (id: string) => void;
  focusKey: string; // when this changes the map fits to the open shape
  squareCorners: boolean;
  snapping: boolean;
}

const TORONTO: L.LatLngExpression = [43.6526, -79.3832];
const SNAP_PX = 12;
const ll = (p: Position): L.LatLngExpression => [p[1], p[0]];
const pos = (l: L.LatLng): Position => [l.lng, l.lat];

const BASES = {
  map: () => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19, attribution: '&copy; OpenStreetMap contributors' }),
  satellite: () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 20, maxNativeZoom: 19, attribution: 'Imagery &copy; Esri, Maxar, Earthstar Geographics' }),
};

const vertexIcon = (kind: 'first' | 'corner' | 'pending', flagged: boolean) =>
  L.divIcon({ className: `pp-vertex ${kind}${flagged ? ' flagged' : ''}`, iconSize: [16, 16], iconAnchor: [8, 8] });
const midIcon = L.divIcon({ className: 'pp-mid', iconSize: [12, 12], iconAnchor: [6, 6] });

export default function MapEditor(p: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const areaLayer = useRef(L.layerGroup());
  const editLayer = useRef(L.layerGroup());
  const guide = useRef<L.Polyline | null>(null);
  const guideLabel = useRef<L.Tooltip | null>(null);
  const base = useRef<L.TileLayer | null>(null);
  const props = useRef(p);
  props.current = p;
  const targets = useRef<SnapTargets>({ vertices: [], segments: [] });
  const [zoom, setZoom] = useState(14);
  const [baseName, setBaseName] = useState<keyof typeof BASES>('map');
  const [hint, setHint] = useState('');
  const [query, setQuery] = useState('');

  // ---- create the map once ----
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, doubleClickZoom: false, maxZoom: 20, zoomSnap: 0.5 }).setView(TORONTO, 14);
    base.current = BASES.map().addTo(m);
    L.control.scale({ imperial: false, maxWidth: 140 }).addTo(m);
    areaLayer.current.addTo(m);
    editLayer.current.addTo(m);
    // The page scrolls normally; the wheel zooms the map only after you click into it, and stops when you leave it.
    m.on('click', () => m.scrollWheelZoom.enable());
    m.getContainer().addEventListener('mouseleave', () => m.scrollWheelZoom.disable());
    m.on('zoomend', () => setZoom(m.getZoom()));
    m.on('click', (e: L.LeafletMouseEvent) => onMapClick(e));
    m.on('mousemove', (e: L.LeafletMouseEvent) => drawGuide(e.latlng));
    m.getContainer().addEventListener('mouseleave', () => clearGuide());
    map.current = m;
    setZoom(m.getZoom());
    return () => { m.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // keyboard: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Enter closes the shape, Escape drops rectangle taps
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (!props.current.active || t.closest('input,select,textarea')) return;
      const k = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); props.current.dispatch({ type: e.shiftKey ? 'redo' : 'undo' }); }
      else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); props.current.dispatch({ type: 'redo' }); }
      else if (k === 'enter') props.current.dispatch({ type: 'close' });
      else if (k === 'escape') props.current.dispatch({ type: 'tool', tool: props.current.state.tool });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  function snapped(at: L.LatLng, prevPrev?: Position, prev?: Position): { point: Position; kind: string } {
    const m = map.current!;
    const { snapping, squareCorners } = props.current;
    let point = pos(at);
    let kind = 'none';
    if (snapping) {
      const tol = SNAP_PX * metersPerPixel(at.lat, m.getZoom());
      const r = snapPoint(point, { vertices: [...targets.current.vertices, ...(props.current.state.vertices[0] ? [props.current.state.vertices[0]] : [])], segments: targets.current.segments }, tol);
      point = r.point; kind = r.kind;
    }
    if (kind === 'none' && squareCorners && prevPrev && prev) { point = squareCorner(prevPrev, prev, point); kind = 'square'; }
    return { point, kind };
  }

  function canDraw(): boolean {
    const m = map.current!;
    const min = MIN_DRAW_ZOOM[props.current.level];
    if (m.getZoom() >= min) return true;
    setHint(`Zoom in to street level to place corners (zoom ${min}+, now ${m.getZoom()}). At this zoom one pixel is ${fmtM(metersPerPixel(m.getCenter().lat, m.getZoom()))}, too coarse for a parking area.`);
    return false;
  }

  function onMapClick(e: L.LeafletMouseEvent) {
    const { active, state, dispatch } = props.current;
    if (!active || state.closed) return;
    if (!canDraw()) return;
    setHint('');
    const v = state.vertices;
    const s = snapped(e.latlng, v[v.length - 2], v[v.length - 1]);
    dispatch({ type: 'tap', at: s.point });
  }

  function clearGuide() {
    guide.current?.remove(); guide.current = null;
    guideLabel.current?.remove(); guideLabel.current = null;
  }
  // rubber band from the last corner to the pointer, with its length, while drawing
  function drawGuide(at: L.LatLng) {
    const m = map.current;
    const { active, state } = props.current;
    if (!m || !active || state.closed) { clearGuide(); return; }
    const last = state.tool === 'rectangle' ? state.pending[state.pending.length - 1] : state.vertices[state.vertices.length - 1];
    if (!last) { clearGuide(); return; }
    const v = state.vertices;
    const s = snapped(at, v[v.length - 2], v[v.length - 1]);
    const pts: L.LatLngExpression[] = [ll(last), ll(s.point)];
    if (state.tool === 'polygon' && v.length >= 2) pts.push(ll(v[0]));
    if (!guide.current) guide.current = L.polyline(pts, { color: '#e07b00', weight: 2, dashArray: '6 6', interactive: false }).addTo(m);
    else guide.current.setLatLngs(pts);
    const lenM = m.distance(ll(last), ll(s.point));
    const text = `${fmtM(lenM)}${s.kind === 'vertex' ? ' · snapped to corner' : s.kind === 'edge' ? ' · snapped to edge' : s.kind === 'square' ? ' · square corner' : ''}`;
    if (!guideLabel.current) guideLabel.current = L.tooltip({ permanent: true, direction: 'right', offset: [12, 0], className: 'pp-len' }).setLatLng(ll(s.point)).setContent(text).addTo(m);
    else guideLabel.current.setLatLng(ll(s.point)).setContent(text);
  }

  // ---- other areas: redrawn only when the data or the open area changes ----
  useEffect(() => {
    const g = areaLayer.current;
    g.clearLayers();
    const others = p.areas.filter((a) => a.id !== p.editingId);
    targets.current = snapTargets(others.map((a) => a.geometry));
    for (const a of others) {
      const layer = L.geoJSON({ type: 'Feature', properties: {}, geometry: a.geometry } as GeoJSON.Feature, {
        style: { color: a.level === 3 ? '#2f6fde' : '#888', weight: 2, fillOpacity: a.level === 3 ? 0.16 : 0.03, dashArray: a.level === 3 ? undefined : '6 6' },
        // while drawing, clicks must reach the map (to place corners), not open the area underneath
        interactive: !p.active,
      });
      layer.bindTooltip(a.name, { sticky: true });
      layer.on('click', (e) => { L.DomEvent.stopPropagation(e); props.current.onSelect(a.id); });
      layer.addTo(g);
    }
  }, [p.areas, p.editingId, p.active]);

  // ---- the shape being edited ----
  useEffect(() => {
    const g = editLayer.current;
    g.clearLayers();
    if (!p.active) return;
    const { vertices, closed, pending, tool } = p.state;
    const report = vertices.length >= 3 ? analyzeShape(vertices, p.level) : null;
    const flagged = new Set(report?.issues.filter((i) => i.at).map((i) => `${i.at![0]},${i.at![1]}`));
    const bad = report != null && !report.valid && closed;
    if (vertices.length >= 2) {
      const shape = closed
        ? L.polygon(vertices.map(ll), { color: bad ? '#c93b3b' : '#0b8f5a', weight: 3, fillOpacity: 0.25, interactive: false })
        : L.polyline(vertices.map(ll), { color: '#e07b00', weight: 3, interactive: false });
      shape.addTo(g);
    }
    // edge lengths on the shape (kept readable: only for shapes a person would edit by hand)
    if (vertices.length >= 2 && vertices.length <= 40) {
      const n = closed ? vertices.length : vertices.length - 1;
      for (let i = 0; i < n; i++) {
        const a = vertices[i], b = vertices[(i + 1) % vertices.length];
        const mid: L.LatLngExpression = [(a[1] + b[1]) / 2, (a[0] + b[0]) / 2];
        L.tooltip({ permanent: true, direction: 'center', className: 'pp-edge', interactive: false }).setLatLng(mid).setContent(fmtM(map.current!.distance(ll(a), ll(b)))).addTo(g);
      }
    }
    vertices.forEach((v, i) => {
      const mk = L.marker(ll(v), { icon: vertexIcon(i === 0 && !closed ? 'first' : 'corner', flagged.has(`${v[0]},${v[1]}`)), draggable: true, keyboard: false, title: closed ? 'Drag to move · right-click to remove' : i === 0 && vertices.length >= 3 ? 'Click to close the shape' : 'Drag to move · right-click to remove' });
      mk.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (i === 0 && !closed && vertices.length >= 3) props.current.dispatch({ type: 'close' });
      });
      mk.on('contextmenu', (e) => { L.DomEvent.stopPropagation(e); L.DomEvent.preventDefault(e as unknown as Event); props.current.dispatch({ type: 'remove', index: i }); });
      mk.on('drag', () => {
        // live preview without touching React state: move the outline and the neighbouring length labels
        const shape = g.getLayers().find((l) => l instanceof L.Polyline) as L.Polyline | undefined;
        if (shape) { const pts = vertices.map(ll); pts[i] = mk.getLatLng(); shape.setLatLngs(pts); }
      });
      mk.on('dragend', () => {
        const others = vertices.filter((_, j) => j !== i);
        const m = map.current!;
        const tol = SNAP_PX * metersPerPixel(mk.getLatLng().lat, m.getZoom());
        const r = props.current.snapping ? snapPoint(pos(mk.getLatLng()), { vertices: [...targets.current.vertices, ...others], segments: targets.current.segments }, tol) : { point: pos(mk.getLatLng()) };
        props.current.dispatch({ type: 'move', index: i, to: r.point });
      });
      mk.addTo(g);
    });
    if (closed && vertices.length <= 200) {
      midpoints(vertices).forEach((mp, i) => {
        const mk = L.marker(ll(mp), { icon: midIcon, keyboard: false, title: 'Click to add a corner here' });
        mk.on('click', (e) => { L.DomEvent.stopPropagation(e); props.current.dispatch({ type: 'insert', after: i, at: mp }); });
        mk.addTo(g);
      });
    }
    if (tool === 'rectangle') pending.forEach((v) => L.marker(ll(v), { icon: vertexIcon('pending', false), interactive: false }).addTo(g));
    if (closed) clearGuide();
  }, [p.state, p.active, p.level]);

  // ---- fit the view only when a different area is opened (never while editing) ----
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const v = props.current.state.vertices;
    if (v.length >= 2) m.fitBounds(L.latLngBounds(v.map(ll)).pad(0.5), { maxZoom: 19 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.focusKey]);

  function switchBase(name: keyof typeof BASES) {
    const m = map.current;
    if (!m || name === baseName) return;
    base.current?.remove();
    base.current = BASES[name]().addTo(m);
    base.current.bringToBack();
    setBaseName(name);
  }

  async function goTo(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q || !map.current) return;
    setHint('Searching…');
    try {
      // OpenStreetMap Nominatim, biased to the current view; one request per search (their usage policy).
      const b = map.current.getBounds();
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}&viewbox=${b.getWest()},${b.getNorth()},${b.getEast()},${b.getSouth()}`;
      const r = (await (await fetch(url, { headers: { Accept: 'application/json' } })).json()) as { lat: string; lon: string; display_name: string }[];
      if (!r.length) { setHint(`No place found for “${q}”.`); return; }
      map.current.setView([Number(r[0].lat), Number(r[0].lon)], 18);
      setHint(r[0].display_name);
    } catch { setHint('Address search is unavailable right now.'); }
  }

  const mpp = map.current ? metersPerPixel(map.current.getCenter().lat, zoom) : 0;
  const drawOk = zoom >= MIN_DRAW_ZOOM[p.level];
  return (
    // Leaflet owns the map element's classes (leaflet-container etc.), so React must never set className on it.
    <div className={`mapwrap${p.active && !p.state.closed ? ' drawing' : ''}`}>
      <div className="mapbar">
        <form onSubmit={goTo} className="mapsearch">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Go to an address or place" aria-label="Go to an address or place" />
        </form>
        <div className="seg" role="group" aria-label="Base map">
          <button type="button" className={baseName === 'map' ? 'on' : ''} onClick={() => switchBase('map')}>Map</button>
          <button type="button" className={baseName === 'satellite' ? 'on' : ''} onClick={() => switchBase('satellite')}>Satellite</button>
        </div>
      </div>
      <div ref={el} className="map" />
      <div className="mapstatus">
        <span>Zoom {zoom} · 1 px ≈ {fmtM(mpp)}</span>
        {p.active && !p.state.closed ? <span className={drawOk ? 'ok' : 'warn'}>{drawOk ? 'Ready to place corners' : `Zoom in to ${MIN_DRAW_ZOOM[p.level]}+ to draw`}</span> : null}
        <span className="muted">Click the map once to let the mouse wheel zoom it.</span>
      </div>
      {hint ? <div className="maphint" role="status">{hint}</div> : null}
    </div>
  );
}
