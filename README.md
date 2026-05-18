# HIROBA (広場)

A video conferencing system built with Zoom Video SDK, featuring AI avatars, real-time transcription, speech synthesis, and a Master Control Panel for managing agent behavior during sessions.

## Features

- **AI Avatars**: Multiple synchronized agents with lip-sync animation
- **Real-time Transcription**: Live speech-to-text conversion
- **AI Responses**: OpenAI-powered intelligent replies
- **Speech Synthesis**: Amazon Polly and SpeechGen.io support
- **Master Control Panel**: Remote parameter management (silence detection, periodic speech, prompts)
- **Session Logging**: Complete conversation export (CSV, JSON)

---

## Quick Start (Local Development)

```bash
git clone https://github.com/Hybrid-Social-Interaction-Lab/hiroba.git
cd hiroba
npm install
cp .env.example .env
# Fill in ZOOM_VSDK_KEY and ZOOM_VSDK_SECRET at minimum.
node index.js
```

Then open:
- **Lobby**: http://localhost:3000/
- **Admin**: http://localhost:3000/admin/

Auto-reload with Docker:

```bash
docker compose -f deploy/docker/docker-compose.dev.yml up
```

Get Zoom credentials at [Zoom Developer Portal](https://developers.zoom.us/docs/video-sdk/developer-accounts/#get-video-sdk-credentials).

---

## Production Deployment

The production stack is **Docker Compose + Caddy** (automatic HTTPS via
Let's Encrypt). It runs identically on Sakura VPS, AWS EC2, or any Docker
host with a public IP and a domain.

Two paths are documented below — pick whichever fits:

- **Path A: Sakura VPS**
- **Path B: AWS EC2**

Need rolling deploys or multi-AZ redundancy? Use the
[Fargate + ALB path](docs/AWS-DEPLOYMENT-SUBDOMAIN.md) instead — single-instance
deploys below have no redundancy.

### Common preparation (do this once, locally)

On your local machine, in this repo:

```bash
cp .env.example.production .env.production
```

Edit `.env.production` and set at least:

- `DOMAIN` — the public hostname (e.g. `hiroba.example.com`)
- `ACME_EMAIL` — your email (Let's Encrypt registration)
- `ZOOM_VSDK_KEY`, `ZOOM_VSDK_SECRET` — from the Zoom Developer Portal

Optional: `OPENAI_API_KEY`, `AWS_*` (for Polly), `SPEECHGEN_*`.

> ⚠️ **Order of operations matters.** Caddy requests a Let's Encrypt cert on
> first start and will be rate-limited (5 failures/hour) if DNS isn't ready.
> Always: **add the A record first → wait for `dig +short ${DOMAIN}` → then start the stack.**

---

### Path A: Sakura VPS (recommended for Japan-billed lab handoff)

**1. Create the VPS.** Sign in to [Sakura VPS](https://secure.sakura.ad.jp/vps/) and create a new instance:

- Plan: **2GB** (recommended) — or 1GB (demo only; app's prod limit is 1GB so concurrent sessions risk OOM)
- Region: **東京**
- OS: **Ubuntu 22.04 LTS amd64**
- Register your SSH public key
- Leave the startup-script field empty for now

Note the assigned IPv4 address.

**2. Point DNS at the VPS.** At your DNS provider:

```
${DOMAIN}   A   <VPS IPv4>
```

Verify from your local machine: `dig +short ${DOMAIN}` should print the IP.

**3. Open the Sakura packet filter.** Sakura applies a control-panel-level
packet filter on top of the VM's `ufw`. **Both must be open** or traffic is
silently dropped.

In the VPS control panel → "パケットフィルター設定", allow inbound:
**TCP 22, TCP 80, TCP 443, UDP 443**.

**4. Bootstrap.** Generate the base64-encoded env file locally:

```bash
base64 < .env.production | tr -d '\n'
# Copy the output.
```

SSH into the VPS:

```bash
ssh ubuntu@<VPS IPv4>
```

On the VPS:

```bash
curl -fsSLO https://raw.githubusercontent.com/Hybrid-Social-Interaction-Lab/hiroba/main/deploy/scripts/ec2-user-data.sh

ENV_B64='paste-the-base64-string-here'
sed -i \
  -e "s|__REPO_URL__|https://github.com/Hybrid-Social-Interaction-Lab/hiroba.git|g" \
  -e "s|__REPO_REF__|main|g" \
  -e "s|__ENV_FILE_BASE64__|${ENV_B64}|g" \
  ec2-user-data.sh

sudo bash ec2-user-data.sh
sudo tail -f /var/log/user-data.log
```

Wait for `=== HIROBA user-data done ===` (typically 2–3 minutes).

**5. Verify.** From your local machine:

```bash
curl -vI https://${DOMAIN}/   # HTTP/2 200; cert by "Let's Encrypt"
```

Open `https://${DOMAIN}/admin/` and start a session — the browser should
prompt for camera + microphone permissions (the entire reason we need real
HTTPS — `getUserMedia` is gated on a secure context).

More detail and Sakura-specific troubleshooting: [docs/SAKURA-DEPLOY.md](docs/SAKURA-DEPLOY.md).

---

### Path B: AWS EC2 (recommended for AWS-billed lab handoff)

**Prerequisites.** AWS CLI v2 configured for `ap-northeast-1` (Tokyo) with
permissions for EC2 + Elastic IPs.

**1. Launch the instance.** From the repo root, after preparing `.env.production`:

```bash
bash deploy/scripts/ec2-deploy.sh
```

Defaults: `t4g.small` (ARM) + Ubuntu 22.04 LTS + 20GB gp3 + Elastic IP.
Use `--amd64` for `t3.small` if you prefer x86_64. Other knobs: `AWS_REGION`,
`KEY_NAME`, `REPO_URL`, `REPO_REF`, `ADMIN_CIDR` (SSH source — defaults to your current public IP).

The script:
1. Creates / reuses the key pair (saves `hiroba-key.pem` locally).
2. Creates / reuses the security group (22 from your IP, 80/443 from anywhere).
3. Looks up the latest Ubuntu 22.04 LTS AMI dynamically.
4. Substitutes placeholders in `ec2-user-data.sh` and submits as user-data
   (base64-encoded `.env.production` injected here).
5. Launches the instance, allocates + associates an Elastic IP.

When it finishes it prints the Elastic IP.

**2. Point DNS at the Elastic IP.** At your DNS provider:

```
${DOMAIN}   A   <Elastic IP>
```

Verify: `dig +short ${DOMAIN}` should print the EIP.

**3. Watch the bootstrap.**

```bash
ssh -i hiroba-key.pem ubuntu@<Elastic IP>
sudo tail -f /var/log/user-data.log
```

Wait for `=== HIROBA user-data done ===`.

**4. Verify.**

```bash
curl -vI https://${DOMAIN}/   # HTTP/2 200; cert by "Let's Encrypt"
```

Open `https://${DOMAIN}/admin/` — the browser should prompt for camera + mic.

More detail and AWS-specific troubleshooting: [docs/AWS-EC2-CADDY-DEPLOY.md](docs/AWS-EC2-CADDY-DEPLOY.md).

---

### Update / redeploy (shared, both paths)

After a `git push` to the main branch:

```bash
ssh <user>@<server>
cd /opt/hiroba
sudo git pull
sudo docker compose \
  -f deploy/docker/docker-compose.caddy.yml \
  --env-file .env.production \
  up -d --build
```

Rotate secrets by editing `/opt/hiroba/.env.production` and re-running
`compose up -d`.

Check status:

```bash
sudo docker compose -f /opt/hiroba/deploy/docker/docker-compose.caddy.yml ps
sudo docker compose -f /opt/hiroba/deploy/docker/docker-compose.caddy.yml logs --tail 100
```

---

## Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ZOOM_VSDK_KEY` | Required | — | Zoom Video SDK key |
| `ZOOM_VSDK_SECRET` | Required | — | Zoom Video SDK secret |
| `DOMAIN` | Required (Caddy deploy) | — | Public hostname for Let's Encrypt |
| `ACME_EMAIL` | Required (Caddy deploy) | — | Email for Let's Encrypt registration |
| `PORT` | Optional | 3000 | HTTP port (internal in Caddy deploys) |
| `HTTPS_PORT` | Optional | 3443 | HTTPS port (ignored when Caddy fronts the app) |
| `NODE_ENV` | Optional | development | Environment mode |
| `OPENAI_API_KEY` | Optional | — | OpenAI for AI responses |
| `AWS_ACCESS_KEY_ID` | Optional | — | AWS Polly (speech synthesis) |
| `AWS_SECRET_ACCESS_KEY` | Optional | — | AWS secret key |
| `AWS_REGION` | Optional | ap-northeast-1 | AWS region |
| `SPEECHGEN_API_TOKEN` | Optional | — | SpeechGen.io token |
| `SPEECHGEN_EMAIL` | Optional | — | SpeechGen.io email |
| `SETTINGS_BACKEND` | Optional | file | `file` or `dynamodb` |
| `SETTINGS_DDB_TABLE` | Optional | — | DynamoDB table for settings |
| `SESSION_LOG_UPLOAD_BACKEND` | Optional | file | `file` or `s3` |
| `SESSION_LOG_S3_BUCKET` | Optional | — | S3 bucket for session logs |

## License

MIT
