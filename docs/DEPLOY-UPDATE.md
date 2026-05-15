# Updating a Running Deployment

This guide explains how to deploy a new version of the application to an active ECS service.

## Quick Start

The fastest way to deploy a new version:

```bash
# 1. Login to ECR
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin 118120622551.dkr.ecr.ap-northeast-1.amazonaws.com

# 2. Build and push image (AMD64 for ECS)
docker build --platform linux/amd64 -t 118120622551.dkr.ecr.ap-northeast-1.amazonaws.com/vsdk-app:latest .
docker push 118120622551.dkr.ecr.ap-northeast-1.amazonaws.com/vsdk-app:latest

# 3. Force service update
aws ecs update-service --cluster vsdk-cluster --service vsdk-service --force-new-deployment --region ap-northeast-1
```

## Step-by-Step Process

### 1. Create a Unique Image Tag

Use a timestamp for easy identification:

```bash
TAG="debug-logging-$(date +%Y%m%d-%H%M%S)"
```

### 2. Login to ECR

```bash
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin 118120622551.dkr.ecr.ap-northeast-1.amazonaws.com
```

### 3. Build for AMD64 (Required for ECS)

```bash
docker build --platform linux/amd64 -t 118120622551.dkr.ecr.ap-northeast-1.amazonaws.com/vsdk-app:$TAG .
```

### 4. Push to ECR

```bash
docker push 118120622551.dkr.ecr.ap-northeast-1.amazonaws.com/vsdk-app:$TAG
```

### 5. Update Task Definition

Get current task definition and update with new image:

```bash
aws ecs describe-task-definition --task-definition vsdk-task --region ap-northeast-1 | \
jq --arg IMAGE "118120622551.dkr.ecr.ap-northeast-1.amazonaws.com/vsdk-app:$TAG" '
  .taskDefinition |
  del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .placementConstraints, .compatibilities, .registeredAt, .registeredBy) |
  .containerDefinitions[0].image = $IMAGE
' > new-task-definition.json

# Register new task definition
NEW_TASK_ARN=$(aws ecs register-task-definition --cli-input-json file://new-task-definition.json --region ap-northeast-1 --query 'taskDefinition.taskDefinitionArn' --output text)
echo "New task definition: $NEW_TASK_ARN"
```

### 6. Update ECS Service

```bash
aws ecs update-service \
    --cluster vsdk-cluster \
    --service vsdk-service \
    --task-definition $NEW_TASK_ARN \
    --region ap-northeast-1

# Wait for stability (5-10 minutes)
aws ecs wait services-stable --cluster vsdk-cluster --services vsdk-service --region ap-northeast-1
```

### 7. Verify Deployment

```bash
# Check service status
aws ecs describe-services --cluster vsdk-cluster --services vsdk-service --region ap-northeast-1 \
    --query 'services[0].{serviceName:serviceName,status:status,runningCount:runningCount,taskDefinition:taskDefinition}' \
    --output table

# Test application
curl -I https://avatar-conference.ohararyo.com
```

### 8. Cleanup

```bash
rm -f new-task-definition.json
```

## Alternative: Force Update Without New Task Definition

If you just pushed a new `latest` tag and want to force a redeploy:

```bash
aws ecs update-service \
    --cluster vsdk-cluster \
    --service vsdk-service \
    --force-new-deployment \
    --region ap-northeast-1
```

This restarts tasks with the current task definition (useful if you pushed a new `latest` image).

## Monitoring Deployment

### Watch Task Status

```bash
watch -n 5 "aws ecs describe-services --cluster vsdk-cluster --services vsdk-service --region ap-northeast-1 --query 'services[0].deployments' --output table"
```

### Check CloudWatch Logs

```bash
# Get latest logs
aws logs tail /ecs/vsdk-task --follow --region ap-northeast-1
```

## Rollback

If deployment has issues, revert to a previous task definition:

```bash
# List recent task definition revisions
aws ecs list-task-definition-revisions --family-name vsdk-task --region ap-northeast-1 --max-items 10

# Rollback to a previous revision (e.g., revision 28)
aws ecs update-service \
    --cluster vsdk-cluster \
    --service vsdk-service \
    --task-definition vsdk-task:28 \
    --region ap-northeast-1
```

## Important Notes

⚠️ During deployment:
- Service is temporarily unavailable (usually 1-2 minutes)
- New task takes 5-10 minutes to fully start
- Health checks must pass before traffic routes to new task
- Old task remains until new one is healthy

✅ After deployment:
- Verify application returns correct status code
- Check CloudWatch logs for errors
- Test critical features in the UI

## Troubleshooting

### Task keeps restarting
- Check CloudWatch logs: `aws logs tail /ecs/vsdk-task --region ap-northeast-1`
- Verify environment variables in task definition
- Check Docker image exists in ECR: `aws ecr describe-images --repository-name vsdk-app --region ap-northeast-1`

### Health checks failing
- Task definition health check path might be wrong (default: `/`)
- Check application is responding: `curl http://localhost:3000/`
- Review ECS task logs

### Can't connect to the app
- Check ALB security group allows inbound on 443/80
- Verify task security group allows inbound from ALB
- Check CloudWatch logs for binding errors

## For More Information

- Architecture setup: docs/AWS-DEPLOYMENT-SUBDOMAIN.md
- Docker cross-architecture issues: docs/DOCKER-CROSS-ARCH.md
- Simple deployment (no ALB): docs/SIMPLE-DEPLOY.md
