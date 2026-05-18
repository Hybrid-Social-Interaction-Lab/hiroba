# Free HTTPS Options — Legacy

> **Superseded.** Our standard HTTPS story is now Caddy + Let's Encrypt
> baked into [`docker-compose.caddy.yml`](../../deploy/docker/docker-compose.caddy.yml).
> See [Sakura VPS](../SAKURA-DEPLOY.md) or [AWS EC2 + Caddy](../AWS-EC2-CADDY-DEPLOY.md).
> Kept here as an escape hatch when Let's Encrypt is rate-limited or you
> have no public DNS.

If you don't have a custom domain or want a quick free SSL certificate, here are three approaches:

## Option 1: DuckDNS + ACM (Recommended for AWS)

DuckDNS provides a free subdomain under `*.duckdns.org`. This is simple and integrates well with AWS Certificate Manager.

### Setup Steps

#### 1. Get a DuckDNS Domain

1. Visit [https://www.duckdns.org/](https://www.duckdns.org/)
2. Sign in with Google
3. Enter your desired subdomain name (e.g., `my-vsdk-app`)
4. Set the IP/domain to your ALB DNS name:
   ```
   vsdk-alb-1950753101.ap-northeast-1.elb.amazonaws.com
   ```
5. Click "Update IP"
6. Your domain: `my-vsdk-app.duckdns.org`

#### 2. Request ACM Certificate

```bash
aws acm request-certificate \
    --domain-name "my-vsdk-app.duckdns.org" \
    --validation-method DNS \
    --region ap-northeast-1
```

#### 3. Add DNS Validation Record

ACM will provide a CNAME record. Add it to DuckDNS DNS settings and wait for status to show **Issued**.

#### 4. Add HTTPS Listener to ALB

In AWS Console:
- EC2 → Load Balancers → Your ALB → Listeners
- Add listener: HTTPS : 443
- Select the issued ACM certificate
- Forward to your target group (port 3000)

#### 5. Redirect HTTP to HTTPS

Edit HTTP listener (port 80):
- Replace "Forward" with "Redirect"
- Protocol: HTTPS, Port: 443
- Status code: 301

### Result

```
https://my-vsdk-app.duckdns.org ✅
```

**Cost**: Free (DuckDNS + ACM are both free)  
**Pros**: AWS native, automatic renewal, clean domain  
**Cons**: Requires AWS console access

---

## Option 2: Cloudflare Tunnel (Simplest)

Cloudflare Tunnel is the easiest option if you just want HTTPS working immediately.

### Setup Steps

#### 1. Create Cloudflare Account

1. Sign up at [https://cloudflare.com](https://cloudflare.com)
2. Go to **Zero Trust → Networks → Tunnels**
3. Click **Create a tunnel**

#### 2. Install and Authenticate

Follow Cloudflare's instructions to download `cloudflared` and authenticate.

#### 3. Start Tunnel

```bash
cloudflared tunnel --url http://vsdk-alb-1950753101.ap-northeast-1.elb.amazonaws.com
```

This gives you a temporary HTTPS URL like:
```
https://xxxxx.trycloudflare.com
```

### For a Custom Domain

If you use Cloudflare's DNS:
- Add your domain to Cloudflare
- Go to **Zero Trust → Networks → Tunnels**
- Create a public hostname pointing your domain to the tunnel
- Example: `videocall.mycompany.com` → tunnel

### Result

```
https://videocall.mycompany.com ✅ (if using custom domain)
or
https://xxxxx.trycloudflare.com ✅ (temporary URL)
```

**Cost**: Free for basic setup  
**Pros**: Zero infrastructure, instant HTTPS, works anywhere  
**Cons**: Temporary URL if no custom domain, extra network hop

---

## Option 3: ngrok (Development)

ngrok is best for development/testing. It's simple but shares a public URL.

### Setup

#### 1. Install ngrok

```bash
npm install -g ngrok
# or visit https://ngrok.com/download
```

#### 2. Sign Up (Free)

Go to [https://ngrok.com/](https://ngrok.com/) and create a free account.

#### 3. Get Auth Token

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN
```

#### 4. Start Tunnel

```bash
ngrok http vsdk-alb-1950753101.ap-northeast-1.elb.amazonaws.com:80
```

This outputs:
```
Forwarding  https://abc123.ngrok.io -> http://vsdk-alb-...
```

### Result

```
https://abc123.ngrok.io ✅
```

The URL changes every time you restart ngrok (unless you use a paid plan).

**Cost**: Free (limited to 1 concurrent tunnel)  
**Pros**: Instant HTTPS, works anywhere, easy to start  
**Cons**: URL changes, public logs visible to ngrok, rate limited

---

## Comparison Table

| Option | Cost | Setup Time | Domain Persistence | Best For |
|--------|------|-----------|-------------------|----------|
| **DuckDNS + ACM** | Free | 10 min | Permanent | Production on AWS |
| **Cloudflare Tunnel** | Free | 5 min | Permanent (with custom domain) | Quick HTTPS, any infrastructure |
| **ngrok** | Free | 2 min | Temporary (free tier) | Development/testing |

---

## Current Status

Before these options, you might have accessed the application as:
- HTTP: `http://vsdk-alb-1950753101.ap-northeast-1.elb.amazonaws.com`
- HTTPS (self-signed): `https://52.195.188.228:3443`

With any of these options, you get a proper HTTPS certificate and clean domain.

## Next Steps

1. **Production**: Use DuckDNS + ACM (Option 1)
2. **Quick demo**: Use Cloudflare Tunnel (Option 2)
3. **Local testing**: Use ngrok (Option 3)

For full production setup with a custom domain, see docs/AWS-DEPLOYMENT-SUBDOMAIN.md.
