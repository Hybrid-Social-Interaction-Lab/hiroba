#!/bin/bash

# Setup AWS Systems Manager Parameter Store secrets for vSDK application
# This script creates placeholder parameters that need to be updated with real values

set -e

AWS_REGION="ap-northeast-1"

echo "🔐 Setting up AWS Systems Manager Parameter Store parameters..."
echo "⚠️  NOTE: This script creates parameters with placeholder values."
echo "   You MUST update them with real values manually or through AWS console."
echo ""

# Function to create or update parameter
create_parameter() {
    local param_name=$1
    local param_description=$2
    local placeholder_value=$3

    echo "Creating parameter: $param_name"

    # Check if parameter exists
    if aws ssm get-parameter --name "$param_name" --region "$AWS_REGION" >/dev/null 2>&1; then
        echo "  Parameter $param_name already exists, updating..."
        aws ssm put-parameter \
            --name "$param_name" \
            --value "$placeholder_value" \
            --description "$param_description" \
            --type "SecureString" \
            --overwrite \
            --region "$AWS_REGION"
    else
        echo "  Creating new parameter $param_name..."
        aws ssm put-parameter \
            --name "$param_name" \
            --value "$placeholder_value" \
            --description "$param_description" \
            --type "SecureString" \
            --region "$AWS_REGION"
    fi
}

# Create parameters
create_parameter "/vsdk-app/ZOOM_VSDK_KEY" "Zoom Video SDK API Key for avatar conference app" "REPLACE_WITH_REAL_ZOOM_VSDK_KEY"
create_parameter "/vsdk-app/ZOOM_VSDK_SECRET" "Zoom Video SDK Secret for avatar conference app" "REPLACE_WITH_REAL_ZOOM_VSDK_SECRET"
create_parameter "/vsdk-app/OPENAI_API_KEY" "OpenAI API Key for avatar conference app" "REPLACE_WITH_REAL_OPENAI_API_KEY"
create_parameter "/vsdk-app/AWS_ACCESS_KEY_ID" "AWS Access Key ID for Polly TTS service" "REPLACE_WITH_REAL_AWS_ACCESS_KEY_ID"
create_parameter "/vsdk-app/AWS_SECRET_ACCESS_KEY" "AWS Secret Access Key for Polly TTS service" "REPLACE_WITH_REAL_AWS_SECRET_ACCESS_KEY"

echo ""
echo "✅ Parameter Store setup complete!"
echo ""
echo "⚠️  IMPORTANT: Update the parameter values manually:"
echo "   1. Go to AWS Systems Manager Console > Parameter Store"
echo "   2. Update each parameter with the real values:"
echo "      - /vsdk-app/ZOOM_VSDK_KEY"
echo "      - /vsdk-app/ZOOM_VSDK_SECRET"
echo "      - /vsdk-app/OPENAI_API_KEY"
echo "      - /vsdk-app/AWS_ACCESS_KEY_ID"
echo "      - /vsdk-app/AWS_SECRET_ACCESS_KEY"
echo ""
echo "   Or use AWS CLI:"
echo "   aws ssm put-parameter --name '/vsdk-app/ZOOM_VSDK_KEY' --value 'YOUR_REAL_KEY' --type 'SecureString' --overwrite"
echo ""

# Check ECS task execution role permissions
echo "🔍 Checking ECS task execution role permissions..."
ROLE_NAME="ecsTaskExecutionRole"

# Check if role has SSM permissions
if aws iam list-attached-role-policies --role-name "$ROLE_NAME" --query 'AttachedPolicies[?PolicyName==`AmazonSSMReadOnlyAccess`]' --output text | grep -q "AmazonSSMReadOnlyAccess"; then
    echo "✅ ECS task execution role has SSM permissions"
else
    echo "⚠️  Adding SSM permissions to ECS task execution role..."
    aws iam attach-role-policy \
        --role-name "$ROLE_NAME" \
        --policy-arn "arn:aws:iam::aws:policy/AmazonSSMReadOnlyAccess"
    echo "✅ SSM permissions added to ECS task execution role"
fi

echo ""
echo "🎉 Setup complete! You can now deploy with secure parameter references."