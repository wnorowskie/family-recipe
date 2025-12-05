FROM node:20-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Install OpenSSL so Prisma can detect and link against libssl (openss3 on bookworm)
RUN apt-get update && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ARG PRISMA_SCHEMA=prisma/schema.postgres.prisma
ENV PRISMA_SCHEMA=${PRISMA_SCHEMA}
ENV NODE_ENV=production
# Prisma commands need a placeholder URL; compose/runtime provide the real one
ENV DATABASE_URL=postgresql://postgres:postgres@db:5432/family_recipe
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema $PRISMA_SCHEMA
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["npm", "run", "start"]
