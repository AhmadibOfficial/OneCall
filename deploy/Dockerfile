FROM node:24-bookworm AS builder
RUN npm install --global pnpm@11.10.0
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/backend/package.json apps/backend/package.json
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY apps/backend apps/backend
RUN pnpm --filter backend prisma:generate
RUN pnpm --filter backend build

FROM node:24-bookworm AS runner
RUN npm install --global pnpm@11.10.0
WORKDIR /workspace
# Prisma migration tooling is retained in this staging image.
COPY --from=builder /workspace/node_modules ./node_modules
COPY --from=builder /workspace/package.json /workspace/pnpm-workspace.yaml ./
COPY --from=builder /workspace/apps/backend/node_modules ./apps/backend/node_modules
COPY --from=builder /workspace/apps/backend/package.json /workspace/apps/backend/prisma.config.ts ./apps/backend/
COPY --from=builder /workspace/apps/backend/dist ./apps/backend/dist
COPY --from=builder /workspace/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /workspace/apps/backend/scripts ./apps/backend/scripts
COPY --from=builder /workspace/apps/backend/admin-web ./apps/backend/admin-web
COPY --from=builder /workspace/apps/backend/legal-web ./apps/backend/legal-web
RUN mkdir -p /var/lib/onecall/private && chown -R node:node /var/lib/onecall
ENV NODE_ENV=production HOST=0.0.0.0 PORT=10000
WORKDIR /workspace/apps/backend
USER node
EXPOSE 10000
CMD ["node", "scripts/start-cloud.cjs"]
