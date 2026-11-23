# Multi-stage unprivileged Dockerfile for Radar
# Node 24 LTS, not 26: Node 26 bundles undici 8, whose fetch hangs on HTTPS answers of several
# megabytes (see CHANGELOG 0.44.7). The undici package is held at 7 for the same reason.
FROM node:24-trixie-slim AS build
WORKDIR /app
# npm and pnpm download over TLS with Node's defaults; TLS 1.2 keeps the handshake in
# one packet where networks drop the larger post-quantum one (see src/net/tls.ts).
ENV NODE_OPTIONS=--tls-max-v1.2
# Corepack is leaving Node: pnpm comes from npm, the version of packageManager.
RUN npm install -g pnpm@12.16.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build
# extension.zip (served at /extension) is packed from extension/ here, never committed,
# so the download always matches the extension sources of this image.
COPY extension ./extension
COPY scripts/pack-extension.js ./scripts/pack-extension.js
RUN node scripts/pack-extension.js

FROM node:24-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV RADAR_BIND=0.0.0.0
RUN NODE_OPTIONS=--tls-max-v1.2 npm install -g pnpm@12.16.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN NODE_OPTIONS=--tls-max-v1.2 pnpm install --prod --frozen-lockfile
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY bin ./bin
COPY README.md LICENSE ./
COPY assets/og.png ./assets/og.png
COPY assets/og-en.png ./assets/og-en.png
COPY docs/stories.json ./docs/stories.json
COPY --from=build /app/extension.zip ./extension.zip
COPY extension ./extension
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["node", "bin/radar.js"]
CMD ["serve"]
