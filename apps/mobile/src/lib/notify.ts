import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/** Local notifications only (no server push needed for reminders). Everything is best-effort: Expo Go / web may refuse. */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';
let configured = false;

function configure() {
  if (configured || !supported) return;
  configured = true;
  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    if (Platform.OS === 'android') {
      void Notifications.setNotificationChannelAsync('default', { name: 'Parking reminders', importance: Notifications.AndroidImportance.HIGH });
    }
  } catch {
    /* ignore */
  }
}

export async function ensureNotificationPermission(): Promise<boolean> {
  if (!supported) return false;
  configure();
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function notifyNow(title: string, body: string) {
  if (!supported) return;
  configure();
  try {
    await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: null });
  } catch {
    /* ignore */
  }
}

const idsKey = (sessionId: string) => `parkpay.reminders.${sessionId}`;

/** Reminders for a running session: 15 min before the maximum stay, and a long-stay nudge. */
/**
 * Schedules every timed reminder for a running session. `elapsed` = minutes already parked (non-zero when the
 * plan is changed mid-session); `closesIn` = minutes until the area closes, if it has a closing time.
 */
export async function scheduleSessionReminders(
  sessionId: string,
  areaName: string,
  maxStayMinutes: number | null,
  plannedMinutes: number | null = null,
  opts: { elapsed?: number; closesIn?: number | null } = {},
) {
  const gone = opts.elapsed ?? 0;
  if (!supported) return;
  configure();
  try {
    if (!(await ensureNotificationPermission())) return;
    const ids: string[] = [];
    const add = async (fromStartSeconds: number, title: string, body: string) => {
      const seconds = fromStartSeconds - gone * 60; // triggers count from now, the plan counts from the start
      if (seconds < 5) return;
      ids.push(
        await Notifications.scheduleNotificationAsync({
          content: { title, body },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds, repeats: false },
        }),
      );
    };
    // The driver's own planned time: warn 10 minutes before it (or at the halfway point of short stays), then at the end.
    if (plannedMinutes) {
      const lead = plannedMinutes > 20 ? 10 : Math.max(1, Math.floor(plannedMinutes / 2));
      await add((plannedMinutes - lead) * 60, 'Your parking time is almost up', `${lead} min left of the time you planned in ${areaName}. Extend or end your session.`);
      await add(plannedMinutes * 60, 'Planned time is up', `The time you planned in ${areaName} has ended. The meter keeps running until you end your session.`);
    }
    if (maxStayMinutes && !(plannedMinutes && plannedMinutes >= maxStayMinutes - 15)) {
      await add((maxStayMinutes - 15) * 60, 'Parking ends soon', `Your stay in ${areaName} reaches its limit in 15 minutes.`);
      await add(maxStayMinutes * 60, 'Maximum stay reached', `You have reached the maximum stay in ${areaName}. End your session to avoid a fine.`);
    } else if (!plannedMinutes) {
      await add(4 * 3600, 'Still parked?', `Your session in ${areaName} has been running for 4 hours.`);
    }
    // The area closes: 15 minutes' notice (5 if it closes sooner than that).
    if (opts.closesIn != null && opts.closesIn > 2) {
      const lead = opts.closesIn > 20 ? 15 : Math.min(5, opts.closesIn - 1);
      await add((gone + opts.closesIn - lead) * 60, `${areaName} closes soon`, `It closes in ${lead} minutes. Move your vehicle and end your session.`);
    }
    // Forgot to end: a late nudge for any session that is still open after 12 hours.
    if (!maxStayMinutes || maxStayMinutes > 12 * 60) await add(12 * 3600, 'Did you forget to end parking?', `Your session in ${areaName} has been open for 12 hours and is still charging.`);
    await AsyncStorage.setItem(idsKey(sessionId), JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

export async function cancelSessionReminders(sessionId: string) {
  if (!supported) return;
  try {
    const raw = await AsyncStorage.getItem(idsKey(sessionId));
    const ids: string[] = raw ? JSON.parse(raw) : [];
    await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
    await AsyncStorage.removeItem(idsKey(sessionId));
  } catch {
    /* ignore */
  }
}
