import { Alert, Platform } from 'react-native';

/** Alert.alert does nothing on web, so use the browser dialogs there. */
export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') {
    (globalThis as { alert?: (m: string) => void }).alert?.(message ? `${title}\n\n${message}` : title);
    return;
  }
  Alert.alert(title, message);
}

/** Ask a yes/no question. Resolves true when the user confirms. */
export function confirmDialog(title: string, message: string, confirmText: string, destructive = false): Promise<boolean> {
  if (Platform.OS === 'web') {
    const ok = (globalThis as { confirm?: (m: string) => boolean }).confirm?.(`${title}\n\n${message}`) ?? false;
    return Promise.resolve(ok);
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) },
    );
  });
}
