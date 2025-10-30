// lib/api-client.ts

export class APIClient {
  private baseURL = '/api';

  private getMasterPassword(): string {
    const masterPassword = sessionStorage.getItem('mp');
    if (!masterPassword) {
      throw new Error('Session expired. Please log in again.');
    }
    return masterPassword;
  }

  private async request(
    endpoint: string,
    options: RequestInit & { masterPassword?: boolean } = {}
  ) {
    const { masterPassword: needsMasterPassword, ...fetchOptions } = options;
    const headers = new Headers(fetchOptions.headers || {});

    if (needsMasterPassword) {
      const mp = this.getMasterPassword();
      headers.set('x-master-password', mp);
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...fetchOptions,
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `API error: ${response.status}`);
    }

    return response.json();
  }

  // Credentials API
  async fetchCredentials(categoryId?: number | null, search?: string) {
    const params = new URLSearchParams();
    if (categoryId !== undefined && categoryId !== null) {
      params.append('categoryId', String(categoryId));
    }
    if (search) {
      params.append('search', search);
    }

    return this.request(`/credentials${params.toString() ? '?' + params : ''}`, {
      method: 'GET',
      masterPassword: true,
    });
  }

  async createCredential(data: {
    categoryId?: number | null;
    title: string;
    siteLink?: string;
    username?: string;
    password: string;
    description?: string;
  }) {
    const masterPassword = this.getMasterPassword();

    return this.request('/credentials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, masterPassword }),
    });
  }

  async updateCredential(id: number, data: any) {
    const masterPassword = this.getMasterPassword();

    return this.request('/credentials', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, id, masterPassword }),
    });
  }

  async deleteCredential(id: number) {
    return this.request(`/credentials?id=${id}`, {
      method: 'DELETE',
    });
  }

  // Categories API
  async fetchCategories() {
    return this.request('/categories', {
      method: 'GET',
    });
  }

  async createCategory(data: { name: string; color: string }) {
    return this.request('/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  async deleteCategory(id: number) {
    return this.request(`/categories?id=${id}`, {
      method: 'DELETE',
    });
  }

  // Auth API
  async login(username: string, password: string) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Login failed' }));
      throw new Error(error.error || 'Login failed');
    }

    return response.json();
  }

  async signup(username: string, password: string) {
    const response = await fetch(`${this.baseURL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Signup failed' }));
      throw new Error(error.error || 'Signup failed');
    }

    return response.json();
  }

  async verify() {
    const response = await fetch(`${this.baseURL}/auth/verify`, {
      credentials: 'include',
    });

    return response.json();
  }

  async logout() {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }
}

// Export singleton instance
export const apiClient = new APIClient();