import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { BootStep } from '../state/AppState';
import { radius, space, type as ty, useTheme } from '../theme';
import { Button } from './ui';
import { IS_ADMIN_APP, IS_OFFICER_APP } from '../lib/variant';

export function Logo({ size = 72 }: { size?: number }) {
  const t = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: IS_ADMIN_APP ? '#5B21B6' : IS_OFFICER_APP ? '#1E3A8A' : t.brand, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: t.brandText, fontSize: size * 0.55, fontWeight: '900', letterSpacing: -2, marginTop: -2 }}>P</Text>
    </View>
  );
}

/** Start screen. Shows each start-up step with a tick so a slow phone or network is visible, never a mystery. */
export function BootScreen({ steps, onSkip }: { steps: BootStep[]; onSkip: () => void }) {
  const t = useTheme();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(id);
  }, []);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.xl }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <Logo size={84} />
          <Text style={[ty.title, { color: t.text }]}>ParkPay</Text>
        </View>
        <View accessibilityLiveRegion="polite" style={{ alignSelf: 'stretch', backgroundColor: t.card, borderRadius: radius.card, padding: space.lg, gap: space.md, borderWidth: 1, borderColor: t.border }}>
          {steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </View>
        {slow ? (
          <View style={{ alignSelf: 'stretch', gap: space.sm }}>
            <Text style={[ty.small, { color: t.muted, textAlign: 'center' }]}>This is taking longer than usual. Check your connection, or open the app now.</Text>
            <Button title="Open the app now" variant="secondary" onPress={onSkip} />
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

function StepRow({ step }: { step: BootStep }) {
  const t = useTheme();
  const color = step.state === 'ok' ? t.brand : step.state === 'fail' ? t.danger : t.muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 28 }}>
      <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
        {step.state === 'active' ? (
          <ActivityIndicator size="small" color={t.brand} />
        ) : step.state === 'ok' ? (
          <Ionicons name="checkmark-circle" size={24} color={t.brand} />
        ) : step.state === 'fail' ? (
          <Ionicons name="alert-circle" size={24} color={t.danger} />
        ) : step.state === 'skip' ? (
          <Ionicons name="remove-circle-outline" size={24} color={t.muted} />
        ) : (
          <View style={{ width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: t.border }} />
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: step.state === 'pending' ? t.muted : t.text, fontSize: 15, fontWeight: '600' }}>{step.label}</Text>
        {step.detail ? <Text style={{ color, fontSize: 12 }}>{step.detail}</Text> : null}
      </View>
    </View>
  );
}

/** Shown instead of a frozen or blank screen when something throws. Tells the user what happened and lets them retry. */
export function CrashScreen({ error, onRetry }: { error: Error | { message: string; stack?: string }; onRetry?: () => void }) {
  const t = useTheme();
  const [show, setShow] = useState(false);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.xl, gap: space.lg }}>
        <View style={{ alignItems: 'center', gap: space.md }}>
          <Ionicons name="warning" size={44} color={t.warn} />
          <Text style={[ty.title, { color: t.text, textAlign: 'center' }]}>Something went wrong</Text>
          <Text style={[ty.body, { color: t.muted, textAlign: 'center' }]}>The app hit an unexpected problem. Your parking session and receipts are safe on the server.</Text>
        </View>
        {onRetry ? <Button title="Try again" onPress={onRetry} /> : null}
        <Button title={show ? 'Hide details' : 'Show details'} variant="ghost" onPress={() => setShow(!show)} />
        {show ? (
          <View style={{ backgroundColor: t.card, borderRadius: radius.field, padding: space.md, borderWidth: 1, borderColor: t.border }}>
            <Text selectable style={{ color: t.text, fontSize: 12, fontFamily: undefined }}>
              {error.message}
              {'\n\n'}
              {(error.stack ?? '').split('\n').slice(0, 12).join('\n')}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
