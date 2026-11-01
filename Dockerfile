# Arapoush website — production image (Next.js standalone server, ~150 MB).
#   docker build -t arapoush --build-arg SITE_URL=https://arapoush.com .
#   docker run -d --name arapoush --restart unless-stopped -p 80:3000 arapoush
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
ARG SITE_URL=http://localhost
ENV NEXT_PUBLIC_SITE_URL=$SITE_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/fa >/dev/null || exit 1
CMD ["node", "server.js"]
