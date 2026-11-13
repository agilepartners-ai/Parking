import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatMoney, formatDays, type AreaGeometry, type ParkingArea, type RateRule } from '@parkpay/shared';
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
const TAB_NAMES: Record<Tab, string> = { dashboard: 'Dashboard', areas: 'Areas & rates', sessions: 'Sessions', tickets: 'Tickets', staff: 'Staff', audit: 'Audit log', platform: 'Platform' };

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
        {tab === 'dashboard' ? <Dashboard /> : tab === 'areas' ? <Areas /> : tab === 'sessions' ? <Sessions /> : tab === 'tickets' ? <Citations /> : tab === 'audit' ? <Audit /> : tab === 'platform' ? <Platform /> : <Staff />}
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
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try {
      setError('');
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
  id: string | null; name: string; level: 2 | 3; maxStay: string; active: boolean;
  planName: string; minCents: string; dailyMax: string; grace: string;
  rules: { days: number[]; start: string; end: string; price: string; priority: string }[];
  geometry: AreaGeometry | null;
}

const blankDraft = (): Draft => ({
  id: null, name: '', level: 3, maxStay: '', active: false, planName: '', minCents: '1.00', dailyMax: '', grace: '5',
  rules: [{ days: [1, 2, 3, 4, 5, 6, 7], start: '08:00', end: '24:00', price: '3.00', priority: '0' }], geometry: null,
});

function toDraft(a: OperatorArea): Draft {
  return {
    id: a.id, name: a.name, level: a.level === 2 ? 2 : 3, maxStay: a.max_stay_minutes ? String(a.max_stay_minutes) : '', active: a.active,
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
  area_not_found: 'That area belongs to another operator.',
  operator_required: 'Your account is not linked to an operator. A platform admin edits an existing area, or assigns you to an operator first.',
};
const areaError = (e: unknown) => { const m = (e as Error).message; const k = Object.keys(AREA_ERRORS).find((x) => m.includes(x)); return k ? AREA_ERRORS[k] : m.includes('no_rate_plan') ? 'Add at least one hourly rate and save before publishing.' : m; };
const fmtArea = (m2: number) => (m2 >= 1e6 ? `${(m2 / 1e6).toFixed(2)} km²` : m2 >= 10000 ? `${(m2 / 10000).toFixed(2)} ha` : `${Math.round(m2).toLocaleString()} m²`);

const cents = (s: string) => Math.round(parseFloat(s || '0') * 100);

function Areas() {
  const [areas, setAreas] = useState<OperatorArea[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [stamp, setStamp] = useState(0);
  const [check, setCheck] = useState<AreaCheck | null>(null);

  // Ask the server about the shape while it is being drawn: size, limits and overlaps with other areas.
  const draftGeo = draft?.geometry ?? null; const draftId = draft?.id ?? null; const draftLevel = draft?.level ?? 3;
  useEffect(() => {
    if (!draftGeo) { setCheck(null); return; }
    let stale = false;
    const id = setTimeout(() => {
      rpc<AreaCheck>('operator_check_area', { p_area_id: draftId, p_level: draftLevel, p_geojson: draftGeo }).then((c) => { if (!stale) setCheck(c); }).catch(() => { if (!stale) setCheck(null); });
    }, 300);
    return () => { stale = true; clearTimeout(id); };
  }, [draftGeo, draftId, draftLevel]);

  async function publish(on: boolean) {
    if (!draft?.id) return;
    setSaving(true); setError(''); setMsg('');
    try {
      const a = await rpc<OperatorArea>('operator_publish_area', { p_area_id: draft.id, p_publish: on });
      await load(); setDraft((d) => (d ? { ...d, active: a.active } : d)); setStamp((n) => n + 1);
      setMsg(on ? 'Published. Every driver app shows this area the next time it loads areas (within seconds).' : 'Unpublished. Drivers no longer see it; running sessions are not affected.');
    } catch (e) { setError(areaError(e)); } finally { setSaving(false); }
  }

  const load = useCallback(async () => { try { setAreas(await rpc<OperatorArea[]>('operator_areas')); } catch (e) { setError((e as Error).message); } }, []);
  useEffect(() => { void load(); }, [load]);

  const selected = draft?.id ?? null;
  const shownAreas = useMemo(() => areas.map((a) => (a.id === draft?.id && draft.geometry ? { ...a, geometry: draft.geometry } : a)), [areas, draft?.id, draft?.geometry]);

  function onGeometry(g: AreaGeometry, isNew: boolean) {
    setMsg(''); setError('');
    // A fresh drawing never replaces the outline of the area that happens to be open: it starts a new draft
    // (or reshapes a draft that has not been saved yet). Only dragging corners edits the open area.
    setDraft((d) => (d && (!isNew || !d.id) ? { ...d, geometry: g } : { ...blankDraft(), geometry: g }));
  }

  async function save() {
    if (!draft || !draft.geometry) return;
    setSaving(true); setError(''); setMsg('');
    try {
      const rules: RateRule[] = draft.rules.map((r) => ({ days_of_week: r.days, start_time: r.start, end_time: r.end, price_per_hour_cents: cents(r.price), priority: parseInt(r.priority || '0', 10) }));
      const saved = await rpc<OperatorArea>('operator_save_area', {
        p_area_id: draft.id, p_name: draft.name, p_level: draft.level, p_geojson: draft.geometry,
        p_max_stay: draft.maxStay ? parseInt(draft.maxStay, 10) : null, p_active: draft.active,
        p_plan: { name: draft.planName || `${draft.name} rate`, min_charge_cents: cents(draft.minCents), daily_max_cents: draft.dailyMax ? cents(draft.dailyMax) : null, grace_minutes: parseInt(draft.grace || '0', 10), rules },
      });
      await load();
      setDraft(toDraft(saved));
      setStamp((n) => n + 1);
      setMsg(saved.active ? 'Saved. It is published, so drivers see the change right away. Cars already parked keep the old price until they leave.' : 'Saved as a draft. Drivers cannot see it until you publish.');
    } catch (e) { setError(areaError(e)); } finally { setSaving(false); }
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setRule = (i: number, patch: Partial<Draft['rules'][number]>) => setDraft((d) => (d ? { ...d, rules: d.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : d));

  return (
    <div className="grid">
      <h2 style={{ margin: 0 }}>Areas &amp; rates</h2>
      <p className="muted" style={{ margin: 0 }}>Click an area to edit its rates and drag its corners. To add one, draw a polygon or rectangle with the tools on the left of the map.</p>
      <div className="split">
        <MapEditor areas={shownAreas} selectedId={selected} draftGeometry={draft && !draft.id ? draft.geometry : null}
          onSelect={(id) => { const a = areas.find((x) => x.id === id); if (a) { setDraft(toDraft(a)); setMsg(''); setError(''); } }} onGeometry={onGeometry} />
        <div className="grid">
          {!draft ? (
            <div className="card list">
              <h3>Areas ({areas.length})</h3>
              {areas.map((a) => <button key={a.id} onClick={() => setDraft(toDraft(a))}><b>{a.name}</b> <span className="muted">· {a.level === 3 ? 'area' : 'zone'}</span> <span className={`pill ${a.active ? '' : 'grey'}`} style={{ float: 'right' }}>{a.active ? 'Published' : 'Draft'}</span></button>)}
            </div>
          ) : (
            <div className="card grid">
              <h3>{draft.id ? 'Edit area' : 'New area'} <span className={`pill ${draft.active ? '' : 'grey'}`} style={{ float: 'right', textTransform: 'none', letterSpacing: 0 }}>{draft.active ? 'Published' : 'Draft'}</span></h3>
              <div><label>Name</label><input value={draft.name} onChange={(e) => set('name', e.target.value)} placeholder="King St W zone" /></div>
              <div className="row">
                <div><label>Type</label><select value={draft.level} onChange={(e) => set('level', Number(e.target.value) as 2 | 3)}><option value={3}>Parking area (lot / street)</option><option value={2}>City zone (fallback)</option></select></div>
                <div><label>Max stay (min)</label><input value={draft.maxStay} onChange={(e) => set('maxStay', e.target.value)} placeholder="none" inputMode="numeric" /></div>
              </div>
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
              {!draft.geometry ? <div className="error">Draw the area on the map first.</div> : null}
              {check ? (
                <div className="geo" aria-live="polite">
                  <div><b>Size:</b> {fmtArea(check.area_m2)}</div>
                  {check.problems.map((p) => <div key={p} className={p === 'self_intersecting' ? 'warn' : 'error'}>{AREA_ERRORS[p] ?? p}</div>)}
                  {check.overlaps.filter((o) => o.same_operator).map((o) => <div key={o.name} className="warn">Overlaps your area “{o.name}” by {fmtArea(o.overlap_m2)}. Where two areas overlap, drivers are charged the rate of the smaller one.</div>)}
                  {check.valid && !check.problems.length && !check.overlaps.length ? <div className="ok">No overlap with other areas.</div> : null}
                </div>
              ) : null}
              {error ? <div className="error">{error}</div> : null}
              {msg ? <div className="ok">{msg}</div> : null}
              <div className="row">
                <button className={draft.active || !draft.id ? 'btn' : 'btn secondary'} disabled={saving || !draft.geometry || draft.name.trim().length < 2 || (check != null && !check.valid && (draft.active || check.problems.some((p) => p !== 'area_overlaps_other_operator')))} onClick={save}>{saving ? 'Saving…' : draft.id ? 'Save changes' : 'Save draft'}</button>
                {draft.id ? <button className={draft.active ? 'btn danger' : 'btn'} disabled={saving} onClick={() => publish(!draft.active)}>{draft.active ? 'Unpublish' : 'Publish'}</button> : null}
                <button className="btn secondary" onClick={() => { setDraft(null); setError(''); setMsg(''); }}>Close</button>
              </div>
              {draft.id ? <Versions areaId={draft.id} stamp={stamp} /> : null}
            </div>
          )}
          {!draft ? <button className="btn secondary" onClick={() => setDraft(blankDraft())}>+ New area (then draw it)</button> : null}
          {error && !draft ? <div className="error">{error}</div> : null}
        </div>
      </div>
    </div>
  );
}

function Staff() {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'officer' | 'driver'>('officer');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  async function apply() {
    setMsg(''); setError('');
    try { await rpc('operator_set_user_role', { p_email: email, p_role: role }); setMsg(`${email} is now ${role === 'officer' ? 'an officer' : 'a driver'}. They see the change when they reopen the app.`); }
    catch (e) { setError((e as Error).message.includes('user_not_found') ? 'No user with that email. They must sign up in the app first.' : (e as Error).message); }
  }
  return (
    <div className="grid" style={{ maxWidth: 520 }}>
      <h2 style={{ margin: 0 }}>Staff</h2>
      <div className="card grid">
        <p className="muted" style={{ margin: 0 }}>Make an existing app user an enforcement officer for your operator (they must have signed up first), or return them to a normal driver.</p>
        <div><label>User email</label><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="officer@example.com" /></div>
        <div><label>Role</label><select value={role} onChange={(e) => setRole(e.target.value as 'officer' | 'driver')}><option value="officer">Officer</option><option value="driver">Driver</option></select></div>
        {error ? <div className="error">{error}</div> : null}
        {msg ? <div className="ok">{msg}</div> : null}
        <button className="btn" disabled={!email.includes('@')} onClick={apply}>Apply</button>
      </div>
    </div>
  );
}
