# Hiroba (広場)

A video conferencing system built with Zoom Video SDK, featuring AI avatars, real-time transcription, speech synthesis, and a Master Control Panel for managing agent behavior during sessions.

## Features

- **AI Avatars**: Multiple synchronized agents with lip-sync animation
- **Real-time Transcription**: Live speech-to-text conversion
- **AI Responses**: OpenAI-powered intelligent replies
- **Speech Synthesis**: Amazon Polly and SpeechGen.io support
- **Master Control Panel**: Remote parameter management (silence detection, periodic speech, prompts)
- **Session Logging**: Complete conversation export (CSV, JSON)

## Quick Start

#### 1. Clone and Setup

```bash
git clone https://github.com/Hybrid-Social-Interaction-Lab/hiroba.git
cd hiroba
npm install
cp .env.example .env
```

#### 2. Configure `.env`

```bash
# Required
ZOOM_VSDK_KEY=your_zoom_key
ZOOM_VSDK_SECRET=your_zoom_secret

# Optional
OPENAI_API_KEY=your_openai_key
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
AWS_REGION=ap-northeast-1
```

#### 3. Start

You can start the server directly with node:

```bash
node index.js
```

For development with automatic code reloading on file changes:

```bash
docker-compose -f deploy/docker/docker-compose.dev.yml up
```

This configuration:
- Maps your entire source code directory into the container
- Watches for file changes and automatically reflects them
- Uses NODE_ENV=development
- Exposes ports 3000 (HTTP) and 3443 (HTTPS)

#### 4. Access

- **Lobby**: http://localhost:3000/
- **Admin**: http://localhost:3000/admin/

#### Production Build

For production deployment:

```bash
docker-compose -f deploy/docker/docker-compose.prod.yml up -d
```

This configuration:
- No volume mounts (code baked into image)
- Resource limits: 1GB memory max, 512MB reserved
- Always restart on failure
- Enhanced healthchecks and logging rotation
- NODE_ENV=production

#### Environment Variables

Create a `.env` file in the project root with the same variables as above. Docker Compose will automatically load it.

## Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ZOOM_VSDK_KEY` | Required | — | Zoom Video SDK key |
| `ZOOM_VSDK_SECRET` | Required | — | Zoom Video SDK secret |
| `PORT` | Optional | 3000 | HTTP port |
| `HTTPS_PORT` | Optional | 3443 | HTTPS port |
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

Get Zoom credentials at [Zoom Developer Portal](https://developers.zoom.us/docs/video-sdk/developer-accounts/#get-video-sdk-credentials).

## License

MIT
