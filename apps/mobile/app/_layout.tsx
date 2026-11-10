import '../src/lib/background'; // registers the background task before the app starts
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AppProvider, useApp } from '../src/state/AppState';
import { useTheme } from '../src/theme';

function Gate() {
  const { ready, user } = useApp();
  const t = useTheme();
  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
        <ActivityIndicator color={t.brand} size="large" />
      </View>
    );
  }
  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={!!user}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="receipt/[id]" options={{ headerShown: true, title: 'Receipt', presentation: 'modal', headerStyle: { backgroundColor: t.card }, headerTintColor: t.text }} />
        </Stack.Protected>
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function Root() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <Gate />
      </AppProvider>
    </SafeAreaProvider>
  );
}
