import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { errorMessage, useApp } from '../../src/state/AppState';
import { Body, Button, Card, ErrorText, Field, Screen } from '../../src/components/ui';
import { useTheme } from '../../src/theme';

export default function SignIn() {
  const t = useTheme();
  const { signIn, signUp, mode, liveAvailable, switchMode } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const demo = mode === 'demo';

  async function submit() {
    setError(null);
    setInfo(null);
    if (!demo && (!email.includes('@') || password.length < 6)) return setError('Enter a valid email and a password of at least 6 characters.');
    if (creating && name.trim().length < 1) return setError('Enter your name.');
    setLoading(true);
    try {
      if (creating) {
        const r = await signUp(email, password, name);
        if (r === 'confirm') {
          setInfo('Account created. Open the confirmation email we sent, then come back and sign in.');
          setCreating(false);
        }
      } else {
        await signIn(email, password);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ gap: 16, paddingTop: 24 }}>
        <View style={{ alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <View style={{ width: 72, height: 72, borderRadius: 22, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="car-sport" size={38} color={t.brandText} />
          </View>
          <Text style={{ fontSize: 30, fontWeight: '800', color: t.text, letterSpacing: -0.5 }}>ParkPay</Text>
          <Body muted style={{ textAlign: 'center' }}>Park, pay for exactly the time you used, and leave. No meters, no coins.</Body>
        </View>

        {demo ? (
          <Card tone="info">
            <Body bold>Demo mode</Body>
            <Body muted>Everything runs on this phone with sample Toronto parking areas. Tap the button to start, no account needed.</Body>
          </Card>
        ) : null}

        {!demo ? (
          <Card>
            {creating ? <Field label="Your name" value={name} onChangeText={setName} placeholder="Alex Morgan" autoCapitalize="words" textContentType="name" /> : null}
            <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
            <Field label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry autoCapitalize="none" textContentType={creating ? 'newPassword' : 'password'} />
            <ErrorText>{error}</ErrorText>
            {info ? <Body style={{ color: t.brand }}>{info}</Body> : null}
            <Button title={creating ? 'Create account' : 'Sign in'} onPress={submit} loading={loading} />
            <Button variant="ghost" title={creating ? 'I already have an account' : 'Create an account'} onPress={() => { setCreating(!creating); setError(null); }} />
          </Card>
        ) : (
          <>
            <ErrorText>{error}</ErrorText>
            <Button title="Start demo" icon="play" onPress={submit} loading={loading} />
          </>
        )}

        {liveAvailable ? (
          <Button variant="secondary" title={demo ? 'Use my real account instead' : 'Try demo mode (offline)'} onPress={() => switchMode(demo ? 'live' : 'demo')} />
        ) : null}
        <Body muted style={{ textAlign: 'center', fontSize: 12 }}>
          Prototype. Payments are simulated: no money moves.
        </Body>
      </KeyboardAvoidingView>
    </Screen>
  );
}
