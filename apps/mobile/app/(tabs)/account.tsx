import Constants from 'expo-constants';
import React, { useState } from 'react';
import type { Role } from '@parkpay/shared';
import { backgroundSupported } from '../../src/lib/background';
import { Body, Button, Card, Chip, Field, H1, Label, Pill, Row, Screen, Spread } from '../../src/components/ui';
import { confirmDialog, notify } from '../../src/lib/dialog';
import { errorMessage, useApp } from '../../src/state/AppState';

const ROLE_LABEL: Record<Role, string> = { driver: 'Driver', officer: 'Officer', operator_admin: 'Operator admin', platform_admin: 'Platform admin' };

export default function AccountScreen() {
  const { user, mode, liveAvailable, switchMode, signOut, deleteAccount, api, refreshUser, setRole, activeSession } = useApp();
  const [name, setName] = useState(user?.full_name ?? '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api.updateName(name);
      await refreshUser();
    } catch (e) {
      notify('Could not save', errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (activeSession) return notify('You are parked', 'End your active parking session before deleting your account.');
    const ok = await confirmDialog('Delete account?', 'This removes your profile and vehicles. Past receipts stay with the operator for accounting, without your name. This cannot be undone.', 'Delete', true);
    if (!ok) return;
    try {
      await deleteAccount();
    } catch (e) {
      notify('Could not delete', errorMessage(e));
    }
  }

  return (
    <Screen>
      <H1>Account</H1>
      <Card>
        <Spread left={<Body bold>{user?.email ?? 'Demo user'}</Body>} right={<Pill text={ROLE_LABEL[user?.role ?? 'driver']} tone={user?.role === 'driver' ? 'muted' : 'info'} />} />
        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Button variant="secondary" title="Save name" onPress={save} loading={saving} disabled={name.trim() === (user?.full_name ?? '')} />
      </Card>

      <Card>
        <Label>Backend</Label>
        <Body>{mode === 'live' ? 'Live: connected to your Supabase project.' : 'Demo: everything stays on this phone.'}</Body>
        {liveAvailable ? <Button variant="secondary" title={mode === 'live' ? 'Switch to demo mode' : 'Switch to live backend'} onPress={() => switchMode(mode === 'live' ? 'demo' : 'live')} /> : <Body muted style={{ fontSize: 12 }}>Add Supabase keys (apps/mobile/.env) to enable live mode.</Body>}
      </Card>

      {mode === 'demo' ? (
        <Card>
          <Label>Demo role</Label>
          <Body muted>Try the app as an enforcement officer.</Body>
          <Row style={{ flexWrap: 'wrap' }}>
            {(['driver', 'officer'] as Role[]).map((r) => (
              <Chip key={r} text={ROLE_LABEL[r]} active={user?.role === r} onPress={() => setRole(r)} />
            ))}
          </Row>
        </Card>
      ) : (
        <Card>
          <Label>Officer access</Label>
          <Body muted>Officer and operator access is granted by an operator admin (see docs/SETUP-AND-TESTING.md).</Body>
        </Card>
      )}

      <Card>
        <Label>Reminders</Label>
        <Body muted>
          {backgroundSupported
            ? 'Background reminders are on: if you drive away without ending your session you get a notification (needs "Always" location).'
            : 'You are in Expo Go: reminders work while the app is open. Install the development build for background reminders.'}
        </Body>
      </Card>

      <Button variant="secondary" title="Sign out" icon="log-out-outline" onPress={signOut} />
      <Button variant="ghost" title="Delete my account" onPress={confirmDelete} />
      <Body muted style={{ textAlign: 'center', fontSize: 12 }}>ParkPay {Constants.expoConfig?.version ?? ''} · prototype · payments are simulated</Body>
    </Screen>
  );
}
