# ==========================================
# Stage 1: Build & Typecheck
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Install build dependencies
COPY package.json package-lock.json* tsconfig.json ./
RUN npm ci

# Copy source code and test files
COPY src ./src
COPY tests ./tests
COPY scripts ./scripts

# Build TypeScript to dist
RUN npm run build

# ==========================================
# Stage 2: Minimal Production Runtime
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

# Security: Non-root user
RUN addgroup -S -g 1001 nodejs && \
    adduser -S -u 1001 -G nodejs nodejs

# Set production environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    PERSISTENCE_DRIVER=sqlite \
    SQLITE_DB_PATH=/app/data/platform.db

# Copy package descriptors & production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled artifacts & web assets from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/platform/web ./dist/src/platform/web
COPY --from=builder /app/src/platform/web ./src/platform/web

# Create persistent data & logs directory owned by non-root user
RUN mkdir -p /app/data /app/logs && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000

# Healthcheck for container orchestration (Kubernetes / ECS / Docker Swarm)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start Platform Control Plane Server
CMD ["node", "dist/src/platform/server.js"]
