FROM node:26.5-alpine@sha256:233761595746769ebfdb6090f44fc7cdf818ae0ce62d2b37e0367723b9823e36 AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG VERSION
ENV VERSION=$VERSION
RUN test -n "$VERSION" \
    && node --run build \
    && npm prune --omit=dev \
    && npm cache clean --force

FROM node:26.5-alpine@sha256:233761595746769ebfdb6090f44fc7cdf818ae0ce62d2b37e0367723b9823e36

ARG VERSION
LABEL org.opencontainers.image.title="Creator Signal Shlink web client" \
      org.opencontainers.image.description="OIDC-protected Shlink operator UI with a server-side credential boundary" \
      org.opencontainers.image.source="https://github.com/creator-signal/fork-shlinkio-shlink-web-client" \
      org.opencontainers.image.version="$VERSION"

ENV NODE_ENV=production \
    PORT=8080
WORKDIR /app

RUN apk upgrade --no-cache \
    && addgroup -S -g 10001 shlinkweb \
    && adduser -S -D -H -u 10001 -G shlinkweb shlinkweb \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/server-dist ./server-dist

USER 10001:10001
EXPOSE 8080
STOPSIGNAL SIGTERM
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 CMD ["node", "/app/server-dist/healthcheck.js"]
ENTRYPOINT ["node", "/app/server-dist/index.js"]
