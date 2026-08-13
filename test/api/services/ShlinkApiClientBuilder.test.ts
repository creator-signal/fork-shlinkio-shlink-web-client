import { fromPartial } from '@total-typescript/shoehorn';
import type { HttpClient } from '../../../src/api/services/HttpClient';
import { buildShlinkApiClient } from '../../../src/api/services/ShlinkApiClientBuilder';
import type { ReachableServer, SelectedServer } from '../../../src/servers/data';

describe('ShlinkApiClientBuilder', () => {
  const server = fromPartial<ReachableServer>;

  const createBuilder = (httpClient: HttpClient = fromPartial({})) => {
    const builder = buildShlinkApiClient(httpClient);
    return (selectedServer: SelectedServer) => builder(() => fromPartial({ selectedServer }));
  };

  it('uses one BFF client for the fixed server', () => {
    const builder = createBuilder();
    const firstApiClient = builder(server({ id: 'creator-signal' }));
    const secondApiClient = builder(server({ id: 'creator-signal' }));

    expect(firstApiClient).toBe(secondApiClient);
  });

  it('returns existing instances when provided params are the same', () => {
    const builder = createBuilder();
    const selectedServer = server({ id: 'creator-signal' });

    const firstApiClient = builder(selectedServer);
    const secondApiClient = builder(selectedServer);
    const thirdApiClient = builder(selectedServer);

    expect(firstApiClient).toBe(secondApiClient);
    expect(firstApiClient).toBe(thirdApiClient);
    expect(secondApiClient).toBe(thirdApiClient);
  });

  it('always calls the same-origin BFF without credentials', async () => {
    const jsonRequest = vi.fn();
    const httpClient = fromPartial<HttpClient>({ jsonRequest });
    const apiClient = createBuilder(httpClient)(server({ id: 'creator-signal' }));

    await apiClient.health();

    expect(jsonRequest).toHaveBeenCalledWith('/api/shlink/rest/v3/health', { signal: undefined });
  });
});
