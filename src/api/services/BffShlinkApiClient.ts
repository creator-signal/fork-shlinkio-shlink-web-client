import type {
  Abortable,
  ShlinkApiClient,
  ShlinkCreateShortUrlData,
  ShlinkDeleteVisitsResult,
  ShlinkDomainRedirects,
  ShlinkDomainsList,
  ShlinkEditDomainRedirects,
  ShlinkEditShortUrlData,
  ShlinkHealth,
  ShlinkMercureInfo,
  ShlinkOrphanVisitsParams,
  ShlinkRedirectRulesList,
  ShlinkRenaming,
  ShlinkSetRedirectRulesData,
  ShlinkShortUrl,
  ShlinkShortUrlIdentifier,
  ShlinkShortUrlsList,
  ShlinkShortUrlsListParams,
  ShlinkTagsList,
  ShlinkTagsStatsList,
  ShlinkVisitsList,
  ShlinkVisitsOverview,
  ShlinkVisitsParams,
  ShlinkWithDomainVisitsParams,
} from '@shlinkio/shlink-js-sdk/api-contract';
import type { HttpClient, RequestOptions } from './HttpClient';

const baseUrl = '/api/shlink/rest/v3';

const queryValue = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  throw new Error('Unsupported Shlink query parameter');
};

const queryString = (params: Record<string, unknown> = {}) => {
  const entries = Object.entries(params).flatMap(([key, value]) => {
    if (value === undefined || value === null) {
      return [];
    }
    return Array.isArray(value) ? value.map((item) => [`${key}[]`, queryValue(item)]) : [[key, queryValue(value)]];
  });
  return new URLSearchParams(entries).toString();
};

const urlFor = (path: string, query?: Record<string, unknown>) => {
  const serialized = queryString(query);
  return `${baseUrl}${path}${serialized ? `?${serialized}` : ''}`;
};

const shortUrlPath = ({ shortCode }: ShlinkShortUrlIdentifier) => `/short-urls/${encodeURIComponent(shortCode)}`;

export class BffShlinkApiClient implements ShlinkApiClient {
  public constructor(private readonly httpClient: HttpClient) {}

  private json<T>(path: string, options: RequestOptions = {}, query?: Record<string, unknown>) {
    return this.httpClient.jsonRequest<T>(urlFor(path, query), options);
  }

  private empty(path: string, options: RequestOptions = {}, query?: Record<string, unknown>) {
    return this.httpClient.emptyRequest(urlFor(path, query), options);
  }

  public async listShortUrls({ signal, orderBy = {}, ...params }: ShlinkShortUrlsListParams & Abortable = {}) {
    const response = await this.json<{ shortUrls: ShlinkShortUrlsList }>(
      '/short-urls',
      { signal },
      {
        ...params,
        excludeMaxVisitsReached: params.excludeMaxVisitsReached === true ? 'true' : undefined,
        excludePastValidUntil: params.excludePastValidUntil === true ? 'true' : undefined,
        orderBy: orderBy.dir ? `${orderBy.field}-${orderBy.dir}` : undefined,
      },
    );
    return response.shortUrls;
  }

  public createShortUrl({ signal, ...data }: ShlinkCreateShortUrlData & Abortable) {
    return this.json<ShlinkShortUrl>('/short-urls', { method: 'POST', body: JSON.stringify(data), signal });
  }

  public getShortUrl(identifier: ShlinkShortUrlIdentifier, { signal }: Abortable = {}) {
    return this.json<ShlinkShortUrl>(shortUrlPath(identifier), { signal }, { domain: identifier.domain });
  }

  public deleteShortUrl(identifier: ShlinkShortUrlIdentifier, { signal }: Abortable = {}) {
    return this.empty(shortUrlPath(identifier), { method: 'DELETE', signal }, { domain: identifier.domain });
  }

  public updateShortUrl(identifier: ShlinkShortUrlIdentifier, { signal, ...data }: ShlinkEditShortUrlData & Abortable) {
    return this.json<ShlinkShortUrl>(
      shortUrlPath(identifier),
      { method: 'PATCH', body: JSON.stringify(data), signal },
      { domain: identifier.domain },
    );
  }

  public getShortUrlRedirectRules(identifier: ShlinkShortUrlIdentifier, { signal }: Abortable = {}) {
    return this.json<ShlinkRedirectRulesList>(
      `${shortUrlPath(identifier)}/redirect-rules`,
      { signal },
      {
        domain: identifier.domain,
      },
    );
  }

  public setShortUrlRedirectRules(
    identifier: ShlinkShortUrlIdentifier,
    { signal, ...data }: ShlinkSetRedirectRulesData & Abortable,
  ) {
    return this.json<ShlinkRedirectRulesList>(
      `${shortUrlPath(identifier)}/redirect-rules`,
      { method: 'POST', body: JSON.stringify(data), signal },
      { domain: identifier.domain },
    );
  }

  public async getVisitsOverview({ signal }: Abortable = {}) {
    const response = await this.json<{ visits: ShlinkVisitsOverview }>('/visits', { signal });
    return response.visits;
  }

  private async visits(path: string, params: Record<string, unknown>, signal?: AbortSignal) {
    const response = await this.json<{ visits: ShlinkVisitsList }>(path, { signal }, params);
    return response.visits;
  }

  public getShortUrlVisits(
    identifier: ShlinkShortUrlIdentifier,
    { signal, ...params }: ShlinkVisitsParams & Abortable = {},
  ) {
    return this.visits(`${shortUrlPath(identifier)}/visits`, { ...params, domain: identifier.domain }, signal);
  }

  public getTagVisits(tag: string, { signal, ...params }: ShlinkWithDomainVisitsParams & Abortable = {}) {
    return this.visits(`/tags/${encodeURIComponent(tag)}/visits`, params, signal);
  }

  public getDomainVisits(domain: string, { signal, ...params }: ShlinkVisitsParams & Abortable = {}) {
    return this.visits(`/domains/${encodeURIComponent(domain)}/visits`, params, signal);
  }

  public getOrphanVisits({ signal, ...params }: ShlinkOrphanVisitsParams & Abortable = {}) {
    return this.visits('/visits/orphan', params, signal);
  }

  public getNonOrphanVisits({ signal, ...params }: ShlinkWithDomainVisitsParams & Abortable = {}) {
    return this.visits('/visits/non-orphan', params, signal);
  }

  public deleteShortUrlVisits(identifier: ShlinkShortUrlIdentifier, { signal }: Abortable = {}) {
    return this.json<ShlinkDeleteVisitsResult>(
      `${shortUrlPath(identifier)}/visits`,
      { method: 'DELETE', signal },
      { domain: identifier.domain },
    );
  }

  public deleteOrphanVisits({ signal }: Abortable = {}) {
    return this.json<ShlinkDeleteVisitsResult>('/visits/orphan', { method: 'DELETE', signal });
  }

  public async listTags({ signal }: Abortable = {}) {
    const response = await this.json<{ tags: ShlinkTagsList }>('/tags', { signal });
    return response.tags;
  }

  public async tagsStats({ signal }: Abortable = {}) {
    const response = await this.json<{ tags: ShlinkTagsStatsList }>('/tags/stats', { signal });
    return response.tags;
  }

  public async deleteTags(tags: string[], { signal }: Abortable = {}) {
    await this.empty('/tags', { method: 'DELETE', signal }, { tags });
    return { tags };
  }

  public async editTag({ oldName, newName }: ShlinkRenaming, { signal }: Abortable = {}) {
    await this.empty('/tags', { method: 'PUT', body: JSON.stringify({ oldName, newName }), signal });
    return { oldName, newName };
  }

  public async listDomains({ signal }: Abortable = {}) {
    const response = await this.json<{ domains: ShlinkDomainsList }>('/domains', { signal });
    return response.domains;
  }

  public editDomainRedirects(data: ShlinkEditDomainRedirects, { signal }: Abortable = {}) {
    return this.json<ShlinkDomainRedirects>('/domains/redirects', {
      method: 'PATCH',
      body: JSON.stringify(data),
      signal,
    });
  }

  public health({ signal }: Abortable = {}) {
    return this.json<ShlinkHealth>('/health', { signal });
  }

  public async mercureInfo(_options: Abortable = {}): Promise<ShlinkMercureInfo> {
    throw new Error('Realtime credentials are not exposed through the Creator Signal browser boundary');
  }
}
