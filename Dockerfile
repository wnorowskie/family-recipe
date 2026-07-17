FROM node:20-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Install OpenSSL so Prisma can detect and link against libssl
RUN apk add --no-cache openssl

FROM base AS deps
ENV NODE_ENV=development
COPY package.json package-lock.json ./
# Install build deps for native modules (bcrypt) and install all deps (dev + prod)
RUN apk add --no-cache python3 make g++ \
  && HUSKY=0 npm ci

FROM base AS builder
ARG PRISMA_SCHEMA=prisma/schema.postgres.node.prisma
ENV PRISMA_SCHEMA=${PRISMA_SCHEMA}
# Next inlines NEXT_PUBLIC_* into the client bundle during `npm run build`, so
# this has to be an ARG set before that step — a runtime --set-env-vars on Cloud
# Run cannot change an already-inlined value. Deployed builds leave it empty:
# the browser calls /v1/* on the Next origin and src/app/v1/[...path] forwards
# to FastAPI (API_INTERNAL_URL, runtime). Local dev sets it to
# http://localhost:8000 to hit FastAPI directly. See issue #241.
ARG NEXT_PUBLIC_API_BASE_URL=
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}
ENV NODE_ENV=production
# Prisma commands need a placeholder URL; compose/runtime provide the real one
ENV DATABASE_URL=postgresql://postgres:postgres@db:5432/family_recipe
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema $PRISMA_SCHEMA
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/prisma ./prisma
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

EXPOSE 3000
CMD ["node", "./node_modules/.bin/next", "start"]
