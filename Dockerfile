# Production Express API image. Build from the repository root so runtime
# relative imports to repo-root shared/ keep working:
#   backend/src/routes/*.js              -> ../../../shared/...
#   backend/src/services/*.js            -> ../../../shared/...
#   backend/src/constants/*.js           -> ../../../shared/...
#   backend/src/utils/*.js               -> ../../../shared/...
#   backend/src/routes/admin/*.js        -> ../../../../shared/...
# Layout in the image: /app/backend/** and /app/shared/**
FROM node:24-alpine AS dependencies
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app
COPY --from=dependencies --chown=node:node /app/backend/node_modules ./backend/node_modules
COPY --chown=node:node backend/package.json backend/package-lock.json ./backend/
COPY --chown=node:node backend/src ./backend/src
COPY --chown=node:node shared ./shared
WORKDIR /app/backend
USER node
EXPOSE 8080
CMD ["node", "src/server.js"]
