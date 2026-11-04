# Multi-stage unprivileged Dockerfile for Radar
# Node 24 LTS, not 26: on 26.13 reading an answer above about 6.5 MB over HTTPS hangs and later
# requests to the host hang with it, with any TLS settings; 24 reads the same boards in a second.
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
COPY extension.zip* ./
COPY extension ./extension
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8787/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["node", "bin/radar.js"]
CMD ["serve"]
