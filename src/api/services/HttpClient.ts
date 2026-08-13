import { getCsrfToken } from '../../auth/session';

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: string;
  signal?: AbortSignal;
};

export type HttpClient = {
  jsonRequest<T>(url: string, options?: RequestOptions): Promise<T>;
  emptyRequest(url: string, options?: RequestOptions): Promise<void>;
};

const mutationMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class BffHttpClient implements HttpClient {
  public constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {}

  private async request(url: string, options: RequestOptions = {}) {
    const method = options.method ?? 'GET';
    const headers = new Headers();
    headers.set('Accept', 'application/json');
    headers.set('X-Request-Id', crypto.randomUUID());
    if (options.body !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (mutationMethods.has(method)) {
      headers.set('X-CSRF-Token', getCsrfToken());
    }

    const response = await this.fetchImpl(url, {
      method,
      body: options.body,
      headers,
      credentials: 'same-origin',
      redirect: 'error',
      signal: options.signal,
    });
    if (response.status === 401 && typeof window !== 'undefined') {
      window.location.assign('/auth/login');
    }
    return response;
  }

  public async jsonRequest<T>(url: string, options?: RequestOptions): Promise<T> {
    const response = await this.request(url, options);
    const result = await response.json();
    if (!response.ok) {
      throw result;
    }
    return result as T;
  }

  public async emptyRequest(url: string, options?: RequestOptions): Promise<void> {
    const response = await this.request(url, options);
    if (!response.ok) {
      throw await response.json();
    }
  }
}
