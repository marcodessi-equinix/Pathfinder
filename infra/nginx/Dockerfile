FROM node:25-bookworm-slim AS frontend-build

WORKDIR /frontend

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
RUN npm ci

COPY frontend ./frontend
RUN npm run build -w frontend

FROM nginx:1.27-alpine

COPY infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=frontend-build /frontend/frontend/dist /usr/share/nginx/html

EXPOSE 80
