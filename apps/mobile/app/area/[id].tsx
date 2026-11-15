import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  analyzeShape, editorReducer, fmtM, fmtM2, formatDays, initialEditor, toPolygon, verticesOf,
  type AreaGeometry, type RateRule,
} from '@parkpay/shared';
import { adminApi, adminError, type AreaCheck, type OperatorArea } from '../../src/api/admin';
import AreaEditorMap, { type AreaEditorHandle } from '../../src/components/AreaEditorMap';
import { Banner, Button, Chip, Field, Pill, Row } from '../../src/components/ui';
import { confirmDialog, notify } from '../../src/lib/dialog';
import { useApp } from '../../src/state/AppState';
import { radius, space, type as ty, useTheme } from '../../src/theme';

const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
interface Rule { days: number[]; start: string; end: string; price: string }
interface Form { name: string; level: 2 | 3; maxStay: string; closing: string; minCharge: string; dailyMax: string; grace: string; rules: Rule[]; active: boolean; planName: string }
const blank = (): Form => ({ name: '', level: 3, maxStay: '', closing: '', minCharge: '1.00', dailyMax: '', grace: '5', rules: [{ days: [1, 2, 3, 4, 5, 6, 7], start: '08:00', end: '24:00', price: '3.00' }], active: false, planName: '' });
const fromArea = (a: OperatorArea): Form => ({
  name: a.name, level: a.level === 2 ? 2 : 3, maxStay: a.max_stay_minutes ? String(a.max_stay_minutes) : '', closing: a.closing_time ?? '',
  minCharge: (a.plan.min_charge_cents / 100).toFixed(2), dailyMax: a.plan.daily_max_cents != null ? (a.plan.daily_max_cents / 100).toFixed(2) : '',
  grace: String(a.plan.grace_minutes), active: a.active, planName: a.plan.name,
  rules: a.plan.rules.map((r) => ({ days: r.days_of_week, start: r.start_time, end: r.end_time, price: (r.price_per_hour_cents / 100).toFixed(2) })),
});
const cents = (s: string) => Math.round(parseFloat(s || '0') * 100);

/** Full-screen area editor: draw or reshape the outline, set the rates, save, publish. */
export default function AreaEditor() {
  const t = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const { fix, refreshLocation } = useApp();
  const mapRef = useRef<AreaEditorHandle>(null);

  const [areas, setAreas] = useState<OperatorArea[] | null>(null);
  const [area, setArea] = useState<OperatorArea | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [ed, dispatch] = useReducer(editorReducer, undefined, () => initialEditor());
  const [selected, setSelected] = useState<number | null>(null);
  const [snapping, setSnapping] = useState(true);
  const [square, setSquare] = useState(true);
  const [satellite, setSatellite] = useState(false);
  const [panel, setPanel] = useState<'shape' | 'details'>('shape');
  const [hint, setHint] = useState('');
  const [check, setCheck] = useState<AreaCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    adminApi.areas().then((list) => {
      setAreas(list);
      if (!isNew) {
        const a = list.find((x) => x.id === id);
        if (!a) { setLoadError('This area was not found, or it belongs to another operator.'); return; }
        setArea(a); setForm(fromArea(a));
        dispatch({ type: 'load', vertices: verticesOf(a.geometry).vertices });
      }
    }).catch((e) => setLoadError(adminError(e)));
  }, [id, isNew]);

  const edited = ed.past.length > 0 || ed.future.length > 0;
  const geometry: AreaGeometry | null = useMemo(() => {
    if (!edited && area) return area.geometry;
    return ed.closed && ed.vertices.length >= 3 ? toPolygon(ed.vertices) : null;
  }, [edited, area, ed.closed, ed.vertices]);
  const report = useMemo(() => (ed.vertices.length >= 3 ? analyzeShape(ed.vertices, form.level) : null), [ed.vertices, form.level]);
  const parts = verticesOf(area?.geometry);

  // Leaving with an unsaved outline asks first (back button, back gesture or the header arrow).
  type LeaveEvent = { preventDefault(): void; data: { action: unknown } };
  const navigation = useNavigation() as unknown as { addListener(ev: 'beforeRemove', cb: (e: LeaveEvent) => void): () => void; dispatch(a: unknown): void };
  const dirty = edited && !busy;
  const leaving = useRef(false); // set before our own navigation (after save or archive), which never needs the prompt
  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (!dirty || leaving.current) return;
      e.preventDefault();
      void confirmDialog('Discard changes?', 'The outline has changes that are not saved.', 'Discard', true).then((ok) => { if (ok) navigation.dispatch(e.data.action); });
    });
  }, [navigation, dirty]);

  // server check (authoritative for overlaps with other operators), debounced
  useEffect(() => {
    if (!geometry) { setCheck(null); return; }
    let stale = false;
    const h = setTimeout(() => { adminApi.checkArea(area?.id ?? null, form.level, geometry).then((c) => !stale && setCheck(c)).catch(() => !stale && setCheck(null)); }, 400);
    return () => { stale = true; clearTimeout(h); };
  }, [geometry, area?.id, form.level]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setRule = (i: number, patch: Partial<Rule>) => setForm((f) => ({ ...f, rules: f.rules.map((r, j) => (j === i ? { ...r, ...patch } : r)) }));
  const serverBlocks = check != null && !check.valid && (form.active || check.problems.some((p) => p !== 'area_overlaps_other_operator'));
  const canSave = !!geometry && form.name.trim().length >= 2 && (!report || report.valid) && !serverBlocks && form.rules.length > 0;

  async function save() {
    if (!geometry) return;
    if (form.name.trim().length < 2) { setPanel('details'); notify('Name needed', 'Give the area a name of at least 2 characters.'); return; }
    setBusy(true);
    try {
      const rules: RateRule[] = form.rules.map((r) => ({ days_of_week: r.days, start_time: r.start, end_time: r.end, price_per_hour_cents: cents(r.price), priority: 0 }));
      let saved = await adminApi.saveArea({
        id: area?.id ?? null, name: form.name.trim(), level: form.level, geometry, active: form.active,
        maxStay: form.maxStay ? parseInt(form.maxStay, 10) : null,
        plan: { name: form.planName || `${form.name.trim()} rate`, min_charge_cents: cents(form.minCharge), daily_max_cents: form.dailyMax ? cents(form.dailyMax) : null, grace_minutes: parseInt(form.grace || '0', 10), rules },
      });
      if ((form.closing.trim() || '') !== (saved.closing_time ?? '')) saved = await adminApi.setHours(saved.id, form.closing.trim());
      setArea(saved); setForm(fromArea(saved));
      dispatch({ type: 'load', vertices: verticesOf(saved.geometry).vertices });
      notify('Saved', saved.active ? 'It is published, so drivers see the change right away.' : 'Saved as a draft. Drivers cannot see it until you publish.');
      if (isNew) { leaving.current = true; router.replace(`/area/${saved.id}`); }
    } catch (e) { notify('Could not save', adminError(e)); } finally { setBusy(false); }
  }

  async function publish(on: boolean) {
    if (!area) return;
    setBusy(true);
    try {
      const a = await adminApi.publish(area.id, on);
      setArea(a); set('active', a.active);
      notify(on ? 'Published' : 'Unpublished', on ? 'Every driver app shows this area within seconds.' : 'Drivers no longer see it. Running sessions are not affected.');
    } catch (e) { notify('Could not change', adminError(e)); } finally { setBusy(false); }
  }

  async function archive() {
    if (!area) return;
    const ok = await confirmDialog('Archive area?', `"${area.name}" disappears from drivers and from your list. Receipts and history are kept. This cannot be undone in the app.`, 'Archive', true);
    if (!ok) return;
    setBusy(true);
    try { await adminApi.archive(area.id); leaving.current = true; router.back(); } catch (e) { notify('Could not archive', adminError(e)); } finally { setBusy(false); }
  }

  async function search() {
    const q = query.trim();
    if (!q) return;
    try {
      const r = await Location.geocodeAsync(q);
      if (!r.length) { setHint(`No place found for “${q}”.`); return; }
      mapRef.current?.centerOn(r[0].latitude, r[0].longitude);
      setHint('');
    } catch { setHint('Address search needs location permission and a connection.'); }
  }

  async function myLocation() {
    const f = await refreshLocation();
    if (f) mapRef.current?.centerOn(f.lat, f.lng); else setHint('Your location is not available. Allow location for this app.');
  }

  // Stable inputs for the memoised map: it redraws only when its data really changes.
  const others = useMemo(() => (areas ?? []).filter((a) => a.id !== area?.id), [areas, area?.id]);
  const startRef = useRef<{ lat: number; lng: number } | null>(null);
  if (!startRef.current && areas) {
    const first = verticesOf(others[0]?.geometry).vertices[0];
    startRef.current = fix ?? (first ? { lat: first[1], lng: first[0] } : { lat: 43.6526, lng: -79.3832 });
  }

  if (loadError) return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, padding: space.lg, gap: space.md }}><Banner tone="danger" title={loadError} /><Button title="Back" variant="secondary" onPress={() => router.back()} /></SafeAreaView>;
  if (!areas || (!isNew && !area)) return <SafeAreaView style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={t.brand} /></SafeAreaView>;

  const Tool = ({ icon, label, onPress, on, disabled, tone }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void; on?: boolean; disabled?: boolean; tone?: 'danger' }) => (
    <Pressable onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled, selected: on }}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 11, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: on ? t.brand : t.border, backgroundColor: on ? t.brandSoft : t.card, opacity: disabled ? 0.4 : pressed ? 0.7 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Ionicons name={icon} size={16} color={tone === 'danger' ? t.danger : on ? t.brand : t.text} />
      <Text style={{ fontSize: 13, fontWeight: '700', color: tone === 'danger' ? t.danger : on ? t.brand : t.text }}>{label}</Text>
    </Pressable>
  );

  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      {/* header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: space.md, paddingVertical: 8 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="Back" hitSlop={10} style={{ padding: 4 }}><Ionicons name="chevron-back" size={24} color={t.text} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[ty.heading, { color: t.text, fontSize: 18 }]} numberOfLines={1}>{isNew ? 'New area' : form.name || 'Area'}</Text>
          <Text style={[ty.small, { color: t.muted }]}>{form.active ? 'Published' : 'Draft'}{edited ? ' · unsaved changes' : ''}</Text>
        </View>
        <Button title={busy ? 'Saving' : 'Save'} size="sm" onPress={save} loading={busy} disabled={!canSave || busy} />
      </View>

      {/* tools */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: space.md, paddingBottom: 8 }} style={{ flexGrow: 0 }}>
        {!ed.closed ? <Tool icon="git-commit-outline" label="Outline" on={ed.tool === 'polygon'} onPress={() => dispatch({ type: 'tool', tool: 'polygon' })} /> : null}
        {!ed.closed ? <Tool icon="square-outline" label="Rectangle" on={ed.tool === 'rectangle'} onPress={() => dispatch({ type: 'tool', tool: 'rectangle' })} /> : null}
        <Tool icon="arrow-undo" label="Undo" disabled={!ed.past.length && !ed.pending.length} onPress={() => { dispatch({ type: 'undo' }); setSelected(null); }} />
        <Tool icon="arrow-redo" label="Redo" disabled={!ed.future.length} onPress={() => { dispatch({ type: 'redo' }); setSelected(null); }} />
        {!ed.closed && ed.vertices.length >= 3 ? <Tool icon="checkmark-done" label="Finish" onPress={() => dispatch({ type: 'close' })} /> : null}
        {selected != null ? <Tool icon="trash-outline" label="Remove corner" tone="danger" onPress={() => { dispatch({ type: 'remove', index: selected }); setSelected(null); }} /> : null}
        <Tool icon="magnet-outline" label="Snap" on={snapping} onPress={() => setSnapping((x) => !x)} />
        <Tool icon="git-compare-outline" label="Square" on={square} onPress={() => setSquare((x) => !x)} />
        <Tool icon={satellite ? 'map-outline' : 'earth'} label={satellite ? 'Map' : 'Satellite'} onPress={() => setSatellite((x) => !x)} />
        <Tool icon="refresh" label="Start over" disabled={!ed.vertices.length && !ed.pending.length} onPress={() => { dispatch({ type: 'clear' }); setSelected(null); }} />
      </ScrollView>

      {/* map */}
      <View style={{ flex: 1 }}>
        <AreaEditorMap ref={mapRef} others={others} state={ed} dispatch={dispatch} level={form.level} snapping={snapping} squareCorners={square}
          satellite={satellite} selected={selected} onSelect={setSelected} initial={startRef.current ?? { lat: 43.6526, lng: -79.3832 }} onHint={setHint} />
        <View style={{ position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: t.card, borderRadius: radius.sm, borderWidth: 1, borderColor: t.border, paddingHorizontal: 10, height: 42 }}>
            <Ionicons name="search" size={16} color={t.muted} />
            <TextInput value={query} onChangeText={setQuery} onSubmitEditing={search} returnKeyType="search" placeholder="Go to an address" placeholderTextColor={t.muted} style={{ flex: 1, color: t.text, fontSize: 16, marginLeft: 6 }} />
          </View>
          <Pressable onPress={myLocation} accessibilityLabel="Go to my location" style={{ width: 42, height: 42, borderRadius: radius.sm, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="locate" size={20} color={t.brand} />
          </Pressable>
        </View>
        {!ed.closed ? (
          <View style={{ position: 'absolute', bottom: 40, alignSelf: 'center' }}>
            <Button title={ed.tool === 'rectangle' ? `Add point ${ed.pending.length + 1} of 3 at +` : ed.vertices.length >= 3 ? 'Add corner at +' : `Add corner ${ed.vertices.length + 1} at +`} icon="add-circle" size="sm" onPress={() => mapRef.current?.addAtCrosshair()} />
          </View>
        ) : null}
      </View>

      {/* bottom panel */}
      <View style={{ backgroundColor: t.card, borderTopWidth: 1, borderColor: t.border, maxHeight: panel === 'details' ? '62%' : '40%' }}>
        <View style={{ flexDirection: 'row', gap: 6, padding: space.sm, paddingBottom: 0 }}>
          <Chip text="Shape" active={panel === 'shape'} onPress={() => setPanel('shape')} icon="shapes-outline" />
          <Chip text="Details & rates" active={panel === 'details'} onPress={() => setPanel('details')} icon="pricetag-outline" />
        </View>
        <ScrollView contentContainerStyle={{ padding: space.md, gap: space.sm, paddingBottom: space.xl }} keyboardShouldPersistTaps="handled">
          {panel === 'shape' ? (
            <>
              {!ed.vertices.length ? (
                <Text style={[ty.small, { color: t.muted }]}>
                  {ed.tool === 'rectangle' ? 'Rectangle: tap two corners along one side (for example the kerb), then a third point for the depth. Square corners at any angle.' : 'Zoom to street level. Tap the map, or move the + onto a corner and press "Add corner". Tap the first corner (orange) to finish.'}
                </Text>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
                  {[['Size', report ? fmtM2(report.areaM2) : '–'], ['Perimeter', report ? fmtM(report.perimeterM) : '–'], ['Narrowest', report ? fmtM(report.minWidthM) : '–'], ['Corners', String(ed.vertices.length)]].map(([k, v]) => (
                    <View key={k} style={{ gap: 2 }}><Text style={[ty.micro, { color: t.muted }]}>{k.toUpperCase()}</Text><Text style={{ color: t.text, fontWeight: '800', fontSize: 16, fontVariant: ['tabular-nums'] }}>{v}</Text></View>
                  ))}
                  <View style={{ gap: 2 }}><Text style={[ty.micro, { color: t.muted }]}>STATUS</Text>
                    <Pill text={!ed.closed ? 'Not finished' : report?.valid ? 'Valid' : 'Fix it'} tone={!ed.closed ? 'warn' : report?.valid ? 'brand' : 'danger'} /></View>
                </View>
              )}
              {hint ? <Text style={[ty.small, { color: t.warn }]}>{hint}</Text> : null}
              {selected != null ? <Text style={[ty.small, { color: t.muted }]}>Corner {selected + 1} selected: drag it to move, or tap Remove corner.</Text> : ed.closed ? <Text style={[ty.small, { color: t.muted }]}>Drag a corner to move it. Tap a “+” label on an edge to add a corner there. Tap a corner to select it.</Text> : null}
              {parts.extraParts && !edited ? <Banner tone="warn" title={`This area has ${parts.extraParts + 1} parts`} text="Editing reshapes the first part; the others are dropped when you save an edit." /> : null}
              {report?.issues.map((i) => <Banner key={i.code} tone={i.severity === 'error' ? 'danger' : 'warn'} title={i.message} />)}
              {check?.overlaps.filter((o) => o.same_operator).map((o) => <Banner key={o.name} tone="warn" title={`Overlaps your area “${o.name}” by ${fmtM2(o.overlap_m2)}`} text="Drivers in the overlap pay the rate of the smaller area." />)}
              {check?.overlaps.filter((o) => !o.same_operator && o.published).map((o) => <Banner key={o.name} tone="danger" title={`Overlaps another operator's published area by ${fmtM2(o.overlap_m2)}`} text="It cannot be published until the edge is moved." />)}
              {ed.closed && report?.valid && check && !check.overlaps.length ? <Text style={[ty.small, { color: t.brand, fontWeight: '700' }]}>Checked with the server: no overlap with other areas.</Text> : null}
            </>
          ) : (
            <>
              <Field label="Name" value={form.name} onChangeText={(v) => set('name', v)} placeholder="King St W lot" />
              <Row style={{ flexWrap: 'wrap' }}>
                <Chip text="Parking area" active={form.level === 3} onPress={() => set('level', 3)} />
                <Chip text="City zone (fallback)" active={form.level === 2} onPress={() => set('level', 2)} />
              </Row>
              <Row>
                <View style={{ flex: 1 }}><Field label="Max stay (min)" value={form.maxStay} onChangeText={(v) => set('maxStay', v)} placeholder="none" keyboardType="number-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Closes at" value={form.closing} onChangeText={(v) => set('closing', v)} placeholder="never" /></View>
              </Row>
              <Row>
                <View style={{ flex: 1 }}><Field label="Minimum $" value={form.minCharge} onChangeText={(v) => set('minCharge', v)} keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Daily max $" value={form.dailyMax} onChangeText={(v) => set('dailyMax', v)} placeholder="none" keyboardType="decimal-pad" /></View>
                <View style={{ flex: 1 }}><Field label="Free min" value={form.grace} onChangeText={(v) => set('grace', v)} keyboardType="number-pad" /></View>
              </Row>
              <Text style={[ty.micro, { color: t.muted }]}>HOURLY RATES</Text>
              {form.rules.map((r, i) => (
                <View key={i} style={{ borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: space.sm, gap: space.sm }}>
                  <Row style={{ gap: 4 }}>
                    {DAYS.map((d, n) => {
                      const on = r.days.includes(n + 1);
                      return (
                        <Pressable key={n} onPress={() => setRule(i, { days: on ? r.days.filter((x) => x !== n + 1) : [...r.days, n + 1].sort() })} accessibilityLabel={`Day ${n + 1}`} accessibilityState={{ selected: on }}
                          style={{ width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.brand : t.card, borderWidth: 1, borderColor: on ? t.brand : t.border }}>
                          <Text style={{ color: on ? t.brandText : t.muted, fontWeight: '800' }}>{d}</Text>
                        </Pressable>
                      );
                    })}
                  </Row>
                  <Row>
                    <View style={{ flex: 1 }}><Field label="From" value={r.start} onChangeText={(v) => setRule(i, { start: v })} placeholder="08:00" /></View>
                    <View style={{ flex: 1 }}><Field label="To" value={r.end} onChangeText={(v) => setRule(i, { end: v })} placeholder="24:00" /></View>
                    <View style={{ flex: 1 }}><Field label="$ / hour" value={r.price} onChangeText={(v) => setRule(i, { price: v })} keyboardType="decimal-pad" /></View>
                  </Row>
                  <Row style={{ justifyContent: 'space-between' }}>
                    <Text style={[ty.small, { color: t.muted }]}>{formatDays(r.days)} {r.start}-{r.end}</Text>
                    <Pressable onPress={() => set('rules', form.rules.filter((_, j) => j !== i))} hitSlop={8}><Text style={{ color: t.danger, fontWeight: '700' }}>Remove</Text></Pressable>
                  </Row>
                </View>
              ))}
              <Button variant="secondary" size="sm" icon="add" title="Add rate line" onPress={() => set('rules', [...form.rules, { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00', price: '3.00' }])} />
              {area ? <Button title={form.active ? 'Unpublish' : 'Publish'} variant={form.active ? 'danger' : 'primary'} disabled={busy || edited} onPress={() => publish(!form.active)} /> : null}
              {edited && area ? <Text style={[ty.small, { color: t.muted }]}>Save the outline before publishing.</Text> : null}
              {area && !form.active ? <Button title="Archive this area" variant="ghost" onPress={archive} /> : null}
            </>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}
