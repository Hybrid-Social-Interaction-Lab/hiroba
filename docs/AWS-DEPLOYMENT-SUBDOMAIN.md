# AWS Deployment - Subdomain (ECS Fargate + ALB + domain.com DNS + ACM HTTPS)

This guide summarizes the end-to-end AWS deployment path for this repo **without moving DNS to Route 53** (because the apex domain is used for other projects), and we need to deploy at subdomain.

You will deploy the app to **ECS Fargate** behind an **Application Load Balancer (ALB)**, route a **subdomain** via **domain.com** DNS, then enable **HTTPS** with **ACM**.

> Why HTTPS matters: browsers require a **secure context** for camera/microphone (`getUserMedia`). `http://localhost` is special-cased, but for real users you should use `https://...`.

---

## Architecture (high level)

- Users visit: `https://videocallstudy.chilanyang.space`
- DNS (domain.com): `videocallstudy` **CNAME** → your ALB DNS name (`*.elb.amazonaws.com`)
- ALB terminates TLS (ACM cert) on **443**
- ALB forwards **HTTP** to the container on **port 3000**
- ECS Fargate runs the Docker container from ECR
- Secrets are provided to the container via **ECS Secrets (ValueFrom)** backed by **SSM Parameter Store**

---

## Prerequisites

- AWS account access (SSO or access keys: Ask Chilan to provide you a IAM account)
- AWS CLI v2 installed
- Docker Desktop installed and running
- A subdomain you control under domain.com (Chilan's domain is issued from domain.com; example used here: `videocallstudy.chilanyang.space`)
- Zoom Video SDK key/secret
- (Optional) OpenAI API key
- (Optional) SpeechGen.io token/email

### Region

This guide assumes **Tokyo**: `ap-northeast-1`.
Keep **ECR + ECS + ALB + ACM + SSM** in the same region.

---

## 0) AWS CLI + SSO (recommended)

Login:

```bash
aws sso login --profile <your-profile>
```

Set region for that profile:

```bash
aws configure set region ap-northeast-1 --profile <your-profile>
aws configure get region --profile <your-profile>
```

Sanity check:

```bash
aws sts get-caller-identity --profile <your-profile> --region ap-northeast-1
```

---

## 1) Create ECR repo + push Docker image

### 1.1 Create repository

```bash
aws ecr create-repository \
  --repository-name vsdk-app \
  --region ap-northeast-1 \
  --profile <your-profile>
```

Get account id and set registry:

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile <your-profile> --region ap-northeast-1)
ECR="$ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com/vsdk-app"
```

### 1.2 Login Docker to ECR

```bash
aws ecr get-login-password --region ap-northeast-1 --profile <your-profile> | \
  docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.ap-northeast-1.amazonaws.com"
```

Notes:
- If PowerShell piping causes issues, try the same command in `cmd.exe`.

### 1.3 Build and push (important: `linux/amd64`)

From repo root:

```bash
docker build --platform linux/amd64 -f deploy/docker/Dockerfile -t vsdk-app:latest .
docker tag vsdk-app:latest "$ECR:latest"
docker push "$ECR:latest"
```

---

## 2) Store secrets in SSM Parameter Store (recommended)

ECS will reference secrets using **ValueFrom** (SSM parameter names or ARNs). Create these parameters as **SecureString**.

Example (repeat for each secret):

```bash
aws ssm put-parameter \
  --name "/vsdk-app/ZOOM_VSDK_KEY" \
  --value "<your-zoom-key>" \
  --type SecureString \
  --overwrite \
  --region ap-northeast-1 \
  --profile <your-profile>
```

Suggested parameters:
- `/vsdk-app/ZOOM_VSDK_KEY` (required)
- `/vsdk-app/ZOOM_VSDK_SECRET` (required)

---

## 3) Storage Settings
### 3.1 Persist settings in DynamoDB (multi-task safe)

`./data/settings.json` inside the container is **not durable** and will diverge per-task. This app supports storing settings in DynamoDB.

#### 3.1.1 Create a DynamoDB table -> For settings.json

- Table name: `vsdk-app-settings` (example)
- Partition key: `id` (String)
- Billing: On-demand is fine

You can create it via AWS CLI:

```bash
aws dynamodb create-table \
  --table-name vsdk-app-settings \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-northeast-1 \
  --profile <your-profile>
```

The app stores a single item under `id=global` that contains the full settings JSON.

### 3.2 Create S3 bucket -> For Session Log
`logs\sessions` inside the container is **not durable**. This app supports storing the logs to S3 bucket.
```
aws s3api create-bucket \
  --bucket moderator-ai-log-bucket \
  --region ap-northeast-1 \
  --create-bucket-configuration LocationConstraint=ap-northeast-1 \
  --profile <your-profile>
```

### 3.3 For Server Log
CloudWatch will automatically log server log. 

---

## 4) Create ALB + ECS service (Console walkthrough)

### 4.1 Create two security groups

You need **two** security groups:

1) **ALB SG** (internet-facing)
- inbound: TCP 80 from `0.0.0.0/0`
- inbound: TCP 443 from `0.0.0.0/0` (after HTTPS is enabled)

2) **Task SG** (private behind ALB)
- inbound: TCP 3000 **from the ALB SG** (source = security group)

> Security groups are L4 rules: use TCP ports (not “HTTP”).

### 4.2 Create ALB

EC2 → Load Balancers → Create → Application Load Balancer:
- internet-facing
- choose VPC + **2 public subnets** in different AZs
- attach **ALB SG**
- listener: HTTP : 80
- target group: type **IP**, protocol HTTP, port 3000, health check path `/`

### 4.3 Create ECS cluster

ECS → Clusters → Create cluster:
- Infrastructure: Fargate

### 4.4 Create task definition

ECS → Task definitions → Create:
- Launch type: Fargate
- Container image: `<account>.dkr.ecr.../vsdk-app:latest`
- Container port mapping: 3000

#### Value vs ValueFrom

- **Value**: literal string stored in the task definition (good for non-secrets)
    - PORT `PORT=3000`, HTTPS_PORT `NODE_ENV=production`, NODE_ENV `NODE_ENV=production`...
- **ValueFrom**: reference to `SSM/Secrets Manager` (best practice for secrets) You have to store these SSM parameter names at `SSM` first.
    - `ZOOM_VSDK_KEY` ← `/vsdk-app/ZOOM_VSDK_KEY`
    - `ZOOM_VSDK_SECRET` ← `/vsdk-app/ZOOM_VSDK_SECRET`

Important:
- Do **not** paste secret values into **ValueFrom**.
- Quotes are not needed in AWS console fields (paste raw strings).


** Add these **:
1) value
- `NODE_ENV=production`
- `PORT=3000`
- `HTTPS_PORT=3443`

- `SETTINGS_BACKEND=dynamodb`
- `SETTINGS_DDB_TABLE=vsdk-app-settings`
- `SETTINGS_DDB_REGION=ap-northeast-1`
- `SETTINGS_DDB_PK_NAME=id`
- `SETTINGS_DDB_PK_VALUE=global`
- `SETTINGS_DDB_CONSISTENT_READ=true`

- `SERVER_LOG_TO_FILE=false`
- `SESSION_LOG_S3_BUCKET=moderator-ai-log-bucket`
- `SESSION_LOG_S3_PREFIX=logs/sessions`
- `SESSION_LOG_UPLOAD_BACKEND=s3`
- `SESSION_LOG_UPLOAD_ONLY_IF_AWS=true`

2) valueFrom
- `ZOOM_VSDK_KEY`=`/vsdk-app/ZOOM_VSDK_KEY`
- `ZOOM_VSDK_SECRET`=`/vsdk-app/ZOOM_VSDK_SECRET`
- `AWS_ACCESS_KEY_ID`=`/vsdk-app/AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`=`/vsdk-app/AWS_SECRET_ACCESS_KEY`
- `AWS_REGION`=`/vsdk-app/AWS_REGION`
- `OPENAI_API_KEY`=`/vsdk-app/OPENAI_API_KEY`
- `SPEECHGEN_API_TOKEN`=`/vsdk-app/SPEECHGEN_API_TOKEN` (optional)
- `SPEECHGEN_EMAIL`=`/vsdk-app/SPEECHGEN_EMAIL` (optional)
- `SPEECHGEN_NEUTRAL_VOICE`=`/vsdk-app/SPEECHGEN_NEUTRAL_VOICE` (optional; not a secret, can be plain env var)

### 4.5 Create ECS service and attach to ALB

ECS → Cluster → Create service:
- Launch type: Fargate
- Desired tasks: 1
- Networking:
  - subnets: the same public subnets
  - security group: **Task SG**
- Load balancing:
  - Application Load Balancer
  - listener: HTTP : 80
  - target group: the one on port 3000
  - container: `vsdk-container`, container port 3000

### 4.6 Test via ALB DNS name

From ALB details page, copy DNS name:

- `http://<alb-dns-name>/master.html`
- `http://<alb-dns-name>/fam`

If this works, proceed to DNS + HTTPS.

---

## 5) Domain routing at domain.com (subdomain → ALB)

You cannot create URL paths in DNS. This is about hostnames:
- V: `videocallstudy.chilanyang.space` (subdomain)
- X: `chilanyang.space/videocallstudy` (path; controlled by your web server)

At domain.com DNS manager for `chilanyang.space`, create:

- Record type: **CNAME**
- Host/Name: `videocallstudy`
- Target/Value: your ALB DNS name, e.g.
  - `moderator-ai-alb-1366496102.ap-northeast-1.elb.amazonaws.com`
- TTL: default

Verify:

```bash
nslookup videocallstudy.chilanyang.space
```

Test:
- `http://videocallstudy.chilanyang.space/master.html`

Why CNAME (not A)?
- Route 53 supports “Alias A” to ALB, but domain.com typically does not.
- ALB IPs can change, so A→IP is not stable.

---

## 6) Enable HTTPS (ACM + ALB listener 443)

### 6.1 Request ACM certificate

AWS Console → ACM (ap-northeast-1) → Request public cert:
- Domain: `videocallstudy.chilanyang.space`
- Validation: DNS

### 6.2 Add ACM validation CNAME at domain.com

ACM will show a **new** CNAME record (a weird `_xxxxx` name). Add it as a separate record in domain.com.

Do not edit your existing `videocallstudy` CNAME-to-ALB.

Wait for ACM status: **Issued**.

### 6.3 Add HTTPS listener to ALB

EC2 → Load Balancers → your ALB → Listeners:
- Add listener: HTTPS : 443
- Select the issued ACM cert
- Forward to the same target group (HTTP : 3000)

Ensure ALB SG inbound includes:
- TCP 443 from `0.0.0.0/0`

### 6.4 Redirect HTTP → HTTPS (recommended)

ALB → Listeners → select HTTP : 80 → View/edit rules → Default rule:
- Replace “Forward” with “Redirect”
- Protocol: HTTPS
- Port: 443
- Host: `#{host}`
- Path: `/#{path}`
- Query: `#{query}`
- Status code: 301

---

## 7) Final tests

- `https://videocallstudy.chilanyang.space/master.html`
- `https://videocallstudy.chilanyang.space/fam`

If camera/mic prompts are blocked, confirm you’re on **https** (not http).


## Alternative paths (not covered here)

- Route 53 authoritative DNS for the apex domain (simpler automation with CloudFormation)
- “Simple deploy” public IP approach (cheap but no stable HTTPS)
- EC2-based deployment

These are documented elsewhere in this repo; this file focuses on the **domain.com DNS + subdomain + ALB + ACM** path.

## Ref
- [Set up CNAME in domain.com](https://www.datahash.com/docs/subdomain-set-up-for-first-party-data-collection/dns-records-set-up-on-domain-dns-manager/)