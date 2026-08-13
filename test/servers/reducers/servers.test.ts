import { fromPartial } from '@total-typescript/shoehorn';
import type { ServersMap } from '../../../src/servers/data';
import { createServers, serversReducer } from '../../../src/servers/reducers/servers';

describe('serversReducer', () => {
  const list: ServersMap = {
    abc123: fromPartial({ id: 'abc123' }),
    def456: fromPartial({ id: 'def456' }),
  };

  describe('reducer', () => {
    it('replaces state with the fixed BFF server', () =>
      expect(serversReducer(list, createServers([fromPartial({ id: 'creator-signal' })]))).toEqual({
        'creator-signal': { id: 'creator-signal' },
      }));
  });

  describe('action creators', () => {
    describe('createServers', () => {
      it('returns expected action', () => {
        const newServers = Object.values(list);
        const { payload } = createServers(newServers);

        expect(payload).toEqual(list);
      });
    });
  });
});
