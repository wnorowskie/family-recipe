FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Install OpenSSL so Prisma can detect and link against libssl
RUN apk add --no-cache openssl
# Upgrade npm to latest version to fix bundled dependency vulnerabilities
RUN npm install -g npm@latest

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

FROM base AS production-deps
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

FROM base AS runner
ENV NODE_ENV=production
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000
CMD ["npm", "run", "start"]
