import { useCallback, useEffect, useState } from 'react';
import { formatDuration, formatMoney } from '@parkpay/shared';
import { rpc } from './supabase';

const range = (days: number) => ({ p_from: new Date(Date.now() - days * 86_400_000).toISOString(), p_to: new Date(Date.now() + 60_000).toISOString() });
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const errText = (e: unknown) => {
  const m = (e as Error).message;
  const known: Record<string, string> = {
    invalid_amount: 'That amount is more than what is left to refund.',
    reason_required: 'Write a short reason (at least 3 characters).',
    nothing_to_refund: 'This session has no captured payment to refund.',
    session_not_completed: 'Only completed sessions can be refunded.',
    citation_already_paid: 'This ticket is already paid. Refund it instead of voiding.',
    invalid_fee: 'The service fee must be between 0% and 50%.',
    invalid_timezone: 'Unknown time zone. Use a name like America/Toronto.',
    user_not_found: 'No user with that email. They must sign up in the app first.',
    forbidden: 'Your account is not allowed to do this.',
  };
  const key = Object.keys(known).find((k) => m.includes(k));
  return key ? known[key] : m;
};

function PeriodSelect({ days, onChange }: { days: number; onChange: (n: number) => void }) {
  return (
    <select value={days} onChange={(e) => onChange(Number(e.target.value))} style={{ maxWidth: 180 }} aria-label="Period">
      <option value={1}>Last 24 hours</option><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option>
    </select>
  );
}

// ---------- charts for the dashboard ---------------------------------------------------------
interface Series { by_day: { day: string; sessions: number; revenue_cents: number }[]; by_hour: { hour: number; sessions: number }[] }

function Bars({ data, label }: { data: { key: string; value: number; tip: string }[]; label: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div role="img" aria-label={label} className="bars">
      {data.map((d) => (
        <div key={d.key} className="bar" title={d.tip}>
          <div style={{ height: `${Math.max(2, Math.round((d.value / max) * 100))}%` }} />
          <span>{d.key}</span>
        </div>
      ))}
    </div>
  );
}

export function Charts({ days, currency }: { days: number; currency: string }) {
  const [s, setS] = useState<Series | null>(null);
  useEffect(() => { rpc<Series>('operator_report_series', range(days)).then(setS).catch(() => setS({ by_day: [], by_hour: [] })); }, [days]);
  if (!s) return <div className="muted">Loading charts…</div>;
  const hours = Array.from({ length: 24 }, (_, h) => s.by_hour.find((x) => x.hour === h)?.sessions ?? 0);
  return (
    <div className="split" style={{ gridTemplateColumns: '1fr 1fr' }}>
      <div className="card">
        <h3>Revenue per day</h3>
        {s.by_day.length ? <Bars label="Revenue per day" data={s.by_day.slice(-31).map((d) => ({ key: d.day.slice(5), value: d.revenue_cents, tip: `${d.day}: ${formatMoney(d.revenue_cents, currency)} from ${d.sessions} sessions` }))} /> : <div className="muted">No completed sessions in this period.</div>}
      </div>
      <div className="card">
        <h3>Sessions started, by hour of day</h3>
        <Bars label="Sessions by hour of day" data={hours.map((n, h) => ({ key: h % 3 === 0 ? String(h) : '', value: n, tip: `${h}:00 - ${n} sessions` }))} />
      </div>
    </div>
  );
}

// ---------- sessions: look-up, refund, CSV ---------------------------------------------------
interface SessionRow {
  id: string; receipt_no: string | null; plate: string; area_name: string; status: string; started_at: string; ended_at: string | null;
  duration_minutes: number | null; fee_cents: number | null; service_fee_cents: number | null; operator_payout_cents: number | null; currency: string; refunded_cents: number;
}

function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const esc = (v: string | number | null) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const blob = new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export function Sessions() {
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [error, setError] = useState('');
  const [refund, setRefund] = useState<SessionRow | null>(null);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setError(''); setRows(await rpc<SessionRow[]>('operator_sessions', { ...range(days), p_search: search || null })); }
    catch (e) { setError(errText(e)); }
  }, [days, search]);
  useEffect(() => { const id = setTimeout(() => void load(), 250); return () => clearTimeout(id); }, [load]);

  async function doRefund() {
    if (!refund) return;
    setBusy(true); setError('');
    try {
      await rpc('operator_refund_session', { p_session_id: refund.id, p_amount_cents: Math.round(parseFloat(amount || '0') * 100), p_reason: reason });
      setRefund(null); setAmount(''); setReason(''); await load();
    } catch (e) { setError(errText(e)); } finally { setBusy(false); }
  }

  return (
    <div className="grid">
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0, flex: 2 }}>Sessions</h2>
        <input placeholder="Search plate or receipt no." value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search" />
        <PeriodSelect days={days} onChange={setDays} />
        <button className="btn secondary" style={{ flex: 0 }} disabled={!rows?.length} onClick={() => rows && downloadCsv(`parkpay-sessions-${new Date().toISOString().slice(0, 10)}.csv`, [
          ['receipt', 'plate', 'area', 'status', 'started', 'ended', 'minutes', 'fee', 'platform_fee', 'operator_payout', 'refunded', 'currency'],
          ...rows.map((r) => [r.receipt_no, r.plate, r.area_name, r.status, r.started_at, r.ended_at, r.duration_minutes, (r.fee_cents ?? 0) / 100, (r.service_fee_cents ?? 0) / 100, (r.operator_payout_cents ?? 0) / 100, r.refunded_cents / 100, r.currency]),
        ])}>Export CSV</button>
      </div>
      {error ? <div className="error" role="alert">{error}</div> : null}
      {refund ? (
        <div className="card grid" style={{ maxWidth: 560 }}>
          <h3>Refund {refund.receipt_no ?? refund.plate}</h3>
          <p className="muted" style={{ margin: 0 }}>Paid {formatMoney(refund.fee_cents ?? 0, refund.currency)}, already refunded {formatMoney(refund.refunded_cents, refund.currency)}. Payments are simulated for now, so this only records the refund.</p>
          <div className="row">
            <div><label>Amount ($)</label><input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={(((refund.fee_cents ?? 0) - refund.refunded_cents) / 100).toFixed(2)} /></div>
            <div style={{ flex: 2 }}><label>Reason</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Charged after leaving" /></div>
          </div>
          <div className="row">
            <button className="btn danger" disabled={busy || !amount || reason.trim().length < 3} onClick={doRefund}>{busy ? 'Refunding…' : 'Refund'}</button>
            <button className="btn secondary" onClick={() => setRefund(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Receipt</th><th>Plate</th><th>Area</th><th>Started</th><th>Time</th><th>Fee</th><th>Refunded</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.receipt_no ?? '-'}</td><td><b>{r.plate}</b></td><td>{r.area_name}</td><td>{when(r.started_at)}</td>
                <td>{r.duration_minutes != null ? formatDuration(r.duration_minutes) : '-'}</td>
                <td>{r.fee_cents != null ? formatMoney(r.fee_cents, r.currency) : '-'}</td>
                <td>{r.refunded_cents ? formatMoney(r.refunded_cents, r.currency) : '-'}</td>
                <td><span className={`pill ${r.status === 'active' ? '' : 'grey'}`}>{r.status}</span></td>
                <td>{r.status === 'completed' && (r.fee_cents ?? 0) > r.refunded_cents ? <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => { setRefund(r); setError(''); }}>Refund</button> : null}</td>
              </tr>
            ))}
            {rows && rows.length === 0 ? <tr><td colSpan={9} className="muted">No sessions match.</td></tr> : null}
            {!rows ? <tr><td colSpan={9} className="muted">Loading…</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- citations --------------------------------------------------------------------------
interface CitationRow { id: string; plate: string; area_name: string | null; reason: string; fine_cents: number; currency: string; status: string; issued_at: string; officer: string | null }

export function Citations() {
  const [days, setDays] = useState(30);
  const [rows, setRows] = useState<CitationRow[] | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => { try { setError(''); setRows(await rpc<CitationRow[]>('operator_citations', range(days))); } catch (e) { setError(errText(e)); } }, [days]);
  useEffect(() => { void load(); }, [load]);

  async function voidIt(c: CitationRow) {
    const reason = window.prompt(`Void the ticket for ${c.plate}? Write the reason:`);
    if (!reason) return;
    try { await rpc('operator_void_citation', { p_citation_id: c.id, p_reason: reason }); await load(); } catch (e) { setError(errText(e)); }
  }

  return (
    <div className="grid">
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0, flex: 3 }}>Tickets</h2>
        <PeriodSelect days={days} onChange={setDays} />
      </div>
      <p className="muted" style={{ margin: 0 }}>Tickets issued by your officers. They are platform notices to the driver until an agreement with a city gives them legal force.</p>
      {error ? <div className="error" role="alert">{error}</div> : null}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Issued</th><th>Plate</th><th>Area</th><th>Reason</th><th>Fine</th><th>Officer</th><th>Status</th><th /></tr></thead>
          <tbody>
            {(rows ?? []).map((c) => (
              <tr key={c.id}>
                <td>{when(c.issued_at)}</td><td><b>{c.plate}</b></td><td>{c.area_name ?? '-'}</td><td>{c.reason}</td>
                <td>{formatMoney(c.fine_cents, c.currency)}</td><td>{c.officer ?? '-'}</td>
                <td><span className={`pill ${c.status === 'issued' ? 'warn' : 'grey'}`}>{c.status}</span></td>
                <td>{c.status === 'issued' ? <button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => voidIt(c)}>Void</button> : null}</td>
              </tr>
            ))}
            {rows && rows.length === 0 ? <tr><td colSpan={8} className="muted">No tickets in this period.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- audit log ---------------------------------------------------------------------------
interface AuditRow { id: number; at: string; by: string; role: string | null; entity: string; entity_id: string | null; action: string; detail: unknown }

export function Audit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { rpc<AuditRow[]>('operator_audit_log', { p_limit: 300 }).then(setRows).catch((e) => setError(errText(e))); }, []);
  return (
    <div className="grid">
      <h2 style={{ margin: 0 }}>Audit log</h2>
      <p className="muted" style={{ margin: 0 }}>Who changed what, newest first. Entries cannot be edited or deleted from the console.</p>
      {error ? <div className="error" role="alert">{error}</div> : null}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>When</th><th>Who</th><th>What</th><th>Action</th><th>Detail</th></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td>{when(r.at)}</td><td>{r.by}{r.role ? <span className="muted"> · {r.role}</span> : null}</td>
                <td>{r.entity.replace('_', ' ')}</td><td><span className="pill">{r.action}</span></td>
                <td className="muted" style={{ fontSize: 12, maxWidth: 380, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.detail ? JSON.stringify(r.detail) : ''}</td>
              </tr>
            ))}
            {rows && rows.length === 0 ? <tr><td colSpan={5} className="muted">Nothing logged yet.</td></tr> : null}
            {!rows && !error ? <tr><td colSpan={5} className="muted">Loading…</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- platform admin ----------------------------------------------------------------------
interface OperatorRow { id: string; name: string; country: string; timezone: string; currency: string; service_fee_bps: number; areas: number; admins: string[] }

export function Platform() {
  const [ops, setOps] = useState<OperatorRow[] | null>(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState<{ id: string | null; name: string; country: string; timezone: string; currency: string; fee: string } | null>(null);
  const [email, setEmail] = useState('');
  const [opId, setOpId] = useState('');

  const load = useCallback(async () => { try { setOps(await rpc<OperatorRow[]>('admin_operators')); } catch (e) { setError(errText(e)); } }, []);
  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!edit) return;
    setError(''); setMsg('');
    try {
      await rpc('admin_save_operator', { p_id: edit.id, p_name: edit.name, p_country: edit.country, p_timezone: edit.timezone, p_currency: edit.currency, p_service_fee_bps: Math.round(parseFloat(edit.fee || '0') * 100) });
      setEdit(null); setMsg('Operator saved.'); await load();
    } catch (e) { setError(errText(e)); }
  }
  async function appoint() {
    setError(''); setMsg('');
    try { await rpc('admin_set_operator_admin', { p_email: email, p_operator_id: opId || null }); setMsg(opId ? `${email} is now an operator admin.` : `${email} is a driver again.`); setEmail(''); await load(); }
    catch (e) { setError(errText(e)); }
  }

  return (
    <div className="grid">
      <div className="row" style={{ alignItems: 'center' }}>
        <h2 style={{ margin: 0, flex: 4 }}>Platform</h2>
        <button className="btn" style={{ flex: 0, whiteSpace: 'nowrap' }} onClick={() => setEdit({ id: null, name: '', country: 'CA', timezone: 'America/Toronto', currency: 'CAD', fee: '8' })}>+ New operator</button>
      </div>
      {error ? <div className="error" role="alert">{error}</div> : null}
      {msg ? <div className="ok">{msg}</div> : null}
      {edit ? (
        <div className="card grid" style={{ maxWidth: 640 }}>
          <h3>{edit.id ? 'Edit operator' : 'New operator'}</h3>
          <div className="row">
            <div style={{ flex: 2 }}><label>Name</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="City of Example Parking" /></div>
            <div><label>Service fee (%)</label><input value={edit.fee} onChange={(e) => setEdit({ ...edit, fee: e.target.value })} inputMode="decimal" /></div>
          </div>
          {!edit.id ? (
            <div className="row">
              <div><label>Country</label><input value={edit.country} maxLength={2} onChange={(e) => setEdit({ ...edit, country: e.target.value.toUpperCase() })} /></div>
              <div><label>Currency</label><input value={edit.currency} maxLength={3} onChange={(e) => setEdit({ ...edit, currency: e.target.value.toUpperCase() })} /></div>
              <div style={{ flex: 2 }}><label>Time zone</label><input value={edit.timezone} onChange={(e) => setEdit({ ...edit, timezone: e.target.value })} /></div>
            </div>
          ) : <p className="muted" style={{ margin: 0 }}>Country, currency and time zone are fixed once an operator exists, because past receipts depend on them.</p>}
          <div className="row">
            <button className="btn" disabled={edit.name.trim().length < 2} onClick={save}>Save</button>
            <button className="btn secondary" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </div>
      ) : null}
      <div className="card" style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr><th>Operator</th><th>Country</th><th>Currency</th><th>Service fee</th><th>Areas</th><th>Admins</th><th /></tr></thead>
          <tbody>
            {(ops ?? []).map((o) => (
              <tr key={o.id}>
                <td><b>{o.name}</b></td><td>{o.country}</td><td>{o.currency}</td><td>{(o.service_fee_bps / 100).toFixed(2)}%</td><td>{o.areas}</td>
                <td className="muted">{o.admins.join(', ') || 'none'}</td>
                <td><button className="btn secondary" style={{ padding: '4px 10px' }} onClick={() => setEdit({ id: o.id, name: o.name, country: o.country, timezone: o.timezone, currency: o.currency, fee: (o.service_fee_bps / 100).toString() })}>Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card grid" style={{ maxWidth: 640 }}>
        <h3>Operator admins</h3>
        <p className="muted" style={{ margin: 0 }}>Give an existing app user the console for one operator, or choose "driver" to remove access.</p>
        <div className="row">
          <div style={{ flex: 2 }}><label>User email</label><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="manager@example.com" /></div>
          <div style={{ flex: 2 }}><label>Operator</label><select value={opId} onChange={(e) => setOpId(e.target.value)}><option value="">Driver (no console access)</option>{(ops ?? []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></div>
          <button className="btn" style={{ flex: 0 }} disabled={!email.includes('@')} onClick={appoint}>Apply</button>
        </div>
      </div>
    </div>
  );
}

// ---------- area version history (used inside the area editor) ---------------------------------
interface VersionRow { version: number; action: string; at: string; by: string | null; name: string; rules: { price_per_hour_cents: number }[] | null }

export function Versions({ areaId, stamp }: { areaId: string; stamp: number }) {
  const [rows, setRows] = useState<VersionRow[]>([]);
  useEffect(() => { rpc<VersionRow[]>('operator_area_versions', { p_area_id: areaId }).then(setRows).catch(() => setRows([])); }, [areaId, stamp]);
  if (!rows.length) return null;
  return (
    <details>
      <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>History ({rows.length} changes)</summary>
      <table style={{ fontSize: 12, marginTop: 6 }}>
        <tbody>
          {rows.slice(0, 12).map((v) => (
            <tr key={v.version}>
              <td>v{v.version}</td><td><span className="pill">{v.action}</span></td><td>{when(v.at)}</td><td className="muted">{v.by ?? ''}</td>
              <td className="muted">{v.rules?.length ? `${formatMoney(Math.max(...v.rules.map((r) => r.price_per_hour_cents)), 'CAD')}/h max` : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
