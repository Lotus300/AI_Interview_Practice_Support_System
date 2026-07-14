FROM node:22-alpine

ENV NODE_ENV=production \
    PORT=8080

WORKDIR /app

COPY --chown=node:node apps/backend ./apps/backend
COPY --chown=node:node packages/shared ./packages/shared

USER node

EXPOSE 8080

CMD ["node", "apps/backend/src/server.mjs"]
