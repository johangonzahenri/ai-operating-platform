# Multi-stage reproducible container build for AI Operating Platform
# Build stage
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci

COPY src/ ./src/
COPY scripts/ ./scripts/
COPY tests/ ./tests/
RUN npm run build
RUN npm test

# Production Runtime stage
FROM node:22-alpine AS runner

WORKDIR /usr/src/app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=127.0.0.1
ENV PERSISTENCE_DRIVER=sqlite
ENV SQLITE_DB_PATH=data/platform.db

# Create non-root unprivileged service account
RUN addgroup -S aiplatform && adduser -S aiplatform -G aiplatform
RUN mkdir -p data && chown -R aiplatform:aiplatform /usr/src/app

COPY --chown=aiplatform:aiplatform package*.json ./
RUN npm ci --omit=dev

COPY --chown=aiplatform:aiplatform --from=builder /usr/src/app/dist ./dist
COPY --chown=aiplatform:aiplatform src/platform/web ./src/platform/web

USER aiplatform

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/api/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); });"

CMD ["node", "dist/src/platform/server.js"]
