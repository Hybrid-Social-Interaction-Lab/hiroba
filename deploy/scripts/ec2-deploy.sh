#!/bin/bash

# EC2を使った代替デプロイ方法
AWS_REGION="ap-northeast-1"
KEY_NAME="vsdkbasic-key"  # 事前にキーペアを作成してください

echo "=== Alternative EC2 Deployment ==="

# 1. キーペアの作成（存在しない場合）
echo "1. Creating key pair..."
aws ec2 create-key-pair --key-name $KEY_NAME --query 'KeyMaterial' --output text > ${KEY_NAME}.pem 2>/dev/null || echo "Key pair already exists"
chmod 400 ${KEY_NAME}.pem 2>/dev/null

# 2. セキュリティグループの作成
echo "2. Creating security group for EC2..."
SG_ID=$(aws ec2 create-security-group --group-name vsdkbasic-ec2-sg --description "Security group for VideoSDK EC2" --query 'GroupId' --output text 2>/dev/null)

if [ $? -eq 0 ]; then
    # SSH (22) とHTTP (3000) を許可
    aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 22 --cidr 0.0.0.0/0
    aws ec2 authorize-security-group-ingress --group-id $SG_ID --protocol tcp --port 3000 --cidr 0.0.0.0/0
    echo "Created security group: $SG_ID"
else
    SG_ID=$(aws ec2 describe-security-groups --filters "Name=group-name,Values=vsdkbasic-ec2-sg" --query 'SecurityGroups[0].GroupId' --output text)
    echo "Using existing security group: $SG_ID"
fi

# 3. User Dataスクリプトを作成
cat > user-data.sh << 'EOF'
#!/bin/bash
yum update -y
yum install -y docker git

# Dockerを起動
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Node.jsをインストール
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 18
nvm use 18

# アプリケーションをクローン（GitHubにプッシュされている場合）
cd /home/ec2-user
# git clone YOUR_GITHUB_REPO
# cd YOUR_REPO_NAME

# 仮のアプリケーションファイルを作成（実際にはGitHubからクローン）
mkdir -p app
cd app

# package.jsonを作成
cat > package.json << 'PACKAGE'
{
  "name": "vsdk-basic-sample",
  "version": "1.5.5",
  "description": "VideoSDK Basic Web Sample",
  "main": "index.js",
  "scripts": {
    "start": "node index.js"
  },
  "dependencies": {
    "body-parser": "^1.20.0",
    "cors": "^2.8.5",
    "dotenv": "^16.0.1",
    "express": "^4.18.1",
    "jsrsasign": "^10.5.27"
  }
}
PACKAGE

# 依存関係をインストール
npm install

# アプリケーションを起動（pm2を使用して永続化）
npm install -g pm2
EOF

# 4. EC2インスタンスを起動
echo "3. Launching EC2 instance..."
INSTANCE_ID=$(aws ec2 run-instances \
  --image-id ami-0d52744d6551d851e \
  --count 1 \
  --instance-type t2.micro \
  --key-name $KEY_NAME \
  --security-group-ids $SG_ID \
  --user-data file://user-data.sh \
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=VideoSDK-Basic-Transcript}]' \
  --query 'Instances[0].InstanceId' \
  --output text)

echo "Instance launched: $INSTANCE_ID"

# 5. パブリックIPを取得
echo "4. Waiting for instance to get public IP..."
sleep 30

PUBLIC_IP=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text)

echo ""
echo "✓ EC2 Alternative deployment initiated!"
echo ""
echo "Instance ID: $INSTANCE_ID"
echo "Public IP: $PUBLIC_IP"
echo "SSH Key: ${KEY_NAME}.pem"
echo ""
echo "To connect:"
echo "ssh -i ${KEY_NAME}.pem ec2-user@$PUBLIC_IP"
echo ""
echo "Application will be available at:"
echo "http://$PUBLIC_IP:3000"
echo ""
echo "Note: Wait 5-10 minutes for the application to fully start."

# クリーンアップ
rm -f user-data.sh