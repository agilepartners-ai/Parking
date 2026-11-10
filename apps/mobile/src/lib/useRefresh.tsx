import { useFocusEffect } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { RefreshControl } from 'react-native';
import { useTheme } from '../theme';

/**
 * Keeps a tab fresh without the user doing anything:
 * - runs `load` every time the tab comes into focus (throttled to once per 2 s so quick tab flicks don't hammer the server)
 * - returns a pull-to-refresh control that runs the same loader.
 */
export function useRefresh(load: () => Promise<unknown>) {
  const t = useTheme();
  const [refreshing, setRefreshing] = useState(false);
  const last = useRef(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useFocusEffect(
    useCallback(() => {
      if (Date.now() - last.current < 2000) return;
      last.current = Date.now();
      Promise.resolve(loadRef.current()).catch(() => undefined);
    }, []),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadRef.current();
    } catch {
      /* the screen shows its own error state */
    } finally {
      last.current = Date.now();
      setRefreshing(false);
    }
  }, []);

  return <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.brand} colors={[t.brand]} progressBackgroundColor={t.card} />;
}
