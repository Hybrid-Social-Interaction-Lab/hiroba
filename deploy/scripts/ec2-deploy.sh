#!/usr/bin/env bash
# Provision a single EC2 instance running the Caddy-fronted hiroba stack.
#
# Defaults: t4g.small (ARM, ~$15/mo), Ubuntu 22.04 LTS latest, Tokyo region.
# Use `--amd64` for x86_64 (t3.small). Override anything via env vars below.
#
# Required local files:
#   .env.production  — operator-filled, copy of .env.example.production
#
# After this script finishes, you must:
#   1. Add an A record:  ${DOMAIN}  ->  <printed Elastic IP>
#   2. Wait for `dig +short ${DOMAIN}` to return that IP
#   3. SSH in and tail /var/log/user-data.log until "user-data done"
#
# Caddy will then request a Let's Encrypt cert on first start.

set -euo pipefail

# --- Config (override via env) --------------------------------------------
AWS_REGION="${AWS_REGION:-ap-northeast-1}"
KEY_NAME="${KEY_NAME:-hiroba-key}"
SG_NAME="${SG_NAME:-hiroba-caddy-sg}"
TAG_NAME="${TAG_NAME:-hiroba}"
REPO_URL="${REPO_URL:-https://github.com/Hybrid-Social-Interaction-Lab/hiroba.git}"
REPO_REF="${REPO_REF:-main}"
ENV_FILE="${ENV_FILE:-.env.production}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t4g.small}"
ARCH="arm64"

# Admin CIDR for SSH (port 22). Defaults to the caller's current public IP /32.
ADMIN_CIDR="${ADMIN_CIDR:-}"

# Parse flags
for arg in "$@"; do
	case "$arg" in
		--amd64)
			INSTANCE_TYPE="t3.small"
			ARCH="amd64"
			;;
		-h|--help)
			grep '^#' "$0" | sed 's/^# \{0,1\}//'
			exit 0
			;;
		*)
			echo "Unknown argument: $arg" >&2
			exit 2
			;;
	esac
done

if [ ! -f "$ENV_FILE" ]; then
	echo "ERROR: $ENV_FILE not found." >&2
	echo "Copy .env.example.production to $ENV_FILE and fill it in first." >&2
	exit 1
fi

if [ -z "$ADMIN_CIDR" ]; then
	MY_IP="$(curl -fsS https://checkip.amazonaws.com)"
	ADMIN_CIDR="${MY_IP}/32"
fi

echo "=== hiroba EC2 deploy ==="
echo "  Region:        $AWS_REGION"
echo "  Instance type: $INSTANCE_TYPE ($ARCH)"
echo "  SSH from:      $ADMIN_CIDR"
echo "  Repo:          $REPO_URL @ $REPO_REF"
echo "  Env file:      $ENV_FILE"
echo

# --- 1. Key pair (idempotent) ---------------------------------------------
if ! aws ec2 describe-key-pairs --region "$AWS_REGION" --key-names "$KEY_NAME" >/dev/null 2>&1; then
	echo "[1/6] Creating key pair $KEY_NAME -> ${KEY_NAME}.pem"
	aws ec2 create-key-pair \
		--region "$AWS_REGION" \
		--key-name "$KEY_NAME" \
		--query 'KeyMaterial' \
		--output text > "${KEY_NAME}.pem"
	chmod 400 "${KEY_NAME}.pem"
else
	echo "[1/6] Key pair $KEY_NAME already exists; expecting ${KEY_NAME}.pem locally"
fi

# --- 2. Security group ----------------------------------------------------
echo "[2/6] Ensuring security group $SG_NAME"
SG_ID="$(aws ec2 describe-security-groups \
	--region "$AWS_REGION" \
	--filters "Name=group-name,Values=$SG_NAME" \
	--query 'SecurityGroups[0].GroupId' \
	--output text 2>/dev/null || true)"

if [ -z "$SG_ID" ] || [ "$SG_ID" = "None" ]; then
	SG_ID="$(aws ec2 create-security-group \
		--region "$AWS_REGION" \
		--group-name "$SG_NAME" \
		--description "hiroba (Caddy + Docker Compose)" \
		--query 'GroupId' --output text)"
	echo "    created $SG_ID"
fi

# Idempotent rule add: ignore "already exists" errors.
add_rule() {
	local proto="$1" port="$2" cidr="$3"
	aws ec2 authorize-security-group-ingress \
		--region "$AWS_REGION" \
		--group-id "$SG_ID" \
		--protocol "$proto" --port "$port" --cidr "$cidr" 2>/dev/null || true
}
add_rule tcp 22 "$ADMIN_CIDR"
add_rule tcp 80 "0.0.0.0/0"
add_rule tcp 443 "0.0.0.0/0"
add_rule udp 443 "0.0.0.0/0"

# --- 3. AMI lookup (Ubuntu 22.04 LTS, current arch) -----------------------
echo "[3/6] Looking up latest Ubuntu 22.04 LTS AMI ($ARCH)"
AMI_ID="$(aws ec2 describe-images \
	--region "$AWS_REGION" \
	--owners 099720109477 \
	--filters \
		"Name=name,Values=ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-${ARCH}-server-*" \
		"Name=state,Values=available" \
	--query 'sort_by(Images, &CreationDate)[-1].ImageId' \
	--output text)"
echo "    AMI: $AMI_ID"

# --- 4. Prepare user-data with substitutions ------------------------------
echo "[4/6] Building user-data script"
ENV_B64="$(base64 < "$ENV_FILE" | tr -d '\n')"
USER_DATA_TMP="$(mktemp)"
trap 'rm -f "$USER_DATA_TMP"' EXIT
sed \
	-e "s|__REPO_URL__|${REPO_URL}|g" \
	-e "s|__REPO_REF__|${REPO_REF}|g" \
	-e "s|__ENV_FILE_BASE64__|${ENV_B64}|g" \
	"$(dirname "$0")/ec2-user-data.sh" > "$USER_DATA_TMP"

# --- 5. Launch instance ---------------------------------------------------
echo "[5/6] Launching $INSTANCE_TYPE"
INSTANCE_ID="$(aws ec2 run-instances \
	--region "$AWS_REGION" \
	--image-id "$AMI_ID" \
	--instance-type "$INSTANCE_TYPE" \
	--key-name "$KEY_NAME" \
	--security-group-ids "$SG_ID" \
	--user-data "file://$USER_DATA_TMP" \
	--block-device-mappings 'DeviceName=/dev/sda1,Ebs={VolumeSize=20,VolumeType=gp3}' \
	--tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$TAG_NAME}]" \
	--query 'Instances[0].InstanceId' \
	--output text)"
echo "    InstanceId: $INSTANCE_ID"

aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"

# --- 6. Elastic IP --------------------------------------------------------
echo "[6/6] Allocating Elastic IP"
ALLOC_ID="$(aws ec2 allocate-address \
	--region "$AWS_REGION" \
	--domain vpc \
	--tag-specifications "ResourceType=elastic-ip,Tags=[{Key=Name,Value=$TAG_NAME}]" \
	--query 'AllocationId' --output text)"

EIP="$(aws ec2 describe-addresses \
	--region "$AWS_REGION" \
	--allocation-ids "$ALLOC_ID" \
	--query 'Addresses[0].PublicIp' --output text)"

aws ec2 associate-address \
	--region "$AWS_REGION" \
	--instance-id "$INSTANCE_ID" \
	--allocation-id "$ALLOC_ID" >/dev/null

cat <<EOF

=== Done ===
  Instance ID:   $INSTANCE_ID
  Elastic IP:    $EIP
  Security grp:  $SG_ID
  SSH key:       ${KEY_NAME}.pem

Next steps:
  1. Add an A record:  \$(grep ^DOMAIN $ENV_FILE)  ->  $EIP
  2. Wait for DNS:     dig +short \$(grep ^DOMAIN $ENV_FILE | cut -d= -f2)
                       should return $EIP
  3. SSH:              ssh -i ${KEY_NAME}.pem ubuntu@$EIP
  4. Tail bootstrap:   sudo tail -f /var/log/user-data.log
  5. Visit:            https://\$(grep ^DOMAIN $ENV_FILE | cut -d= -f2)/

Caddy will request a Let's Encrypt cert automatically on first request.
EOF
