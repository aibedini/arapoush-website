# OPEX 3D renderer — headless Chromium with software WebGL (SwiftShader). Built from the repository root:
#   docker build -f apps/opex-renderer/Dockerfile -t opex-renderer .
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc turbo.json ./
COPY apps/opex-renderer/package.json apps/opex-renderer/
COPY packages/config/package.json packages/config/
RUN pnpm install --frozen-lockfile --filter @arapoush/opex-renderer...
COPY apps/opex-renderer apps/opex-renderer
RUN pnpm --filter @arapoush/opex-renderer deploy --prod --legacy /out

FROM node:22-alpine
# Chromium from Alpine (security updates with the base image), fonts for the logo texture.
RUN apk add --no-cache chromium nss freetype harfbuzz ttf-freefont font-noto tini \
  && addgroup -S render && adduser -S render -G render
WORKDIR /app
ENV NODE_ENV=production CHROME_PATH=/usr/bin/chromium-browser
COPY --from=build --chown=render:render /out ./
USER render
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "--no-warnings", "src/main.ts"]
