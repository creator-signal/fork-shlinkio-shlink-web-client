import { BffHttpClient } from '../../../src/api/services/HttpClient';
import { setBrowserSession } from '../../../src/auth/session';

describe('BffHttpClient', () => {
  it('strips browser credentials and adds same-origin CSRF protection', async () => {
    setBrowserSession({
      user: { displayName: 'Operator' },
      csrfToken: 'csrf-token',
      server: { id: 'creator-signal', name: 'Creator Signal', version: '5.2.0', autoConnect: true },
    });
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl.mockResolvedValue(
      new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }),
    );
    const client = new BffHttpClient(fetchImpl);

    await client.jsonRequest('/api/shlink/rest/v3/short-urls', {
      method: 'POST',
      body: '{}',
    });

    const [, options] = fetchImpl.mock.calls[0];
    const headers = options?.headers as Headers;
    expect(headers.get('X-CSRF-Token')).toBe('csrf-token');
    expect(options?.credentials).toBe('same-origin');
    expect(options?.redirect).toBe('error');
  });

  it('throws safe API responses for JSON and empty operations', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    fetchImpl
      .mockResolvedValueOnce(new Response('{"title":"Denied"}', { status: 403 }))
      .mockResolvedValueOnce(new Response('{"title":"Denied"}', { status: 403 }));
    const client = new BffHttpClient(fetchImpl);

    await expect(client.jsonRequest('/api/shlink/rest/v3/health')).rejects.toEqual({ title: 'Denied' });
    await expect(client.emptyRequest('/api/shlink/rest/v3/short-urls/code')).rejects.toEqual({ title: 'Denied' });
  });
});
