FROM node:22-alpine AS build
WORKDIR /workspace
COPY apps-vue/package*.json ./apps-vue/
RUN cd apps-vue && npm ci
COPY apps-vue ./apps-vue
COPY data/products.json ./data/products.json
ARG APP_BASE=/vue/
ENV APP_BASE=$APP_BASE
ENV CATALOG_FILE=/workspace/data/products.json
RUN cd apps-vue && npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5174
COPY --from=build /workspace/apps-vue/package.json ./
COPY --from=build /workspace/apps-vue/node_modules ./node_modules
COPY --from=build /workspace/apps-vue/server.mjs ./
COPY --from=build /workspace/apps-vue/dist ./dist
CMD ["node", "server.mjs"]
