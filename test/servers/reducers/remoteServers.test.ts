import { fromPartial } from '@total-typescript/shoehorn';
import type { HttpClient } from '../../../src/api/services/HttpClient';
import { fetchServers } from '../../../src/servers/reducers/remoteServers';

describe('remoteServersReducer', () => {
  describe('fetchServers', () => {
    const dispatch = vi.fn();
    const jsonRequest = vi.fn();
    const httpClient = fromPartial<HttpClient>({ jsonRequest });

    it('loads the fixed server from the authenticated BFF session', async () => {
      jsonRequest.mockResolvedValue({
        user: { displayName: 'Operator' },
        csrfToken: 'csrf-token',
        server: { id: 'creator-signal', name: 'Creator Signal', version: '5.2.0', autoConnect: true },
      });

      await fetchServers(httpClient)(dispatch, vi.fn(), {});

      expect(dispatch).toHaveBeenCalledTimes(3);
      expect(dispatch).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          payload: {
            'creator-signal': { id: 'creator-signal', name: 'Creator Signal', version: '5.2.0', autoConnect: true },
          },
        }),
      );
      expect(dispatch).toHaveBeenNthCalledWith(3, expect.objectContaining({ payload: undefined }));
      expect(jsonRequest).toHaveBeenCalledWith('/api/session');
    });

    it('rejects an incomplete session contract', async () => {
      jsonRequest.mockResolvedValue({ csrfToken: '', server: {} });
      const result = await fetchServers(httpClient)(dispatch, vi.fn(), {});
      expect(result.meta.requestStatus).toBe('rejected');
    });
  });
});
