import { Linking } from 'react-native';
import { router } from 'expo-router';
import { auth } from './auth';
import { config } from './config';

export interface DeepLinkParams {
  path: string;
  token?: string;
}

export const linking = {
  parseUrl(url: string): DeepLinkParams | null {
    if (!url) return null;

    const scheme = `${config.APP_SCHEME}://`;
    if (url.startsWith(scheme)) {
      const path = url.replace(scheme, '');
      const [route, token] = path.split('/').filter(Boolean);
      return { path: route, token };
    }

    const webSchemes = [config.WEB_URL, 'https://platform.app', 'http://localhost'];
    for (const webScheme of webSchemes) {
      if (url.startsWith(webScheme)) {
        const path = url.replace(webScheme, '');
        const parts = path.split('/').filter(Boolean);
        return { path: parts[0], token: parts[1] };
      }
    }

    return null;
  },

  async handleDeepLink(url: string): Promise<void> {
    console.log('[DeepLink] Handling URL:', url);
    const parsed = this.parseUrl(url);
    if (!parsed) {
      console.log('[DeepLink] Could not parse URL');
      return;
    }

    const isLoggedIn = await auth.isLoggedIn();

    if (parsed.path === 'preview' && parsed.token) {
      if (isLoggedIn) {
        console.log('[DeepLink] Navigating to preview:', parsed.token);
        router.push(`/preview/${parsed.token}`);
      } else {
        console.log('[DeepLink] Storing pending deep link, redirecting to login');
        await auth.setPendingDeepLink(url);
        router.replace('/login');
      }
      return;
    }

    if (parsed.path === 'invite' && parsed.token) {
      if (isLoggedIn) {
        console.log('[DeepLink] Handling invite:', parsed.token);
        router.push(`/invite/${parsed.token}`);
      } else {
        await auth.setPendingDeepLink(url);
        router.replace('/login');
      }
      return;
    }

    if (parsed.path === 'login') {
      router.replace('/login');
      return;
    }

    console.log('[DeepLink] Unhandled path:', parsed.path);
  },

  async processPendingDeepLink(): Promise<void> {
    const pendingUrl = await auth.getPendingDeepLink();
    if (pendingUrl) {
      console.log('[DeepLink] Processing pending link:', pendingUrl);
      await auth.clearPendingDeepLink();
      await this.handleDeepLink(pendingUrl);
    }
  },

  addListener(callback: (url: string) => void): () => void {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      callback(url);
    });
    return () => subscription.remove();
  },

  async getInitialUrl(): Promise<string | null> {
    return Linking.getInitialURL();
  },
};
