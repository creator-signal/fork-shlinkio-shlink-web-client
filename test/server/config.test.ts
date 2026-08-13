import { randomUUID } from 'node:crypto';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadRuntimeConfig } from '../../server/config.js';

describe('runtime configuration', () => {
  it('rejects plaintext secret environment values', () => {
    expect(() => loadRuntimeConfig({ SHLINK_API_KEY: 'plaintext' })).toThrow(
      /must be supplied through SHLINK_API_KEY_FILE/,
    );
  });

  it('loads all credentials from regular secret files', async () => {
    const directory = join(tmpdir(), `shlink-web-config-${randomUUID()}`);
    await mkdir(directory);
    const secret = async (name: string, value: string) => {
      const path = join(directory, name);
      await writeFile(path, value, { mode: 0o400 });
      await chmod(path, 0o400);
      return path;
    };
    const config = loadRuntimeConfig({
      NODE_ENV: 'test',
      PUBLIC_ORIGIN: 'http://shlink.test',
      OIDC_ISSUER: 'http://identity.test',
      OIDC_CLIENT_ID: 'client',
      OIDC_PROJECT_ID: 'project',
      SHLINK_INTERNAL_URL: 'http://shlink:8080',
      OIDC_CLIENT_SECRET_FILE: await secret('oidc', 'o'.repeat(32)),
      SESSION_SECRET_FILE: await secret('session', 's'.repeat(64)),
      SHLINK_API_KEY_FILE: await secret('shlink', 'k'.repeat(32)),
      REDIS_URL_FILE: await secret('redis', 'redis://redis:6379/0'),
      COOKIE_SECURE: 'false',
    });
    expect(config).toMatchObject({
      oidcClientSecret: 'o'.repeat(32),
      sessionSecret: 's'.repeat(64),
      shlinkApiKey: 'k'.repeat(32),
      redisUrl: 'redis://redis:6379/0',
      cookieSecure: false,
    });
  });
});
