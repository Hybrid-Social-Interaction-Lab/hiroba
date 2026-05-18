# Simple Deployment (ECS without ALB, IP-based) — Legacy

> **Superseded.** For cheap single-instance deploys, use
> [AWS EC2 + Caddy](../AWS-EC2-CADDY-DEPLOY.md) (similar cost, gets you real
> HTTPS and a stable IP). This document is kept for reference because the
> ECS CLI snippets are still useful when troubleshooting Fargate.

Deploy the application using Amazon ECS Fargate with direct IP access, without an Application Load Balancer. This approach is cost-effective but comes with trade-offs.

## Pros and Cons

### ✅ Advantages
- **Cost-effective**: No ALB fee (~$20/month savings)
- **Simple setup**: Minimal infrastructure configuration
- **Quick deployment**: Ready in minutes

### ❌ Disadvantages
- **IP changes**: Task restart changes IP address
- **HTTP only**: HTTPS setup is complex
- **Low availability**: Single task = single point of failure

## Prerequisites

1. AWS CLI installed and configured
2. Docker installed
3. AWS permissions for ECR, ECS, EC2, and CloudWatch

## Deployment Steps

### 1. Configure AWS CLI

```bash
aws configure
```

### 2. Edit Deployment Script

Edit `simple-deploy.sh` and replace these values:

```bash
AWS_ACCOUNT_ID="YOUR_ACCOUNT_ID"  # 12-digit AWS account ID
AWS_REGION="us-west-2"            # Your AWS region
```

### 3. Deploy with One Command

```bash
# Full automated deployment (5-10 minutes)
./simple-deploy.sh
```

### 4. Access the Application

After script completes, access via the public IP shown:

```
http://XX.XX.XX.XX:3000
```

## Manual Operations

### Check Service Status

```bash
aws ecs describe-services --cluster vsdkbasic-cluster --services vsdkbasic-service
```

### Get Public IP

```bash
# Get task ARN
TASK_ARN=$(aws ecs list-tasks --cluster vsdkbasic-cluster --service-name vsdkbasic-service --query 'taskArns[0]' --output text)

# Get network interface ID
ENI_ID=$(aws ecs describe-tasks --cluster vsdkbasic-cluster --tasks $TASK_ARN --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text)

# Get public IP
aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --query 'NetworkInterfaces[0].Association.PublicIp' --output text
```

### View Logs

```bash
aws logs get-log-events --log-group-name "/ecs/vsdkbasic-transcript" --log-stream-name "ecs/vsdkbasic-transcript/TASK_ID"
```

## Cleanup

### Delete Service

```bash
# Set task count to 0
aws ecs update-service --cluster vsdkbasic-cluster --service vsdkbasic-service --desired-count 0

# Delete service
aws ecs delete-service --cluster vsdkbasic-cluster --service vsdkbasic-service

# Delete cluster
aws ecs delete-cluster --cluster vsdkbasic-cluster
```

### Delete ECR Images

```bash
aws ecr delete-repository --repository-name vsdkbasic-transcript --force
```

### Delete Security Group

```bash
# Get security group ID
SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=vsdkbasic-sg" --query 'SecurityGroups[0].GroupId' --output text)

# Delete it
aws ec2 delete-security-group --group-id $SG_ID
```

## Estimated Monthly Cost

| Service | Cost | Notes |
|---------|------|-------|
| ECS Fargate | $15-20 | 0.25 vCPU, 0.5GB RAM |
| Data Transfer | $1-5 | Variable |
| CloudWatch Logs | $1-2 | Variable |
| **Total** | **~$17-27** | Half the cost of ALB approach |

## Important Notes

1. **IP changes**: Task restarts will change the IP address
2. **HTTP only**: Use docs/HTTPS-OPTIONS.md for HTTPS alternatives
3. **Single failure point**: No redundancy if task fails
4. **Public access**: Ensure proper security settings

## Updating Deployment

To deploy a new version:

```bash
# 1. Build and push new image
./simple-deploy.sh

# 2. Force service update
aws ecs update-service --cluster vsdkbasic-cluster --service vsdkbasic-service --force-new-deployment
```

## Troubleshooting

### Can't Access Application

1. Verify port 3000 is open in security group
2. Check ECS task status is "RUNNING"
3. Review CloudWatch logs for errors

### Performance Issues

1. Check ECS task CPU/memory usage
2. Increase task resources in ECS task definition if needed

For more deployment options, see docs/AWS-DEPLOYMENT-SUBDOMAIN.md (production setup with ALB and HTTPS).
