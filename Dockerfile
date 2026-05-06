FROM node:18-alpine AS deps

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json ./
COPY main.ts ./main.ts
COPY src ./src

RUN npm run build

FROM node:18-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV APP_ENV=production
ENV PORT=3000

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

EXPOSE 3000

CMD ["npm", "run", "start"]
