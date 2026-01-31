import { useEffect, useRef } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { linking } from '../src/linking';
import { notifications } from '../src/notifications';

export default function RootLayout() {
  const notificationListener = useRef<any>();
  const responseListener = useRef<any>();

  useEffect(() => {
    const initApp = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        console.log('[App] Initial URL:', initialUrl);
        await linking.handleDeepLink(initialUrl);
      }
    };

    initApp();

    const linkSubscription = Linking.addEventListener('url', ({ url }) => {
      console.log('[App] Deep link received:', url);
      linking.handleDeepLink(url);
    });

    notificationListener.current = notifications.addNotificationReceivedListener(
      (notification) => {
        console.log('[Notifications] Received:', JSON.stringify(notification));
      }
    );

    responseListener.current = notifications.addNotificationResponseListener(
      (response) => {
        console.log('[Notifications] User tapped:', JSON.stringify(response));
        const url = response.notification.request.content.data?.url as string;
        if (url) {
          linking.handleDeepLink(url);
        }
      }
    );

    return () => {
      linkSubscription.remove();
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: 'Sign In' }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen 
          name="preview/[token]" 
          options={{ 
            title: 'Preview',
            headerStyle: { backgroundColor: '#4f46e5' },
            headerTintColor: '#fff',
          }} 
        />
        <Stack.Screen 
          name="invite/[token]" 
          options={{ 
            title: 'Invite',
            headerStyle: { backgroundColor: '#4f46e5' },
            headerTintColor: '#fff',
          }} 
        />
      </Stack>
    </>
  );
}
