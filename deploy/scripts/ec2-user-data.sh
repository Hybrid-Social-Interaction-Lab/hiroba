#!/bin/bash
set -e

# ログ出力
exec > >(tee /var/log/user-data.log)
exec 2>&1

echo "=== Starting EC2 User Data Script ==="

# システムアップデート
yum update -y

# 必要なパッケージをインストール
yum install -y docker git

# Dockerを起動
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# AWS CLIの設定（既にインストール済み）
echo "Configuring AWS CLI..."

# ECRにログイン
aws ecr get-login-password --region ap-northeast-1 | docker login --username AWS --password-stdin 118120622551.dkr.ecr.ap-northeast-1.amazonaws.com

# 環境変数ファイルを作成
mkdir -p /home/ec2-user/app
cat > /home/ec2-user/app/.env << 'ENVEOF'
NODE_ENV=production
PORT=3000
HTTPS_PORT=3443
AWS_REGION=ap-northeast-1
ZOOM_VSDK_KEY=
ZOOM_VSDK_SECRET=
OPENAI_API_KEY=
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
ENVEOF

# ECRから最新のイメージをプル
echo "Pulling latest Docker image from ECR..."
docker pull 118120622551.dkr.ecr.ap-northeast-1.amazonaws.com/vsdk-app:latest

# 既存のコンテナを停止・削除（存在する場合）
docker stop vsdk-app 2>/dev/null || true
docker rm vsdk-app 2>/dev/null || true

# Dockerコンテナを起動
echo "Starting Docker container..."
docker run -d \
  --name vsdk-app \
  --restart unless-stopped \
  -p 80:3000 \
  -p 443:3443 \
  --env-file /home/ec2-user/app/.env \
  118120622551.dkr.ecr.ap-northeast-1.amazonaws.com/vsdk-app:latest

# 所有権を修正
chown -R ec2-user:ec2-user /home/ec2-user/app

echo "=== EC2 User Data Script Completed ==="
echo "Application is now running on port 80 (mapped to 3000)"
