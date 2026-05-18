#!/bin/bash
# Cloud-init / user-data for hiroba on Ubuntu 22.04 LTS.
#
# Used by:
#   - deploy/scripts/ec2-deploy.sh (AWS EC2)
#   - Sakura VPS control panel "startup script" field
#
# The wrapper script substitutes two placeholders before submitting:
#   __REPO_URL__        — git clone URL (e.g., https://github.com/<org>/hiroba.git)
#   __REPO_REF__        — branch / tag / commit to check out (default: main)
#   __ENV_FILE_BASE64__ — base64-encoded contents of the operator's
#                         .env.production file
#
# This script must stay idempotent and self-contained so it can later be
# embedded verbatim in a CloudFormation `Fn::Sub UserData`.

set -euo pipefail

exec > >(tee -a /var/log/user-data.log) 2>&1
echo "=== hiroba user-data start: $(date -u +%FT%TZ) ==="

REPO_URL="__REPO_URL__"
REPO_REF="__REPO_REF__"
ENV_FILE_BASE64="__ENV_FILE_BASE64__"
APP_DIR="/opt/hiroba"

# --- 1. System packages ---------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y \
	ca-certificates \
	curl \
	git \
	gnupg \
	ufw

# --- 2. Docker Engine + Compose plugin (official repo) --------------------
install -m 0755 -d /etc/apt/keyrings
if [ ! -f /etc/apt/keyrings/docker.gpg ]; then
	curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
		| gpg --dearmor -o /etc/apt/keyrings/docker.gpg
	chmod a+r /etc/apt/keyrings/docker.gpg
fi

UBUNTU_CODENAME="$(. /etc/os-release && echo "$VERSION_CODENAME")"
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $UBUNTU_CODENAME stable" \
	> /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y \
	docker-ce \
	docker-ce-cli \
	containerd.io \
	docker-buildx-plugin \
	docker-compose-plugin

systemctl enable --now docker

# --- 3. Host firewall (ufw) -----------------------------------------------
# Sakura also applies its control-panel packet filter — open 80/443 there too.
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# --- 4. Clone / update the app --------------------------------------------
if [ ! -d "$APP_DIR/.git" ]; then
	git clone --depth 1 --branch "$REPO_REF" "$REPO_URL" "$APP_DIR"
else
	git -C "$APP_DIR" fetch --depth 1 origin "$REPO_REF"
	git -C "$APP_DIR" checkout "$REPO_REF"
	git -C "$APP_DIR" reset --hard "origin/$REPO_REF" || true
fi

# --- 5. Materialize .env.production ---------------------------------------
echo "$ENV_FILE_BASE64" | base64 -d > "$APP_DIR/.env.production"
chmod 600 "$APP_DIR/.env.production"

# --- 6. Prepare host volumes for app uid 1001 -----------------------------
# Dockerfile runs the app as uid:gid 1001:1001. Pre-create the bind-mount
# targets so the container can write to them.
mkdir -p "$APP_DIR/data" "$APP_DIR/logs"
chown -R 1001:1001 "$APP_DIR/data" "$APP_DIR/logs"

# --- 7. Build + start the stack ------------------------------------------
cd "$APP_DIR"
docker compose -f deploy/docker/docker-compose.caddy.yml \
	--env-file .env.production \
	up -d --build

echo "=== hiroba user-data done: $(date -u +%FT%TZ) ==="
echo "Verify with:"
echo "  docker compose -f $APP_DIR/deploy/docker/docker-compose.caddy.yml ps"
echo "  docker logs \$(docker compose -f $APP_DIR/deploy/docker/docker-compose.caddy.yml ps -q caddy) 2>&1 | tail -50"
