#!/bin/bash
# ACM証明書要求スクリプト
# Usage: ./request-acm-cert.sh your-domain.duckdns.org

if [ $# -eq 0 ]; then
    echo "Usage: $0 <domain-name>"
    echo "Example: $0 vsdk-app-demo.duckdns.org"
    exit 1
fi

DOMAIN_NAME=$1

echo "Requesting ACM certificate for domain: $DOMAIN_NAME"

# ACM証明書を要求
CERT_ARN=$(aws acm request-certificate \
    --domain-name "$DOMAIN_NAME" \
    --validation-method DNS \
    --region ap-northeast-1 \
    --query 'CertificateArn' \
    --output text)

echo "Certificate ARN: $CERT_ARN"

# DNS検証レコードを取得
echo "Waiting for DNS validation records..."
sleep 10

aws acm describe-certificate \
    --certificate-arn "$CERT_ARN" \
    --region ap-northeast-1 \
    --query 'Certificate.DomainValidationOptions[0].ResourceRecord.{Name:Name,Value:Value,Type:Type}' \
    --output table

echo ""
echo "Next steps:"
echo "1. Add the CNAME record shown above to your DuckDNS domain"
echo "2. Wait for certificate validation (5-10 minutes)"
echo "3. Run: aws acm describe-certificate --certificate-arn $CERT_ARN --region ap-northeast-1 --query 'Certificate.Status'"
echo ""
echo "Certificate ARN (save this): $CERT_ARN"