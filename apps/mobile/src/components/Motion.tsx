import { Ionicons } from '@expo/vector-icons';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { radius, useTheme } from '../theme';

/** Fades and lifts content in once on mount (ease-out, 240 ms). `i` staggers siblings by 45 ms, capped so long lists stay quick. */
export function Enter({ children, i = 0, style }: { children: React.ReactNode; i?: number; style?: StyleProp<ViewStyle> }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 240, delay: Math.min(i, 6) * 45, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [v, i]);
  return (
    <Animated.View style={[{ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] }, style]}>
      {children}
    </Animated.View>
  );
}

/** Springs in from 60% size. Used once for success moments (receipt tick). */
export function Pop({ children }: { children: React.ReactNode }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, damping: 11, stiffness: 140, mass: 0.8, useNativeDriver: true }).start();
  }, [v]);
  return <Animated.View style={{ opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>{children}</Animated.View>;
}

// ---- toasts --------------------------------------------------------------------------------

type ToastKind = 'success' | 'error' | 'info';
interface ToastApi {
  show(text: string, kind?: ToastKind): void;
}
const ToastCtx = createContext<ToastApi>({ show: () => undefined });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const [item, setItem] = useState<{ id: number; text: string; kind: ToastKind } | null>(null);
  const v = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback(
    (text: string, kind: ToastKind = 'success') => {
      clearTimeout(timer.current);
      setItem({ id: Date.now(), text, kind });
      v.setValue(0);
      Animated.timing(v, { toValue: 1, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      timer.current = setTimeout(() => {
        Animated.timing(v, { toValue: 0, duration: 180, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setItem(null));
      }, kind === 'error' ? 4200 : 2400);
    },
    [v],
  );
  const api = useMemo(() => ({ show }), [show]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const icon = item?.kind === 'error' ? 'alert-circle' : item?.kind === 'info' ? 'information-circle' : 'checkmark-circle';
  const tint = item?.kind === 'error' ? t.danger : item?.kind === 'info' ? t.info : t.brand;
  return (
    <ToastCtx.Provider value={api}>
      {children}
      {item ? (
        <SafeAreaView pointerEvents="none" edges={['bottom']} style={{ position: 'absolute', left: 0, right: 0, bottom: 72, alignItems: 'center' }}>
          <Animated.View
            accessibilityLiveRegion="polite"
            style={{
              opacity: v,
              transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: t.hero,
              borderRadius: radius.pill,
              paddingHorizontal: 16,
              paddingVertical: 12,
              maxWidth: '88%',
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 12,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <Ionicons name={icon} size={18} color={tint} />
            <Text style={{ color: t.heroText, fontSize: 14, fontWeight: '600', flexShrink: 1 }}>{item.text}</Text>
          </Animated.View>
        </SafeAreaView>
      ) : null}
    </ToastCtx.Provider>
  );
}

export type { View };
