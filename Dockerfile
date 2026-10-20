FROM node:24-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:24-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/app/data/lawyerup.db
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --chown=node:node server ./server
COPY --chown=node:node src/ai ./src/ai
# The static marketplace listing: the server checks fees and bookability against it.
COPY --chown=node:node src/data ./src/data
COPY --from=build --chown=node:node /app/dist ./dist
# The SQLite database lives here; docker-compose mounts a volume on it.
RUN mkdir -p /app/data && chown node:node /app/data
VOLUME /app/data

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server/index.js"]
