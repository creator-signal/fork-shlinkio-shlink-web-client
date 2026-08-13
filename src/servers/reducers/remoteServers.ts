import { useCallback, useEffect, useRef } from 'react';
import type { HttpClient } from '../../api/services/HttpClient';
import { setBrowserSession, type BrowserSession } from '../../auth/session';
import { useDependencies } from '../../container/context';
import { useAppDispatch } from '../../store';
import { createAsyncThunk } from '../../store/helpers';
import { createServers, useServers } from './servers';

export const fetchServers = createAsyncThunk(
  'shlink/remoteServers/fetchServers',
  async (httpClient: HttpClient, { dispatch }): Promise<void> => {
    const session = await httpClient.jsonRequest<BrowserSession>('/api/session');
    if (!session.csrfToken || !session.server?.id || !session.server.name || !session.server.version) {
      throw new Error('The authenticated session did not provide a valid server contract');
    }
    setBrowserSession(session);
    dispatch(createServers([session.server]));
  },
);

export const useRemoteServers = () => {
  const dispatch = useAppDispatch();
  const [httpClient] = useDependencies<[HttpClient]>('HttpClient');
  const dispatchFetchServer = useCallback(() => dispatch(fetchServers(httpClient)), [dispatch, httpClient]);

  return { fetchServers: dispatchFetchServer };
};

export const useLoadRemoteServers = () => {
  const { fetchServers } = useRemoteServers();
  const { servers } = useServers();
  const initialServers = useRef(servers);

  useEffect(() => {
    // The BFF is the only source for the fixed Creator Signal server identity.
    if (Object.keys(initialServers.current).length === 0) {
      fetchServers();
    }
  }, [fetchServers]);
};
