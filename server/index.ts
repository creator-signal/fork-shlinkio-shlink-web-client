import { buildApp } from './app.js';
import { loadRuntimeConfig } from './config.js';
import { createOidcGateway } from './oidc.js';
import { EncryptedSessionManager, RedisSessionStore } from './session.js';
import { createShlinkGateway } from './shlink.js';

const config = loadRuntimeConfig();
const store = await RedisSessionStore.connect(config.redisUrl);
const sessions = new EncryptedSessionManager(store, config.sessionSecret);
const oidc = await createOidcGateway(config);
const shlink = createShlinkGateway(config);
const app = await buildApp({ config, sessions, oidc, shlink });

let closing = false;
const close = async () => {
  if (closing) {
    return;
  }
  closing = true;
  await app.close();
  await sessions.close();
};

process.once('SIGTERM', () => void close());
process.once('SIGINT', () => void close());

try {
  await app.listen({ host: '0.0.0.0', port: config.port });
} catch {
  await close();
  process.exitCode = 1;
}
