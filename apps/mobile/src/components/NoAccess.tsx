import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { IS_ADMIN_APP } from '../lib/variant';
import { errorMessage, useApp } from '../state/AppState';
import { space, type as ty, useTheme } from '../theme';
import { Logo } from './Boot';
import { Banner, Button, Card, IconBadge } from './ui';

/** A staff app (Enforce or Admin), signed in with an account that does not have the role yet. */
export default function NoAccess() {
  const t = useTheme();
  const { user, refreshUser, signOut } = useApp();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setNote(null);
    try {
      await refreshUser();
      setNote(`Still no ${IS_ADMIN_APP ? 'admin' : 'officer'} access. Ask your admin, then check again.`);
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, justifyContent: 'center', padding: space.xl, gap: space.lg }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <Logo size={64} />
          <Text style={[ty.title, { color: t.text, textAlign: 'center' }]}>{IS_ADMIN_APP ? 'Waiting for admin access' : 'Waiting for officer access'}</Text>
          <Text style={[ty.body, { color: t.muted, textAlign: 'center' }]}>{IS_ADMIN_APP ? 'ParkPay Admin is for parking operator admins.' : 'ParkPay Enforce is for parking enforcement staff.'}</Text>
        </View>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <IconBadge name="shield-checkmark" tone="info" />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[ty.body, { color: t.text, fontWeight: '700' }]}>{IS_ADMIN_APP ? 'Ask your platform admin' : 'Ask your operator admin'}</Text>
              <Text style={[ty.body, { color: t.muted }]}>
                In the ParkPay console they open People &amp; roles, type {user?.email ?? 'your email'} and choose {IS_ADMIN_APP ? 'Operator admin' : 'Officer'}. Then tap Check again.
              </Text>
            </View>
          </View>
          {note ? <Banner tone="info" title={note} /> : null}
          <Button title="Check again" icon="refresh" onPress={check} loading={busy} />
          <Button variant="ghost" title="Sign out" onPress={() => void signOut()} />
        </Card>
      </View>
    </SafeAreaView>
  );
}
