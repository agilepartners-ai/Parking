import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Logo } from '../../src/components/Boot';
import KeyboardScroll from '../../src/components/KeyboardScroll';
import { Banner, Body, Button, Card, Field, type InputRef } from '../../src/components/ui';
import { errorMessage, useApp } from '../../src/state/AppState';
import { radius, space, type as ty, useTheme } from '../../src/theme';

const emailOk = (s: string) => /^\S+@\S+\.\S+$/.test(s.trim());

export default function SignIn() {
  const t = useTheme();
  const { signIn, signUp, mode, liveAvailable, switchMode, serverReachable } = useApp();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ name?: string; email?: string; password?: string; form?: string }>({});
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const emailRef = useRef<InputRef>(null);
  const passRef = useRef<InputRef>(null);

  const demo = mode === 'demo';

  async function submit() {
    setInfo(null);
    const e: typeof errors = {};
    if (!demo) {
      if (creating && name.trim().length < 1) e.name = 'Enter your name.';
      if (!emailOk(email)) e.email = 'Enter a valid email, like you@example.com.';
      if (password.length < 6) e.password = 'Use at least 6 characters.';
    }
    setErrors(e);
    if (Object.keys(e).length) return;
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
    } catch (err) {
      setErrors({ form: errorMessage(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
      <KeyboardScroll contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: space.xl, gap: space.xl }}>
          <View style={{ alignItems: 'center', gap: space.md }}>
            <Logo size={76} />
            <View style={{ alignItems: 'center', gap: 4 }}>
              <Text style={[ty.title, { color: t.text }]}>{demo ? 'Welcome to ParkPay' : creating ? 'Create your account' : 'Welcome back'}</Text>
              <Text style={[ty.body, { color: t.muted, textAlign: 'center' }]}>Park, pay for exactly the time you used, and go. No meters, no coins.</Text>
            </View>
          </View>

          {!demo && serverReachable === false ? <Banner tone="warn" title="Can't reach the server" text="Check your connection, or try demo mode below." /> : null}
          {info ? <Banner tone="brand" title="Check your email" text={info} /> : null}

          {demo ? (
            <Card style={{ gap: space.md }}>
              <Row2 icon="phone-portrait-outline" text="Everything runs on this phone." />
              <Row2 icon="location-outline" text="Sample parking areas in Toronto." />
              <Row2 icon="card-outline" text="Payments are simulated. No money moves." />
              {errors.form ? <Banner tone="danger" title="Could not start" text={errors.form} /> : null}
              <Button title="Start demo" icon="play" onPress={submit} loading={loading} />
            </Card>
          ) : (
            <Card style={{ gap: space.md }}>
              {creating ? <Field label="Your name" value={name} onChangeText={setName} placeholder="Alex Morgan" autoCapitalize="words" textContentType="name" returnKeyType="next" onSubmitEditing={() => emailRef.current?.focus()} error={errors.name} /> : null}
              <Field ref={emailRef} label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" autoCapitalize="none" autoCorrect={false} keyboardType="email-address" autoComplete="email" textContentType="emailAddress" returnKeyType="next" onSubmitEditing={() => passRef.current?.focus()} error={errors.email} />
              <Field ref={passRef} label="Password" value={password} onChangeText={setPassword} placeholder="At least 6 characters" secureTextEntry autoCapitalize="none" textContentType={creating ? 'newPassword' : 'password'} autoComplete={creating ? 'new-password' : 'current-password'} returnKeyType="go" onSubmitEditing={submit} error={errors.password} />
              {errors.form ? <Banner tone="danger" title={creating ? 'Could not create account' : 'Could not sign in'} text={errors.form} /> : null}
              <Button title={creating ? 'Create account' : 'Sign in'} onPress={submit} loading={loading} />
              <Button variant="ghost" title={creating ? 'I already have an account' : 'Create an account'} onPress={() => { setCreating(!creating); setErrors({}); }} />
            </Card>
          )}

          {liveAvailable ? (
            <Button variant="secondary" title={demo ? 'Use my real account instead' : 'Try demo mode (offline)'} onPress={() => switchMode(demo ? 'live' : 'demo')} />
          ) : null}
          <Body muted style={{ textAlign: 'center', fontSize: 12 }}>Prototype. Payments are simulated: no money moves.</Body>
      </KeyboardScroll>
    </SafeAreaView>
  );
}

function Row2({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 36, height: 36, borderRadius: radius.field, backgroundColor: t.brandSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name={icon} size={18} color={t.brand} />
      </View>
      <Text style={[ty.body, { color: t.text, flex: 1 }]}>{text}</Text>
    </View>
  );
}
