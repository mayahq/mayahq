# Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Install build dependencies (some npm packages need these)
RUN apk add --no-cache python3 make g++

# Copy root workspace configuration
COPY package.json yarn.lock tsconfig.json ./

# Copy only the packages we need (maya-agent removed - dead code)
COPY packages/memory-worker ./packages/memory-worker
COPY packages/supabase-client ./packages/supabase-client
COPY packages/maya-core ./packages/maya-core

# Install ALL dependencies (including dev) for building
# Skip postinstall scripts (Supabase CLI binary download not needed in Docker)
RUN yarn install --frozen-lockfile --ignore-scripts --network-timeout 600000

# Build the packages in dependency order
RUN yarn workspace @mayahq/maya-core build && \
    yarn workspace @mayahq/supabase-client build && \
    yarn workspace @mayahq/memory-worker build

# Production stage - smaller final image
FROM node:20-alpine AS production
WORKDIR /app

# Copy the entire built workspace structure (with node_modules already installed)
COPY --from=builder /app/package.json ./
COPY --from=builder /app/yarn.lock ./
COPY --from=builder /app/node_modules ./node_modules

# Copy the built packages
COPY --from=builder /app/packages/memory-worker/dist ./packages/memory-worker/dist
COPY --from=builder /app/packages/memory-worker/package.json ./packages/memory-worker/
COPY --from=builder /app/packages/memory-worker/env-check.js ./packages/memory-worker/
COPY --from=builder /app/packages/memory-worker/check-env.js ./packages/memory-worker/

COPY --from=builder /app/packages/supabase-client/dist ./packages/supabase-client/dist
COPY --from=builder /app/packages/supabase-client/package.json ./packages/supabase-client/

COPY --from=builder /app/packages/maya-core/dist ./packages/maya-core/dist
COPY --from=builder /app/packages/maya-core/package.json ./packages/maya-core/

# Set working directory to memory-worker
WORKDIR /app/packages/memory-worker

EXPOSE 3002

CMD ["sh", "-c", "node env-check.js && node dist/index.js"]
