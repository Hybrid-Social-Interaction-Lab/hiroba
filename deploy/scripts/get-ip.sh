#!/bin/bash

# 設定
AWS_REGION="ap-northeast-1"  # リージョンを実際の値に変更
CLUSTER_NAME="vsdkbasic-cluster"
SERVICE_NAME="vsdkbasic-service"

# 色付きログ用
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}=== Getting Public IP for VideoSDK Transcript ===${NC}"

# タスクARNを取得
echo "Getting task information..."
TASK_ARN=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME --query 'taskArns[0]' --output text --region $AWS_REGION)

if [ "$TASK_ARN" == "None" ] || [ "$TASK_ARN" == "" ]; then
    echo -e "${RED}No running tasks found. Service might be starting or stopped.${NC}"
    echo "Check service status with:"
    echo "aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION"
    exit 1
fi

echo "Task ARN: $TASK_ARN"

# タスクの詳細を取得してENI IDを抽出
echo "Getting network interface..."
ENI_ID=$(aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $TASK_ARN --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text --region $AWS_REGION)

if [ "$ENI_ID" == "" ]; then
    echo -e "${RED}Network interface not found. Task might still be starting.${NC}"
    exit 1
fi

echo "ENI ID: $ENI_ID"

# パブリックIPを取得
echo "Getting public IP..."
PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --query 'NetworkInterfaces[0].Association.PublicIp' --output text --region $AWS_REGION)

if [ "$PUBLIC_IP" == "None" ] || [ "$PUBLIC_IP" == "" ]; then
    echo -e "${RED}Public IP not assigned. Check if assignPublicIp is enabled in service configuration.${NC}"
    exit 1
fi

# 結果表示
echo ""
echo -e "${GREEN}✓ Application is running!${NC}"
echo ""
echo -e "${YELLOW}Access URL:${NC}"
echo -e "${GREEN}http://$PUBLIC_IP:3000${NC}"
echo ""

# 追加情報
echo -e "${YELLOW}Additional Information:${NC}"
echo "Task ARN: $TASK_ARN"
echo "ENI ID: $ENI_ID"
echo "Public IP: $PUBLIC_IP"
echo ""

# ヘルスチェック
echo -e "${YELLOW}Quick health check:${NC}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://$PUBLIC_IP:3000/ 2>/dev/null)
if [ "$HTTP_STATUS" == "200" ]; then
    echo -e "${GREEN}✓ Application is responding (HTTP 200)${NC}"
else
    echo -e "${YELLOW}⚠ Application might still be starting (HTTP $HTTP_STATUS)${NC}"
    echo "Wait a few minutes and try again."
fi