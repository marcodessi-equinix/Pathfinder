FROM node:25-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src

RUN npm run build -w backend

FROM node:25-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/backend/dist ./backend/dist

RUN mkdir -p /app/FR2_Grundriss /app/default-building-templates /app/data /app/uploads

EXPOSE 3000

CMD ["node", "backend/dist/server.js"]
