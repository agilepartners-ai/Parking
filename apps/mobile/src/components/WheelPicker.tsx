import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Text, View } from 'react-native';
import { useTheme } from '../theme';

export const WHEEL_ITEM_H = 44;
const VISIBLE = 5; // rows shown; the middle one is selected

/**
 * Apple-style scroll wheel. Snaps to each row; rows fade and shrink away from the centre.
 * Controlled: `index` is the selected row, `onChange` fires when scrolling settles.
 */
export default function WheelPicker({
  items,
  index,
  onChange,
  width = 96,
  label,
}: {
  items: string[];
  index: number;
  onChange: (i: number) => void;
  width?: number;
  label?: string;
}) {
  const t = useTheme();
  const y = useRef(new Animated.Value(index * WHEEL_ITEM_H)).current;
  const ref = useRef<{ scrollTo: (o: { y: number; animated: boolean }) => void } | null>(null);
  const last = useRef(index);

  // keep the wheel in step when the value is changed from outside (presets, clamping)
  useEffect(() => {
    if (index !== last.current) {
      last.current = index;
      ref.current?.scrollTo({ y: index * WHEEL_ITEM_H, animated: true });
    }
    // Keep the fade/scale in step even when no scroll event arrives (value set before the list was laid out).
    const id = setTimeout(() => y.setValue(last.current * WHEEL_ITEM_H), 350);
    return () => clearTimeout(id);
  }, [index, y]);

  const rows = useMemo(
    () =>
      items.map((text, i) => {
        const inputRange = [(i - 2) * WHEEL_ITEM_H, (i - 1) * WHEEL_ITEM_H, i * WHEEL_ITEM_H, (i + 1) * WHEEL_ITEM_H, (i + 2) * WHEEL_ITEM_H];
        return { text, inputRange };
      }),
    [items],
  );

  const settle = (offsetY: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(offsetY / WHEEL_ITEM_H)));
    last.current = i;
    if (i !== index) onChange(i);
  };

  return (
    <View style={{ width, height: WHEEL_ITEM_H * VISIBLE }} accessibilityRole="adjustable" accessibilityLabel={label} accessibilityValue={{ text: items[index] }}>
      {/* selection band */}
      <View pointerEvents="none" style={{ position: 'absolute', top: WHEEL_ITEM_H * 2, left: 0, right: 0, height: WHEEL_ITEM_H, borderRadius: 12, backgroundColor: t.brandSoft }} />
      <Animated.ScrollView
        ref={ref as never}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_H}
        decelerationRate="fast"
        nestedScrollEnabled
        contentOffset={{ x: 0, y: index * WHEEL_ITEM_H }}
        contentContainerStyle={{ paddingVertical: WHEEL_ITEM_H * 2 }}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={(e) => settle(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => {
          // a slow drag may not produce a momentum phase
          const v = e.nativeEvent.velocity?.y ?? 0;
          if (Math.abs(v) < 0.05) settle(e.nativeEvent.contentOffset.y);
        }}
      >
        {rows.map((r, i) => (
          <Animated.View
            key={i}
            style={{
              height: WHEEL_ITEM_H,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: y.interpolate({ inputRange: r.inputRange, outputRange: [0.18, 0.5, 1, 0.5, 0.18], extrapolate: 'clamp' }),
              transform: [{ scale: y.interpolate({ inputRange: r.inputRange, outputRange: [0.8, 0.9, 1, 0.9, 0.8], extrapolate: 'clamp' }) }],
            }}
          >
            <Text style={{ color: t.text, fontSize: 24, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{r.text}</Text>
          </Animated.View>
        ))}
      </Animated.ScrollView>
    </View>
  );
}
