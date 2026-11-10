import Constants from 'expo-constants';
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import type { Role } from '@parkpay/shared';
import { backgroundSupported } from '../../src/lib/background';
import { Body, Button, Card, Chip, Divider, Field, IconBadge, Pill, Row, Screen, SectionTitle } from '../../src/components/ui';
import { confirmDialog, notify } from '../../src/lib/dialog';
import { errorMessage, useApp } from '../../src/state/AppState';
import { space, type as ty, useTheme } from '../../src/theme';

const ROLE_LABEL: Record<Role, string> = { driver: 'Driver', officer: 'Officer', operator_admin: 'Operator admin', platform_admin: 'Platform admin' };

export default function AccountScreen() {
  const t = useTheme();
  const { user, mode, liveAvailable, switchMode, signOut, deleteAccount, api, refreshUser, setRole, activeSession } = useApp();
  const [name, setName] = useState(user?.full_name ?? '');
  const [saving, setSaving] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const initial = (user?.full_name || user?.email || 'D').trim().charAt(0).toUpperCase();

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
    <Screen title="Account">
      <Card style={{ gap: space.md }}>
        <Row style={{ gap: 14 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.brand, fontSize: 24, fontWeight: '800' }}>{initial}</Text>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[ty.heading, { color: t.text, fontSize: 18 }]} numberOfLines={1}>{user?.full_name || 'Demo user'}</Text>
            <Text style={[ty.small, { color: t.muted }]} numberOfLines={1}>{user?.email ?? 'Offline demo account'}</Text>
          </View>
          <Pill text={ROLE_LABEL[user?.role ?? 'driver']} tone={user?.role === 'driver' ? 'muted' : 'info'} />
        </Row>
        <Divider />
        <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
        <Button variant="secondary" title="Save name" onPress={save} loading={saving} disabled={name.trim() === (user?.full_name ?? '')} />
      </Card>

      <SectionTitle>Connection</SectionTitle>
      <Card style={{ gap: space.md }}>
        <Row>
          <IconBadge name={mode === 'live' ? 'cloud-done' : 'phone-portrait'} tone={mode === 'live' ? 'brand' : 'warn'} />
          <View style={{ flex: 1 }}>
            <Text style={[ty.body, { color: t.text, fontWeight: '700' }]}>{mode === 'live' ? 'Live server' : 'Demo mode'}</Text>
            <Text style={[ty.small, { color: t.muted }]}>{mode === 'live' ? 'Connected to your ParkPay project.' : 'Everything stays on this phone.'}</Text>
          </View>
        </Row>
        {liveAvailable ? (
          <Button
            variant="secondary"
            title={mode === 'live' ? 'Switch to demo mode' : 'Switch to live server'}
            loading={switching}
            onPress={async () => {
              setSwitching(true);
              try {
                await switchMode(mode === 'live' ? 'demo' : 'live');
              } finally {
                setSwitching(false);
              }
            }}
          />
        ) : (
          <Body muted style={{ fontSize: 12 }}>Add Supabase keys (apps/mobile/.env) to enable the live server.</Body>
        )}
      </Card>

      {mode === 'demo' ? (
        <>
          <SectionTitle>Try a different role</SectionTitle>
          <Card>
            <Body muted>See the app as an enforcement officer.</Body>
            <Row style={{ flexWrap: 'wrap' }}>
              {(['driver', 'officer'] as Role[]).map((r) => (
                <Chip key={r} text={ROLE_LABEL[r]} active={user?.role === r} onPress={() => setRole(r)} />
              ))}
            </Row>
          </Card>
        </>
      ) : (
        <Card>
          <Row>
            <IconBadge name="shield-checkmark" tone="info" />
            <Body muted style={{ flex: 1 }}>Officer and operator access is granted by an operator admin.</Body>
          </Row>
        </Card>
      )}

      <SectionTitle>Reminders</SectionTitle>
      <Card>
        <Row>
          <IconBadge name="notifications" tone={backgroundSupported ? 'brand' : 'muted'} />
          <Body muted style={{ flex: 1 }}>
            {backgroundSupported
              ? 'Background reminders are on. If you drive away without ending your session, you get a notification (needs "Always" location).'
              : 'You are in Expo Go: reminders work while the app is open. Install the development build for background reminders.'}
          </Body>
        </Row>
      </Card>

      <View style={{ gap: space.sm, marginTop: space.sm }}>
        <Button
          variant="secondary"
          title="Sign out"
          icon="log-out-outline"
          loading={leaving}
          onPress={async () => {
            setLeaving(true);
            try {
              await signOut();
            } finally {
              setLeaving(false);
            }
          }}
        />
        <Button variant="ghost" title="Delete my account" onPress={confirmDelete} />
      </View>
      <Body muted style={{ textAlign: 'center', fontSize: 12 }}>ParkPay {Constants.expoConfig?.version ?? ''} · prototype · payments are simulated</Body>
    </Screen>
  );
}
