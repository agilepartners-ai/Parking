import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useApp } from '../../src/state/AppState';
import { useTheme } from '../../src/theme';

type Icon = keyof typeof Ionicons.glyphMap;
const icon = (name: Icon, focused: Icon) => ({ color, focused: f, size }: { color: any; focused: boolean; size: number }) => (
  <Ionicons name={f ? focused : name} size={size} color={color} />
);

export default function TabsLayout() {
  const t = useTheme();
  const { isStaff, activeSession } = useApp();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.muted,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Park', tabBarIcon: icon('car-outline', 'car'), tabBarBadge: activeSession ? '●' : undefined, tabBarBadgeStyle: { backgroundColor: t.brand, color: t.brandText, fontSize: 8 } }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: icon('receipt-outline', 'receipt') }} />
      <Tabs.Screen name="vehicles" options={{ title: 'Vehicles', tabBarIcon: icon('speedometer-outline', 'speedometer') }} />
      <Tabs.Screen name="officer" options={{ title: 'Officer', href: isStaff ? undefined : null, tabBarIcon: icon('shield-checkmark-outline', 'shield-checkmark') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
