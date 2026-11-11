# OPEX console — production image (Next.js standalone). Built from the repository root:
#   docker build -f apps/opex-console/Dockerfile --build-arg OPEX_API_URL=http://opex-api:4000 \
#     --build-arg SITE_URL=https://arapoush.com -t opex-console .
FROM node:22-alpine AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/opex-console/package.json apps/opex-console/
COPY packages/config/package.json packages/config/
COPY packages/schema/package.json packages/schema/
RUN pnpm install --frozen-lockfile --filter @arapoush/opex-console...
COPY packages packages
COPY apps/opex-console apps/opex-console
# Rewrites (to the API) and the preview frame origin are fixed at build time.
ARG OPEX_API_URL=http://opex-api:4000
ARG SITE_URL=http://localhost
ENV OPEX_API_URL=$OPEX_API_URL SITE_URL=$SITE_URL
RUN pnpm --filter @arapoush/opex-console build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3300
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /repo/apps/opex-console/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/opex-console/.next/static ./apps/opex-console/.next/static
USER app
WORKDIR /app/apps/opex-console
EXPOSE 3300
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3300/login >/dev/null || exit 1
CMD ["node", "server.js"]
