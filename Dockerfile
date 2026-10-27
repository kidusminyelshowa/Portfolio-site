# Self-hosting: builds the site and runs server.js (pages, API and the cron jobs).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production STORAGE=local STORAGE_DIR=/data PORT=3000
COPY --from=build /app /app
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "server.js"]
