import { randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRuntimeConfig } from '../../server/config.js';

const createConfigEnvironment = async (redisUrl: string): Promise<NodeJS.ProcessEnv> => {
  const directory = join(tmpdir(), `shlink-web-config-${randomUUID()}`);
  await mkdir(directory);
  const secret = async (name: string, value: string) => {
    const path = join(directory, name);
    await writeFile(path, value, { mode: 0o400 });
    await chmod(path, 0o400);
    return path;
  };

  return {
    NODE_ENV: 'test',
    PUBLIC_ORIGIN: 'http://shlink.test',
    OIDC_ISSUER: 'http://identity.test',
    OIDC_CLIENT_ID: 'client',
    OIDC_PROJECT_ID: 'project',
    SHLINK_INTERNAL_URL: 'http://shlink:8080',
    OIDC_CLIENT_SECRET_FILE: await secret('oidc', 'o'.repeat(32)),
    SESSION_SECRET_FILE: await secret('session', 's'.repeat(64)),
    SHLINK_API_KEY_FILE: await secret('shlink', 'k'.repeat(32)),
    REDIS_URL_FILE: await secret('redis', redisUrl),
    COOKIE_SECURE: 'false',
  };
};

describe('runtime configuration', () => {
  it('rejects plaintext secret environment values', () => {
    expect(() => loadRuntimeConfig({ SHLINK_API_KEY: 'plaintext' })).toThrow(
      /must be supplied through SHLINK_API_KEY_FILE/,
    );
  });

  it('loads all credentials, including authenticated Redis, from regular secret files', async () => {
    const redisUrl = `redis://default:${'r'.repeat(32)}@redis:6379/0`;
    const config = loadRuntimeConfig(await createConfigEnvironment(redisUrl));
    expect(config).toMatchObject({
      oidcClientSecret: 'o'.repeat(32),
      sessionSecret: 's'.repeat(64),
      shlinkApiKey: 'k'.repeat(32),
      redisUrl,
      cookieSecure: false,
    });
  });

  it('continues to reject credentials in public HTTP origins', async () => {
    const environment = await createConfigEnvironment('redis://redis:6379/0');
    environment.PUBLIC_ORIGIN = 'http://operator:secret@shlink.test';
    expect(() => loadRuntimeConfig(environment)).toThrow(/PUBLIC_ORIGIN is not an allowed URL/);
  });

  it.each(['redis://default:secret@redis:6379/0?tls=false', 'redis://default:secret@redis:6379/0#fragment'])(
    'rejects Redis connection metadata outside the authority and path: %s',
    async (redisUrl) => {
      const environment = await createConfigEnvironment(redisUrl);
      expect(() => loadRuntimeConfig(environment)).toThrow(/REDIS_URL_FILE is not an allowed URL/);
    },
  );
});
