import * as oidc from 'openid-client';
import type { RuntimeConfig } from './config.js';
import type { LoginTransaction } from './session.js';

export type OidcIdentity = {
  subject: string;
  displayName: string;
  roles: string[];
  accessToken: string;
  idToken: string;
  expiresAt: number;
};

export interface OidcGateway {
  createAuthorizationUrl(transaction: LoginTransaction): Promise<URL>;
  exchange(callbackUrl: URL, transaction: LoginTransaction): Promise<OidcIdentity>;
  hasRequiredRole(accessToken: string, subject: string): Promise<boolean>;
  createLogoutUrl(idToken: string): URL;
}

const audienceContains = (audience: unknown, expected: string): boolean =>
  audience === expected || (Array.isArray(audience) && audience.includes(expected));

export const extractZitadelRoles = (claims: Record<string, unknown>, projectId: string): string[] => {
  const candidates = [
    claims[`urn:zitadel:iam:org:project:${projectId}:roles`],
    claims['urn:zitadel:iam:org:project:roles'],
  ];
  return [
    ...new Set(
      candidates.flatMap((candidate) =>
        candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? Object.keys(candidate) : [],
      ),
    ),
  ];
};

export const createOidcGateway = async (config: RuntimeConfig): Promise<OidcGateway> => {
  const execute = config.oidcAllowInsecure ? [oidc.allowInsecureRequests] : undefined;
  const clientConfiguration = await oidc.discovery(
    config.oidcIssuer,
    config.oidcClientId,
    {
      client_id: config.oidcClientId,
      client_secret: config.oidcClientSecret,
      token_endpoint_auth_method: 'client_secret_basic',
    },
    oidc.ClientSecretBasic(config.oidcClientSecret),
    { execute },
  );
  clientConfiguration.timeout = Math.ceil(config.upstreamTimeoutMs / 1000);

  const roleScopes = [
    'openid',
    'profile',
    'email',
    'urn:zitadel:iam:org:projects:roles',
    `urn:zitadel:iam:org:project:id:${config.oidcProjectId}:aud`,
    `urn:zitadel:iam:org:project:role:${config.oidcRequiredRole}`,
  ];

  const rolesFor = (claims: Record<string, unknown>) => extractZitadelRoles(claims, config.oidcProjectId);

  return {
    async createAuthorizationUrl(transaction) {
      return oidc.buildAuthorizationUrl(clientConfiguration, {
        redirect_uri: config.oidcRedirectUri,
        response_type: 'code',
        scope: roleScopes.join(' '),
        state: transaction.state,
        nonce: transaction.nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(transaction.codeVerifier),
        code_challenge_method: 'S256',
      });
    },

    async exchange(callbackUrl, transaction) {
      const tokens = await oidc.authorizationCodeGrant(clientConfiguration, callbackUrl, {
        expectedState: transaction.state,
        expectedNonce: transaction.nonce,
        pkceCodeVerifier: transaction.codeVerifier,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      if (
        !claims ||
        claims.iss !== config.oidcIssuer.href.replace(/\/$/, '') ||
        !audienceContains(claims.aud, config.oidcClientId) ||
        typeof claims.sub !== 'string' ||
        typeof claims.exp !== 'number' ||
        !tokens.id_token
      ) {
        throw new Error('The OIDC token set did not satisfy the required identity claims');
      }

      const userInfo = await oidc.fetchUserInfo(clientConfiguration, tokens.access_token, claims.sub);
      const roles = rolesFor(userInfo as Record<string, unknown>);
      if (!roles.includes(config.oidcRequiredRole)) {
        throw new Error('The authenticated identity does not have the required operator role');
      }

      const accessExpiresAt = Date.now() + (tokens.expiresIn() ?? config.sessionTtlSeconds) * 1000;
      const expiresAt = Math.min(claims.exp * 1000, accessExpiresAt, Date.now() + config.sessionTtlSeconds * 1000);
      return {
        subject: claims.sub,
        displayName:
          (typeof userInfo.name === 'string' && userInfo.name) ||
          (typeof userInfo.preferred_username === 'string' && userInfo.preferred_username) ||
          'Creator Signal operator',
        roles,
        accessToken: tokens.access_token,
        idToken: tokens.id_token,
        expiresAt,
      };
    },

    async hasRequiredRole(accessToken, subject) {
      try {
        const userInfo = await oidc.fetchUserInfo(clientConfiguration, accessToken, subject);
        return rolesFor(userInfo as Record<string, unknown>).includes(config.oidcRequiredRole);
      } catch {
        return false;
      }
    },

    createLogoutUrl(idToken) {
      return oidc.buildEndSessionUrl(clientConfiguration, {
        id_token_hint: idToken,
        client_id: config.oidcClientId,
        post_logout_redirect_uri: config.oidcPostLogoutRedirectUri,
      });
    },
  };
};
