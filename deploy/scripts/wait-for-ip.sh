#!/bin/bash

# 設定
AWS_REGION="ap-northeast-1"
CLUSTER_NAME="vsdkbasic-cluster"
SERVICE_NAME="vsdkbasic-service"
MAX_ATTEMPTS=20  # 最大試行回数（10分）

# 色付きログ用
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}=== Waiting for VideoSDK Transcript to get Public IP ===${NC}"
echo "This may take 2-5 minutes..."
echo ""

for i in $(seq 1 $MAX_ATTEMPTS); do
    echo -e "${YELLOW}Attempt $i/$MAX_ATTEMPTS...${NC}"
    
    # タスクARNを取得
    TASK_ARN=$(aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME --query 'taskArns[0]' --output text --region $AWS_REGION 2>/dev/null)
    
    if [ "$TASK_ARN" != "None" ] && [ "$TASK_ARN" != "" ] && [ "$TASK_ARN" != "null" ]; then
        echo "✓ Task found: $(basename $TASK_ARN)"
        
        # ENI IDを取得
        ENI_ID=$(aws ecs describe-tasks --cluster $CLUSTER_NAME --tasks $TASK_ARN --query 'tasks[0].attachments[0].details[?name==`networkInterfaceId`].value' --output text --region $AWS_REGION 2>/dev/null)
        
        if [ "$ENI_ID" != "" ] && [ "$ENI_ID" != "None" ]; then
            echo "✓ Network interface found: $ENI_ID"
            
            # パブリックIPを取得
            PUBLIC_IP=$(aws ec2 describe-network-interfaces --network-interface-ids $ENI_ID --query 'NetworkInterfaces[0].Association.PublicIp' --output text --region $AWS_REGION 2>/dev/null)
            
            if [ "$PUBLIC_IP" != "None" ] && [ "$PUBLIC_IP" != "" ] && [ "$PUBLIC_IP" != "null" ]; then
                echo ""
                echo -e "${GREEN}🎉 SUCCESS! Application is ready!${NC}"
                echo ""
                echo -e "${YELLOW}Access your application at:${NC}"
                echo -e "${GREEN}http://$PUBLIC_IP:3000${NC}"
                echo ""
                
                # ヘルスチェック
                echo -e "${YELLOW}Performing health check...${NC}"
                sleep 5  # アプリケーション起動を少し待つ
                
                HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 10 http://$PUBLIC_IP:3000/ 2>/dev/null)
                if [ "$HTTP_STATUS" == "200" ]; then
                    echo -e "${GREEN}✓ Application is responding correctly (HTTP 200)${NC}"
                    echo -e "${GREEN}✓ Ready to use!${NC}"
                else
                    echo -e "${YELLOW}⚠ Application responding with HTTP $HTTP_STATUS${NC}"
                    echo -e "${YELLOW}  It may still be starting up. Try again in a minute.${NC}"
                fi
                
                echo ""
                echo -e "${YELLOW}Additional Info:${NC}"
                echo "Task ARN: $TASK_ARN"
                echo "ENI ID: $ENI_ID"
                echo "Public IP: $PUBLIC_IP"
                exit 0
            else
                echo "⏳ Public IP not yet assigned..."
            fi
        else
            echo "⏳ Network interface not yet attached..."
        fi
    else
        echo "⏳ Task not yet running..."
        
        # サービス状態を確認
        SERVICE_STATUS=$(aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --query 'services[0].status' --output text --region $AWS_REGION 2>/dev/null)
        if [ "$SERVICE_STATUS" != "ACTIVE" ]; then
            echo "⚠ Service status: $SERVICE_STATUS"
        fi
    fi
    
    if [ $i -lt $MAX_ATTEMPTS ]; then
        echo "Waiting 30 seconds before next attempt..."
        sleep 30
        echo ""
    fi
done

echo ""
echo -e "${RED}❌ Timeout: Could not get public IP after $MAX_ATTEMPTS attempts${NC}"
echo ""
echo -e "${YELLOW}Please check:${NC}"
echo "1. ECS service status in AWS console"
echo "2. Task logs in CloudWatch"
echo "3. Security group settings"
echo ""
echo -e "${YELLOW}Manual check commands:${NC}"
echo "aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION"
echo "aws ecs list-tasks --cluster $CLUSTER_NAME --service-name $SERVICE_NAME --region $AWS_REGION"
exit 1