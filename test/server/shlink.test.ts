import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { RuntimeConfig } from '../../server/config.js';
import { createShlinkGateway, isAllowedShlinkRequest } from '../../server/shlink.js';

describe('ShlinkGateway', () => {
  it('allows only the declared REST surface and never query credentials', () => {
    expect(isAllowedShlinkRequest('GET', '/rest/v3/short-urls', new URLSearchParams('page=1'))).toBe(true);
    expect(isAllowedShlinkRequest('POST', '/rest/v3/short-urls/code/visits', new URLSearchParams())).toBe(false);
    expect(isAllowedShlinkRequest('GET', '/rest/v3/short-urls', new URLSearchParams('apiKey=leak'))).toBe(false);
    expect(isAllowedShlinkRequest('GET', '/rest/v3/mercure-info', new URLSearchParams())).toBe(false);
  });

  it('injects the service key only on the server-to-server hop', async () => {
    const requests: Array<{ url: string; key?: string }> = [];
    const upstream = createServer((request, response) => {
      requests.push({ url: request.url || '', key: request.headers['x-api-key'] as string | undefined });
      response.setHeader('content-type', 'application/json');
      if (request.url === '/rest/v3/health') {
        response.end(JSON.stringify({ status: 'pass', version: '5.2.0-cs.1' }));
      } else {
        response.end(
          JSON.stringify({
            shortUrls: {
              data: [],
              pagination: { currentPage: 1, pagesCount: 1, itemsPerPage: 10, itemsInCurrentPage: 0, totalItems: 0 },
            },
          }),
        );
      }
    });
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve));
    const address = upstream.address() as AddressInfo;
    const config = {
      shlinkBaseUrl: `http://127.0.0.1:${address.port}`,
      shlinkApiKey: 'server-only-key',
      shlinkMinimumVersion: '5.2.0-cs.1',
      upstreamTimeoutMs: 2_000,
      upstreamMaxResponseBytes: 65_536,
    } as RuntimeConfig;

    try {
      const gateway = createShlinkGateway(config);
      expect(await gateway.health()).toEqual({ status: 'pass', version: '5.2.0-cs.1' });
      const response = await gateway.proxy({ method: 'GET', path: '/rest/v3/short-urls', query: 'page=1' });
      expect(response.status).toBe(200);
      expect(requests).toHaveLength(2);
      expect(requests.every(({ key }) => key === 'server-only-key')).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => upstream.close((error) => (error ? reject(error) : resolve())));
    }
  });
});
