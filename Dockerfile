FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY index.html tsconfig.json vite.config.ts ./
COPY server ./server
COPY shared ./shared
COPY src ./src
COPY tests ./tests
RUN npm run build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production \
    API_CANVAS_HOST=0.0.0.0 \
    API_CANVAS_PORT=4174 \
    API_CANVAS_HOST_GATEWAY=host.docker.internal

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

USER node
EXPOSE 4174

CMD ["node", "dist-server/index.js"]
