import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, useTheme } from '../theme';

export function Screen({ children, scroll = true, pad = true }: { children: React.ReactNode; scroll?: boolean; pad?: boolean }) {
  const t = useTheme();
  const inner = pad ? { padding: space.lg, gap: space.md } : undefined;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <ScrollView contentContainerStyle={[inner, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, inner]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text style={{ fontSize: 26, fontWeight: '800', color: t.text, letterSpacing: -0.3 }}>{children}</Text>;
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 12, fontWeight: '700', color: t.muted, textTransform: 'uppercase', letterSpacing: 0.6 }, style as object]}>{children}</Text>;
}

export function Body({ children, muted, style, bold }: { children: React.ReactNode; muted?: boolean; style?: object; bold?: boolean }) {
  const t = useTheme();
  return <Text style={[{ fontSize: 15, color: muted ? t.muted : t.text, lineHeight: 21, fontWeight: bold ? '700' : '400' }, style]}>{children}</Text>;
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'danger' | 'warn' | 'brand' | 'info' }) {
  const t = useTheme();
  const bg = tone === 'danger' ? t.dangerSoft : tone === 'warn' ? t.warnSoft : tone === 'brand' ? t.brandSoft : tone === 'info' ? t.infoSoft : t.card;
  return (
    <View style={[{ backgroundColor: bg, borderRadius: radius.lg, padding: space.lg, gap: space.sm, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }, style]}>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = variant === 'primary' ? t.brand : variant === 'danger' ? t.danger : variant === 'secondary' ? t.brandSoft : 'transparent';
  const fg = variant === 'primary' ? t.brandText : variant === 'danger' ? '#fff' : variant === 'secondary' ? t.brand : t.muted;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: radius.md, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: off ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
      <Text style={{ color: fg, fontSize: 16, fontWeight: '700' }}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, style, ...rest }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        placeholderTextColor={t.muted}
        {...rest}
        style={[{ backgroundColor: t.inputBg, color: t.text, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16 }, style]}
      />
    </View>
  );
}

export function Pill({ text, tone = 'brand' }: { text: string; tone?: 'brand' | 'danger' | 'warn' | 'info' | 'muted' }) {
  const t = useTheme();
  const map = {
    brand: [t.brandSoft, t.brand],
    danger: [t.dangerSoft, t.danger],
    warn: [t.warnSoft, t.warn],
    info: [t.infoSoft, t.info],
    muted: [t.border, t.muted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' }}>
      <Text style={{ color: fg, fontSize: 12, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10 }, style]}>{children}</View>;
}

export function Spread({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>{left}{right}</View>;
}

export function Chip({ text, active, onPress }: { text: string; active?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: active ? t.brand : t.card, borderColor: active ? t.brand : t.border, borderWidth: 1, borderRadius: 99, paddingHorizontal: 14, paddingVertical: 8 }}>
      <Text style={{ color: active ? t.brandText : t.text, fontWeight: '600' }}>{text}</Text>
    </Pressable>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  const t = useTheme();
  if (!children) return null;
  return <Text style={{ color: t.danger, fontSize: 14, lineHeight: 20 }}>{children}</Text>;
}

export function Empty({ icon, title, hint }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
      <Ionicons name={icon} size={40} color={t.muted} />
      <Text style={{ color: t.text, fontSize: 17, fontWeight: '700' }}>{title}</Text>
      {hint ? <Text style={{ color: t.muted, textAlign: 'center' }}>{hint}</Text> : null}
    </View>
  );
}
