import type { ServersMap, ServerWithId } from '../data';

export function serversListToMap(servers: ServerWithId[]): ServersMap {
  const serversMap: ServersMap = {};
  servers.forEach((server) => {
    serversMap[server.id] = server;
  });

  return serversMap;
}
