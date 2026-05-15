/**
 * index.js - Application Entry Point
 *
 * All functionality is modularized in lib/ directory:
 * - lib/logger.js           - Log management
 * - lib/api-clients.js      - API client initialization (OpenAI, Polly, SpeechGen)
 * - lib/session-manager.js  - Session/room management
 * - lib/speech-service.js   - Speech synthesis
 * - lib/websocket-manager.js - WebSocket handling
 * - lib/settings-manager.js - Settings persistence
 * - lib/routes/api-routes.js   - API endpoints
 * - lib/routes/page-routes.js  - HTML page delivery
 */

const express = require('express')
const cors = require('cors')
const https = require('https')
const fs = require('fs')
const path = require('path')
require('dotenv').config({ path: path.join(__dirname, '.env') })

// Lib imports
const Logger = require('./lib/logger')
const ApiClients = require('./lib/api-clients')
const SpeechService = require('./lib/speech-service')
const SessionManager = require('./lib/session-manager')
const WebSocketManager = require('./lib/websocket-manager')
const SettingsManager = require('./lib/settings-manager')
const ApiRoutes = require('./lib/routes/api-routes')
const PageRoutes = require('./lib/routes/page-routes')

// Configuration
const port = process.env.PORT || 3000
const httpsPort = process.env.HTTPS_PORT || 3443

// Initialize services
const logger = new Logger(path.join(__dirname, 'logs'))
logger.setupProcessHandlers()
logger.logInfo('SERVER', 'Server starting up...', { port, logFile: logger.getLogFilePath() })

const apiClients = new ApiClients(logger)
const settingsManager = new SettingsManager('./data/settings.json')
const speechService = new SpeechService(apiClients, logger)
const sessionManager = new SessionManager(logger)

// Express setup
const app = express()

// Middleware
app.use(function(req, res, next) {
  res.header("Cross-Origin-Embedder-Policy", "require-corp")
  res.header("Cross-Origin-Opener-Policy", "same-origin")
  next()
})
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.json())
app.use(cors())

// HTTP Server
const server = app.listen(port, () => {
  logger.logInfo('HTTP', `Server running on port ${port}`)
})

// WebSocket Manager
const wsManager = new WebSocketManager(server, sessionManager, logger, {
  settingsManager,
  apiClients
})

// Register routes
new PageRoutes(app, path.join(__dirname, 'public')).register()
new ApiRoutes(app, {
  sessionManager,
  settingsManager,
  apiClients,
  speechService,
  logger,
  broadcastSettingsUpdate: (settings) => wsManager.broadcastSettingsUpdate(settings)
}).register()

// SSL Certificate loading
function loadSslCertificates() {
  try {
    // Try Let's Encrypt certificates first (copied to app directory)
    const letsEncryptKey = './letsencrypt-privkey.pem'
    const letsEncryptCert = './letsencrypt-fullchain.pem'

    if (fs.existsSync(letsEncryptKey) && fs.existsSync(letsEncryptCert)) {
      logger.logInfo('HTTPS', 'Using Let\'s Encrypt SSL certificates for avatar-conference.ohararyo.com')
      return {
        key: fs.readFileSync(letsEncryptKey),
        cert: fs.readFileSync(letsEncryptCert)
      }
    } else if (fs.existsSync('./server.key') && fs.existsSync('./server.crt')) {
      logger.logInfo('HTTPS', 'Using self-signed SSL certificates (development)')
      return {
        key: fs.readFileSync('./server.key'),
        cert: fs.readFileSync('./server.crt')
      }
    }
  } catch (error) {
    logger.logWarn('HTTPS', 'SSL certificates not found, only HTTP server will run', { error: error.message })
  }
  return null
}

// HTTPS Server (optional - only if certificates are available)
const httpsOptions = loadSslCertificates()
if (httpsOptions) {
  const httpsServer = https.createServer(httpsOptions, app).listen(httpsPort, () => {
    logger.logInfo('HTTPS', `Secure server running on port ${httpsPort}`, { url: `https://localhost:${httpsPort}` })
    logger.logInfo('HTTPS', 'Note: You may need to accept the self-signed certificate warning in your browser.')
  })

  // Attach WebSocket to HTTPS server
  wsManager.attachToHttpsServer(httpsServer)
}

// Startup complete
logger.logInfo('SERVER', 'Application fully started', {
  httpPort: port,
  httpsPort: httpsOptions ? httpsPort : 'disabled',
  logFile: logger.getLogFilePath(),
  openAI: apiClients.isOpenAIAvailable,
  polly: apiClients.isPollyAvailable,
  speechGen: apiClients.isSpeechGenAvailable
})
