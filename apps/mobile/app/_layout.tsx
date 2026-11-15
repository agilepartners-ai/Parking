import '../src/lib/background'; // registers the background task before the app starts
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BootScreen, CrashScreen } from '../src/components/Boot';
import { ToastProvider } from '../src/components/Motion';
import NoAccess from '../src/components/NoAccess';
import { IS_OFFICER_APP } from '../src/lib/variant';
import { captureErrors, lastCapturedError, onCapturedError } from '../src/lib/boot';
import { AppProvider, useApp } from '../src/state/AppState';
import { useTheme } from '../src/theme';

captureErrors(); // any uncaught error becomes a visible screen instead of a frozen or closed app

/** expo-router uses this when a screen throws while rendering. */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<unknown> }) {
  return (
    <SafeAreaProvider>
      <CrashScreen error={error} onRetry={() => void retry()} />
    </SafeAreaProvider>
  );
}

function Gate() {
  const { ready, user, bootSteps, skipBoot, onboarding, isStaff } = useApp();
  const t = useTheme();
  if (!ready) return <BootScreen steps={bootSteps} onSkip={skipBoot} />;
  if (IS_OFFICER_APP && user && !isStaff) return <NoAccess />;
  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade_from_bottom' }}>
        <Stack.Protected guard={!!user && onboarding && !IS_OFFICER_APP}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!user && (!onboarding || IS_OFFICER_APP)}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="receipt/[id]"
            options={{ headerShown: true, title: 'Receipt', presentation: 'modal', headerStyle: { backgroundColor: t.card }, headerTintColor: t.text, headerShadowVisible: false }}
          />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function Root() {
  const [crash, setCrash] = useState(lastCapturedError());
  useEffect(() => onCapturedError((e) => setCrash(e)), []);
  return (
    <SafeAreaProvider>
      {crash ? (
        <CrashScreen error={crash} onRetry={() => setCrash(null)} />
      ) : (
        <AppProvider>
          <ToastProvider>
            <Gate />
          </ToastProvider>
        </AppProvider>
      )}
    </SafeAreaProvider>
  );
}
