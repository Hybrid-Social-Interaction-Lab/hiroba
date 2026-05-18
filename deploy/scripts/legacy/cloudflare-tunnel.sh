#!/bin/bash
# CloudFlare Tunnel setup script for free HTTPS

echo "Setting up CloudFlare Tunnel for free HTTPS..."

# Install cloudflared
if ! command -v cloudflared &> /dev/null; then
    echo "Installing cloudflared..."
    
    # For macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &> /dev/null; then
            brew install cloudflared
        else
            echo "Please install Homebrew first: https://brew.sh/"
            exit 1
        fi
    # For Linux
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
        sudo dpkg -i cloudflared-linux-amd64.deb
        rm cloudflared-linux-amd64.deb
    else
        echo "Unsupported OS. Please install cloudflared manually."
        exit 1
    fi
fi

echo "CloudFlare Tunnel installed successfully!"
echo ""
echo "Next steps:"
echo "1. Go to https://dash.cloudflare.com/"
echo "2. Create a free account if you don't have one"
echo "3. Go to Zero Trust > Networks > Tunnels"
echo "4. Create a new tunnel"
echo "5. Run the provided cloudflared command"
echo ""
echo "Your ALB URL: http://vsdk-alb-1950753101.ap-northeast-1.elb.amazonaws.com"
echo "Direct IP: http://52.195.188.228:3000"