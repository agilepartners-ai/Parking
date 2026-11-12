import React, { useState } from 'react';
import { Keyboard, Text, View } from 'react-native';
import { Enter, useToast } from '../../src/components/Motion';
import { Body, Button, Card, Empty, ErrorText, IconBadge, Pill, Screen, SectionTitle, Skeleton } from '../../src/components/ui';
import VehicleForm, { emptyVehicle, toNewVehicle, vehicleValid } from '../../src/components/VehicleForm';
import { confirmDialog, notify } from '../../src/lib/dialog';
import { useRefresh } from '../../src/lib/useRefresh';
import { errorMessage, useApp } from '../../src/state/AppState';
import { radius, space, type as ty, useTheme } from '../../src/theme';

export default function VehiclesScreen() {
  const t = useTheme();
  const { api, vehicles, vehiclesLoaded, refreshVehicles, activeSession } = useApp();
  const [draft, setDraft] = useState(emptyVehicle());
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const refreshControl = useRefresh(refreshVehicles);
  const toast = useToast();

  async function add() {
    setError(null);
    setLoading(true);
    try {
      await api.addVehicle(toNewVehicle(draft));
      setDraft(emptyVehicle());
      Keyboard.dismiss();
      await refreshVehicles();
      toast.show('Vehicle added');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: string, label: string) {
    if (activeSession?.vehicle_id === id) return notify('Vehicle is parked', 'End the parking session first.');
    if (!(await confirmDialog('Remove vehicle?', `${label} will be removed. Past receipts are kept.`, 'Remove', true))) return;
    setWorking(id);
    try {
      await api.removeVehicle(id);
      await refreshVehicles();
      toast.show('Vehicle removed', 'info');
    } catch (e) {
      notify('Could not remove', errorMessage(e));
    } finally {
      setWorking(null);
    }
  }

  async function makeDefault(id: string) {
    setWorking(id);
    try {
      await api.setDefaultVehicle(id);
      await refreshVehicles();
      toast.show('Default vehicle changed');
    } catch (e) {
      notify('Could not change default', errorMessage(e));
    } finally {
      setWorking(null);
    }
  }

  return (
    <Screen title="Vehicles" subtitle="The plates you park with" refreshControl={refreshControl}>
      {!vehiclesLoaded ? (
        <Card><Skeleton w="40%" h={24} /><Skeleton w="60%" h={14} /></Card>
      ) : vehicles.length === 0 ? (
        <Empty icon="car-outline" title="No vehicles yet" hint="Add the plate you park with, below." />
      ) : (
        vehicles.map((v, i) => (
          <Enter key={v.id} i={i}>
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <IconBadge name="car-sport" />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ alignSelf: 'flex-start', borderWidth: 1.5, borderColor: t.text, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ color: t.text, fontSize: 19, fontWeight: '800', letterSpacing: 2, fontVariant: ['tabular-nums'] }}>{v.plate}</Text>
                </View>
                <Text style={[ty.small, { color: t.muted }]}>{[v.plate_region, [v.colour, v.make, v.model].filter(Boolean).join(' ') || v.nickname, v.size_class && v.size_class !== 'standard' ? v.size_class : null].filter(Boolean).join(' · ') || 'No details'}</Text>
              </View>
              {v.is_default ? <Pill text="Default" /> : null}
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {!v.is_default ? <Button size="sm" variant="secondary" title="Make default" loading={working === v.id} onPress={() => makeDefault(v.id)} style={{ flex: 1 }} /> : null}
              <Button size="sm" variant="ghost" title="Remove" disabled={working === v.id} onPress={() => remove(v.id, v.plate)} style={{ flex: 1 }} />
            </View>
          </Card>
          </Enter>
        ))
      )}
      <SectionTitle>Add a vehicle</SectionTitle>
      <Card style={{ gap: space.md }}>
        <VehicleForm value={draft} onChange={setDraft} />
        <ErrorText>{error}</ErrorText>
        <Button title="Add vehicle" icon="add" onPress={add} loading={loading} disabled={!vehicleValid(draft)} />
      </Card>
      <View style={{ height: radius.sm }} />
      <Body muted style={{ fontSize: 12, textAlign: 'center' }}>Officers can check a plate against active parking sessions.</Body>
    </Screen>
  );
}
