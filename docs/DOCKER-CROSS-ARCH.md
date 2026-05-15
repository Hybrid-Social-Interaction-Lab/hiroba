# Docker Cross-Architecture Guide (ARM64 to AMD64)

This document records solutions for Docker deployment issues when building on ARM64 (M1/M2 Mac) for AMD64 (AWS ECS Fargate) environments.

## Problem Overview

- **Development**: M1/M2 Mac (ARM64)
- **Production**: AWS ECS Fargate (AMD64)
- **Issue**: Docker images built locally fail to start on ECS

## Root Causes

1. **Architecture mismatch**: Images built on M1 are ARM64, but ECS Fargate requires AMD64
2. **Native package compatibility**: Packages with native dependencies are architecture-specific
3. **Incorrect Docker build flags**: Wrong `--platform` usage causes startup failures

## Solution

### Incorrect Dockerfile (Before)

```dockerfile
# ❌ Problem: ARM64 build platform specified
FROM --platform=$BUILDPLATFORM node:18-alpine
ARG BUILDPLATFORM
ARG TARGETPLATFORM
RUN npm ci --only=production --platform=linux --arch=x64
```

**Issues**:
- `--platform=$BUILDPLATFORM` locks to ARM64 (M1 Mac architecture)
- `npm --platform` and `--arch` flags don't work as intended
- Results in ARM64 image sent to AMD64 ECS

### Correct Dockerfile (After)

```dockerfile
# ✅ Correct: Simple, AMD64-ready
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./

# Install health check tools
RUN apk add --no-cache curl

# Install dependencies (AMD64 environment)
RUN npm ci --only=production

COPY . .

EXPOSE 3000 3443

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001

RUN chown -R nextjs:nodejs /app
USER nextjs

CMD ["npm", "start"]
```

### Correct Build Command

```bash
# Build for AMD64 on M1/M2 Mac
docker buildx build --platform linux/amd64 --load -t vsdk-app:amd64-latest .

# Tag for ECR
docker tag vsdk-app:amd64-latest 118120622551.dkr.ecr.ap-northeast-1.amazonaws.com/vsdk-app:amd64-latest

# Push to ECR
docker push 118120622551.dkr.ecr.ap-northeast-1.amazonaws.com/vsdk-app:amd64-latest
```

### Verify Deployment

```bash
# Register new task definition
aws ecs register-task-definition --cli-input-json file://task-definition-amd64.json --region ap-northeast-1

# Update service
aws ecs update-service --cluster vsdk-cluster --service vsdk-service \
  --task-definition arn:aws:ecs:ap-northeast-1:118120622551:task-definition/vsdk-task:29 \
  --force-new-deployment --region ap-northeast-1

# Verify deployment
curl -I https://avatar-conference.ohararyo.com
```

## Best Practices

### ✅ DO

1. **Explicit architecture**: Always use `docker buildx build --platform linux/amd64`
2. **Simple Dockerfile**: Avoid unnecessary `--platform` arguments
3. **Match production**: AWS ECS = AMD64, build for that target
4. **Use buildx**: For multi-platform build support

### ❌ DON'T

1. **Avoid `--platform=$BUILDPLATFORM`**: Locks to development architecture
2. **Don't mix architectures**: Single Dockerfile for all targets
3. **Don't use npm platform flags**: They're unreliable in Dockerfile

## Troubleshooting

### ECS Task Stops Immediately After Starting

**Cause**: Architecture mismatch

**Solution**: Rebuild explicitly for AMD64

```bash
# Verify current state
aws ecs describe-tasks --cluster vsdk-cluster --tasks <task-arn> --region ap-northeast-1

# Rebuild for AMD64
docker buildx build --platform linux/amd64 --load -t app:amd64 .
```

### "exec format error"

**Cause**: ARM64 image running on AMD64 environment

**Solution**: Rebuild with `--platform linux/amd64`

### Native Package Compatibility Errors

**Cause**: Architecture-specific binaries mismatch

**Solution**:
1. Build with `--platform linux/amd64`
2. Delete `node_modules` and run fresh `npm ci`

## Verification Checklist

After deployment, verify:

1. **HTTP Status**: `200 OK`
2. **Content changes**: New code is reflected
3. **ECS task**: Status is `RUNNING` with `HealthStatus: HEALTHY`
4. **CloudWatch logs**: No startup errors

## Reference Commands

```bash
# Check image architecture
docker inspect <image-name> | grep Architecture

# Create multiarch builder
docker buildx create --use --name multiarch-builder

# Check current platform
docker version --format '{{.Server.Arch}}'

# Check ECS service status
aws ecs describe-services --cluster vsdk-cluster --services vsdk-service --region ap-northeast-1
```

## Summary

| Scenario | Solution |
|----------|----------|
| M1 Mac → AWS ECS | `docker buildx build --platform linux/amd64` |
| Package errors | Rebuild + `npm ci` |
| Task won't start | Check architecture with `docker inspect` |
| Task runs but errors | Check CloudWatch logs for runtime issues |

Last updated: 2025-07-25
