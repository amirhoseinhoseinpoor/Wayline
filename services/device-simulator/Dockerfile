# syntax=docker/dockerfile:1

# ---- build: install all deps and compile TypeScript ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --ignore-scripts
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- deps: production dependencies only ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts

# ---- runtime: small image, non-root user ----
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
CMD ["node", "dist/main.js"]
