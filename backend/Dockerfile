FROM node:24-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

COPY backend/tsconfig.json ./backend/tsconfig.json
COPY backend/src ./backend/src

RUN npm run build -w backend

FROM node:24-bookworm-slim AS templates

WORKDIR /app

COPY backend ./backend
RUN mkdir -p /app/backend/FR2_Grundriss

FROM node:24-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=templates /app/backend/FR2_Grundriss ./FR2_Grundriss
COPY --from=templates /app/backend/FR2_Grundriss ./default-building-templates

RUN mkdir -p /app/data /app/uploads

EXPOSE 3000

CMD ["node", "backend/dist/server.js"]
