FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:22-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl \
    && rm -rf /var/lib/apt/lists/*
# Эквайринг T-Bank отдаёт сертификат Минцифры, которого нет в наборе Node:
# добавляем корневой сертификат к встроенному набору, не подменяя его
COPY ops/russian_trusted_root_ca.pem /etc/ssl/russian_trusted_root_ca.pem
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/russian_trusted_root_ca.pem
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/src/generated ./src/generated
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
RUN mkdir -p uploads
EXPOSE 4000
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && node dist/main.js"]
