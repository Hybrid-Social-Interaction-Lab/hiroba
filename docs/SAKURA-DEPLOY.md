# Sakura VPS Deploy (Docker Compose + Caddy)

Deploy HIROBA on a Sakura VPS with automatic HTTPS via Caddy + Let's Encrypt.
This is the recommended path for lab handoff: a single VPS, a single
`docker compose up -d` command, and no AWS managed services required.

Same Compose stack as [AWS EC2 + Caddy](AWS-EC2-CADDY-DEPLOY.md); only
the provisioning steps differ.

---

## 1. Choose a plan

| Plan | vCPU | RAM | SSD | 月額 | Fit |
|------|------|-----|-----|------|-----|
| 1GB  | 2    | 1GB | 50GB  | ¥880   | Minimum. App's prod memory limit is 1GB, so concurrent sessions risk OOM. Demo / smoke test only. |
| **2GB** | **3** | **2GB** | **100GB** | **¥1,738** | **Recommended.** Comfortable margin for Node + Caddy + a few concurrent Zoom sessions. |
| 4GB  | 4    | 4GB | 200GB | ¥3,520 | For large data-collection runs only. |

Tokyo region recommended (lowest latency to US West Coast participants).
Note: Zoom Video SDK media (audio/video) routes through Zoom's infrastructure,
so server-side latency mainly affects signaling and static assets.

---

## 2. Prepare your `.env.production`

On your local machine:

```bash
cp .env.example.production .env.production
# Edit DOMAIN, ACME_EMAIL, ZOOM_VSDK_KEY, ZOOM_VSDK_SECRET (required).
# Optional: OPENAI_API_KEY, AWS_* for Polly, SPEECHGEN_*.
```

Generate the base64 blob you'll paste into the Sakura startup script later:

```bash
base64 < .env.production | tr -d '\n'
```

Keep this output handy.

---

## 3. Create the VPS

1. Sign in to [Sakura VPS](https://secure.sakura.ad.jp/vps/).
2. Create a new instance with:
   - **Plan**: 2GB (recommended) / 1GB (minimum)
   - **Region**: 東京
   - **OS**: Ubuntu 22.04 LTS amd64
   - **SSH key**: register your local public key
   - **Startup script**: leave empty for now — we'll customize the bundled
     `ec2-user-data.sh` and paste it after provisioning, since the script
     needs three substitutions.

Start the VPS. Note the assigned IPv4.

---

## 4. Point DNS at the VPS

**Do this before starting the app.** Caddy requests a Let's Encrypt cert on
first boot and will be rate-limited (5 failures/hour) if DNS isn't ready.

Add an A record at your DNS provider:

```
${DOMAIN}     A     <VPS IPv4>
```

Wait until `dig +short ${DOMAIN}` returns the VPS IP from your local machine.

---

## 5. Open the Sakura packet filter

Sakura applies a packet filter at the control-panel level **in addition to**
any host firewall on the VM. If you only open ports in `ufw`, traffic is
silently blocked.

In the VPS control panel:

- Go to "パケットフィルター設定"
- Allow inbound: **TCP 22, TCP 80, TCP 443, UDP 443** (UDP 443 is for HTTP/3).
- Save.

The `ec2-user-data.sh` script will also configure `ufw` inside the VM with the
same ports.

---

## 6. Run the bootstrap script

SSH into the VPS as `ubuntu`:

```bash
ssh ubuntu@<VPS IPv4>
```

On the VPS, fetch the script and substitute the three placeholders:

```bash
# Pull the script
curl -fsSLO https://raw.githubusercontent.com/Hybrid-Social-Interaction-Lab/hiroba/main/deploy/scripts/ec2-user-data.sh

# Substitute placeholders:
#   __REPO_URL__         git URL of this repo
#   __REPO_REF__         branch / tag (main is fine)
#   __ENV_FILE_BASE64__  the base64 string from step 2
ENV_B64='paste-the-base64-string-here'
sed -i \
  -e "s|__REPO_URL__|https://github.com/Hybrid-Social-Interaction-Lab/hiroba.git|g" \
  -e "s|__REPO_REF__|main|g" \
  -e "s|__ENV_FILE_BASE64__|${ENV_B64}|g" \
  ec2-user-data.sh

# Run as root
sudo bash ec2-user-data.sh
sudo tail -f /var/log/user-data.log
```

Wait for `=== HIROBA user-data done ===` in the log (typically 2–3 minutes
for the first build).

---

## 7. Verify

From your local machine:

```bash
curl -vI https://${DOMAIN}/
# Expect: HTTP/2 200, certificate issued by "Let's Encrypt"
```

Open `https://${DOMAIN}/admin/` in a browser. The Zoom session UI should
prompt for camera + microphone permissions (this is the whole reason we
need real HTTPS — `getUserMedia` is gated on a secure context).

Container status:

```bash
sudo docker compose \
  -f /opt/hiroba/deploy/docker/docker-compose.caddy.yml ps
```

Both `app` and `caddy` should be `running (healthy)`.

---

## 8. Update / redeploy

To deploy a new version after a `git push`:

```bash
cd /opt/hiroba
sudo git pull
sudo docker compose \
  -f deploy/docker/docker-compose.caddy.yml \
  --env-file .env.production \
  up -d --build
```

To rotate secrets:

```bash
sudo nano /opt/hiroba/.env.production
sudo docker compose \
  -f /opt/hiroba/deploy/docker/docker-compose.caddy.yml \
  --env-file /opt/hiroba/.env.production \
  up -d
```

---

## Troubleshooting

**Caddy stuck on ACME challenge.** Confirm both layers of firewall are open:

```bash
sudo ufw status                                   # on the VM
nc -vz <VPS IPv4> 443                             # from outside
```

If `nc` times out but `ufw` shows 443 ALLOW, the Sakura panel filter is
blocking it.

**`dig` returns the wrong IP.** Wait for DNS TTL to expire. Use
`dig @8.8.8.8 +short ${DOMAIN}` to bypass your local resolver.

**Out of memory on 1GB plan.** Upgrade to 2GB, or trim the heaviest features
(OpenAI, Polly are optional — leave their keys empty in `.env.production`).

**App writes fail with EACCES.** The bundled bootstrap script chowns
`/opt/hiroba/data` and `/opt/hiroba/logs` to uid 1001 (the container's user).
If you create those directories manually as root, redo:
`sudo chown -R 1001:1001 /opt/hiroba/data /opt/hiroba/logs`.

---

## See also

- [Deploy overview](DEPLOY-OVERVIEW.md) — which path should I pick?
- [AWS EC2 + Caddy](AWS-EC2-CADDY-DEPLOY.md) — same stack on AWS
- [AWS Fargate + ALB](AWS-DEPLOYMENT-SUBDOMAIN.md) — HA production option
