import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IS_ADMIN_APP, IS_OFFICER_APP, IS_STAFF_APP } from '../../src/lib/variant';
import { useApp } from '../../src/state/AppState';
import { useTheme } from '../../src/theme';

type Icon = keyof typeof Ionicons.glyphMap;
const icon = (name: Icon, focused: Icon) => ({ color, focused: f, size }: { color: any; focused: boolean; size: number }) => (
  <Ionicons name={f ? focused : name} size={size} color={color} />
);

export default function TabsLayout() {
  const t = useTheme();
  const { activeSession } = useApp();
  const driverTab = IS_STAFF_APP ? null : undefined; // href null hides a tab
  const adminTab = IS_ADMIN_APP ? undefined : null;
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.brand,
        tabBarInactiveTintColor: t.muted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border, height: 56 + bottom, paddingTop: 6, paddingBottom: bottom },
      }}
    >
      <Tabs.Screen name="index" options={{ href: driverTab, title: 'Park', tabBarIcon: icon('car-outline', 'car'), tabBarBadge: activeSession ? '' : undefined, tabBarBadgeStyle: { backgroundColor: t.brand, minWidth: 10, height: 10, borderRadius: 5 } }} />
      <Tabs.Screen name="history" options={{ href: driverTab, title: 'History', tabBarIcon: icon('receipt-outline', 'receipt') }} />
      <Tabs.Screen name="vehicles" options={{ href: driverTab, title: 'Vehicles', tabBarIcon: icon('car-sport-outline', 'car-sport') }} />
      <Tabs.Screen name="officer" options={{ title: 'Enforce', href: IS_OFFICER_APP ? undefined : null, tabBarIcon: icon('shield-checkmark-outline', 'shield-checkmark') }} />
      <Tabs.Screen name="dashboard" options={{ title: 'Dashboard', href: adminTab, tabBarIcon: icon('stats-chart-outline', 'stats-chart') }} />
      <Tabs.Screen name="areas" options={{ title: 'Areas', href: adminTab, tabBarIcon: icon('map-outline', 'map') }} />
      <Tabs.Screen name="people" options={{ title: 'People', href: adminTab, tabBarIcon: icon('people-outline', 'people') }} />
      <Tabs.Screen name="account" options={{ title: 'Account', tabBarIcon: icon('person-circle-outline', 'person-circle') }} />
    </Tabs>
  );
}
