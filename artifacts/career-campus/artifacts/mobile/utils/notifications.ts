import { Platform } from 'react-native';
import Constants from 'expo-constants';

const isExpoGo = Constants.appOwnership === 'expo';

let Notifications: typeof import('expo-notifications') | null = null;

async function getNotifications() {
  if (Platform.OS === 'web') return null;
  if (isExpoGo) return null;
  if (Notifications) return Notifications;
  try {
    Notifications = await import('expo-notifications');
    try {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowAlert: true,
          shouldPlaySound: true,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
    } catch {}
    return Notifications;
  } catch {
    return null;
  }
}

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === 'web' || isExpoGo) return false;
  try {
    const n = await getNotifications();
    if (!n) return false;
    const { status: existingStatus } = await n.getPermissionsAsync();
    if (existingStatus === 'granted') return true;
    const { status } = await n.requestPermissionsAsync();
    return status === 'granted';
  } catch {
    return false;
  }
}

export async function scheduleLocalNotification(opts: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    const n = await getNotifications();
    if (!n) return;
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    await n.scheduleNotificationAsync({
      content: {
        title: opts.title,
        body: opts.body,
        data: opts.data ?? {},
      },
      trigger: null,
    });
  } catch {}
}

export async function scheduleTimedNotification(opts: {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  triggerDate: Date;
}): Promise<void> {
  if (Platform.OS === 'web' || isExpoGo) return;
  try {
    const n = await getNotifications();
    if (!n) return;
    const granted = await requestNotificationPermissions();
    if (!granted) return;
    await n.scheduleNotificationAsync({
      content: {
        title: opts.title,
        body: opts.body,
        data: opts.data ?? {},
      },
      trigger: { date: opts.triggerDate } as any,
    });
  } catch {}
}
