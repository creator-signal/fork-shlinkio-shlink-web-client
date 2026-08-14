import { lstatSync, readFileSync } from 'node:fs';

export type RuntimeConfig = {
  environment: 'development' | 'test' | 'production';
  port: number;
  publicOrigin: URL;
  oidcIssuer: URL;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcRedirectUri: string;
  oidcPostLogoutRedirectUri: string;
  oidcProjectId: string;
  oidcRequiredRole: string;
  oidcRoleRevalidationSeconds: number;
  oidcAllowInsecure: boolean;
  shlinkBaseUrl: string;
  shlinkApiKey: string;
  shlinkDisplayName: string;
  shlinkMinimumVersion: string;
  redisUrl: string;
  sessionSecret: string;
  sessionTtlSeconds: number;
  upstreamTimeoutMs: number;
  upstreamMaxResponseBytes: number;
  cookieSecure: boolean;
};

const secretEnvironmentNames = ['OIDC_CLIENT_SECRET', 'SESSION_SECRET', 'SHLINK_API_KEY', 'REDIS_URL'] as const;

const requireValue = (env: NodeJS.ProcessEnv, name: string): string => {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const parseInteger = (
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const raw = env[name]?.trim();
  const value = raw ? Number(raw) : fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
};

const readSecret = (env: NodeJS.ProcessEnv, name: string, fallbackPath: string, minimumLength = 1): string => {
  const path = env[`${name}_FILE`]?.trim() || fallbackPath;
  const stats = lstatSync(path);
  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(`${name}_FILE must identify a regular, non-symbolic-link file`);
  }

  const value = readFileSync(path, 'utf8').trim();
  if (value.length < minimumLength) {
    throw new Error(`${name}_FILE does not contain a sufficiently long value`);
  }
  return value;
};

const validateUrl = (
  value: string,
  name: string,
  allowedProtocols: string[],
  options: { allowCredentials?: boolean } = {},
): URL => {
  const url = new URL(value);
  const credentialsForbidden = !options.allowCredentials && (url.username || url.password);
  if (!allowedProtocols.includes(url.protocol) || credentialsForbidden || url.search || url.hash) {
    throw new Error(`${name} is not an allowed URL`);
  }
  return url;
};

export const loadRuntimeConfig = (env: NodeJS.ProcessEnv = process.env): RuntimeConfig => {
  for (const name of secretEnvironmentNames) {
    if (env[name]) {
      throw new Error(`${name} must be supplied through ${name}_FILE, never as a plaintext environment value`);
    }
  }

  const environment = env.NODE_ENV === 'production' ? 'production' : env.NODE_ENV === 'test' ? 'test' : 'development';
  const nonProduction = environment !== 'production';
  const publicOrigin = validateUrl(
    requireValue(env, 'PUBLIC_ORIGIN'),
    'PUBLIC_ORIGIN',
    nonProduction ? ['http:', 'https:'] : ['https:'],
  );
  const oidcIssuer = validateUrl(
    requireValue(env, 'OIDC_ISSUER'),
    'OIDC_ISSUER',
    nonProduction ? ['http:', 'https:'] : ['https:'],
  );
  const shlinkBaseUrl = validateUrl(requireValue(env, 'SHLINK_INTERNAL_URL'), 'SHLINK_INTERNAL_URL', [
    'http:',
    'https:',
  ]);
  const redisUrl = validateUrl(
    readSecret(env, 'REDIS_URL', '/run/secrets/provider/shlink-web-redis-url'),
    'REDIS_URL_FILE',
    ['redis:', 'rediss:'],
    { allowCredentials: true },
  );
  const oidcRedirectUri = new URL('/auth/callback', publicOrigin).href;
  const oidcPostLogoutRedirectUri = new URL('/auth/logout/callback', publicOrigin).href;

  return {
    environment,
    port: parseInteger(env, 'PORT', 8080, 1, 65_535),
    publicOrigin,
    oidcIssuer,
    oidcClientId: requireValue(env, 'OIDC_CLIENT_ID'),
    oidcClientSecret: readSecret(env, 'OIDC_CLIENT_SECRET', '/run/secrets/provider/shlink-web-oidc-client-secret', 16),
    oidcRedirectUri,
    oidcPostLogoutRedirectUri,
    oidcProjectId: requireValue(env, 'OIDC_PROJECT_ID'),
    oidcRequiredRole: env.OIDC_REQUIRED_ROLE?.trim() || 'platform:operator',
    oidcRoleRevalidationSeconds: parseInteger(env, 'OIDC_ROLE_REVALIDATION_SECONDS', 60, 0, 300),
    oidcAllowInsecure: nonProduction && env.OIDC_ALLOW_INSECURE === 'true',
    shlinkBaseUrl: shlinkBaseUrl.href.replace(/\/$/, ''),
    shlinkApiKey: readSecret(env, 'SHLINK_API_KEY', '/run/secrets/provider/shlink-dashboard-api-key', 16),
    shlinkDisplayName: env.SHLINK_DISPLAY_NAME?.trim() || 'Creator Signal Links',
    shlinkMinimumVersion: env.SHLINK_MINIMUM_VERSION?.trim() || '5.2.0-cs.1',
    redisUrl: redisUrl.href,
    sessionSecret: readSecret(env, 'SESSION_SECRET', '/run/secrets/provider/shlink-web-session-key', 32),
    sessionTtlSeconds: parseInteger(env, 'SESSION_TTL_SECONDS', 3600, 300, 28_800),
    upstreamTimeoutMs: parseInteger(env, 'UPSTREAM_TIMEOUT_MS', 10_000, 500, 30_000),
    upstreamMaxResponseBytes: parseInteger(env, 'UPSTREAM_MAX_RESPONSE_BYTES', 2_097_152, 65_536, 8_388_608),
    cookieSecure: environment === 'production' || env.COOKIE_SECURE !== 'false',
  };
};
