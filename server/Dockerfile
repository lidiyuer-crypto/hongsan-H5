FROM oven/bun:1-alpine

WORKDIR /app

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy package files and install dependencies (layer caching)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Create data directory for SQLite persistence
RUN mkdir -p /app/data

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001
ENV JWT_SECRET=change-this-to-a-random-secret

CMD ["bun", "run", "index.ts"]
