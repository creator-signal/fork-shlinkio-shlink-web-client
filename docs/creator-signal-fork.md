# Creator Signal Shlink web client

## Branch and release ownership

| Branch | Purpose |
| --- | --- |
| `develop`, `main` | Exact fast-forward mirrors of `shlinkio/shlink-web-client`; never receive Creator Signal commits. |
| `creator-signal/develop` | Default integration and normal pull-request target. |
| `creator-signal/main` | Governed Creator Signal release source. |

Feature branches start from current `creator-signal/develop`. The upstream-sync workflow advances mirror branches only by fast-forward. A normal reviewed merge brings upstream `develop` into the namespaced integration branch. Release promotion is a pull request from `creator-signal/develop` to `creator-signal/main`; no branch is force-pushed.

## Trust boundary

The Node BFF owns all privileged state:

- ZITADEL discovery, Authorization Code exchange, PKCE verifier, state and nonce;
- issuer, audience, subject, expiry and ID-token validation through `openid-client`;
- initial and periodic `platform:operator` project-role enforcement through UserInfo;
- encrypted Redis session records containing upstream tokens and a per-session CSRF token;
- an HMAC-authenticated random session identifier in an `HttpOnly`, `Secure`, `SameSite=Lax`, host-only cookie;
- the Shlink management key, read only from a regular, non-symlink secret file;
- a strict method/path/query allow-list for Shlink REST API v3;
- exact-origin and CSRF validation for mutations, bounded bodies/responses, timeouts, no upstream redirects, and sanitized audit logs.

The browser receives a display name, CSRF token, and fixed public server identity. It cannot submit credentials to the proxy. Multi-server management, server import/export, PWA/service-worker caching, `servers.json`, and persisted server state were removed. Local storage is limited to UI settings under `shlink.settings` and non-sensitive tag colors under the existing storage abstraction.

## Runtime configuration

Non-secret environment values:

| Variable | Purpose |
| --- | --- |
| `PUBLIC_ORIGIN` | External HTTPS origin, such as `https://links.creatorsignal.me`. |
| `OIDC_ISSUER` | ZITADEL issuer URL. |
| `OIDC_CLIENT_ID` | Confidential web application client ID. |
| `OIDC_PROJECT_ID` | Project containing the role claim. |
| `OIDC_REQUIRED_ROLE` | Defaults to `platform:operator`. |
| `SHLINK_INTERNAL_URL` | Private Shlink origin; never emitted to the browser. |
| `SHLINK_DISPLAY_NAME` | Safe UI label. |
| `SHLINK_MINIMUM_VERSION` | Defaults to `5.2.0-cs.1`. |
| `PORT` | Listener port, default `8080`. |

Secrets are file-only. Plaintext `OIDC_CLIENT_SECRET`, `SESSION_SECRET`, `SHLINK_API_KEY`, and `REDIS_URL` environment values make startup fail.

| File variable | Default provider path |
| --- | --- |
| `OIDC_CLIENT_SECRET_FILE` | `/run/secrets/provider/shlink-web-oidc-client-secret` |
| `SESSION_SECRET_FILE` | `/run/secrets/provider/shlink-web-session-key` |
| `SHLINK_API_KEY_FILE` | `/run/secrets/provider/shlink-dashboard-api-key` |
| `REDIS_URL_FILE` | `/run/secrets/provider/shlink-web-redis-url` |

The paired Shlink initializer creates the management key with `shlink api-key:provision-file creator-signal-web-ui /run/secrets/provider/shlink-dashboard-api-key`. Only that initializer and this BFF may mount the file.

Register the ZITADEL confidential web application with:

- redirect URI: `${PUBLIC_ORIGIN}/auth/callback`;
- post-logout URI: `${PUBLIC_ORIGIN}/auth/logout/callback`;
- Authorization Code flow and PKCE S256;
- project role claims and the `platform:operator` role assignment;
- no implicit or resource-owner-password flow.

## Health and deployment

- `GET /health/live` proves the process is responsive.
- `GET /health/ready` requires Redis and a compatible authenticated Shlink health response.
- all application and API routes require an OIDC session except login/callback, health and static assets;
- the image runs as UID/GID `10001`, has no npm CLI in the runtime layer, and needs no writable application filesystem.

Deploy with a read-only root filesystem, `/tmp` tmpfs, dropped Linux capabilities, `no-new-privileges`, a private Redis network and a private BFF-to-Shlink network. Expose only the BFF through the public edge. Pin both server and client image digests; never deploy a mutable tag.

## Validation and release

`config/creator-signal-compatibility.json` binds `4.8.1-cs.2` to Shlink `>=5.2.0-cs.1 <6.0.0` and REST v3. CI runs style, browser and Node type checks, browser coverage, adversarial BFF tests, dependency/secret/config scans, the compiled-browser boundary scan, amd64 vulnerability scanning, and an arm64 build proof.

The governed release workflow runs only from exact `creator-signal/main`, matches the requested version to both repository manifests, refuses existing tags/images, rebuilds and scans both architectures, and stages every image archive and SPDX SBOM under a repository-relative directory so downloaded artifacts have the deterministic flat layout used by the publish job. It emits GitHub OIDC provenance, publishes `ghcr.io/creator-signal/shlink-web-client`, then creates `creator-signal-v4.8.1-cs.2` and the GitHub release last. It never publishes `latest`.

`4.8.1-cs.1` is a retired partial registry publication from an aborted release transaction. It has no supported GitHub release and must not be deployed, deleted, retagged or overwritten. `4.8.1-cs.2` is the first supported Creator Signal web-client release.

A fork release is not production deployment authorization. The stack still requires STAGE OIDC/browser acceptance, preserved-data Shlink migration/backup/restore evidence, and an explicitly approved production promotion.
