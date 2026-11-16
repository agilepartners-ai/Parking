import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import {
  analyzeShape, editorReducer, fmtM, fmtM2, formatDays, formatMoney, geometryAreaM2, initialEditor, simplifyVertices, toPolygon, verticesOf,
  type AreaGeometry, type ParkingArea, type RateRule,
} from '@parkpay/shared';
import { Audit, Charts, Citations, Platform, Sessions, Versions } from './Admin';
import MapEditor from './MapEditor';
import { configured, rpc, supabase } from './supabase';

interface Profile { id: string; full_name: string; email: string | null; role: string; operator_id: string | null }
interface Report {
  sessions: number; active_now: number; revenue_cents: number; platform_fee_cents: number; operator_payout_cents: number;
  citations: number; citation_cents: number; by_area: { area_name: string; sessions: number; revenue_cents: number }[];
}
interface ActiveSession { session_id: string; plate: string; area_name: string; started_at: string }
type OperatorArea = ParkingArea & { active: boolean };

const CUR = 'CAD';
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

type Tab = 'dashboard' | 'areas' | 'sessions' | 'tickets' | 'staff' | 'audit' | 'platform';
const TAB_NAMES: Record<Tab, string> = { dashboard: 'Dashboard', areas: 'Areas & rates', sessions: 'Sessions', tickets: 'Tickets', staff: 'People & roles', audit: 'Audit log', platform: 'Platform' };

export default function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState<Tab>('dashboard');

  const load = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) { setProfile(null); setBooting(false); return; }
    try { setProfile(await rpc<Profile>('my_profile')); } catch { setProfile(null); }
    setBooting(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (!configured) return <div className="login card"><h2>Not configured</h2><p className="muted">Copy <code>.env.example</code> to <code>.env</code> in apps/ops-console and add your Supabase URL and publishable key.</p></div>;
  if (booting) return <div className="login muted">Loading…</div>;
  if (!profile) return <Login onDone={load} />;
  if (profile.role !== 'operator_admin' && profile.role !== 'platform_admin') {
    return (
      <div className="login card">
        <h2>No operator access</h2>
        <p className="muted">{profile.email} is a {profile.role}. Ask a platform admin to grant the operator_admin role.</p>
        <button className="btn secondary" onClick={async () => { await supabase.auth.signOut(); setProfile(null); }}>Sign out</button>
      </div>
    );
  }
  return (
    <>
      <header className="top">
        <h1>ParkPay <span className="muted" style={{ fontWeight: 500 }}>{profile.role === 'platform_admin' ? 'Platform admin' : 'Operator'}</span></h1>
        <nav>
          {(Object.keys(TAB_NAMES) as Tab[]).filter((t) => t !== 'platform' || profile.role === 'platform_admin').map((t) => (
            <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>{TAB_NAMES[t]}</button>
          ))}
        </nav>
        <span className="muted">{profile.email}</span>
        <button className="btn secondary" onClick={async () => { await supabase.auth.signOut(); setProfile(null); }}>Sign out</button>
      </header>
      <main>
        {tab === 'dashboard' ? <Dashboard /> : tab === 'areas' ? <Areas /> : tab === 'sessions' ? <Sessions /> : tab === 'tickets' ? <Citations /> : tab === 'audit' ? <Audit /> : tab === 'platform' ? <Platform /> : <Staff me={profile} />}
      </main>
    </>
  );
}

function Login({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    setBusy(false);
    if (error) setError(error.message); else onDone();
  }
  return (
    <form className="login card" onSubmit={submit}>
      <h2 style={{ margin: 0 }}>ParkPay Operator Console</h2>
      <p className="muted" style={{ margin: 0 }}>Sign in with an operator admin account.</p>
      <div><label>Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" /></div>
      <div><label>Password</label><input value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" /></div>
      {error ? <div className="error">{error}</div> : null}
      <button className="btn" disabled={busy || !email || !password}>{busy ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}

function Dashboard() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [active, setActive] = useState<ActiveSession[]>([]);
  const [occ, setOcc] = useState<OperatorArea[]>([]);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      setError('');
      rpc<OperatorArea[]>('operator_areas').then((a) => setOcc(a.filter((x) => x.active && x.level === 3))).catch(() => undefined);
      const from = new Date(Date.now() - days * 86_400_000).toISOString();
      setReport(await rpc<Report>('operator_report', { p_from: from, p_to: new Date().toISOString() }));
      setActive(await rpc<ActiveSession[]>('operator_active_sessions'));
    } catch (e) { setError((e as Error).message); }
  }, [days]);
  useEffect(() => { void refresh(); const id = setInterval(() => void refresh(), 30_000); return () => clearInterval(id); }, [refresh]);

  return (
    <div className="grid">
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0, flex: 3 }}>Dashboard</h2>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ maxWidth: 180 }}>
          <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
        </select>
        <button className="btn secondary" style={{ flex: 0 }} onClick={refresh}>Refresh</button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      {report ? (
        <>
          <div className="grid cards">
            <div className="card"><h3>Parking revenue</h3><div className="big">{formatMoney(report.revenue_cents, CUR)}</div><div className="muted">{report.sessions} completed sessions</div></div>
            <div className="card"><h3>Operator payout</h3><div className="big">{formatMoney(report.operator_payout_cents, CUR)}</div><div className="muted">after {formatMoney(report.platform_fee_cents, CUR)} platform fee</div></div>
            <div className="card"><h3>Parked right now</h3><div className="big">{report.active_now}</div><div className="muted">active sessions</div></div>
            <div className="card"><h3>Citations</h3><div className="big">{report.citations}</div><div className="muted">{formatMoney(report.citation_cents, CUR)} in fines</div></div>
          </div>
          <div className="card">
            <h3>Occupancy now</h3>
            <table><thead><tr><th>Area</th><th>Parked</th><th>Spaces</th><th style={{ width: '40%' }}></th></tr></thead>
              <tbody>{occ.map((a) => {
                const counted = a.total_spaces != null; const pct = counted ? Math.min(100, ((a.occupied ?? 0) / Math.max(1, a.total_spaces!)) * 100) : 0; const full = counted && (a.available ?? 0) === 0;
                return <tr key={a.id}><td>{a.name}</td><td>{a.occupied ?? 0}</td><td>{counted ? <span className={full ? 'error' : ''}>{a.total_spaces}{full ? ' · full' : ` · ${a.available} free`}</span> : <span className="muted">not counted</span>}</td>
                  <td>{counted ? <div className="occ"><div style={{ width: `${Math.max(2, pct)}%`, background: full ? 'var(--danger)' : pct >= 85 ? 'var(--warn)' : 'var(--brand)' }} /></div> : null}</td></tr>;
              })}{occ.length === 0 ? <tr><td colSpan={4} className="muted">No published parking areas.</td></tr> : null}</tbody></table>
          </div>
          <Charts days={days} currency={CUR} />
          <div className="split" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="card">
              <h3>Revenue by area</h3>
              <table><thead><tr><th>Area</th><th>Sessions</th><th>Revenue</th></tr></thead>
                <tbody>{report.by_area.map((a) => <tr key={a.area_name}><td>{a.area_name}</td><td>{a.sessions}</td><td>{formatMoney(a.revenue_cents, CUR)}</td></tr>)}
                  {report.by_area.length === 0 ? <tr><td colSpan={3} className="muted">No completed sessions in this period.</td></tr> : null}</tbody></table>
            </div>
            <div className="card">
              <h3>Parked now</h3>
              <table><thead><tr><th>Plate</th><th>Area</th><th>Since</th></tr></thead>
                <tbody>{active.map((s) => <tr key={s.session_id}><td><b>{s.plate}</b></td><td>{s.area_name}</td><td>{new Date(s.started_at).toLocaleTimeString()}</td></tr>)}
                  {active.length === 0 ? <tr><td colSpan={3} className="muted">Nobody is parked.</td></tr> : null}</tbody></table>
            </div>
          </div>
        </>
      ) : <div className="muted">Loading…</div>}
    </div>
  );
}

interface Draft {
  id: string | null; name: string; level: 2 | 3; maxStay: string; closing: string; spaces: string; active: boolean;
  planName: string; minCents: string; dailyMax: string; grace: string;
  rules: { days: number[]; start: string; end: string; price: string; priority: string }[];
  geometry: AreaGeometry | null;
}

const blankDraft = (): Draft => ({
  id: null, name: '', level: 3, maxStay: '', closing: '', spaces: '', active: false, planName: '', minCents: '1.00', dailyMax: '', grace: '5',
  rules: [{ days: [1, 2, 3, 4, 5, 6, 7], start: '08:00', end: '24:00', price: '3.00', priority: '0' }], geometry: null,
});

function toDraft(a: OperatorArea): Draft {
  return {
    id: a.id, name: a.name, level: a.level === 2 ? 2 : 3, maxStay: a.max_stay_minutes ? String(a.max_stay_minutes) : '', closing: a.closing_time ?? '',
    spaces: a.total_spaces != null ? String(a.total_spaces) : '', active: a.active,
    planName: a.plan.name, minCents: (a.plan.min_charge_cents / 100).toFixed(2), dailyMax: a.plan.daily_max_cents != null ? (a.plan.daily_max_cents / 100).toFixed(2) : '',
    grace: String(a.plan.grace_minutes),
    rules: a.plan.rules.map((r) => ({ days: r.days_of_week, start: r.start_time, end: r.end_time, price: (r.price_per_hour_cents / 100).toFixed(2), priority: String(r.priority) })),
    geometry: a.geometry,
  };
}

interface AreaCheck { area_m2: number; valid: boolean; problems: string[]; overlaps: { name: string; same_operator: boolean; published: boolean; overlap_m2: number }[] }
const AREA_ERRORS: Record<string, string> = {
  area_too_small: 'This shape is smaller than one parking bay (10 m²). Draw it larger.',
  area_too_large: 'This shape is too large for a parking area (over 5 km²). Use a city zone for wide coverage.',
  area_too_complex: 'This shape has too many points. Simplify it.',
  area_overlaps_other_operator: 'This shape overlaps a published area of another operator, so it cannot be published. Move its edge.',
  invalid_geometry: 'This shape is not valid. Draw it again.',
  self_intersecting: 'The outline crosses itself. It will be repaired when saved; check the result on the map.',
  invalid_time: 'Write the closing time as HH:MM, for example 23:00, or leave it empty.',
  invalid_capacity: 'Spaces must be a whole number from 1 to 100,000, or empty if you do not count spaces.',
  area_has_active_sessions: 'A vehicle is parked here right now. Unpublish the area and archive it once it is empty.',
  area_not_found: 'That area belongs to another operator.',
  operator_required: 'Your account is not linked to an operator. A platform admin edits an existing area, or assigns you to an operator first.',
};
const areaError = (e: unknown) => { const m = (e as Error).message; const k = Object.keys(AREA_ERRORS).find((x) => m.includes(x)); return k ? AREA_ERRORS[k] : m.includes('no_rate_plan') ? 'Add at least one hourly rate and save before publishing.' : m; };

const cents = (s: string) => Math.round(parseFloat(s || '0') * 100);

function Areas() {
  const [areas, setAreas] = useState<OperatorArea[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [stamp, setStamp] = useState(0);
  const [check, setCheck] = useState<AreaCheck | null>(null);
  const [ed, dispatch] = useReducer(editorReducer, undefined, () => initialEditor());
  const [focusKey, setFocusKey] = useState('');
  const [squareCorners, setSquareCorners] = useState(true);
  const [snapping, setSnapping] = useState(true);
  const [parts, setParts] = useState({ extra: 0, holes: 0 });

  const level = draft?.level ?? 3;
  // The outline being edited. Untouched areas keep their stored geometry exactly (including extra parts);
  // once edited, the shape is the editor's cleaned, counter-clockwise polygon.
  const edited = ed.past.length > 0 || ed.future.length > 0;
  const geometry: AreaGeometry | null = useMemo(() => {
    if (!draft) return null;
    if (!edited && draft.geometry) return draft.geometry;
    return ed.closed && ed.vertices.length >= 3 ? toPolygon(ed.vertices) : null;
  }, [draft, edited, ed.closed, ed.vertices]);
  const report = useMemo(() => (ed.vertices.length >= 3 ? analyzeShape(ed.vertices, level) : null), [ed.vertices, level]);

  // Ask the server too: it knows the other operators' areas, so it is the authority on overlaps.
  const draftId = draft?.id ?? null;
  useEffect(() => {
    if (!geometry) { setCheck(null); return; }
    let stale = false;
    const id = setTimeout(() => {
      rpc<AreaCheck>('operator_check_area', { p_area_id: draftId, p_level: level, p_geojson: geometry }).then((c) => { if (!stale) setCheck(c); }).catch(() => { if (!stale) setCheck(null); });
    }, 350);
    return () => { stale = true; clearTimeout(id); };
  }, [geometry, draftId, level]);

  const load = useCallback(async () => { try { setAreas(await rpc<OperatorArea[]>('operator_areas')); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);

  function open(d: Draft | null, focus = true) {
    setDraft(d); setMsg(''); setError(''); setCheck(null);
    const v = verticesOf(d?.geometry);
    setParts({ extra: v.extraParts, holes: v.holes });
    dispatch({ type: 'load', vertices: v.vertices });
    if (focus && v.vertices.length) setFocusKey(`${d?.id ?? 'new'}:${Date.now()}`);
  }

  async function publish(on: boolean) {
    if (!draft?.id) return;
    setSaving(true); setError(''); setMsg('');
    try {
      const a = await rpc<OperatorArea>('operator_publish_area', { p_area_id: draft.id, p_publish: on });
      await load(); setDraft((d) => (d ? { ...d, active: a.active } : d)); setStamp((n) => n + 1);
      setMsg(on ? 'Published. Every driver app shows this area the next time it loads areas (within seconds).' : 'Unpublished. Drivers no longer see it; running sessions are not affected.');
    } catch (e) { setError(areaError(e)); } finally { setSaving(false); }
  }

  async function save() {
    if (!draft || !geometry) return;
    setSaving(true); setError(''); setMsg('');
    try {
      const rules: RateRule[] = draft.rules.map((r) => ({ days_of_week: r.days, start_time: r.start, end_time: r.end, price_per_hour_cents: cents(r.price), priority: parseInt(r.priority || '0', 10) }));
      const saved = await rpc<OperatorArea>('operator_save_area', {
        p_area_id: draft.id, p_name: draft.name, p_level: draft.level, p_geojson: geometry,
        p_max_stay: draft.maxStay ? parseInt(draft.maxStay, 10) : null, p_active: draft.active,
        p_plan: { name: draft.planName || `${draft.name} rate`, min_charge_cents: cents(draft.minCents), daily_max_cents: draft.dailyMax ? cents(draft.dailyMax) : null, grace_minutes: parseInt(draft.grace || '0', 10), rules },
      });
      let final = saved;
      if ((draft.closing.trim() || '') !== (saved.closing_time ?? '')) final = await rpc<OperatorArea>('operator_set_area_hours', { p_area_id: saved.id, p_closing_time: draft.closing.trim() });
      const spaces = draft.spaces.trim() ? parseInt(draft.spaces.trim(), 10) : null;
      if (spaces !== (final.total_spaces ?? null)) final = await rpc<OperatorArea>('operator_set_area_capacity', { p_area_id: saved.id, p_total_spaces: spaces });
      await load();
      open(toDraft(final), false);
      setStamp((n) => n + 1);
      setMsg(saved.active ? 'Saved. It is published, so drivers see the change right away. Cars already parked keep the old price until they leave.' : 'Saved as a draft. Drivers cannot see it until you publish.');
    } catch (e) { setError(areaError(e)); } finally { setSaving(false); }
  }

  async function archive() {
    if (!draft?.id) return;
    if (!window.confirm(`Archive "${draft.name}"? Drivers and this list will no longer show it. Receipts and history are kept. This cannot be undone from the console.`)) return;
    setSaving(true); setError(''); setMsg('');
    try { await rpc('operator_archive_area', { p_area_id: draft.id }); await load(); open(null); }
    catch (e) { setError(areaError(e)); } finally { setSaving(false); }
  }

  // Import a shape drawn elsewhere (GeoJSON Feature, FeatureCollection or bare geometry). The first polygon is used;
  // outlines with far more corners than a lot needs are simplified to 30 cm so they stay editable.
  async function importFile(f: File | undefined) {
    if (!f) return;
    setError(''); setMsg('');
    try {
      const j = JSON.parse(await f.text()) as { type?: string; features?: unknown[]; geometry?: unknown; properties?: { name?: string } };
      const feats = (j.type === 'FeatureCollection' ? j.features ?? [] : [j]) as { type?: string; geometry?: AreaGeometry; properties?: { name?: string }; coordinates?: unknown }[];
      const hit = feats.map((x) => ({ g: (x.type === 'Feature' ? x.geometry : x) as AreaGeometry | undefined, name: x.properties?.name })).find((x) => x.g && (x.g.type === 'Polygon' || x.g.type === 'MultiPolygon'));
      if (!hit?.g) throw new Error('no_polygon');
      let v = verticesOf(hit.g).vertices;
      const before = v.length;
      if (v.length > 300) v = simplifyVertices(v, 0.3);
      open({ ...blankDraft(), name: hit.name ?? f.name.replace(/\.(geo)?json$/i, ''), geometry: null });
      dispatch({ type: 'load', vertices: v });
      setFocusKey(`import:${Date.now()}`);
      setMsg(`${feats.length > 1 ? `Imported the first of ${feats.length} shapes` : 'Imported'}${before !== v.length ? `, simplified from ${before} to ${v.length} corners (within 30 cm)` : ''}. Check it on the map, set the rates, then save.`);
    } catch {
      setError('That file is not GeoJSON with a polygon. Export the area as GeoJSON (WGS84, longitude then latitude) and try again.');
    }
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setRule = (i: number, patch: Partial<Draft['rules'][number]>) => setDraft((d) => (d ? { ...d, rules: d.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : d));
  const serverBlocks = check != null && !check.valid && (draft?.active || check.problems.some((p) => p !== 'area_overlaps_other_operator'));
  const canSave = !!draft && !!geometry && draft.name.trim().length >= 2 && (report ? report.valid : !!geometry) && !serverBlocks;

  return (
    <div className="grid">
      <h2 style={{ margin: 0 }}>Areas &amp; rates</h2>
      <p className="muted" style={{ margin: 0 }}>Open an area to edit it, or start a new one. Draw at street zoom: click to place corners (they snap to nearby corners and edges), click the first corner to finish. Drag corners to adjust, click the small dots to add a corner, right-click a corner to remove it.</p>
      <div className="split">
        <div className="grid" style={{ gap: 8 }}>
          {draft ? (
            <div className="toolbar" role="toolbar" aria-label="Drawing tools">
              <div className="seg">
                <button type="button" className={ed.tool === 'polygon' ? 'on' : ''} onClick={() => dispatch({ type: 'tool', tool: 'polygon' })} title="Click each corner, then the first corner again">Outline</button>
                <button type="button" className={ed.tool === 'rectangle' ? 'on' : ''} onClick={() => dispatch({ type: 'tool', tool: 'rectangle' })} title="Click two corners along one side, then a third point for the depth">Rectangle (3 clicks)</button>
              </div>
              <button type="button" className="tool" onClick={() => dispatch({ type: 'undo' })} disabled={!ed.past.length && !ed.pending.length} title="Undo (Ctrl+Z)">Undo</button>
              <button type="button" className="tool" onClick={() => dispatch({ type: 'redo' })} disabled={!ed.future.length} title="Redo (Ctrl+Y)">Redo</button>
              {!ed.closed && ed.vertices.length >= 3 ? <button type="button" className="tool" onClick={() => dispatch({ type: 'close' })} title="Enter">Finish shape</button> : null}
              <button type="button" className="tool" onClick={() => dispatch({ type: 'clear' })} disabled={!ed.vertices.length && !ed.pending.length}>Start over</button>
              <label className="check"><input type="checkbox" checked={snapping} onChange={(e) => setSnapping(e.target.checked)} /> Snap</label>
              <label className="check"><input type="checkbox" checked={squareCorners} onChange={(e) => setSquareCorners(e.target.checked)} /> Square corners</label>
            </div>
          ) : null}
          <MapEditor areas={areas} editingId={draft?.id ?? null} level={level} state={ed} dispatch={dispatch} active={!!draft}
            onSelect={(id) => { const a = areas.find((x) => x.id === id); if (a) open(toDraft(a)); }}
            focusKey={focusKey} squareCorners={squareCorners} snapping={snapping} />
          {draft ? (
            <div className="geo" aria-live="polite">
              {!ed.vertices.length ? (
                <div className="muted">{ed.tool === 'rectangle' ? `Rectangle: click the first corner (${ed.pending.length}/3).` : 'Click the map to place the first corner.'}</div>
              ) : (
                <div className="metrics">
                  <div><span>Size</span><b>{report ? fmtM2(report.areaM2) : '–'}</b></div>
                  <div><span>Perimeter</span><b>{report ? fmtM(report.perimeterM) : '–'}</b></div>
                  <div><span>Narrowest</span><b>{report ? fmtM(report.minWidthM) : '–'}</b></div>
                  <div><span>Corners</span><b>{ed.vertices.length}</b></div>
                  <div><span>Status</span><b className={!ed.closed ? 'warn' : report?.valid ? 'ok' : 'error'}>{!ed.closed ? 'Not finished' : report?.valid ? 'Valid' : 'Fix below'}</b></div>
                </div>
              )}
              {parts.extra && !edited ? <div className="warn">This area has {parts.extra + 1} separate parts. Editing reshapes the first part only; the others are dropped when you save an edit.</div> : null}
              {parts.holes && !edited ? <div className="warn">This area has {parts.holes} hole(s). Editing keeps only the outer outline.</div> : null}
              {report?.issues.map((i) => <div key={i.code} className={i.severity === 'error' ? 'error' : 'warn'}>{i.message}</div>)}
              {check?.overlaps.filter((o) => o.same_operator).map((o) => <div key={o.name} className="warn">Overlaps your area “{o.name}” by {fmtM2(o.overlap_m2)}. Where two areas overlap, drivers are charged the rate of the smaller one.</div>)}
              {check?.overlaps.filter((o) => !o.same_operator && o.published).map((o) => <div key={o.name} className="error">Overlaps another operator's published area by {fmtM2(o.overlap_m2)}. It cannot be published until the edge is moved.</div>)}
              {ed.closed && report?.valid && check && !check.overlaps.length ? <div className="ok">Checked with the server: no overlap with other areas.</div> : null}
            </div>
          ) : null}
        </div>
        <div className="grid">
          {!draft ? (
            <div className="card list">
              <h3>Areas ({areas.length})</h3>
              {areas.map((a) => <button key={a.id} onClick={() => open(toDraft(a))}><b>{a.name}</b> <span className="muted">· {a.level === 3 ? 'area' : 'zone'} · {fmtM2(geometryAreaM2(a.geometry))} · {a.total_spaces != null ? ((a.available ?? 0) === 0 ? <span className="error">full ({a.occupied}/{a.total_spaces})</span> : `${a.occupied ?? 0}/${a.total_spaces} parked`) : `${a.occupied ?? 0} parked`}</span> <span className={`pill ${a.active ? '' : 'grey'}`} style={{ float: 'right' }}>{a.active ? 'Published' : 'Draft'}</span></button>)}
              {!areas.length ? <div className="muted">No areas yet. Start a new one.</div> : null}
            </div>
          ) : (
            <div className="card grid">
              <h3>{draft.id ? 'Edit area' : 'New area'} <span className={`pill ${draft.active ? '' : 'grey'}`} style={{ float: 'right', textTransform: 'none', letterSpacing: 0 }}>{draft.active ? 'Published' : 'Draft'}</span></h3>
              <div><label>Name</label><input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="King St W zone" /></div>
              <div className="row">
                <div><label>Type</label><select value={draft.level} onChange={(e) => set('level', Number(e.target.value) as 2 | 3)}><option value={3}>Parking area (lot / street)</option><option value={2}>City zone (fallback)</option></select></div>
                <div><label>Max stay (min)</label><input value={draft.maxStay} onChange={(e) => set('maxStay', e.target.value)} placeholder="none" inputMode="numeric" /></div>
                <div><label>Closes at</label><input value={draft.closing} onChange={(e) => set('closing', e.target.value)} placeholder="never" aria-label="Closing time, 24-hour HH:MM" /></div>
                <div><label>Spaces</label><input value={draft.spaces} onChange={(e) => set('spaces', e.target.value.replace(/[^0-9]/g, ''))} placeholder="not counted" inputMode="numeric" aria-label="Number of parking spaces, empty if not counted" /></div>
              </div>
              {(() => {
                const a = areas.find((x) => x.id === draft.id);
                return a && a.total_spaces != null
                  ? <p className={(a.available ?? 0) === 0 ? 'error' : 'muted'} style={{ margin: 0, fontSize: 13 }}>Now {a.occupied ?? 0} parked, {a.available ?? 0} free. When every space is taken, drivers see “Full” and the server refuses new sessions; ending a session frees its space at once.</p>
                  : <p className="muted" style={{ margin: 0, fontSize: 13 }}>Spaces are counted per area (phone GPS cannot tell which bay a car is in): each running session uses one. Leave empty for streets and zones you do not count.</p>;
              })()}
              <div className="row">
                <div><label>Minimum charge ($)</label><input value={draft.minCents} onChange={(e) => set('minCents', e.target.value)} inputMode="decimal" /></div>
                <div><label>Daily max ($)</label><input value={draft.dailyMax} onChange={(e) => set('dailyMax', e.target.value)} placeholder="none" inputMode="decimal" /></div>
                <div><label>Free minutes</label><input value={draft.grace} onChange={(e) => set('grace', e.target.value)} inputMode="numeric" /></div>
              </div>
              <label style={{ margin: 0 }}>Hourly rates</label>
              {draft.rules.map((r, i) => (
                <div key={i} className="card" style={{ padding: 10, display: 'grid', gap: 8 }}>
                  <div className="days">{DAYS.map((d, n) => <button key={n} type="button" className={r.days.includes(n + 1) ? 'on' : ''} onClick={() => setRule(i, { days: r.days.includes(n + 1) ? r.days.filter((x) => x !== n + 1) : [...r.days, n + 1].sort() })}>{d}</button>)}</div>
                  <div className="row">
                    <div><label>From</label><input value={r.start} onChange={(e) => setRule(i, { start: e.target.value })} placeholder="08:00" /></div>
                    <div><label>To</label><input value={r.end} onChange={(e) => setRule(i, { end: e.target.value })} placeholder="24:00" /></div>
                    <div><label>$ / hour</label><input value={r.price} onChange={(e) => setRule(i, { price: e.target.value })} inputMode="decimal" /></div>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>{formatDays(r.days)} {r.start}-{r.end} <button type="button" className="btn danger" style={{ padding: '2px 8px', float: 'right' }} onClick={() => set('rules', draft.rules.filter((_, j) => j !== i))}>Remove</button></div>
                </div>
              ))}
              <button type="button" className="btn secondary" onClick={() => set('rules', [...draft.rules, { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00', price: '3.00', priority: '0' }])}>+ Add rate line</button>
              <p className="muted" style={{ margin: 0, fontSize: 13 }}>{draft.active ? 'This area is live: every driver app can see and use it.' : 'Draft: only your staff can see it. Save, check it on the map, then publish.'}</p>
              {!geometry ? <div className="error">{ed.vertices.length ? 'Finish the shape on the map (click the first corner).' : 'Draw the area on the map first.'}</div> : null}
              {error ? <div className="error">{error}</div> : null}
              {msg ? <div className="ok">{msg}</div> : null}
              <div className="row">
                <button className={draft.active || !draft.id ? 'btn' : 'btn secondary'} disabled={saving || !canSave} onClick={save}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Save draft'}</button>
                {draft.id ? <button className={draft.active ? 'btn danger' : 'btn'} disabled={saving || edited} title={edited ? 'Save the outline first' : undefined} onClick={() => publish(!draft.active)}>{draft.active ? 'Unpublish' : 'Publish'}</button> : null}
                <button className="btn secondary" onClick={() => open(null, false)}>Close</button>
              </div>
              {draft.id ? <Versions areaId={draft.id} stamp={stamp} /> : null}
              {draft.id && !draft.active ? <button type="button" className="linkish" disabled={saving} onClick={archive}>Archive this area</button> : null}
            </div>
          )}
          {!draft ? <button className="btn" onClick={() => open(blankDraft())}>+ New area</button> : null}
          {!draft ? <label className="btn secondary filebtn">Import GeoJSON<input type="file" accept=".json,.geojson,application/geo+json,application/json" onChange={(e) => { void importFile(e.target.files?.[0]); e.target.value = ''; }} /></label> : null}
          {msg && !draft ? <div className="ok">{msg}</div> : null}
          {error && !draft ? <div className="error">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

interface StaffRow { id: string; email: string; full_name: string; role: string; operator_id: string | null; operator_name: string | null; is_me: boolean }
const ROLE_INFO: { id: 'driver' | 'officer' | 'operator_admin'; title: string; what: string }[] = [
  { id: 'driver', title: 'Driver', what: 'Parks and pays in the app. Everyone starts here. No console access.' },
  { id: 'officer', title: 'Officer', what: 'Uses the ParkPay Enforce app to check plates and issue tickets.' },
  { id: 'operator_admin', title: 'Operator admin', what: 'Signs in to this console: areas, rates, reports, refunds, staff.' },
];
const STAFF_ERRORS: Record<string, string> = {
  user_not_found: 'No account with that email. The person must first create an account in the ParkPay app.',
  cannot_change_own_role: 'You cannot change your own role. Ask another admin.',
  operator_required: 'Choose which operator this person works for.',
  forbidden: 'Your role is not allowed to make this change.',
};
const staffError = (e: unknown) => { const m = (e as Error).message; const k = Object.keys(STAFF_ERRORS).find((x) => m.includes(x)); return k ? STAFF_ERRORS[k] : m; };

/** People & roles: who has access, and one dropdown to change it. */
function Staff({ me }: { me: Profile }) {
  const isPlatform = me.role === 'platform_admin';
  const [rows, setRows] = useState<StaffRow[] | null>(null);
  const [ops, setOps] = useState<{ id: string; name: string }[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'officer' | 'operator_admin'>('officer');
  const [opId, setOpId] = useState(me.operator_id ?? '');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const roles = ROLE_INFO.filter((r) => isPlatform || r.id !== 'operator_admin');

  const load = useCallback(async () => {
    try { setRows(await rpc<StaffRow[]>('operator_staff')); } catch (e) { setError(staffError(e)); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (isPlatform) rpc<{ id: string; name: string }[]>('admin_operators').then((o) => { setOps(o); setOpId((cur) => cur || o[0]?.id || ''); }).catch(() => undefined); }, [isPlatform]);

  async function change(who: string, to: string, operator: string | null) {
    setMsg(''); setError(''); setBusy(who);
    try {
      await rpc('set_staff_role', { p_email: who, p_role: to, p_operator_id: operator });
      setMsg(to === 'driver' ? `${who} is a driver again and no longer has staff access.` : `${who} is now ${to === 'officer' ? 'an officer' : 'an operator admin'}. They see the change the next time they open the app or console.`);
      await load();
    } catch (e) { setError(staffError(e)); } finally { setBusy(''); }
  }

  return (
    <div className="grid" style={{ maxWidth: 860 }}>
      <h2 style={{ margin: 0 }}>People &amp; roles</h2>
      <div className="grid cards">
        {roles.map((r) => <div key={r.id} className="card"><h3>{r.title}</h3><div style={{ fontSize: 14 }}>{r.what}</div></div>)}
      </div>

      <div className="card grid">
        <h3>Give someone access</h3>
        <p className="muted" style={{ margin: 0 }}>1. They create an account in the ParkPay app (drivers) or the ParkPay Enforce app (officers). 2. You type their email here and pick a role.</p>
        <div className="row">
          <div style={{ flex: 2 }}><label htmlFor="st-email">Their email</label><input id="st-email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="person@example.com" /></div>
          <div><label htmlFor="st-role">Role</label><select id="st-role" value={role} onChange={(e) => setRole(e.target.value as 'officer' | 'operator_admin')}>{roles.filter((r) => r.id !== 'driver').map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select></div>
          {isPlatform ? <div><label htmlFor="st-op">Operator</label><select id="st-op" value={opId} onChange={(e) => setOpId(e.target.value)}>{ops.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div> : null}
          <button className="btn" style={{ flex: '0 0 auto', minWidth: 'max-content', whiteSpace: 'nowrap' }} disabled={!email.includes('@') || !!busy} onClick={async () => { await change(email.trim().toLowerCase(), role, isPlatform ? opId || null : null); setEmail(''); }}>Give access</button>
        </div>
        {error ? <div className="error" role="alert">{error}</div> : null}
        {msg ? <div className="ok" role="status">{msg}</div> : null}
      </div>

      <div className="card" style={{ overflowX: 'auto' }}>
        <h3>Who has access now</h3>
        <table>
          <thead><tr><th>Name</th><th>Email</th>{isPlatform ? <th>Operator</th> : null}<th>Role</th></tr></thead>
          <tbody>
            {(rows ?? []).map((u) => {
              const locked = u.is_me || u.role === 'platform_admin' || (!isPlatform && u.role === 'operator_admin');
              return (
                <tr key={u.id}>
                  <td><b>{u.full_name}</b>{u.is_me ? <span className="muted"> (you)</span> : null}</td>
                  <td>{u.email}</td>
                  {isPlatform ? <td>{u.operator_name ?? <span className="muted">all operators</span>}</td> : null}
                  <td>
                    {locked ? (
                      <span className="pill">{u.role === 'platform_admin' ? 'Platform admin' : u.role === 'operator_admin' ? 'Operator admin' : 'Officer'}</span>
                    ) : (
                      <select aria-label={`Role of ${u.full_name}`} value={u.role} disabled={busy === u.email} style={{ maxWidth: 200 }}
                        onChange={(e) => { const to = e.target.value; if (to === 'driver' && !window.confirm(`Remove staff access from ${u.full_name}?`)) return; void change(u.email, to, u.operator_id); }}>
                        {roles.map((r) => <option key={r.id} value={r.id}>{r.id === 'driver' ? 'Driver (remove access)' : r.title}</option>)}
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows && rows.length === 0 ? <tr><td colSpan={isPlatform ? 4 : 3} className="muted">Nobody has staff access yet.</td></tr> : null}
            {!rows ? <tr><td colSpan={isPlatform ? 4 : 3} className="muted">Loading…</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
