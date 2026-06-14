FROM node:20-alpine AS base

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src ./src
COPY tests ./tests

RUN chown -R appuser:appgroup /app

FROM base AS production

RUN npm prune --omit=dev

USER appuser

EXPOSE 4000

CMD ["node", "src/server.js"]