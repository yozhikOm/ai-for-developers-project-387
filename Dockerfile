# syntax=docker/dockerfile:1

# --- Stage 1: сборка ---
# Устанавливаем все зависимости (включая dev — нужны для vite build) и собираем frontend
FROM node:24-alpine AS build
WORKDIR /app

# Сначала только манифесты: слой с node_modules закэшируется и не будет
# пересобираться при изменении исходников
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

# Исходники и сборка frontend (apps/web/dist)
COPY . .
RUN npm run build

# Оставляем только production-зависимости для рантайма
RUN npm prune --omit=dev

# --- Stage 2: рантайм ---
# Backend запускается на нативном type stripping Node 24 (см. AGENTS.md),
# поэтому шаг компиляции backend не нужен — копируем исходники как есть
FROM node:24-alpine
ENV NODE_ENV=production
# Порт по умолчанию; платформа деплоя (Render) и проверка Хекслета задают свой через PORT
ENV PORT=3000
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY apps/api ./apps/api
COPY --from=build /app/apps/web/dist ./apps/web/dist

# Каталог SQLite (ADR 0005). Владелец — node, чтобы процесс мог писать в него;
# новый именованный volume, смонтированный сюда, наследует владельца
ENV DATABASE_PATH=/app/data/calendar.db
RUN mkdir -p /app/data && chown node:node /app/data

# Непривилегированный пользователь из базового образа
USER node

EXPOSE 3000
# Shell-форма: ${PORT} подставляется при каждой проверке, а не при сборке
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

CMD ["node", "apps/api/src/index.ts"]
