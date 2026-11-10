import React, { useState } from 'react';
import { Body, Button, Card, Empty, ErrorText, Field, H1, Label, Pill, Row, Screen, Spread } from '../../src/components/ui';
import { confirmDialog, notify } from '../../src/lib/dialog';
import { errorMessage, useApp } from '../../src/state/AppState';

export default function VehiclesScreen() {
  const { api, vehicles, refreshVehicles, activeSession } = useApp();
  const [plate, setPlate] = useState('');
  const [region, setRegion] = useState('ON');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function add() {
    setError(null);
    setLoading(true);
    try {
      await api.addVehicle({ plate, region, nickname });
      setPlate('');
      setNickname('');
      await refreshVehicles();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string, label: string) {
    if (activeSession?.vehicle_id === id) return notify('Vehicle is parked', 'End the parking session first.');
    if (!(await confirmDialog('Remove vehicle?', `${label} will be removed. Past receipts are kept.`, 'Remove', true))) return;
    try {
      await api.removeVehicle(id);
      await refreshVehicles();
    } catch (e) {
      notify('Error', errorMessage(e));
    }
  }

  return (
    <Screen>
      <H1>Vehicles</H1>
      {vehicles.length === 0 ? <Empty icon="car-outline" title="No vehicles yet" hint="Add the plate you park with." /> : null}
      {vehicles.map((v) => (
        <Card key={v.id}>
          <Spread
            left={<Body bold style={{ fontSize: 20, letterSpacing: 1.5 }}>{v.plate}</Body>}
            right={v.is_default ? <Pill text="DEFAULT" /> : <Button variant="ghost" title="Make default" onPress={async () => { await api.setDefaultVehicle(v.id); await refreshVehicles(); }} />}
          />
          <Row>
            <Body muted style={{ flex: 1 }}>{[v.plate_region, v.nickname].filter(Boolean).join(' · ') || 'No nickname'}</Body>
            <Button variant="ghost" title="Remove" onPress={() => remove(v.id, v.plate)} />
          </Row>
        </Card>
      ))}
      <Card>
        <Label>Add a vehicle</Label>
        <Field label="Licence plate" value={plate} onChangeText={setPlate} placeholder="ABCD 123" autoCapitalize="characters" autoCorrect={false} />
        <Field label="Province / state" value={region} onChangeText={setRegion} placeholder="ON" autoCapitalize="characters" maxLength={3} />
        <Field label="Nickname (optional)" value={nickname} onChangeText={setNickname} placeholder="Blue Corolla" />
        <ErrorText>{error}</ErrorText>
        <Button title="Add vehicle" icon="add" onPress={add} loading={loading} disabled={plate.trim().length < 2} />
      </Card>
    </Screen>
  );
}
