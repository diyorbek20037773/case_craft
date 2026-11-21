# CaseCraft frontend: Vite build -> nginx (statik fayllar + /api -> backend proxy)
ARG NODE_VERSION=22

# ---------------------------------------------------------------- build
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Backend manzili. Standart "/api" — nginx shu prefiksni backend konteyneriga yo'naltiradi (bitta origin, CORS kerak emas).
ARG VITE_API_URL=/api
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build

# ---------------------------------------------------------------- dev: docker-compose.dev.yml (hot reload)
FROM node:${NODE_VERSION}-slim AS dev
WORKDIR /web
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ---------------------------------------------------------------- runtime
FROM nginx:1.27-alpine AS runtime
ENV BACKEND_URL=http://server:8000
COPY nginx.conf /etc/nginx/templates/default.conf.template
COPY --from=build /web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/nginx-health || exit 1
