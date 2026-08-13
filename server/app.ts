import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyReply, type FastifyRequest, LogController } from 'fastify';
import type { RuntimeConfig } from './config.js';
import type { OidcGateway } from './oidc.js';
import type { AuthSession, EncryptedSessionManager, LoginTransaction } from './session.js';
import type { ShlinkGateway } from './shlink.js';

export type AppDependencies = {
  config: RuntimeConfig;
  sessions: EncryptedSessionManager;
  oidc: OidcGateway;
  shlink: ShlinkGateway;
  staticRoot?: string;
  serveStatic?: boolean;
};

type AuthenticatedSession = { id: string; value: AuthSession };

const randomValue = () => randomBytes(32).toString('base64url');
const actorId = (subject: string) => createHash('sha256').update(subject).digest('hex').slice(0, 16);
const safePath = (url: string) => url.split('?', 1)[0];
const routePath = (request: { routeOptions: { url?: string }; raw: { url?: string }; url: string }) =>
  request.routeOptions.url || safePath(request.raw.url || request.url);
const hasJsonContentType = (request: FastifyRequest) =>
  request.headers['content-type']?.split(';', 1)[0] === 'application/json';

export const buildApp = async ({
  config,
  sessions,
  oidc,
  shlink,
  staticRoot = resolve(process.cwd(), 'build'),
  serveStatic = true,
}: AppDependencies) => {
  const sessionCookie = config.cookieSecure ? '__Host-cs_shlink_session' : 'cs_shlink_session';
  const loginCookie = config.cookieSecure ? '__Host-cs_shlink_login' : 'cs_shlink_login';
  const app = Fastify({
    bodyLimit: 1_048_576,
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: false,
    logger: {
      level: config.environment === 'test' ? 'silent' : 'info',
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.headers.x-api-key',
          'res.headers.set-cookie',
          '*.accessToken',
          '*.idToken',
          '*.csrfToken',
        ],
        censor: '[REDACTED]',
      },
    },
    genReqId: (request) => {
      const supplied = request.headers['x-request-id'];
      return typeof supplied === 'string' && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : randomValue();
    },
  });

  await app.register(cookie);
  if (serveStatic) {
    await app.register(fastifyStatic, { root: staticRoot, serve: false });
  }

  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax' as const,
  };
  const clearCookie = (reply: FastifyReply, name: string) => reply.clearCookie(name, cookieOptions);
  const setSessionCookie = (reply: FastifyReply, id: string, maxAge: number) =>
    reply.setCookie(sessionCookie, sessions.createToken(id), { ...cookieOptions, maxAge });

  const destroySession = async (reply: FastifyReply, id: string | null) => {
    if (id) {
      await sessions.delete(id);
    }
    clearCookie(reply, sessionCookie);
  };

  const authenticate = async (request: FastifyRequest, reply: FastifyReply): Promise<AuthenticatedSession | null> => {
    const id = sessions.verifyToken(request.cookies[sessionCookie]);
    const value = id ? await sessions.get<AuthSession>(id, 'auth') : null;
    if (!id || !value || value.expiresAt <= Date.now()) {
      await destroySession(reply, id);
      return null;
    }

    const revalidationDue =
      config.oidcRoleRevalidationSeconds === 0 ||
      value.lastRoleCheckAt + config.oidcRoleRevalidationSeconds * 1000 <= Date.now();
    if (revalidationDue) {
      const allowed = await oidc.hasRequiredRole(value.accessToken, value.subject);
      if (!allowed) {
        request.log.warn({ event: 'auth.role_denied', actor: actorId(value.subject), requestId: request.id });
        await destroySession(reply, id);
        return null;
      }
      value.lastRoleCheckAt = Date.now();
      await sessions.put(id, value, Math.max(1, Math.floor((value.expiresAt - Date.now()) / 1000)));
    }
    return { id, value };
  };

  const requireApiSession = async (request: FastifyRequest, reply: FastifyReply) => {
    const authenticated = await authenticate(request, reply);
    if (!authenticated) {
      await reply.code(401).send({ title: 'Authentication required', status: 401, loginUrl: '/auth/login' });
      return null;
    }
    return authenticated;
  };

  const verifyMutation = async (request: FastifyRequest, reply: FastifyReply, session: AuthSession) => {
    if (
      request.headers.origin !== config.publicOrigin.origin ||
      request.headers['x-csrf-token'] !== session.csrfToken ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      request.log.warn({ event: 'request.csrf_denied', actor: actorId(session.subject), requestId: request.id });
      await reply.code(403).send({ title: 'Request verification failed', status: 403 });
      return false;
    }
    return true;
  };

  app.addHook('onSend', async (request, reply, payload) => {
    const path = routePath(request);
    reply.header('X-Request-Id', request.id);
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; worker-src 'none'; manifest-src 'self'",
    );
    if (config.environment === 'production') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    reply.header('Cache-Control', path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store');
    return payload;
  });

  app.addHook('onResponse', async (request, reply) => {
    request.log.info({
      event: 'http.request',
      method: request.method,
      path: routePath(request),
      status: reply.statusCode,
      requestId: request.id,
    });
  });

  app.setErrorHandler(async (error, request, reply) => {
    const candidateStatus =
      typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 500;
    const status = candidateStatus >= 400 && candidateStatus < 500 ? candidateStatus : 500;
    request.log[status === 500 ? 'error' : 'warn']({
      event: 'http.error',
      method: request.method,
      path: routePath(request),
      requestId: request.id,
    });
    await reply.code(status).send({
      title: status === 500 ? 'Unexpected server error' : 'Invalid request',
      status,
      requestId: request.id,
    });
  });

  app.get('/health/live', async () => ({ status: 'pass' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await sessions.ping();
      const health = await shlink.health();
      if (health.status !== 'pass') {
        throw new Error('Shlink compatibility check failed');
      }
      return { status: 'pass', dependencies: { sessions: 'pass', shlink: 'pass' } };
    } catch {
      return reply.code(503).send({ status: 'fail', dependencies: { sessions: 'unknown', shlink: 'fail' } });
    }
  });

  app.get('/auth/login', async (_request, reply) => {
    const id = sessions.createId();
    const transaction: LoginTransaction = {
      kind: 'login',
      state: randomValue(),
      nonce: randomValue(),
      codeVerifier: randomValue(),
      expiresAt: Date.now() + 300_000,
    };
    await sessions.put(id, transaction, 300);
    reply.setCookie(loginCookie, sessions.createToken(id), { ...cookieOptions, maxAge: 300 });
    return reply.redirect((await oidc.createAuthorizationUrl(transaction)).href);
  });

  app.get('/auth/callback', async (request, reply) => {
    const loginId = sessions.verifyToken(request.cookies[loginCookie]);
    const transaction = loginId ? await sessions.get<LoginTransaction>(loginId, 'login') : null;
    if (!loginId || !transaction) {
      clearCookie(reply, loginCookie);
      return reply.code(400).send({ title: 'Login transaction is invalid or expired', status: 400 });
    }
    await sessions.delete(loginId);
    clearCookie(reply, loginCookie);

    try {
      const callbackUrl = new URL(request.raw.url || request.url, config.publicOrigin);
      const identity = await oidc.exchange(callbackUrl, transaction);
      const id = sessions.createId();
      const session: AuthSession = {
        kind: 'auth',
        subject: identity.subject,
        displayName: identity.displayName,
        roles: identity.roles,
        csrfToken: randomValue(),
        accessToken: identity.accessToken,
        idToken: identity.idToken,
        expiresAt: identity.expiresAt,
        lastRoleCheckAt: Date.now(),
      };
      const ttl = Math.max(1, Math.floor((identity.expiresAt - Date.now()) / 1000));
      await sessions.put(id, session, ttl);
      setSessionCookie(reply, id, ttl);
      request.log.info({ event: 'auth.login', actor: actorId(identity.subject), requestId: request.id });
      return reply.redirect('/');
    } catch {
      request.log.warn({ event: 'auth.login_denied', requestId: request.id });
      return reply.code(403).send({ title: 'Login was not authorized', status: 403 });
    }
  });

  app.post('/auth/logout', async (request, reply) => {
    const authenticated = await requireApiSession(request, reply);
    if (!authenticated || !(await verifyMutation(request, reply, authenticated.value))) {
      return;
    }
    const logoutUrl = oidc.createLogoutUrl(authenticated.value.idToken).href;
    request.log.info({ event: 'auth.logout', actor: actorId(authenticated.value.subject), requestId: request.id });
    await destroySession(reply, authenticated.id);
    return { logoutUrl };
  });

  app.get('/auth/logout/callback', async (request, reply) => {
    const id = sessions.verifyToken(request.cookies[sessionCookie]);
    await destroySession(reply, id);
    return reply.redirect('/');
  });

  app.get('/api/session', async (request, reply) => {
    const authenticated = await requireApiSession(request, reply);
    if (!authenticated) {
      return;
    }
    const health = await shlink.health();
    if (health.status !== 'pass') {
      return reply
        .code(503)
        .send({ title: 'The configured Shlink version is unavailable or unsupported', status: 503 });
    }
    return {
      user: { displayName: authenticated.value.displayName },
      csrfToken: authenticated.value.csrfToken,
      server: { id: 'creator-signal', name: config.shlinkDisplayName, version: health.version, autoConnect: true },
    };
  });

  app.all('/api/shlink/*', async (request, reply) => {
    const authenticated = await requireApiSession(request, reply);
    if (!authenticated) {
      return;
    }
    const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method);
    if (mutating && !(await verifyMutation(request, reply, authenticated.value))) {
      return;
    }
    if (request.headers.authorization || request.headers['x-api-key']) {
      return reply.code(400).send({ title: 'Browser-supplied credentials are not accepted', status: 400 });
    }
    if (mutating && request.body !== undefined && !hasJsonContentType(request)) {
      return reply.code(415).send({ title: 'Content-Type must be application/json', status: 415 });
    }

    const incoming = new URL(request.raw.url || request.url, config.publicOrigin);
    const path = incoming.pathname.slice('/api/shlink'.length);
    const result = await shlink.proxy({
      method: request.method,
      path,
      query: incoming.searchParams.toString(),
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
      requestId: request.id,
    });
    request.log.info({
      event: mutating ? 'shlink.mutation' : 'shlink.read',
      actor: actorId(authenticated.value.subject),
      method: request.method,
      operation: request.routeOptions.url,
      status: result.status,
      requestId: result.requestId,
    });
    reply.code(result.status).header('X-Request-Id', result.requestId);
    if (result.contentType) {
      reply.type(result.contentType);
    }
    return result.body;
  });

  if (serveStatic) {
    app.get('/assets/*', async (request, reply) =>
      reply.sendFile(`assets/${(request.params as { '*': string })['*']}`),
    );
    app.get('/icons/*', async (request, reply) => reply.sendFile(`icons/${(request.params as { '*': string })['*']}`));
    for (const file of ['favicon.ico', 'favicon.svg', 'favicon.png', 'favicon.gif']) {
      app.get(`/${file}`, async (_request, reply) => reply.sendFile(file));
    }
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url.startsWith('/auth/')) {
      return reply.code(404).send({ title: 'Not found', status: 404 });
    }
    const authenticated = await authenticate(request, reply);
    if (!authenticated) {
      return reply.redirect('/auth/login');
    }
    return serveStatic ? reply.type('text/html; charset=utf-8').sendFile('index.html') : reply.code(404).send();
  });

  return app;
};
