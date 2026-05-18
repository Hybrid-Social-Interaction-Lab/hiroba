# AWS EC2 Deploy (Docker Compose + Caddy)

Deploy hiroba on a single AWS EC2 instance with automatic HTTPS via
Caddy + Let's Encrypt. Same Docker Compose stack as
[Sakura VPS](SAKURA-DEPLOY.md) — only the provisioning differs.

This is the AWS path for **lab handoff**: one instance, fixed monthly cost
(~$15 for t4g.small + EIP + 20GB gp3 ≈ $17–19/mo), no ALB, no ECR push
workflow. For high-availability production with rolling deploys, see
[Fargate + ALB](AWS-DEPLOYMENT-SUBDOMAIN.md) instead.

---

## Prerequisites

- AWS CLI v2 configured (`aws configure` or SSO) with permissions for EC2,
  CloudWatch logs, and Elastic IPs in `ap-northeast-1` (Tokyo).
- A domain whose DNS you control (Route 53, Cloudflare, domain.com, etc.).
- A local clone of this repo.

---

## 1. Prepare `.env.production`

```bash
cp .env.example.production .env.production
# Fill in DOMAIN, ACME_EMAIL, ZOOM_VSDK_KEY, ZOOM_VSDK_SECRET.
# Optional: OPENAI_API_KEY, AWS_* for Polly, SPEECHGEN_*.
```

The deploy script reads this file and injects it into the instance's
user-data (base64-encoded) so the bootstrap can write
`/opt/hiroba/.env.production` automatically.

> **Security note:** EC2 user-data is readable from inside the instance via
> the metadata service (`http://169.254.169.254/latest/user-data`). That's
> acceptable for a lab handoff. The future CloudFormation version will pull
> secrets from SSM Parameter Store instead.

---

## 2. Launch the instance

From the repo root:

```bash
bash deploy/scripts/ec2-deploy.sh
```

Defaults:

| Setting | Value | Override via |
|---|---|---|
| Region | `ap-northeast-1` | `AWS_REGION` |
| Instance type | `t4g.small` (ARM, ~$13/mo) | `--amd64` for `t3.small` |
| AMI | latest Ubuntu 22.04 LTS for the arch | (dynamic lookup) |
| Repo | `https://github.com/Hybrid-Social-Interaction-Lab/hiroba.git@main` | `REPO_URL`, `REPO_REF` |
| Key pair | `hiroba-key` (created if absent, saved as `hiroba-key.pem`) | `KEY_NAME` |
| Security group | `hiroba-caddy-sg` (22 from your IP/32, 80/443 from anywhere) | `SG_NAME`, `ADMIN_CIDR` |
| Disk | 20GB gp3 root | (edit script) |

The script will:

1. Create / reuse the key pair (saving the `.pem` locally).
2. Create / reuse the security group with the right ingress rules.
3. Look up the latest Ubuntu 22.04 LTS AMI dynamically (no hard-coded IDs).
4. Substitute placeholders in `deploy/scripts/ec2-user-data.sh` and submit
   it as the instance's user-data.
5. Launch the instance and wait for it to be running.
6. Allocate + associate an Elastic IP (so the IP survives reboots).

When it finishes it prints the Elastic IP and SSH command.

---

## 3. Point DNS at the Elastic IP

**Do this before the app finishes booting** so Caddy's first ACME challenge
succeeds.

Add an A record at your DNS provider:

```
${DOMAIN}     A     <Elastic IP from step 2>
```

Verify from your local machine:

```bash
dig +short ${DOMAIN}
# Should print the Elastic IP.
```

---

## 4. Watch the bootstrap

```bash
ssh -i hiroba-key.pem ubuntu@<Elastic IP>
sudo tail -f /var/log/user-data.log
```

Wait for `=== hiroba user-data done ===`. The first run takes 2–3 minutes
(apt + Docker install + first compose build).

---

## 5. Verify

```bash
curl -vI https://${DOMAIN}/
# HTTP/2 200; cert issued by "Let's Encrypt"
```

Open `https://${DOMAIN}/admin/` and start a Zoom session. The browser
should prompt for camera + microphone (the entire reason we need real
HTTPS — `getUserMedia` is gated on secure context).

Check both containers are healthy:

```bash
sudo docker compose \
  -f /opt/hiroba/deploy/docker/docker-compose.caddy.yml ps
```

---

## 6. Update / redeploy

```bash
ssh -i hiroba-key.pem ubuntu@<Elastic IP>
cd /opt/hiroba
sudo git pull
sudo docker compose \
  -f deploy/docker/docker-compose.caddy.yml \
  --env-file .env.production \
  up -d --build
```

Rotate secrets by editing `/opt/hiroba/.env.production` and re-running
`compose up -d`.

---

## 7. Tear down

```bash
# Replace IDs with the ones printed by ec2-deploy.sh
aws ec2 terminate-instances --instance-ids <i-...> --region ap-northeast-1
aws ec2 release-address --allocation-id <eipalloc-...> --region ap-northeast-1
aws ec2 delete-security-group --group-id <sg-...> --region ap-northeast-1
```

The key pair survives so future deploys can re-use the same `.pem` file.
Delete it explicitly with `aws ec2 delete-key-pair --key-name hiroba-key`.

---

## Troubleshooting

**Caddy can't get a cert.** Almost always a DNS or firewall issue:

```bash
# From outside the VM
nc -vz <Elastic IP> 443   # should succeed
dig +short ${DOMAIN}      # should print Elastic IP
```

If a previous run hit Let's Encrypt rate limits, wait one hour, then make
sure the `caddy_data` volume is preserved across `up -d` invocations so
the cert is reused instead of re-requested.

**App is unreachable but Caddy returns 502.** App container failed to
start. Check logs:

```bash
sudo docker compose \
  -f /opt/hiroba/deploy/docker/docker-compose.caddy.yml logs app | tail -100
```

**Disk full.** 20GB is enough for the app + Caddy data, but Docker image
layers can accumulate. `sudo docker system prune -a` to reclaim.

---

## See also

- [Deploy overview](DEPLOY-OVERVIEW.md)
- [Sakura VPS](SAKURA-DEPLOY.md) — same Compose, different cloud
- [Fargate + ALB (HA)](AWS-DEPLOYMENT-SUBDOMAIN.md) — when single-instance isn't enough
