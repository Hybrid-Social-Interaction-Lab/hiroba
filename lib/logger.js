const fs = require('fs')
const os = require('os')
const path = require('path')

function normalizeEnvString(value) {
  return typeof value === 'string' ? value.trim() : value
}

function parseEnvBool(value, defaultValue) {
  const v = normalizeEnvString(value)
  if (v === undefined || v === null || v === '') return defaultValue
  return String(v).toLowerCase() === 'true'
}

function isRunningOnAws() {
  return Boolean(
    process.env.AWS_EXECUTION_ENV ||
      process.env.ECS_CONTAINER_METADATA_URI_V4 ||
      process.env.ECS_CONTAINER_METADATA_URI ||
      process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI
  )
}

/**
 * Logger
 * Manages server-wide and session-specific logging
 */
class Logger {
  constructor(logsDir) {
    this.logsDir = logsDir
    this.sessionLogFiles = new Map() // sessionId -> logFilePath
    this.sessionLogSuffixes = new Map() // sessionId -> suffix (fam/mam/faf/maf/nan)

    // Server log file writing can fail in containerized/AWS environments (read-only FS, no volume, etc).
    // Default: write server logs to stdout only on AWS; keep file logging for local unless disabled.
    this.serverLogToFile = parseEnvBool(process.env.SERVER_LOG_TO_FILE, !isRunningOnAws())

    // Optional: upload session logs (logs/sessions/*) to S3 when a session ends.
    // Default is file-only (local dev friendly).
    this.sessionLogUploadBackend = (normalizeEnvString(process.env.SESSION_LOG_UPLOAD_BACKEND) || 'file').toLowerCase()
    this.sessionLogUploadOnlyIfAws = parseEnvBool(process.env.SESSION_LOG_UPLOAD_ONLY_IF_AWS, true)
    this.sessionLogS3Bucket = normalizeEnvString(process.env.SESSION_LOG_S3_BUCKET)
    this.sessionLogS3Prefix = normalizeEnvString(process.env.SESSION_LOG_S3_PREFIX) || 'logs/sessions'
    this.sessionLogS3Region =
      normalizeEnvString(process.env.SESSION_LOG_S3_REGION) ||
      normalizeEnvString(process.env.AWS_REGION) ||
      undefined

    this._sessionLogS3Client = null

    this.logFilePath = null
    if (this.serverLogToFile) {
      try {
        if (!fs.existsSync(this.logsDir)) {
          fs.mkdirSync(this.logsDir, { recursive: true })
        }

        // Create log file for this server instance
        const logFileName = `server-${new Date().toISOString().slice(0, 10)}.log`
        this.logFilePath = path.join(this.logsDir, logFileName)
        console.log(`📁 [LOG] Log file: ${this.logFilePath}`)
      } catch (error) {
        this.serverLogToFile = false
        this.logFilePath = null
        console.warn('[LOG] Disabled server log file writing (filesystem not writable):', error?.message || error)
      }
    }
  }

  /**
   * Get the current log file path
   */
  getLogFilePath() {
    return this.logFilePath
  }

  _normalizeSessionLogSuffix(suffix) {
    if (typeof suffix !== 'string') return null
    const trimmed = suffix.trim().toLowerCase()
    if (!trimmed) return null
    // Keep filenames safe and predictable.
    if (!/^[a-z0-9_-]+$/.test(trimmed)) return null
    return trimmed
  }

  setSessionLogSuffix(sessionId, suffix) {
    const normalized = this._normalizeSessionLogSuffix(suffix)
    if (!normalized) return
    if (this.sessionLogSuffixes.has(sessionId)) return
    this.sessionLogSuffixes.set(sessionId, normalized)
  }

  _shouldUploadSessionLogsToS3() {
    if (this.sessionLogUploadBackend !== 's3') return false
    if (this.sessionLogUploadOnlyIfAws && !isRunningOnAws()) return false
    if (!this.sessionLogS3Bucket) return false
    return true
  }

  _getSessionLogS3Client() {
    if (this._sessionLogS3Client) return this._sessionLogS3Client

    let S3Client
    try {
      ;({ S3Client } = require('@aws-sdk/client-s3'))
    } catch (err) {
      const e = new Error('Missing dependency: @aws-sdk/client-s3. Run npm install.')
      e.name = 'MissingDependencyError'
      e.cause = err
      throw e
    }

    const clientConfig = {}
    if (this.sessionLogS3Region) {
      clientConfig.region = this.sessionLogS3Region
    }

    this._sessionLogS3Client = new S3Client(clientConfig)
    return this._sessionLogS3Client
  }

  _scheduleSessionLogUpload(sessionId, sessionLogPath) {
    if (!this._shouldUploadSessionLogsToS3()) return

    setImmediate(() => {
      this._uploadSessionLogToS3(sessionId, sessionLogPath).catch((err) => {
        this.logWarn('SESSION-LOG', 'Failed to upload session log to S3', {
          sessionId,
          error: err && err.message ? err.message : String(err),
          name: err && err.name ? err.name : undefined
        })
      })
    })
  }

  async _uploadSessionLogToS3(sessionId, sessionLogPath) {
    const s3 = this._getSessionLogS3Client()

    const { PutObjectCommand } = require('@aws-sdk/client-s3')

    const baseName = path.basename(sessionLogPath)
    const prefix = (this.sessionLogS3Prefix || '').replace(/\/+$/g, '')
    const key = prefix ? `${prefix}/${baseName}` : baseName

    const command = new PutObjectCommand({
      Bucket: this.sessionLogS3Bucket,
      Key: key,
      Body: fs.createReadStream(sessionLogPath),
      ContentType: 'text/plain',
      Metadata: {
        sessionid: String(sessionId)
      }
    })

    await s3.send(command)

    this.logInfo('SESSION-LOG', 'Uploaded session log to S3', {
      sessionId,
      bucket: this.sessionLogS3Bucket,
      key
    })
  }

  /**
   * Write a log entry to file and console
   */
  writeLog(level, category, message, data = null) {
    const timestamp = new Date().toISOString()
    const logData = data ? ` | Data: ${JSON.stringify(data)}` : ''
    const logLine = `[${timestamp}] [${level}] [${category}] ${message}${logData}\n`

    // Output to console (as before)
    console.log(logLine.trim())

    // Optional: Output to file (disabled by default on AWS)
    if (this.serverLogToFile && this.logFilePath) {
      try {
        fs.appendFileSync(this.logFilePath, logLine)
      } catch (error) {
        // If the FS becomes unwritable at runtime, degrade gracefully.
        this.serverLogToFile = false
        console.warn('[LOG] Disabled server log file writing after write failure:', error?.message || error)
      }
    }
  }

  /**
   * Log info level message
   */
  logInfo(category, message, data = null) {
    this.writeLog('INFO', category, message, data)
  }

  /**
   * Log error level message
   */
  logError(category, message, data = null) {
    this.writeLog('ERROR', category, message, data)
  }

  /**
   * Log debug level message
   */
  logDebug(category, message, data = null) {
    this.writeLog('DEBUG', category, message, data)
  }

  /**
   * Log warning level message
   */
  logWarn(category, message, data = null) {
    this.writeLog('WARN', category, message, data)
  }

  /**
   * Get session log file path
   */
  _getSessionLogPath(sessionId) {
    let sessionLogsDir = path.join(this.logsDir, 'sessions')
    try {
      if (!fs.existsSync(sessionLogsDir)) {
        fs.mkdirSync(sessionLogsDir, { recursive: true })
      }

      // Directory may exist but be unwritable (common in containers).
      fs.accessSync(sessionLogsDir, fs.constants.W_OK)
    } catch (error) {
      // Fallback for environments where the app directory isn't writable.
      sessionLogsDir = path.join(os.tmpdir(), 'moderator-ai-logs', 'sessions')
      if (!fs.existsSync(sessionLogsDir)) {
        fs.mkdirSync(sessionLogsDir, { recursive: true })
      }
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9-_]/g, '_')
    const suffix = this._normalizeSessionLogSuffix(this.sessionLogSuffixes.get(sessionId))
    const suffixPart = suffix ? `_${suffix}` : ''
    const sessionLogFileName = `session-${sanitizedSessionId}-${timestamp}${suffixPart}.log`
    return path.join(sessionLogsDir, sessionLogFileName)
  }

  /**
   * Write session-specific log entry
   */
  writeSessionLog(sessionId, level, category, message, data = null) {
    const timestamp = new Date().toISOString()
    const logData = data ? ` | Data: ${JSON.stringify(data)}` : ''
    const logLine = `[${timestamp}] [${level}] [${category}] ${message}${logData}\n`

    // Also output to server-wide log
    this.writeLog(level, category, message, data)

    // Output to session-specific log file
    let sessionLogPath = this.sessionLogFiles.get(sessionId)
    if (!sessionLogPath) {
      const header = `=== Session Log ===\nSession ID: ${sessionId}\nStarted: ${timestamp}\n${'='.repeat(50)}\n\n`

      // Try normal location first (with internal fallback to tmp dir if unwritable)
      const candidatePath = this._getSessionLogPath(sessionId)
      try {
        fs.writeFileSync(candidatePath, header)
        sessionLogPath = candidatePath
        this.sessionLogFiles.set(sessionId, sessionLogPath)
        console.log(`📄 [SESSION-LOG] Created session log: ${sessionLogPath}`)
      } catch (error) {
        // As a last resort, force tmp dir regardless of logsDir.
        try {
          const tmpDir = path.join(os.tmpdir(), 'moderator-ai-logs', 'sessions')
          if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
          fs.accessSync(tmpDir, fs.constants.W_OK)

          const timestampForName = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9-_]/g, '_')
          const suffix = this._normalizeSessionLogSuffix(this.sessionLogSuffixes.get(sessionId))
          const suffixPart = suffix ? `_${suffix}` : ''
          const tmpPath = path.join(tmpDir, `session-${sanitizedSessionId}-${timestampForName}${suffixPart}.log`)

          fs.writeFileSync(tmpPath, header)
          sessionLogPath = tmpPath
          this.sessionLogFiles.set(sessionId, sessionLogPath)
          console.log(`📄 [SESSION-LOG] Created session log (tmp fallback): ${sessionLogPath}`)
        } catch (fallbackError) {
          console.error(
            `Failed to create session log file: ${error.message} (fallback also failed: ${fallbackError.message})`
          )
          return
        }
      }
    }

    try {
      fs.appendFileSync(sessionLogPath, logLine)
    } catch (error) {
      // If the existing file becomes unwritable, fall back to tmp and continue.
      try {
        const tmpDir = path.join(os.tmpdir(), 'moderator-ai-logs', 'sessions')
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })
        fs.accessSync(tmpDir, fs.constants.W_OK)

        const timestampForName = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9-_]/g, '_')
        const suffix = this._normalizeSessionLogSuffix(this.sessionLogSuffixes.get(sessionId))
        const suffixPart = suffix ? `_${suffix}` : ''
        const tmpPath = path.join(tmpDir, `session-${sanitizedSessionId}-${timestampForName}${suffixPart}.log`)

        const header = `=== Session Log (continued) ===\nSession ID: ${sessionId}\nStarted: ${timestamp}\n${'='.repeat(50)}\n\n`
        fs.writeFileSync(tmpPath, header)
        fs.appendFileSync(tmpPath, logLine)
        this.sessionLogFiles.set(sessionId, tmpPath)
        console.warn(`📄 [SESSION-LOG] Switched session log to tmp fallback: ${tmpPath}`)
      } catch (fallbackError) {
        console.error(
          `Failed to write to session log file: ${error.message} (fallback also failed: ${fallbackError.message})`
        )
      }
    }
  }

  /**
   * Log session info level message
   */
  logSessionInfo(sessionId, category, message, data = null) {
    this.writeSessionLog(sessionId, 'INFO', category, message, data)
  }

  /**
   * Log session error level message
   */
  logSessionError(sessionId, category, message, data = null) {
    this.writeSessionLog(sessionId, 'ERROR', category, message, data)
  }

  /**
   * Log session debug level message
   */
  logSessionDebug(sessionId, category, message, data = null) {
    this.writeSessionLog(sessionId, 'DEBUG', category, message, data)
  }

  /**
   * Log session warning level message
   */
  logSessionWarn(sessionId, category, message, data = null) {
    this.writeSessionLog(sessionId, 'WARN', category, message, data)
  }

  /**
   * Close session log file
   */
  closeSessionLog(sessionId) {
    const sessionLogPath = this.sessionLogFiles.get(sessionId)
    if (sessionLogPath) {
      const timestamp = new Date().toISOString()
      const footer = `\n${'='.repeat(50)}\nSession Ended: ${timestamp}\n=== End of Session Log ===\n`
      try {
        fs.appendFileSync(sessionLogPath, footer)
        console.log(`📄 [SESSION-LOG] Closed session log: ${sessionLogPath}`)
      } catch (error) {
        console.error(`Failed to close session log file: ${error.message}`)
      } finally {
        // Upload asynchronously so session shutdown isn't blocked.
        this._scheduleSessionLogUpload(sessionId, sessionLogPath)
      }
      this.sessionLogFiles.delete(sessionId)
    }
  }

  /**
   * Setup process error handlers
   */
  setupProcessHandlers() {
    process.on('uncaughtException', (error) => {
      const errorMsg = `Uncaught Exception: ${error.message}`
      try {
        this.logError('SERVER', 'Uncaught Exception', { error: error.message, stack: error.stack })
      } catch (logErr) {
        console.error('Failed to log uncaught exception:', logErr)
      }
      console.error(errorMsg, error)
      process.exit(1)
    })

    process.on('unhandledRejection', (reason, promise) => {
      try {
        this.logError('SERVER', 'Unhandled Rejection', { reason: reason?.toString(), promise: promise?.toString() })
      } catch (logErr) {
        console.error('Failed to log unhandled rejection:', logErr)
      }
      console.error('Unhandled Rejection at:', promise, 'reason:', reason)
    })
  }
}

module.exports = Logger
