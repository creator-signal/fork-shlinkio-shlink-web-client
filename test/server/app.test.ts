import { buildApp } from '../../server/app.js';
import type { RuntimeConfig } from '../../server/config.js';
import type { OidcGateway } from '../../server/oidc.js';
import { EncryptedSessionManager, MemorySessionStore } from '../../server/session.js';
import type { ShlinkGateway } from '../../server/shlink.js';

const cookieFrom = (headers: string | string[] | undefined, name: string) => {
  const values = Array.isArray(headers) ? headers : headers ? [headers] : [];
  const value = values.find((header) => header.startsWith(`${name}=`));
  if (!value) {
    throw new Error(`Response did not set ${name}`);
  }
  return value.split(';', 1)[0];
};

describe('Creator Signal BFF', () => {
  const config = {
    environment: 'test',
    publicOrigin: new URL('http://shlink.test'),
    oidcRoleRevalidationSeconds: 0,
    cookieSecure: false,
    shlinkDisplayName: 'Creator Signal Links',
  } as RuntimeConfig;

  it('enforces OIDC session, role, origin, CSRF and credential boundaries', async () => {
    let roleAllowed = true;
    const oidc: OidcGateway = {
      createAuthorizationUrl: vi.fn(async () => new URL('https://identity.test/authorize')),
      exchange: vi.fn(async () => ({
        subject: 'operator-123',
        displayName: 'Creator Signal Operator',
        roles: ['platform:operator'],
        accessToken: 'access-secret',
        idToken: 'identity-secret',
        expiresAt: Date.now() + 600_000,
      })),
      hasRequiredRole: vi.fn(async () => roleAllowed),
      createLogoutUrl: vi.fn(() => new URL('https://identity.test/logout')),
    };
    const proxy = vi.fn(async () => ({
      status: 200,
      contentType: 'application/json',
      body: Buffer.from('{"ok":true}'),
      requestId: 'upstream-request',
    }));
    const shlink: ShlinkGateway = {
      health: vi.fn(async () => ({ status: 'pass' as const, version: '5.2.0-cs.1' })),
      proxy,
    };
    const sessions = new EncryptedSessionManager(new MemorySessionStore(), 's'.repeat(64));
    const app = await buildApp({ config, sessions, oidc, shlink, serveStatic: false });

    try {
      const anonymous = await app.inject({ method: 'GET', url: '/api/session' });
      expect(anonymous.statusCode).toBe(401);

      const login = await app.inject({ method: 'GET', url: '/auth/login' });
      expect(login.statusCode).toBe(302);
      expect(login.headers.location).toBe('https://identity.test/authorize');
      const loginCookie = cookieFrom(login.headers['set-cookie'], 'cs_shlink_login');

      const callback = await app.inject({
        method: 'GET',
        url: '/auth/callback?code=code&state=state',
        headers: { cookie: loginCookie },
      });
      expect(callback.statusCode).toBe(302);
      const sessionCookie = cookieFrom(callback.headers['set-cookie'], 'cs_shlink_session');
      expect(sessionCookie).not.toContain('access-secret');

      const sessionResponse = await app.inject({
        method: 'GET',
        url: '/api/session',
        headers: { cookie: sessionCookie },
      });
      expect(sessionResponse.statusCode).toBe(200);
      const session = sessionResponse.json();
      expect(session).toMatchObject({
        user: { displayName: 'Creator Signal Operator' },
        server: { id: 'creator-signal', name: 'Creator Signal Links', version: '5.2.0-cs.1' },
      });
      expect(JSON.stringify(session)).not.toContain('access-secret');

      const deniedMutation = await app.inject({
        method: 'POST',
        url: '/api/shlink/rest/v3/short-urls',
        headers: {
          cookie: sessionCookie,
          origin: 'https://evil.test',
          'x-csrf-token': session.csrfToken,
          'content-type': 'application/json',
        },
        payload: { longUrl: 'https://example.com' },
      });
      expect(deniedMutation.statusCode).toBe(403);
      expect(proxy).not.toHaveBeenCalled();

      const mutation = await app.inject({
        method: 'POST',
        url: '/api/shlink/rest/v3/short-urls',
        headers: {
          cookie: sessionCookie,
          origin: config.publicOrigin.origin,
          'sec-fetch-site': 'same-origin',
          'x-csrf-token': session.csrfToken,
          'content-type': 'application/json',
        },
        payload: { longUrl: 'https://example.com' },
      });
      expect(mutation.statusCode).toBe(200);
      expect(proxy).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/rest/v3/short-urls',
          body: '{"longUrl":"https://example.com"}',
        }),
      );

      const browserCredential = await app.inject({
        method: 'GET',
        url: '/api/shlink/rest/v3/health',
        headers: { cookie: sessionCookie, 'x-api-key': 'browser-key' },
      });
      expect(browserCredential.statusCode).toBe(400);

      const logout = await app.inject({
        method: 'POST',
        url: '/auth/logout',
        headers: {
          cookie: sessionCookie,
          origin: config.publicOrigin.origin,
          'sec-fetch-site': 'same-origin',
          'x-csrf-token': session.csrfToken,
          'content-type': 'application/json',
        },
        payload: {},
      });
      expect(logout.statusCode).toBe(200);
      expect(logout.json()).toEqual({ logoutUrl: 'https://identity.test/logout' });

      const loginAgain = await app.inject({ method: 'GET', url: '/auth/login' });
      const loginAgainCookie = cookieFrom(loginAgain.headers['set-cookie'], 'cs_shlink_login');
      const callbackAgain = await app.inject({
        method: 'GET',
        url: '/auth/callback?code=code',
        headers: { cookie: loginAgainCookie },
      });
      const sessionAgainCookie = cookieFrom(callbackAgain.headers['set-cookie'], 'cs_shlink_session');
      roleAllowed = false;
      const revoked = await app.inject({ method: 'GET', url: '/api/session', headers: { cookie: sessionAgainCookie } });
      expect(revoked.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('reports dependency readiness without exposing details', async () => {
    const sessions = new EncryptedSessionManager(new MemorySessionStore(), 'r'.repeat(64));
    const app = await buildApp({
      config,
      sessions,
      oidc: {} as OidcGateway,
      shlink: { health: async () => ({ status: 'pass', version: '5.2.0-cs.1' }), proxy: vi.fn() },
      serveStatic: false,
    });
    try {
      expect((await app.inject({ method: 'GET', url: '/health/live' })).json()).toEqual({ status: 'pass' });
      expect((await app.inject({ method: 'GET', url: '/health/ready' })).json()).toEqual({
        status: 'pass',
        dependencies: { sessions: 'pass', shlink: 'pass' },
      });
    } finally {
      await app.close();
    }
  });
});
