FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG GIT_COMMIT=
ENV GIT_COMMIT=$GIT_COMMIT
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
ENV HOSTNAME=0.0.0.0
ARG GIT_COMMIT=
ENV GIT_COMMIT=$GIT_COMMIT
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/postcss.config.mjs ./postcss.config.mjs
COPY --from=build /app/firestore.rules ./firestore.rules
COPY --from=build /app/firestore.indexes.json ./firestore.indexes.json
EXPOSE 8080
CMD ["npx", "tsx", "scripts/start.ts"]
