const OpenAI = require('openai')
const { PollyClient } = require('@aws-sdk/client-polly')

/**
 * ApiClients
 * Manages initialization and access to external API clients (OpenAI, Polly, SpeechGen)
 */
class ApiClients {
  constructor(logger) {
    this.logger = logger
    this._openai = null
    this._pollyClient = null
    this._speechGenConfig = null

    this._initOpenAI()
    this._initPolly()
    this._initSpeechGen()
  }

  /**
   * Initialize OpenAI client
   */
  _initOpenAI() {
    if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim() !== '') {
      try {
        this._openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY
        })
        this.logger.logInfo('OPENAI', 'Client initialized successfully')
      } catch (error) {
        this.logger.logError('OPENAI', 'Failed to initialize client', { error: error.message })
        this._openai = null
      }
    } else {
      this.logger.logWarn('OPENAI', 'API key not found. AI responses will be disabled.')
    }
  }

  /**
   * Initialize Amazon Polly client
   */
  _initPolly() {
    if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && process.env.AWS_REGION) {
      try {
        this._pollyClient = new PollyClient({
          region: process.env.AWS_REGION,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID,
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
          }
        })
        this.logger.logInfo('POLLY', 'Client initialized successfully')
      } catch (error) {
        this.logger.logError('POLLY', 'Failed to initialize client', { error: error.message })
        this._pollyClient = null
      }
    } else {
      this.logger.logWarn('POLLY', 'AWS credentials not found. Using browser speech synthesis.')
    }
  }

  /**
   * Initialize SpeechGen.io configuration
   */
  _initSpeechGen() {
    if (process.env.SPEECHGEN_API_TOKEN && process.env.SPEECHGEN_EMAIL) {
      try {
        this._speechGenConfig = {
          apiToken: process.env.SPEECHGEN_API_TOKEN,
          email: process.env.SPEECHGEN_EMAIL,
          voice: process.env.SPEECHGEN_NEUTRAL_VOICE || 'Echo'
        }
        this.logger.logInfo('SPEECHGEN', 'Client initialized successfully', { voice: this._speechGenConfig.voice })
      } catch (error) {
        this.logger.logError('SPEECHGEN', 'Failed to initialize client', { error: error.message })
        this._speechGenConfig = null
      }
    } else {
      this.logger.logWarn('SPEECHGEN', 'API credentials not found. Neutral voice will use Polly fallback.')
    }
  }

  /**
   * Get OpenAI client
   */
  get openai() {
    return this._openai
  }

  /**
   * Get Polly client
   */
  get pollyClient() {
    return this._pollyClient
  }

  /**
   * Get SpeechGen configuration
   */
  get speechGenConfig() {
    return this._speechGenConfig
  }

  /**
   * Check if OpenAI is available
   */
  get isOpenAIAvailable() {
    return this._openai !== null
  }

  /**
   * Check if Polly is available
   */
  get isPollyAvailable() {
    return this._pollyClient !== null
  }

  /**
   * Check if SpeechGen is available
   */
  get isSpeechGenAvailable() {
    return this._speechGenConfig !== null
  }
}

module.exports = ApiClients
