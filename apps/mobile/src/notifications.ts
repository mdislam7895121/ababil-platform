import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { api } from './api';
import { auth } from './auth';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export const notifications = {
  async requestPermissions(): Promise<boolean> {
    if (!Device.isDevice) {
      console.log('[Notifications] Must use physical device');
      return false;
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[Notifications] Permission denied');
      return false;
    }

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#4f46e5',
      });
    }

    console.log('[Notifications] Permission granted');
    return true;
  },

  async registerForPushNotifications(): Promise<string | null> {
    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return null;

    try {
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: '00000000-0000-0000-0000-000000000000',
      });
      const token = tokenData.data;
      console.log('[Notifications] Expo push token:', token);
      
      await auth.setPushToken(token);
      
      await this.registerTokenWithBackend(token);
      
      return token;
    } catch (error) {
      console.error('[Notifications] Failed to get push token:', error);
      return null;
    }
  },

  async registerTokenWithBackend(expoPushToken: string): Promise<void> {
    try {
      const response = await api.post('/api/push/register', {
        expoPushToken,
        deviceInfo: {
          platform: Platform.OS,
          version: Platform.Version,
          isDevice: Device.isDevice,
          deviceName: Device.deviceName,
          modelName: Device.modelName,
        },
      });
      console.log('[Notifications] Token registered with backend:', JSON.stringify(response));
    } catch (error) {
      console.error('[Notifications] Failed to register token:', error);
    }
  },

  async sendTestNotification(): Promise<any> {
    try {
      const response = await api.post('/api/push/test', {});
      console.log('[Notifications] Test notification sent:', JSON.stringify(response));
      return response;
    } catch (error) {
      console.error('[Notifications] Failed to send test:', error);
      throw error;
    }
  },

  addNotificationReceivedListener(
    callback: (notification: Notifications.Notification) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationReceivedListener(callback);
  },

  addNotificationResponseListener(
    callback: (response: Notifications.NotificationResponse) => void
  ): Notifications.Subscription {
    return Notifications.addNotificationResponseReceivedListener(callback);
  },
};
