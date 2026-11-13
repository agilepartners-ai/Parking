import L from 'leaflet';
import '@geoman-io/leaflet-geoman-free';
import { useEffect, useRef } from 'react';
import type { AreaGeometry, ParkingArea } from '@parkpay/shared';

interface Props {
  areas: ParkingArea[];
  selectedId: string | null;
  draftGeometry: AreaGeometry | null; // geometry of an area being drawn but not saved yet
  onSelect: (id: string) => void;
  /** isNew = a fresh drawing (starts a new area); otherwise the selected area's corners were dragged. */
  onGeometry: (g: AreaGeometry, isNew: boolean) => void;
}

const TORONTO: L.LatLngExpression = [43.6526, -79.3832];

/** Leaflet map: shows all areas, lets the operator pick one, draw a polygon, and drag vertices. */
export default function MapEditor({ areas, selectedId, draftGeometry, onSelect, onGeometry }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<L.LayerGroup>(L.layerGroup());
  const cb = useRef({ onSelect, onGeometry });
  cb.current = { onSelect, onGeometry };

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: true }).setView(TORONTO, 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(m);
    layers.current.addTo(m);
    m.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawRectangle: true,
      drawPolygon: true,
      drawCircle: false,
      drawText: false,
      editMode: false,
      dragMode: false,
      cutPolygon: false,
      removalMode: false,
      rotateMode: false,
    });
    m.on('pm:create', (e: { layer: L.Layer }) => {
      const geo = (e.layer as L.Polygon).toGeoJSON().geometry as AreaGeometry;
      m.removeLayer(e.layer);
      cb.current.onGeometry(geo, true);
    });
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layers.current.clearLayers();
    let focus: L.LatLngBounds | null = null;
    for (const a of areas) {
      const selected = a.id === selectedId;
      const g = L.geoJSON({ type: 'Feature', properties: {}, geometry: a.geometry } as GeoJSON.Feature, {
        style: {
          color: selected ? '#0b8f5a' : a.level === 3 ? '#2f6fde' : '#888',
          weight: selected ? 3 : 2,
          fillOpacity: selected ? 0.3 : a.level === 3 ? 0.18 : 0.04,
          dashArray: a.level === 3 ? undefined : '6 6',
          interactive: true,
        },
      });
      g.bindTooltip(a.name, { sticky: true });
      g.on('click', () => cb.current.onSelect(a.id));
      g.addTo(layers.current);
      if (selected) {
        focus = g.getBounds();
        g.eachLayer((l) => {
          const pl = l as L.Polygon;
          pl.pm.enable({ allowSelfIntersection: false });
          pl.on('pm:edit', () => {
            const rings: number[][][][] = [];
            g.eachLayer((x) => {
              const gj = (x as L.Polygon).toGeoJSON().geometry as GeoJSON.Polygon;
              rings.push(gj.coordinates as number[][][]);
            });
            cb.current.onGeometry({ type: 'MultiPolygon', coordinates: rings } as AreaGeometry, false);
          });
        });
      }
    }
    if (draftGeometry) {
      const d = L.geoJSON({ type: 'Feature', properties: {}, geometry: draftGeometry } as GeoJSON.Feature, {
        style: { color: '#e07b00', weight: 3, fillOpacity: 0.25 },
      });
      d.addTo(layers.current);
      focus = d.getBounds();
    }
    if (focus && focus.isValid()) m.fitBounds(focus.pad(0.6), { maxZoom: 18 });
  }, [areas, selectedId, draftGeometry]);

  return <div ref={el} className="map" />;
}
