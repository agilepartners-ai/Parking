import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Keyboard, Platform, ScrollView, View, type ScrollViewProps } from 'react-native';

type ViewRef = React.ElementRef<typeof View>;
type ScrollRef = React.ElementRef<typeof ScrollView>;

/**
 * ScrollView that stays usable while typing.
 * - Android 15+ draws edge to edge, so the keyboard no longer shrinks the window: we add bottom padding equal to the keyboard height.
 * - When an input gets focus, `ensureVisible` scrolls it above the keyboard (Field calls this).
 */
interface Ctx {
  ensureVisible(view: ViewRef | null): void;
}
const KeyboardCtx = createContext<Ctx>({ ensureVisible: () => undefined });
export const useKeyboardScroll = () => useContext(KeyboardCtx);

export function useKeyboardHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setH(e.endCoordinates.height));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return h;
}

export default function KeyboardScroll({ children, contentContainerStyle, refreshControl, ...rest }: ScrollViewProps & { children: React.ReactNode }) {
  const ref = useRef<ScrollRef>(null);
  const y = useRef(0);
  const kb = useKeyboardHeight();
  const kbRef = useRef(0);
  kbRef.current = kb;

  const ensureVisible = useCallback((view: ViewRef | null) => {
    if (!view) return;
    // wait for the keyboard to finish opening, then measure
    setTimeout(() => {
      view.measureInWindow((_x: number, top: number, _w: number, height: number) => {
        const visibleBottom = Dimensions.get('window').height - kbRef.current - 24;
        const overflow = top + height - visibleBottom;
        if (overflow > 0) ref.current?.scrollTo({ y: y.current + overflow, animated: true });
      });
    }, 320);
  }, []);

  const ctx = useMemo(() => ({ ensureVisible }), [ensureVisible]);

  return (
    <KeyboardCtx.Provider value={ctx}>
      <ScrollView
        ref={ref}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
        onScroll={(e) => {
          y.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={32}
        refreshControl={refreshControl}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[contentContainerStyle, Platform.OS === 'android' ? { paddingBottom: 48 + kb } : null]}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardCtx.Provider>
  );
}
