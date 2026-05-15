cat > export.sh <<'SH'
#!/usr/bin/env bash
set -euo pipefail

REGION="ap-northeast-1"
ECR_REPO="vsdk-app"
ECS_CLUSTER="moderator-ai-cluster"
ECS_SERVICE="moderator-ai-service"
ALB_NAME="moderator-ai-alb"
DDB_TABLE="vsdk-app-settings"
S3_BUCKET="moderator-ai-log-bucket"
SSM_PATH_PREFIX="/vsdk-app/"

OUT="aws_subdomain_deploy_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUT"/{ecr,ecs,alb,dynamodb,s3,ssm}

run() {
  local out="$1"; shift
  mkdir -p "$(dirname "$out")"
  aws --region "$REGION" "$@" --output json > "$out"
}

echo "Export folder: $OUT"

# ------------------------
# ECR
# ------------------------
run "$OUT/ecr/repository.json" ecr describe-repositories --repository-names "$ECR_REPO"
run "$OUT/ecr/images.json" ecr describe-images --repository-name "$ECR_REPO"

aws --region "$REGION" ecr get-repository-policy \
  --repository-name "$ECR_REPO" \
  --output json > "$OUT/ecr/policy.json" 2>/dev/null || true

# ------------------------
# SSM
# ------------------------
run "$OUT/ssm/parameters_metadata.json" \
  ssm get-parameters-by-path \
  --path "$SSM_PATH_PREFIX" \
  --recursive

# ------------------------
# DynamoDB
# ------------------------
run "$OUT/dynamodb/describe-table.json" \
  dynamodb describe-table \
  --table-name "$DDB_TABLE"

aws --region "$REGION" dynamodb describe-time-to-live \
  --table-name "$DDB_TABLE" \
  --output json > "$OUT/dynamodb/ttl.json" 2>/dev/null || true

# ------------------------
# S3
# ------------------------
aws --region "$REGION" s3api get-bucket-location \
  --bucket "$S3_BUCKET" \
  --output json > "$OUT/s3/location.json" 2>/dev/null || true

# aws --region "$REGION" s3api get-bucket-versioning \
#   --bucket "$S3_BUCKET" \
#   --output json > "$OUT/s3/versioning.json" 2>/dev/null || true

# ------------------------
# ECS
# ------------------------
run "$OUT/ecs/cluster.json" \
  ecs describe-clusters \
  --clusters "$ECS_CLUSTER" \
  --include SETTINGS CONFIGURATIONS STATISTICS TAGS

run "$OUT/ecs/service.json" \
  ecs describe-services \
  --cluster "$ECS_CLUSTER" \
  --services "$ECS_SERVICE" \
  --include TAGS

TASKDEF_ARN=$(python3 - "$OUT" <<'PY'
import json,sys
out=sys.argv[1]
d=json.load(open(f"{out}/ecs/service.json"))
print(d["services"][0]["taskDefinition"])
PY
)

run "$OUT/ecs/task_definition.json" \
  ecs describe-task-definition \
  --task-definition "$TASKDEF_ARN" \
  --include TAGS

# ------------------------
# ALB
# ------------------------
run "$OUT/alb/load_balancer_by_name.json" \
  elbv2 describe-load-balancers \
  --names "$ALB_NAME"

ALB_ARN=$(python3 - "$OUT" <<'PY'
import json,sys
out=sys.argv[1]
d=json.load(open(f"{out}/alb/load_balancer_by_name.json"))
print(d["LoadBalancers"][0]["LoadBalancerArn"])
PY
)

run "$OUT/alb/load_balancer.json" \
  elbv2 describe-load-balancers \
  --load-balancer-arns "$ALB_ARN"

run "$OUT/alb/load_balancer_attributes.json" \
  elbv2 describe-load-balancer-attributes \
  --load-balancer-arn "$ALB_ARN"

run "$OUT/alb/listeners.json" \
  elbv2 describe-listeners \
  --load-balancer-arn "$ALB_ARN"

echo "Export complete: $OUT"
SH