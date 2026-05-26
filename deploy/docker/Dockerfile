# Multi-platform support for M1 (ARM64) and AMD64
FROM --platform=$BUILDPLATFORM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install build dependencies for multi-platform
RUN apk add --no-cache curl python3 make g++

# Install dependencies with platform detection
ARG TARGETPLATFORM
RUN if [ "$TARGETPLATFORM" = "linux/arm64" ]; then \
      npm ci --only=production --build-from-source; \
    else \
      npm ci --only=production; \
    fi

# Dev stage — all dependencies (including devDependencies) so the source
# volume mount gets a complete node_modules from the image layer.
FROM node:18-alpine AS dev
RUN apk add --no-cache curl python3 make g++
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000 3443
CMD ["npm", "start"]

# Production stage
FROM node:18-alpine AS production

# Install runtime dependencies
RUN apk add --no-cache curl

# Set working directory
WORKDIR /app

# Copy dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# アプリケーションファイルをコピー
COPY . .

# ポート3000と3443を公開
EXPOSE 3000 3443

# 非rootユーザーを作成してセキュリティを向上（chown問題を回避）
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# ファイルの所有権を最小限に変更
RUN chown nextjs:nodejs /app

USER nextjs

# アプリケーションを起動
CMD ["npm", "start"]