# syntax=docker/dockerfile:1

# ---- Build stage: compile client AND server ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm ci && npm ci --prefix server

COPY . .
# Build the client (tsc --noEmit && vite build -> /app/dist) and the server
# (esbuild bundle + tsc -> /app/server/dist). The previous image only built the
# client, so the server was never compiled and the container crashed on start.
RUN npm run build && npm run build:server

# ---- Runtime stage: slim, non-root ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Only production server dependencies in the runtime image.
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server && npm cache clean --force

# Compiled server and client assets.
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/dist ./dist

# Run as the unprivileged built-in node user.
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||3001)+'/api/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/dist/index.js"]
