FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY src/ ./src/

FROM node:20-slim
WORKDIR /app
COPY --from=builder /app ./
USER node
EXPOSE 3000
CMD ["node", "src/index.js"]
