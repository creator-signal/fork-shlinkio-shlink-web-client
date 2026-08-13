import { randomUUID } from 'node:crypto';
import { compareVersions } from 'compare-versions';
import type { RuntimeConfig } from './config.js';

export type ShlinkProxyRequest = {
  method: string;
  path: string;
  query: string;
  body?: string;
  requestId?: string;
};

export type ShlinkProxyResponse = {
  status: number;
  contentType?: string;
  body?: Buffer;
  requestId: string;
};

export interface ShlinkGateway {
  health(): Promise<{ status: 'pass' | 'fail'; version: string }>;
  proxy(request: ShlinkProxyRequest): Promise<ShlinkProxyResponse>;
}

const allowedRoutes: Array<{ methods: string[]; pattern: RegExp }> = [
  { methods: ['GET'], pattern: /^\/rest\/v3\/health$/ },
  { methods: ['GET', 'POST'], pattern: /^\/rest\/v3\/short-urls$/ },
  { methods: ['GET', 'PATCH', 'DELETE'], pattern: /^\/rest\/v3\/short-urls\/[^/]+$/ },
  { methods: ['GET', 'POST'], pattern: /^\/rest\/v3\/short-urls\/[^/]+\/redirect-rules$/ },
  { methods: ['GET', 'DELETE'], pattern: /^\/rest\/v3\/short-urls\/[^/]+\/visits$/ },
  { methods: ['GET'], pattern: /^\/rest\/v3\/visits$/ },
  { methods: ['GET', 'DELETE'], pattern: /^\/rest\/v3\/visits\/orphan$/ },
  { methods: ['GET'], pattern: /^\/rest\/v3\/visits\/non-orphan$/ },
  { methods: ['GET', 'PUT', 'DELETE'], pattern: /^\/rest\/v3\/tags$/ },
  { methods: ['GET'], pattern: /^\/rest\/v3\/tags\/stats$/ },
  { methods: ['GET'], pattern: /^\/rest\/v3\/tags\/[^/]+\/visits$/ },
  { methods: ['GET'], pattern: /^\/rest\/v3\/domains$/ },
  { methods: ['PATCH'], pattern: /^\/rest\/v3\/domains\/redirects$/ },
  { methods: ['GET'], pattern: /^\/rest\/v3\/domains\/[^/]+\/visits$/ },
];

const allowedQueryParameters = new Set([
  'page',
  'itemsPerPage',
  'searchTerm',
  'domain',
  'tags[]',
  'tagsMode',
  'excludeTags[]',
  'excludeTagsMode',
  'orderBy',
  'startDate',
  'endDate',
  'excludeBots',
  'type',
  'apiKeyName',
  'excludeMaxVisitsReached',
  'excludePastValidUntil',
]);

export const isAllowedShlinkRequest = (method: string, path: string, query: URLSearchParams): boolean =>
  allowedRoutes.some(({ methods, pattern }) => methods.includes(method) && pattern.test(path)) &&
  [...query.keys()].every((key) => key.toLowerCase() !== 'apikey' && allowedQueryParameters.has(key));

const readBoundedBody = async (response: Response, maximumBytes: number): Promise<Buffer> => {
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    length += value.byteLength;
    if (length > maximumBytes) {
      await reader.cancel();
      throw new Error('The Shlink response exceeded the configured maximum size');
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
};

export const createShlinkGateway = (config: RuntimeConfig): ShlinkGateway => {
  return {
    async health() {
      try {
        const response = await fetch(new URL('/rest/v3/health', `${config.shlinkBaseUrl}/`), {
          redirect: 'error',
          signal: AbortSignal.timeout(config.upstreamTimeoutMs),
          headers: { Accept: 'application/json', 'X-Api-Key': config.shlinkApiKey },
        });
        const body = await readBoundedBody(response, 65_536);
        const health = JSON.parse(body.toString('utf8')) as { status?: unknown; version?: unknown };
        if (
          !response.ok ||
          health.status !== 'pass' ||
          typeof health.version !== 'string' ||
          compareVersions(health.version, config.shlinkMinimumVersion) < 0
        ) {
          return { status: 'fail', version: typeof health.version === 'string' ? health.version : 'unknown' };
        }
        return { status: 'pass', version: health.version };
      } catch {
        return { status: 'fail', version: 'unknown' };
      }
    },

    async proxy(request) {
      const query = new URLSearchParams(request.query);
      if (!isAllowedShlinkRequest(request.method, request.path, query)) {
        return {
          status: 404,
          contentType: 'application/problem+json',
          body: Buffer.from(JSON.stringify({ title: 'Unsupported Shlink operation', status: 404 })),
          requestId: request.requestId || randomUUID(),
        };
      }

      const requestId = request.requestId || randomUUID();
      const target = new URL(`${request.path}${request.query ? `?${request.query}` : ''}`, `${config.shlinkBaseUrl}/`);
      try {
        const response = await fetch(target, {
          method: request.method,
          redirect: 'error',
          signal: AbortSignal.timeout(config.upstreamTimeoutMs),
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Api-Key': config.shlinkApiKey,
            'X-Request-Id': requestId,
          },
          body: request.body,
        });
        const responseRequestId = response.headers.get('x-request-id') || requestId;
        if (response.status >= 500) {
          await response.body?.cancel();
          return {
            status: 502,
            contentType: 'application/problem+json',
            body: Buffer.from(JSON.stringify({ title: 'Shlink is temporarily unavailable', status: 502 })),
            requestId: responseRequestId,
          };
        }
        return {
          status: response.status,
          contentType: response.headers.get('content-type') || undefined,
          body: await readBoundedBody(response, config.upstreamMaxResponseBytes),
          requestId: responseRequestId,
        };
      } catch (error) {
        const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
        return {
          status: timedOut ? 504 : 502,
          contentType: 'application/problem+json',
          body: Buffer.from(
            JSON.stringify({
              title: timedOut ? 'Shlink request timed out' : 'Shlink is unavailable',
              status: timedOut ? 504 : 502,
            }),
          ),
          requestId,
        };
      }
    },
  };
};
