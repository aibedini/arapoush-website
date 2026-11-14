# OPEX API — production image. Built from the repository root:
#   docker build -f apps/opex-api/Dockerfile -t opex-api .
# Node runs the TypeScript sources directly (type stripping, Node ≥ 22.18); there is no build step.
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
# CI=1: the root "prepare" script installs git hooks, which need .git and scripts/ (not in this image).
ENV CI=1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/opex-api/package.json apps/opex-api/
COPY packages/schema/package.json packages/schema/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter @arapoush/opex-api...
COPY packages/schema packages/schema
COPY apps/opex-api apps/opex-api
# A self-contained folder with production dependencies only (the schema package included).
RUN pnpm --filter @arapoush/opex-api deploy --prod --legacy /out

FROM node:22-alpine
RUN apk add --no-cache tini && addgroup -S opex && adduser -S opex -G opex
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 DATA_DIR=/data MEDIA_DIR=/data/media
COPY --from=build --chown=opex:opex /out ./
RUN mkdir -p /data/media && chown -R opex:opex /data
USER opex
VOLUME ["/data"]
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4000/readyz >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--no-warnings", "src/server.ts"]
