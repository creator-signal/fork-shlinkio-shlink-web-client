# Creator Signal fork governance and releases

This repository preserves upstream Shlink branches while developing the Creator Signal operator client independently.

## Branch ownership

| Branch | Owner | Purpose | Direct Creator Signal commits |
| --- | --- | --- | --- |
| `develop` | upstream mirror | Fast-forward mirror of `shlinkio/shlink-web-client:develop` | Never |
| `main` | upstream mirror | Fast-forward mirror of `shlinkio/shlink-web-client:main` | Never |
| `creator-signal/develop` | Creator Signal | Integration branch and normal pull-request target | Through pull requests only |
| `creator-signal/main` | Creator Signal | Governed Creator Signal release source | Through promotion pull requests only |

Feature branches start from current `creator-signal/develop`. Upstream changes first fast-forward the mirror branches through the **Sync upstream mirror branches** workflow. A separate, reviewable sync branch then merges `develop` into `creator-signal/develop`; conflicts and client-specific behavior are resolved there. Never force-push a mirror or Creator Signal branch.

Promote `creator-signal/develop` to `creator-signal/main` only after its required checks pass and the intended release scope is documented. The upstream `main` mirror is not a Creator Signal release source.

## Release contract

The **Creator Signal release** workflow is manually dispatched from an exact commit on `creator-signal/main` with a semantic version. It:

1. checks the repository-owned release gate;
2. reruns style, type, test, distribution, container, and vulnerability checks;
3. generates an SPDX JSON SBOM;
4. publishes multi-platform `linux/amd64` and `linux/arm64` images to `ghcr.io/creator-signal/shlink-web-client`;
5. publishes per-platform SPDX SBOMs and a GitHub build-provenance attestation for the final manifest;
6. creates the namespaced `creator-signal-vX.Y.Z` tag and GitHub release only after the image is published successfully.

Published images have semantic-version, namespaced-version, and full-source-commit tags. Sales Pulse must pin the reported image digest and must not deploy `latest`.

`config/creator-signal-release-policy.json` is deliberately fail-closed. `productionReady` remains `false` until all security and browser-boundary acceptance criteria in [issue #1](https://github.com/creator-signal/fork-shlinkio-shlink-web-client/issues/1) pass. Changing it to `true` requires its own reviewed evidence; the pipeline alone does not make the current upstream static client production-ready.

## Credential boundary

The current upstream static application stores configured Shlink API keys in browser local storage. Creator Signal will not deploy it in that form. Issue #1 replaces direct browser-to-Shlink access with a server-side backend-for-frontend, ZITADEL `platform:operator` authorization, and a Shlink management key supplied only through a mounted secret file.

The release workflow must not be used to describe an image as production-ready until browser inspection proves no Shlink key or private API URL is present in JavaScript, HTML, storage, cookies, caches, network requests, logs, exports, or error reports.
