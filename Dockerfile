# Arapoush website — production image (Next.js standalone server from the monorepo, ~150 MB).
#   docker build -t arapoush --build-arg SITE_URL=https://arapoush.com .
#   docker run -d --name arapoush --restart unless-stopped -p 80:3000 arapoush
FROM node:22-alpine AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
# Manifests first, so dependency layers are cached until a lockfile or package.json changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/web/package.json apps/web/
COPY packages/config/package.json packages/config/
COPY packages/schema/package.json packages/schema/
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps/web apps/web
ARG SITE_URL=http://localhost
# OPEX (optional): Next bakes the /media rewrite and the frame-ancestors header in at build time.
# Pages built while OPEX is unreachable use the content snapshot, then refresh on the first publish
# webhook (or within an hour).
ARG OPEX_DELIVERY_URL=
ARG OPEX_CONSOLE_ORIGIN=
ENV NEXT_PUBLIC_SITE_URL=$SITE_URL OPEX_DELIVERY_URL=$OPEX_DELIVERY_URL OPEX_CONSOLE_ORIGIN=$OPEX_CONSOLE_ORIGIN
RUN pnpm --filter @arapoush/web build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S app && adduser -S app -G app
# The standalone bundle keeps the monorepo shape: the server sits at apps/web/server.js.
COPY --from=build --chown=app:app /repo/apps/web/.next/standalone ./
COPY --from=build --chown=app:app /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=app:app /repo/apps/web/public ./apps/web/public
USER app
WORKDIR /app/apps/web
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/fa >/dev/null || exit 1
CMD ["node", "server.js"]
