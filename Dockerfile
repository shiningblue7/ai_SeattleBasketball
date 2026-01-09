# syntax=docker/dockerfile:1

# ---- deps (install node_modules) ----
FROM node:20-bookworm-slim AS deps
WORKDIR /app

# Prisma needs OpenSSL at runtime/build time
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm install

# ---- builder (build Next.js) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure Prisma client exists for build/runtime
RUN npx prisma generate
RUN npm run build

# ---- runner (production) ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Next.js standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "server.js"]

# ---- migrate (one-off job target) ----
FROM deps AS migrate
WORKDIR /app
COPY . .
CMD ["npx", "prisma", "migrate", "deploy"]
