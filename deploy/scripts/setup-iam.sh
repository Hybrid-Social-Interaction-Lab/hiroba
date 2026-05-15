#!/bin/bash

AWS_REGION="ap-northeast-1"
ACCOUNT_ID="118120622551"

echo "=== Setting up IAM roles and policies ==="

# 1. ECS Task Execution Roleの作成
echo "1. Creating ECS Task Execution Role..."
aws iam create-role --role-name ecsTaskExecutionRole --assume-role-policy-document '{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "",
      "Effect": "Allow",
      "Principal": {
        "Service": "ecs-tasks.amazonaws.com"
      },
      "Action": "sts:AssumeRole"
    }
  ]
}' 2>/dev/null || echo "Role already exists"

# 2. 必要なポリシーをアタッチ
echo "2. Attaching policies to ecsTaskExecutionRole..."
aws iam attach-role-policy --role-name ecsTaskExecutionRole --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy

# 3. ユーザーにPassRole権限を付与するポリシーを作成
echo "3. Creating PassRole policy for user..."
cat > /tmp/ecs-passrole-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "iam:PassRole"
            ],
            "Resource": [
                "arn:aws:iam::${ACCOUNT_ID}:role/ecsTaskExecutionRole"
            ]
        },
        {
            "Effect": "Allow",
            "Action": [
                "ecs:*",
                "ec2:DescribeVpcs",
                "ec2:DescribeSubnets",
                "ec2:DescribeSecurityGroups",
                "ec2:CreateSecurityGroup",
                "ec2:AuthorizeSecurityGroupIngress",
                "ec2:DescribeNetworkInterfaces",
                "ecr:*",
                "logs:CreateLogGroup",
                "logs:CreateLogStream",
                "logs:PutLogEvents",
                "logs:DescribeLogGroups",
                "logs:DescribeLogStreams"
            ],
            "Resource": "*"
        }
    ]
}
EOF

# 4. ポリシーを作成
aws iam create-policy --policy-name ECSDeployPolicy --policy-document file:///tmp/ecs-passrole-policy.json 2>/dev/null || echo "Policy already exists"

# 5. 現在のユーザーにポリシーをアタッチ
USER_NAME=$(aws sts get-caller-identity --query 'Arn' --output text | cut -d'/' -f2)
echo "5. Attaching policy to user: $USER_NAME"
aws iam attach-user-policy --user-name $USER_NAME --policy-arn arn:aws:iam::${ACCOUNT_ID}:policy/ECSDeployPolicy

echo "✓ IAM setup completed!"
echo ""
echo "Note: It may take a few minutes for the permissions to propagate."
echo "Wait 2-3 minutes before running the deploy script again."

# クリーンアップ
rm -f /tmp/ecs-passrole-policy.json