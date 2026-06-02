FROM oven/bun:1-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy server package files and install dependencies (layer caching)
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile

# Copy shared engine to /shared/ so ../../../shared/ resolves in container
# (server files are at /app/, so ../../../ = /, and /shared/ is at root)
COPY shared/ /shared/

# Copy server source code
COPY server/ .

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001
ENV JWT_SECRET=change-this-to-a-random-secret

CMD ["bun", "run", "index.ts"]
