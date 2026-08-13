import type { ServerWithId } from '../../servers/data';
import type { GetState } from '../../store';
import { BffShlinkApiClient } from './BffShlinkApiClient';
import type { HttpClient } from './HttpClient';

const getSelectedServerFromState = (getState: GetState): ServerWithId => {
  const { selectedServer } = getState();
  if (!selectedServer || !('id' in selectedServer)) {
    throw new Error("There's no selected server or it is not found");
  }

  return selectedServer;
};

export const buildShlinkApiClient = (httpClient: HttpClient) => {
  const apiClient = new BffShlinkApiClient(httpClient);
  return (getStateOrSelectedServer: GetState | ServerWithId) => {
    if (typeof getStateOrSelectedServer === 'function') {
      getSelectedServerFromState(getStateOrSelectedServer);
    }
    return apiClient;
  };
};

export type ShlinkApiClientBuilder = ReturnType<typeof buildShlinkApiClient>;
