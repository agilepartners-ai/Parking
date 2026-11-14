import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import KeyboardScroll from '../src/components/KeyboardScroll';
import { Enter } from '../src/components/Motion';
import VehicleForm, { emptyVehicle, toNewVehicle, vehicleValid } from '../src/components/VehicleForm';
import { Banner, Button, Card } from '../src/components/ui';
import { ensureNotificationPermission } from '../src/lib/notify';
import { errorMessage, useApp } from '../src/state/AppState';
import { radius, space, type as ty, useTheme } from '../src/theme';

type Step = 'vehicle' | 'permissions';

/** Shown once after sign-up (and once to an older account with no vehicle): vehicle details, then why we ask for location and notifications. */
export default function Onboarding() {
  const t = useTheme();
  const { api, user, vehicles, refreshVehicles, finishOnboarding } = useApp();
  const [step, setStep] = useState<Step>(vehicles.length ? 'permissions' : 'vehicle');
  const [v, setV] = useState(emptyVehicle());
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loc, setLoc] = useState<'idle' | 'granted' | 'denied'>('idle');
  const [note, setNote] = useState<'idle' | 'granted' | 'denied'>('idle');

  async function saveVehicle() {
    setError(null);
    setBusy(true);
    try {
      await api.addVehicle(toNewVehicle(v));
      await refreshVehicles();
      setStep('permissions');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function askLocation() {
    if (Platform.OS === 'web') return setLoc('granted');
    try {
      setLoc((await Location.requestForegroundPermissionsAsync()).granted ? 'granted' : 'denied');
    } catch {
      setLoc('denied');
    }
  }
  async function askNotifications() {
    setNote((await ensureNotificationPermission()) ? 'granted' : 'denied');
  }

  const first = user?.full_name?.trim().split(/\s+/)[0];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardScroll contentContainerStyle={{ flexGrow: 1, padding: space.xl, gap: space.lg }}>
        {/* progress */}
        <View style={{ flexDirection: 'row', gap: 6 }} accessibilityLabel={`Step ${step === 'vehicle' ? 2 : 3} of 3`}>
          {[0, 1, 2].map((i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i <= (step === 'vehicle' ? 1 : 2) ? t.brand : t.border }} />
          ))}
        </View>

        {step === 'vehicle' ? (
          <Enter key="vehicle" style={{ gap: space.lg }}>
            <View style={{ gap: 4 }}>
              <Text style={[ty.title, { color: t.text }]}>{first ? `Hi ${first}, what do you drive?` : 'What do you drive?'}</Text>
              <Text style={[ty.body, { color: t.muted }]}>We ask once. Officers check the plate against your parking session, so you never need a paper ticket.</Text>
            </View>
            <Card style={{ gap: space.md }}>
              <VehicleForm value={v} onChange={setV} error={error} />
            </Card>
            <Button title="Continue" icon="arrow-forward" onPress={saveVehicle} loading={busy} disabled={!vehicleValid(v)} />
            <Button variant="ghost" title="I'll add it later" onPress={() => setStep('permissions')} />
          </Enter>
        ) : (
          <Enter key="perm" style={{ gap: space.lg }}>
            <View style={{ gap: 4 }}>
              <Text style={[ty.title, { color: t.text }]}>Two quick permissions</Text>
              <Text style={[ty.body, { color: t.muted }]}>Both are optional, but ParkPay works best with them on.</Text>
            </View>
            <Perm
              icon="navigate"
              title="Location"
              text="Finds the parking area you are standing in and its price. Used while you use the app; never sold or shared."
              state={loc}
              onPress={askLocation}
              cta="Allow location"
            />
            <Perm
              icon="notifications"
              title="Reminders"
              text="Tells you when your time is almost up, when you reach a paid area, and if you drive away without ending."
              state={note}
              onPress={askNotifications}
              cta="Allow reminders"
            />
            {loc === 'denied' ? <Banner tone="warn" title="Location is off" text="ParkPay cannot find your parking area without it. You can turn it on later in your phone's Settings." /> : null}
            <View style={{ flex: 1 }} />
            <Button title="Start using ParkPay" icon="checkmark" onPress={() => void finishOnboarding()} />
          </Enter>
        )}
      </KeyboardScroll>
    </SafeAreaView>
  );
}

function Perm({ icon, title, text, state, onPress, cta }: { icon: keyof typeof Ionicons.glyphMap; title: string; text: string; state: 'idle' | 'granted' | 'denied'; onPress: () => void; cta: string }) {
  const t = useTheme();
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
        <View style={{ width: 44, height: 44, borderRadius: radius.button, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name={icon} size={22} color={t.brand} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[ty.heading, { color: t.text, fontSize: 17 }]}>{title}</Text>
          <Text style={[ty.body, { color: t.muted }]}>{text}</Text>
        </View>
      </View>
      {state === 'granted' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="checkmark-circle" size={20} color={t.brand} />
          <Text style={{ color: t.brand, fontWeight: '700' }}>Turned on</Text>
        </View>
      ) : (
        <Button size="sm" variant={state === 'denied' ? 'ghost' : 'secondary'} title={state === 'denied' ? 'Not allowed. Try again' : cta} onPress={onPress} />
      )}
    </Card>
  );
}
