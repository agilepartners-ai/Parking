import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { formatMoney, type Citation, type NearbyVehicle, type PlateCheck } from '@parkpay/shared';
import TestLocation from '../../src/components/TestLocation';
import { Body, Button, Card, Chip, ErrorText, Field, Label, Pill, Row, Screen, SectionTitle, Spread } from '../../src/components/ui';
import { notify } from '../../src/lib/dialog';
import { errorMessage, useApp } from '../../src/state/AppState';

const REASONS = ['No valid payment', 'Exceeded maximum stay', 'Paid for a different area'];
const FINES = [4500, 6000, 9000];

export default function OfficerScreen() {
  const { api, fix, currentArea } = useApp();
  const [plate, setPlate] = useState('');
  const [result, setResult] = useState<PlateCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [nearby, setNearby] = useState<NearbyVehicle[]>([]);
  const [cites, setCites] = useState<Citation[]>([]);
  const [reason, setReason] = useState(REASONS[0]);
  const [fine, setFine] = useState(FINES[0]);
  const [issuing, setIssuing] = useState(false);

  const load = useCallback(async () => {
    if (!fix) return;
    try {
      setNearby(await api.officerNearby(fix.lat, fix.lng, 150));
      setCites(await api.officerCitations());
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [api, fix?.lat, fix?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function check() {
    setError(null);
    setResult(null);
    setChecking(true);
    try {
      setResult(await api.officerCheck(plate, fix?.lat, fix?.lng));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setChecking(false);
    }
  }

  async function issue() {
    if (!result) return;
    setIssuing(true);
    try {
      const c = await api.officerCite({ plate: result.plate, reason, fineCents: fine, lat: fix?.lat, lng: fix?.lng });
      notify('Citation issued', `${c.plate}: ${formatMoney(c.fine_cents, c.currency)} (${c.reason})`);
      setResult(null);
      setPlate('');
      await load();
    } catch (e) {
      notify('Could not issue citation', errorMessage(e));
    } finally {
      setIssuing(false);
    }
  }

  const tone = result?.result === 'valid' ? 'brand' : result?.result === 'wrong_area' ? 'warn' : 'danger';

  return (
    <Screen title="Officer" subtitle={currentArea ? `You are in ${currentArea.name}` : 'You are outside every parking area'}>

      <Card>
        <SectionTitle>Check a plate</SectionTitle>
        <Field label="Licence plate" value={plate} onChangeText={(v) => { setPlate(v); setResult(null); }} placeholder="DEMO123" autoCapitalize="characters" autoCorrect={false} />
        <ErrorText>{error}</ErrorText>
        <Button title="Check plate" icon="search" onPress={check} loading={checking} disabled={plate.trim().length < 2} />
      </Card>

      {result ? (
        <Card tone={tone}>
          <Pill text={result.result.replace('_', ' ')} tone={result.result === 'valid' ? 'brand' : result.result === 'wrong_area' ? 'warn' : 'danger'} />
          <Body bold style={{ fontSize: 20 }}>{result.plate}</Body>
          <Body>{result.message}</Body>
          {result.started_at ? <Body muted>Started {new Date(result.started_at).toLocaleTimeString()}</Body> : null}
          {result.result !== 'valid' ? (
            <>
              <Label style={{ marginTop: 8 }}>Citation</Label>
              <Row style={{ flexWrap: 'wrap' }}>{REASONS.map((r) => <Chip key={r} text={r} active={r === reason} onPress={() => setReason(r)} />)}</Row>
              <Row style={{ flexWrap: 'wrap' }}>{FINES.map((f) => <Chip key={f} text={formatMoney(f, 'CAD')} active={f === fine} onPress={() => setFine(f)} />)}</Row>
              <Button variant="danger" title="Issue citation" icon="document-text" onPress={issue} loading={issuing} />
            </>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Spread left={<Label>Paid vehicles within 150 m</Label>} right={<Button variant="ghost" title="Refresh" onPress={load} />} />
        {nearby.length === 0 ? <Body muted>None nearby. In demo mode, park a car first, or stand at City Hall Lot.</Body> : null}
        {nearby.map((n) => (
          <Spread key={n.session_id} left={<Body bold>{n.plate}</Body>} right={<Body muted>{n.area_name} · {new Date(n.started_at).toLocaleTimeString()}</Body>} />
        ))}
      </Card>

      <Card>
        <Label>My recent citations</Label>
        {cites.length === 0 ? <Body muted>No citations issued yet.</Body> : null}
        {cites.map((c) => (
          <Spread key={c.id} left={<Body bold>{c.plate}</Body>} right={<Body muted>{formatMoney(c.fine_cents, c.currency)} · {c.reason}</Body>} />
        ))}
      </Card>
      <TestLocation />
    </Screen>
  );
}
