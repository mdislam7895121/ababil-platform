import * as SecureStore from 'expo-secure-store';

const KEYS = {
  TOKEN: 'auth_token',
  REFRESH_TOKEN: 'refresh_token',
  USER: 'auth_user',
  TENANT_ID: 'tenant_id',
  PENDING_DEEP_LINK: 'pending_deep_link',
  PUSH_TOKEN: 'expo_push_token',
};

export const auth = {
  async setToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.TOKEN, token);
    console.log('[SecureStore] Token stored successfully (length:', token.length, ')');
  },

  async getToken(): Promise<string | null> {
    const token = await SecureStore.getItemAsync(KEYS.TOKEN);
    console.log('[SecureStore] Token retrieved:', token ? 'exists' : 'null');
    return token;
  },

  async setRefreshToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, token);
  },

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
  },

  async setUser(user: any): Promise<void> {
    await SecureStore.setItemAsync(KEYS.USER, JSON.stringify(user));
  },

  async getUser(): Promise<any | null> {
    const userStr = await SecureStore.getItemAsync(KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
  },

  async setTenantId(tenantId: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.TENANT_ID, tenantId);
  },

  async getTenantId(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.TENANT_ID);
  },

  async setPendingDeepLink(url: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.PENDING_DEEP_LINK, url);
  },

  async getPendingDeepLink(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.PENDING_DEEP_LINK);
  },

  async clearPendingDeepLink(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.PENDING_DEEP_LINK);
  },

  async setPushToken(token: string): Promise<void> {
    await SecureStore.setItemAsync(KEYS.PUSH_TOKEN, token);
  },

  async getPushToken(): Promise<string | null> {
    return SecureStore.getItemAsync(KEYS.PUSH_TOKEN);
  },

  async isLoggedIn(): Promise<boolean> {
    const token = await this.getToken();
    return !!token;
  },

  async logout(): Promise<void> {
    await SecureStore.deleteItemAsync(KEYS.TOKEN);
    await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.USER);
    await SecureStore.deleteItemAsync(KEYS.TENANT_ID);
    await SecureStore.deleteItemAsync(KEYS.PUSH_TOKEN);
    console.log('[SecureStore] All auth data cleared');
  },
};
