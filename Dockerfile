FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@10.34.9
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN CI=true pnpm prune --prod

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 ORBITA_DB_PATH=/data/orbita.sqlite
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server/api.ts /app/server/db.ts /app/server/node-handler.ts /app/server/push.ts /app/server/security.ts /app/server/start.ts ./server/
COPY --from=build /app/src/data/seed.ts /app/src/data/validation.ts ./src/data/
COPY --from=build /app/src/lib/utils.ts ./src/lib/
COPY --from=build /app/src/types.ts ./src/
COPY --from=build /app/scripts/backup.mjs ./scripts/backup.mjs
RUN mkdir /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
CMD ["node", "server/start.ts"]
