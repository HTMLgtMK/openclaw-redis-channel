FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

FROM node:18-alpine

WORKDIR /opt/openclaw/extensions/redis-channel

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/openclaw.plugin.json ./
COPY --from=builder /app/package.json ./

RUN npm install --production --legacy-peer-deps

USER node
