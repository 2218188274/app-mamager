FROM node:22-alpine AS dependencies
RUN npm install --global pnpm@9.15.9
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml ./
COPY server/package.json server/package.json
COPY admin/package.json admin/package.json
RUN pnpm install --no-frozen-lockfile

FROM dependencies AS build
COPY server/ server/
COPY admin/ admin/
RUN pnpm --filter @app-manager/server build
RUN pnpm --filter @app-manager/admin build
RUN pnpm --filter @app-manager/server deploy --prod /runtime

FROM scratch AS web
COPY --from=build /workspace/admin/dist/ /

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
COPY --from=build --chown=node:node /workspace/server/scripts/payment-readiness.mjs ./scripts/payment-readiness.mjs
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
