# Deploy Overview — Which Path to Pick

hiroba can run on any Docker host. We document three production paths,
optimized for different needs.

## TL;DR

- **Single instance, simple handoff to researchers** → pick **Sakura VPS** (Japan-billed)
  or **AWS EC2 + Caddy** (US-billed). Same Docker Compose stack on both.
- **High availability, rolling deploys, AWS-managed services** → **AWS Fargate + ALB + ACM**.

## Decision matrix

| | Sakura VPS + Caddy | AWS EC2 + Caddy | AWS Fargate + ALB |
|---|---|---|---|
| **Monthly cost** | ¥1,738 (2GB plan, Tokyo) ≈ $11 | ~$17 (t4g.small + EIP + 20GB) | ~$50+ (ALB ≈ $20 alone) |
| **HTTPS** | Caddy auto (Let's Encrypt) | Caddy auto (Let's Encrypt) | ACM cert on ALB |
| **Redundancy** | None (single VM) | None (single VM) | Multi-AZ if desiredCount > 1 |
| **Persistent state** | File on host volume | File on host volume | DynamoDB + S3 (required) |
| **Who can operate it** | Anyone comfortable with `docker compose` | Anyone comfortable with `docker compose` | Needs ECS / ECR / CFn knowledge |
| **Deploy step** | `git pull && docker compose up -d --build` on the VM | `git pull && docker compose up -d --build` on the VM | Build, push to ECR, `aws ecs update-service` |
| **Billing currency** | JPY (¥) | USD ($) | USD ($) |
| **Documentation** | [SAKURA-DEPLOY.md](SAKURA-DEPLOY.md) | [AWS-EC2-CADDY-DEPLOY.md](AWS-EC2-CADDY-DEPLOY.md) | [AWS-DEPLOYMENT-SUBDOMAIN.md](AWS-DEPLOYMENT-SUBDOMAIN.md) |

## How to choose

1. **Are you handing this off to a researcher who only uses `ssh` and `docker compose`?**
   → Sakura or EC2+Caddy. They share a Compose file and a bootstrap script.

2. **Do you need >1 task running for redundancy or zero-downtime deploys?**
   → Fargate + ALB. The current Fargate setup runs a single task (no actual
   redundancy until you bump `desiredCount`), so don't default to it just
   because it's "serverless."

3. **Sakura vs AWS?**
   - Pick **Sakura** if you want fixed-yen billing, fewer cloud services to
     reason about, and US participants are fine with media routed through
     Zoom (which it is — only signaling/static assets hit your server).
   - Pick **AWS EC2** if you want to integrate with DynamoDB / S3 / Polly
     under the same account, or use SSO / IAM the lab already has.

## The compose path is the same

Both Sakura and AWS EC2 run:

```bash
docker compose -f deploy/docker/docker-compose.caddy.yml \
  --env-file .env.production up -d
```

The `app` container is reachable only through Caddy on the internal compose
network. Caddy publishes 80/443 (HTTP/2 + HTTP/3) and handles cert issuance
+ renewal automatically.

If you can run that command on any Docker host with a domain pointed at it,
you can run hiroba there. Bare-metal lab machines, on-prem servers,
Hetzner / DigitalOcean / etc. all work — the two documented guides
(Sakura, EC2) are just the ones we've actually tested.

## Legacy paths

Older deploy docs live under [`docs/legacy/`](legacy/) for reference:
- `SIMPLE-DEPLOY.md` — Fargate without ALB (HTTP-only, IP-based, superseded by EC2+Caddy)
- `HTTPS-OPTIONS.md` — Cloudflare Tunnel / DuckDNS / Caddy alternatives (we picked Caddy)
