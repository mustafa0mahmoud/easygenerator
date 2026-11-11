# syntax=docker/dockerfile:1

ARG NODE_VERSION=22-alpine
ARG NGINX_VERSION=1.29-alpine

# --- Build the static bundle ---
FROM node:${NODE_VERSION} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime image: nginx only, no Node, non-root user ---
FROM nginxinc/nginx-unprivileged:${NGINX_VERSION} AS runtime
# Where `/api` is forwarded. Substituted into the template at start-up.
ENV API_UPSTREAM=http://backend:3000
COPY nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz || exit 1
