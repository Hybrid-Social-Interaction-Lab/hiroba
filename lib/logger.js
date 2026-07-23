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
    this.sessionLogDirs = new Map()  // sessionId -> per-session folder path (parent of session.log)
    this.sessionLogSuffixes = new Map() // sessionId -> suffix (fam/mam/faf/maf/nan)
    this.sessionTranscripts = new Map() // sessionId -> Array of conversation events
    this.sessionMetadata = new Map() // sessionId -> metadata object built up over the session

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

    const prefix = (this.sessionLogS3Prefix || '').replace(/\/+$/g, '')
    const sessionFolder = path.dirname(sessionLogPath)
    const folderName = path.basename(sessionFolder)

    const contentTypeFor = (filename) => {
      if (filename.endsWith('.json')) return 'application/json'
      if (filename.endsWith('.csv')) return 'text/csv'
      return 'text/plain'
    }

    let files = []
    try {
      files = fs.readdirSync(sessionFolder)
    } catch (err) {
      // Folder might be missing if session never wrote anything; fall back to just the log.
      files = [path.basename(sessionLogPath)]
    }

    const uploadedKeys = []
    for (const filename of files) {
      const filePath = path.join(sessionFolder, filename)
      let stat
      try {
        stat = fs.statSync(filePath)
      } catch {
        continue
      }
      if (!stat.isFile()) continue

      const key = prefix
        ? `${prefix}/${folderName}/${filename}`
        : `${folderName}/${filename}`

      const command = new PutObjectCommand({
        Bucket: this.sessionLogS3Bucket,
        Key: key,
        Body: fs.createReadStream(filePath),
        ContentType: contentTypeFor(filename),
        Metadata: {
          sessionid: String(sessionId)
        }
      })
      await s3.send(command)
      uploadedKeys.push(key)
    }

    this.logInfo('SESSION-LOG', 'Uploaded session artifacts to S3', {
      sessionId,
      bucket: this.sessionLogS3Bucket,
      keys: uploadedKeys
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
   * Get the per-session folder + session log path.
   * Each session gets its own folder under logs/sessions/, so transcript.json,
   * transcript.csv and metadata.json can live alongside session.log.
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
    const sessionFolderName = `session-${sanitizedSessionId}-${timestamp}${suffixPart}`
    const sessionFolder = path.join(sessionLogsDir, sessionFolderName)
    fs.mkdirSync(sessionFolder, { recursive: true })
    this.sessionLogDirs.set(sessionId, sessionFolder)
    return path.join(sessionFolder, 'session.log')
  }

  /**
   * Append a conversation event to the in-memory transcript for this session.
   * The transcript is written to disk on closeSessionLog.
   */
  appendTranscriptEntry(sessionId, entry) {
    if (!sessionId || !entry || typeof entry !== 'object') return
    if (!this.sessionTranscripts.has(sessionId)) {
      this.sessionTranscripts.set(sessionId, [])
    }
    const normalized = {
      timestamp: entry.timestamp || new Date().toISOString(),
      type: entry.type || 'unknown',
      speaker: entry.speaker || null,
      userId: entry.userId || null,
      message: entry.message || '',
      speechType: entry.speechType || null,
      silenceBeforeSpeaking:
        typeof entry.silenceBeforeSpeaking === 'number' ? entry.silenceBeforeSpeaking : null
    }
    this.sessionTranscripts.get(sessionId).push(normalized)
  }

  /**
   * Merge metadata fields for a session. Called from session-manager when
   * the room is created and as more is learned (conditionId, hostUserId, etc.).
   */
  setSessionMetadata(sessionId, fields) {
    if (!sessionId || !fields || typeof fields !== 'object') return
    const current = this.sessionMetadata.get(sessionId) || {}
    this.sessionMetadata.set(sessionId, { ...current, ...fields })
  }

  /**
   * Build CSV content from a transcript array. Includes system rows
   * (unlike the in-browser export). Columns match the host panel's CSV.
   */
  buildTranscriptCsv(transcript) {
    const headers = [
      'Timestamp',
      'Speaker ID',
      'Utterance',
      'Word Count',
      'Trigger Event',
      'Agent Type',
      'Silence Before Speaking'
    ]
    const triggerMap = { silence: 'silence_detection', periodic: 'periodic_speech', name: 'name_mentioned' }
    const escape = (value) => {
      const str = value === null || value === undefined ? '' : String(value)
      // Always quote so commas/quotes in utterances are handled.
      return `"${str.replace(/"/g, '""')}"`
    }

    const rows = [headers.join(',')]
    for (const entry of transcript) {
      const speakerId =
        entry.type === 'user'
          ? entry.userId || entry.speaker || 'Unknown'
          : entry.type === 'agent' || entry.type === 'agent_initiated' || entry.type === 'ai_response'
            ? 'Agent'
            : 'System'
      const agentType =
        entry.type === 'user'
          ? 'Human'
          : entry.type === 'agent' || entry.type === 'agent_initiated' || entry.type === 'ai_response'
            ? 'Agent'
            : 'System'
      const wordCount = entry.message ? entry.message.split(/\s+/).filter(Boolean).length : 0
      const triggerEvent = triggerMap[entry.speechType] || ''
      const silence =
        typeof entry.silenceBeforeSpeaking === 'number' ? entry.silenceBeforeSpeaking.toFixed(1) : ''
      rows.push([
        escape(entry.timestamp),
        escape(speakerId),
        escape(entry.message),
        escape(wordCount),
        escape(triggerEvent),
        escape(agentType),
        escape(silence)
      ].join(','))
    }
    return rows.join('\n') + '\n'
  }

  /**
   * Write transcript.json, transcript.csv and metadata.json into the session folder.
   * Tolerates a missing folder (returns the list of files actually written).
   */
  _writeSessionArtifacts(sessionId) {
    const folder = this.sessionLogDirs.get(sessionId)
    if (!folder) return []

    const written = []
    const transcript = this.sessionTranscripts.get(sessionId) || []
    const metadata = this.sessionMetadata.get(sessionId) || {}
    metadata.sessionId = sessionId
    metadata.endTime = metadata.endTime || new Date().toISOString()
    if (transcript.length > 0 && !metadata.startTime) {
      metadata.startTime = transcript[0].timestamp
    }

    try {
      const transcriptPath = path.join(folder, 'transcript.json')
      fs.writeFileSync(transcriptPath, JSON.stringify(transcript, null, 2))
      written.push(transcriptPath)
    } catch (err) {
      console.error(`Failed to write transcript.json: ${err.message}`)
    }

    try {
      const csvPath = path.join(folder, 'transcript.csv')
      fs.writeFileSync(csvPath, this.buildTranscriptCsv(transcript))
      written.push(csvPath)
    } catch (err) {
      console.error(`Failed to write transcript.csv: ${err.message}`)
    }

    try {
      const metaPath = path.join(folder, 'metadata.json')
      fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2))
      written.push(metaPath)
    } catch (err) {
      console.error(`Failed to write metadata.json: ${err.message}`)
    }

    return written
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
          const tmpSessionsDir = path.join(os.tmpdir(), 'moderator-ai-logs', 'sessions')
          if (!fs.existsSync(tmpSessionsDir)) fs.mkdirSync(tmpSessionsDir, { recursive: true })
          fs.accessSync(tmpSessionsDir, fs.constants.W_OK)

          const timestampForName = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
          const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9-_]/g, '_')
          const suffix = this._normalizeSessionLogSuffix(this.sessionLogSuffixes.get(sessionId))
          const suffixPart = suffix ? `_${suffix}` : ''
          const tmpFolder = path.join(tmpSessionsDir, `session-${sanitizedSessionId}-${timestampForName}${suffixPart}`)
          fs.mkdirSync(tmpFolder, { recursive: true })
          const tmpPath = path.join(tmpFolder, 'session.log')

          fs.writeFileSync(tmpPath, header)
          sessionLogPath = tmpPath
          this.sessionLogFiles.set(sessionId, sessionLogPath)
          this.sessionLogDirs.set(sessionId, tmpFolder)
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
        const tmpSessionsDir = path.join(os.tmpdir(), 'moderator-ai-logs', 'sessions')
        if (!fs.existsSync(tmpSessionsDir)) fs.mkdirSync(tmpSessionsDir, { recursive: true })
        fs.accessSync(tmpSessionsDir, fs.constants.W_OK)

        const timestampForName = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const sanitizedSessionId = sessionId.replace(/[^a-zA-Z0-9-_]/g, '_')
        const suffix = this._normalizeSessionLogSuffix(this.sessionLogSuffixes.get(sessionId))
        const suffixPart = suffix ? `_${suffix}` : ''
        const tmpFolder = path.join(tmpSessionsDir, `session-${sanitizedSessionId}-${timestampForName}${suffixPart}`)
        fs.mkdirSync(tmpFolder, { recursive: true })
        const tmpPath = path.join(tmpFolder, 'session.log')

        const header = `=== Session Log (continued) ===\nSession ID: ${sessionId}\nStarted: ${timestamp}\n${'='.repeat(50)}\n\n`
        fs.writeFileSync(tmpPath, header)
        fs.appendFileSync(tmpPath, logLine)
        this.sessionLogFiles.set(sessionId, tmpPath)
        this.sessionLogDirs.set(sessionId, tmpFolder)
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
   * Close session log file. Also writes transcript.json, transcript.csv,
   * and metadata.json into the same session folder.
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
      }

      // Record end time before writing metadata.
      this.setSessionMetadata(sessionId, { endTime: timestamp })
      const artifacts = this._writeSessionArtifacts(sessionId)
      if (artifacts.length > 0) {
        console.log(`📄 [SESSION-LOG] Wrote session artifacts: ${artifacts.map((p) => path.basename(p)).join(', ')}`)
      }

      // Upload asynchronously so session shutdown isn't blocked.
      this._scheduleSessionLogUpload(sessionId, sessionLogPath)

      this.sessionLogFiles.delete(sessionId)
      this.sessionLogDirs.delete(sessionId)
      this.sessionTranscripts.delete(sessionId)
      this.sessionMetadata.delete(sessionId)
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
