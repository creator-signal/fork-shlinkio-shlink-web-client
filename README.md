# Creator Signal Shlink web client

This fork is Creator Signal's authenticated operator UI for the paired Shlink server fork. It is not the upstream static, multi-server client.

The browser authenticates through ZITADEL OIDC Authorization Code + PKCE and receives only an opaque `HttpOnly`, `SameSite=Lax`, `Secure` session cookie. A Node backend-for-frontend stores encrypted sessions in Redis, requires the `platform:operator` project role, validates origin and CSRF tokens on mutations, and injects the Shlink management key only on the private server-to-server request.

The browser cannot create, edit, import, export, or persist server definitions. It receives one safe server identity from `/api/session`; no Shlink key or private URL is placed in JavaScript, storage, cookies, caches, requests, or exports. Browser local storage is retained only for non-sensitive display settings and tag colors.

See [Creator Signal fork governance and operations](docs/creator-signal-fork.md) for branch ownership, configuration, secret files, health checks, deployment hardening, validation, and releases.

## Development

```sh
npm ci
npm run cs
npm run types
npm run test:ci
npm run build
```

`npm run start:client` runs only the Vite browser development server. `npm start` runs the compiled BFF after `npm run build` and requires the runtime configuration documented in the operator guide.

## Upstream

The original Shlink web client is maintained at [shlinkio/shlink-web-client](https://github.com/shlinkio/shlink-web-client). The mirror branches `develop` and `main` remain dedicated to upstream history; Creator Signal changes live only on namespaced branches.

## License

MIT. See [LICENSE](LICENSE).
