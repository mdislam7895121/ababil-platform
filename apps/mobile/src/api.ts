import { getApiUrl } from './config';
import { auth } from './auth';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export const api = {
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { skipAuth, ...fetchOptions } = options;
    const url = getApiUrl(path);

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(fetchOptions.headers as Record<string, string>),
    };

    if (!skipAuth) {
      const token = await auth.getToken();
      const tenantId = await auth.getTenantId();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      if (tenantId) headers['x-tenant-id'] = tenantId;
    }

    const response = await fetch(url, {
      ...fetchOptions,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || error.message || 'Request failed');
    }

    return response.json();
  },

  get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  },

  post<T>(path: string, body?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  patch<T>(path: string, body?: any, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  },

  delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  },
};
