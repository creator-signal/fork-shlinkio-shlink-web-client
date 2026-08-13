import { fromPartial } from '@total-typescript/shoehorn';
import { BffShlinkApiClient } from '../../../src/api/services/BffShlinkApiClient';
import type { HttpClient } from '../../../src/api/services/HttpClient';

describe('BffShlinkApiClient', () => {
  it('maps the complete UI contract to the fixed same-origin REST v3 boundary', async () => {
    const jsonRequest = vi.fn(async (url: string) => {
      if (url.includes('/short-urls?')) return { shortUrls: { data: [] } };
      if (url.endsWith('/visits') || url.includes('/visits?')) return { visits: { data: [] } };
      if (url.endsWith('/tags')) return { tags: { data: [] } };
      if (url.endsWith('/tags/stats')) return { tags: { data: [] } };
      if (url.endsWith('/domains')) return { domains: { data: [] } };
      return { status: 'pass', version: '5.2.0-cs.1' };
    });
    const emptyRequest = vi.fn(async () => undefined);
    const client = new BffShlinkApiClient(fromPartial<HttpClient>({ jsonRequest, emptyRequest }));
    const identifier = { shortCode: 'code/with spaces', domain: 'example.com' };

    await client.listShortUrls({
      page: 2,
      tags: ['one', 'two'],
      excludeMaxVisitsReached: true,
      excludePastValidUntil: false,
      orderBy: { field: 'dateCreated', dir: 'DESC' },
    } as never);
    await client.listShortUrls();
    await client.createShortUrl({ longUrl: 'https://example.com' } as never);
    await client.getShortUrl(identifier);
    await client.deleteShortUrl(identifier);
    await client.updateShortUrl(identifier, { title: 'Updated' } as never);
    await client.getShortUrlRedirectRules(identifier);
    await client.setShortUrlRedirectRules(identifier, { redirectRules: [] } as never);
    await client.getVisitsOverview();
    await client.getShortUrlVisits(identifier, { page: 1 } as never);
    await client.getTagVisits('tag/with spaces', { page: 1 } as never);
    await client.getDomainVisits('domain/with spaces', { page: 1 } as never);
    await client.getOrphanVisits({ page: 1 } as never);
    await client.getNonOrphanVisits({ page: 1 } as never);
    await client.deleteShortUrlVisits(identifier);
    await client.deleteOrphanVisits();
    await client.listTags();
    await client.tagsStats();
    await client.deleteTags(['one', 'two']);
    await client.editTag({ oldName: 'one', newName: 'two' });
    await client.listDomains();
    await client.editDomainRedirects({ baseUrlRedirect: 'https://example.com' } as never);
    await client.health();

    expect(jsonRequest).toHaveBeenCalledWith(
      expect.stringContaining('tags%5B%5D=one&tags%5B%5D=two'),
      expect.any(Object),
    );
    expect(jsonRequest).toHaveBeenCalledWith(
      '/api/shlink/rest/v3/short-urls/code%2Fwith%20spaces?domain=example.com',
      expect.any(Object),
    );
    expect(jsonRequest).toHaveBeenCalledWith(
      expect.stringContaining('/tags/tag%2Fwith%20spaces/visits'),
      expect.any(Object),
    );
    expect(emptyRequest).toHaveBeenCalledTimes(3);
  });

  it('refuses unsupported query values and realtime credential retrieval', async () => {
    const client = new BffShlinkApiClient(fromPartial<HttpClient>({ jsonRequest: vi.fn(), emptyRequest: vi.fn() }));
    await expect(client.listShortUrls({ page: { unsafe: true } } as never)).rejects.toThrow(
      'Unsupported Shlink query parameter',
    );
    await expect(client.mercureInfo()).rejects.toThrow('Realtime credentials are not exposed');
  });
});
