import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  RefreshControlProps,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, space, type as ty, useTheme } from '../theme';
import KeyboardScroll, { useKeyboardScroll } from './KeyboardScroll';

export type InputRef = React.ElementRef<typeof TextInput>;
type IconName = keyof typeof Ionicons.glyphMap;

/** Page wrapper. `title` renders a large heading; `refreshControl` enables pull-to-refresh. */
export function Screen({
  children,
  scroll = true,
  pad = true,
  title,
  subtitle,
  right,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  pad?: boolean;
  title?: string;
  subtitle?: string;
  right?: React.ReactNode;
  refreshControl?: React.ReactElement<RefreshControlProps>;
}) {
  const t = useTheme();
  const inner = pad ? { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md } : undefined;
  const header = title ? (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', paddingTop: space.sm, paddingBottom: space.xs }}>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text accessibilityRole="header" style={[ty.title, { color: t.text }]}>{title}</Text>
        {subtitle ? <Text style={[ty.small, { color: t.muted }]}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  ) : null;
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: t.bg }}>
      {scroll ? (
        <KeyboardScroll contentContainerStyle={inner} refreshControl={refreshControl}>
          {header}
          {children}
        </KeyboardScroll>
      ) : (
        <View style={[{ flex: 1 }, inner]}>
          {header}
          {children}
        </View>
      )}
    </SafeAreaView>
  );
}

export function H1({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <Text accessibilityRole="header" style={[ty.title, { color: t.text }]}>{children}</Text>;
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: space.sm }}>
      <Text style={[ty.heading, { color: t.text, fontSize: 17 }]}>{children}</Text>
      {action}
    </View>
  );
}

/** Small caption above a value. Sentence case, no all-caps. */
export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<TextStyle> }) {
  const t = useTheme();
  return <Text style={[ty.micro, { color: t.muted, fontSize: 13, fontWeight: '600' }, style]}>{children}</Text>;
}

export function Body({ children, muted, style, bold }: { children: React.ReactNode; muted?: boolean; style?: StyleProp<TextStyle>; bold?: boolean }) {
  const t = useTheme();
  return <Text style={[ty.body, { color: muted ? t.muted : t.text, fontWeight: bold ? '700' : '400' }, style]}>{children}</Text>;
}

export function Card({ children, style, tone }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; tone?: 'danger' | 'warn' | 'brand' | 'info' | 'hero' }) {
  const t = useTheme();
  const bg = tone === 'danger' ? t.dangerSoft : tone === 'warn' ? t.warnSoft : tone === 'brand' ? t.brandSoft : tone === 'info' ? t.infoSoft : tone === 'hero' ? t.hero : t.card;
  return (
    <View
      style={[
        { backgroundColor: bg, borderRadius: radius.card, padding: space.lg, gap: space.sm },
        tone && tone !== 'hero' ? null : { borderWidth: StyleSheet.hairlineWidth, borderColor: t.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** Press feedback: scale to 0.97 in 120 ms. */
function usePress() {
  const v = useRef(new Animated.Value(1)).current;
  const to = (n: number) => Animated.timing(v, { toValue: n, duration: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  return { style: { transform: [{ scale: v }] }, onPressIn: () => to(0.97), onPressOut: () => to(1) };
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading,
  disabled,
  icon,
  style,
  size = 'lg',
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'inverse';
  loading?: boolean;
  disabled?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
  size?: 'lg' | 'sm';
}) {
  const t = useTheme();
  const press = usePress();
  const bg = { primary: t.brand, danger: t.danger, secondary: t.brandSoft, ghost: 'transparent', inverse: t.heroText }[variant];
  const fg = { primary: t.brandText, danger: '#fff', secondary: t.brand, ghost: t.muted, inverse: t.hero }[variant];
  const off = disabled || loading;
  const small = size === 'sm';
  return (
    <Animated.View style={[press.style, { opacity: off ? 0.5 : 1 }, style as object]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!off, busy: !!loading }}
        accessibilityLabel={title}
        onPress={off ? undefined : onPress}
        onPressIn={off ? undefined : press.onPressIn}
        onPressOut={press.onPressOut}
        style={{
          backgroundColor: bg,
          borderRadius: radius.button,
          minHeight: small ? 40 : 52,
          paddingHorizontal: small ? 14 : 20,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        }}
      >
        {loading ? <ActivityIndicator color={fg} /> : icon ? <Ionicons name={icon} size={small ? 16 : 19} color={fg} /> : null}
        <Text style={{ color: fg, fontSize: small ? 14 : 16, fontWeight: '700', letterSpacing: -0.1 }}>{title}</Text>
      </Pressable>
    </Animated.View>
  );
}

export const Field = React.forwardRef<InputRef, TextInputProps & { label: string; error?: string | null }>(function Field({ label, style, error, ...rest }, ref) {
  const t = useTheme();
  const [focus, setFocus] = useState(false);
  const { ensureVisible } = useKeyboardScroll();
  const box = useRef<React.ElementRef<typeof View>>(null);
  return (
    <View ref={box} style={{ gap: 6 }}>
      <Label>{label}</Label>
      <TextInput
        ref={ref}
        placeholderTextColor={t.muted}
        accessibilityLabel={label}
        {...rest}
        onFocus={(e) => {
          setFocus(true);
          ensureVisible(box.current);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          rest.onBlur?.(e);
        }}
        style={[
          {
            backgroundColor: t.inputBg,
            color: t.text,
            borderRadius: radius.field,
            borderWidth: focus || error ? 1.5 : 1,
            borderColor: error ? t.danger : focus ? t.brand : t.border,
            paddingHorizontal: 14,
            minHeight: 50,
            fontSize: 16,
          },
          style,
        ]}
      />
      {error ? <Text accessibilityRole="alert" style={{ color: t.danger, fontSize: 13 }}>{error}</Text> : null}
    </View>
  );
});

export function Pill({ text, tone = 'brand', icon, center }: { center?: boolean; text: string; tone?: 'brand' | 'danger' | 'warn' | 'info' | 'muted' | 'onHero'; icon?: IconName }) {
  const t = useTheme();
  const map = {
    brand: [t.brandSoft, t.brand],
    danger: [t.dangerSoft, t.danger],
    warn: [t.warnSoft, t.warn],
    info: [t.infoSoft, t.info],
    muted: [t.border, t.muted],
    onHero: ['rgba(255,255,255,0.12)', t.heroText],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, alignSelf: center ? 'center' : 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
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

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.border, marginVertical: 2 }} />;
}

/** Key/value line used on receipts and rate tables. */
export function KV({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={[ty.body, { color: t.muted }]}>{k}</Text>
      <Text style={[ty.body, { color: t.text, flexShrink: 1, textAlign: 'right', fontWeight: strong ? '800' : '500', fontVariant: ['tabular-nums'] }]}>{v}</Text>
    </View>
  );
}

export function IconBadge({ name, tone = 'brand', size = 40 }: { name: IconName; tone?: 'brand' | 'info' | 'warn' | 'muted'; size?: number }) {
  const t = useTheme();
  const [bg, fg] = { brand: [t.brandSoft, t.brand], info: [t.infoSoft, t.info], warn: [t.warnSoft, t.warn], muted: [t.border, t.muted] }[tone];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name={name} size={size * 0.5} color={fg} />
    </View>
  );
}

export function Chip({ text, active, onPress, icon }: { text: string; active?: boolean; onPress: () => void; icon?: IconName }) {
  const t = useTheme();
  const press = usePress();
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: !!active }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={{ backgroundColor: active ? t.brand : t.card, borderColor: active ? t.brand : t.border, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 14, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6 }}
      >
        {icon ? <Ionicons name={icon} size={15} color={active ? t.brandText : t.muted} /> : null}
        <Text style={{ color: active ? t.brandText : t.text, fontWeight: '600', fontSize: 14 }}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  const t = useTheme();
  if (!children) return null;
  return <Text accessibilityRole="alert" style={{ color: t.danger, fontSize: 14, lineHeight: 20 }}>{children}</Text>;
}

/** Inline message bar (offline, warnings, success). */
export function Banner({ tone = 'info', icon, title, text, action }: { tone?: 'info' | 'warn' | 'danger' | 'brand'; icon?: IconName; title: string; text?: string; action?: React.ReactNode }) {
  const t = useTheme();
  const [bg, fg] = { info: [t.infoSoft, t.info], warn: [t.warnSoft, t.warn], danger: [t.dangerSoft, t.danger], brand: [t.brandSoft, t.brand] }[tone];
  const ic: IconName = icon ?? (tone === 'danger' ? 'alert-circle' : tone === 'warn' ? 'warning' : tone === 'brand' ? 'checkmark-circle' : 'information-circle');
  return (
    <View accessibilityRole="alert" style={{ backgroundColor: bg, borderRadius: radius.card, padding: space.md, flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
      <Ionicons name={ic} size={20} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        {text ? <Text style={{ color: t.text, fontSize: 14, lineHeight: 20, opacity: 0.85 }}>{text}</Text> : null}
        {action}
      </View>
    </View>
  );
}

export function Empty({ icon, title, hint, action }: { icon: IconName; title: string; hint?: string; action?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 10 }}>
      <IconBadge name={icon} tone="muted" size={64} />
      <Text style={[ty.heading, { color: t.text, marginTop: 6 }]}>{title}</Text>
      {hint ? <Text style={[ty.body, { color: t.muted, textAlign: 'center' }]}>{hint}</Text> : null}
      {action}
    </View>
  );
}

// ---- loading ------------------------------------------------------------------------------

/** Pulsing placeholder block. Mirrors the final layout so nothing jumps when data arrives. */
export function Skeleton({ w, h = 16, r = 8, style }: { w?: number | `${number}%`; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const t = useTheme();
  const v = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0.55, duration: 800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View accessibilityElementsHidden style={[{ width: w ?? '100%', height: h, borderRadius: r, backgroundColor: t.skeleton, opacity: v }, style]} />;
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <Card>
      <Skeleton w="45%" h={18} />
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} w={i === lines - 1 ? '70%' : '100%'} h={14} />
      ))}
    </Card>
  );
}

/** Centered spinner with a caption, for full-area waits. */
export function Loading({ text }: { text?: string }) {
  const t = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={text ?? 'Loading'} style={{ alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
      <ActivityIndicator color={t.brand} size="large" />
      {text ? <Text style={[ty.small, { color: t.muted }]}>{text}</Text> : null}
    </View>
  );
}
