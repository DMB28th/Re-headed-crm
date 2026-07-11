# Cardstack MCP server — plain Node container, config via env vars (PLAN.md hosting).
# Build from the REPO ROOT: docker build -f apps/mcp-server/Dockerfile .
FROM node:22-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app .
ENV NODE_ENV=production
# Railway: attach a volume at /data so published configs survive restarts.
ENV CARDSTACK_CONFIG_PATH=/data/cardstack-config.json
# Railway injects PORT; main.ts reads it (falls back to 3001 locally).
EXPOSE 3001
CMD ["node", "apps/mcp-server/dist/main.js"]
