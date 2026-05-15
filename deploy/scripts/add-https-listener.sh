#!/bin/bash
# ALBにHTTPSリスナーを追加するスクリプト
# Usage: ./add-https-listener.sh <certificate-arn>

if [ $# -eq 0 ]; then
    echo "Usage: $0 <certificate-arn>"
    echo "Example: $0 arn:aws:acm:ap-northeast-1:123456789012:certificate/..."
    exit 1
fi

CERT_ARN=$1
ALB_ARN="arn:aws:elasticloadbalancing:ap-northeast-1:118120622551:loadbalancer/app/vsdk-alb/9cd9cc4be8d64d6c"
TARGET_GROUP_ARN="arn:aws:elasticloadbalancing:ap-northeast-1:118120622551:targetgroup/vsdk-targets/3be133cd192c3b5d"

echo "Adding HTTPS listener to ALB..."

# HTTPSリスナーを追加
LISTENER_ARN=$(aws elbv2 create-listener \
    --load-balancer-arn "$ALB_ARN" \
    --protocol HTTPS \
    --port 443 \
    --certificates CertificateArn="$CERT_ARN" \
    --default-actions Type=forward,TargetGroupArn="$TARGET_GROUP_ARN" \
    --region ap-northeast-1 \
    --query 'Listeners[0].ListenerArn' \
    --output text)

echo "HTTPS Listener created: $LISTENER_ARN"

# HTTP to HTTPS リダイレクトルールを追加
echo "Adding HTTP to HTTPS redirect..."

aws elbv2 modify-listener \
    --listener-arn "arn:aws:elasticloadbalancing:ap-northeast-1:118120622551:listener/app/vsdk-alb/9cd9cc4be8d64d6c/4c5943ae335cdcb8" \
    --default-actions Type=redirect,RedirectConfig='{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}' \
    --region ap-northeast-1

echo "Setup complete!"
echo "Your HTTPS URL will be: https://[your-domain].duckdns.org"