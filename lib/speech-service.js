const axios = require('axios')
const { SynthesizeSpeechCommand } = require('@aws-sdk/client-polly')

/**
 * SpeechService
 * Manages speech synthesis using SpeechGen.io and Amazon Polly
 */
class SpeechService {
  constructor(apiClients, logger) {
    this.apiClients = apiClients
    this.logger = logger
  }

  /**
   * Synthesize speech with automatic service selection
   * @param {string} text - Text to synthesize
   * @param {object} options - Options including gender, voiceId
   * @returns {object} - Result with audio data or fallback indicator
   */
  async synthesize(text, options = {}) {
    const { gender, voiceId } = options

    // Use SpeechGen.io for neutral gender if configured
    if (gender === 'neutral' && this.apiClients.isSpeechGenAvailable) {
      try {
        this.logger.logInfo('SYNTHESIZE', 'Using SpeechGen.io for neutral voice', { textLength: text.length })

        const result = await this.synthesizeWithSpeechGen(text)

        if (result.success) {
          const audioBase64 = result.audioBuffer.toString('base64')

          return {
            success: true,
            useSpeechGen: true,
            audioData: audioBase64,
            voiceId: result.voiceId,
            contentType: result.contentType
          }
        }
      } catch (error) {
        this.logger.logWarn('SYNTHESIZE', 'SpeechGen failed, falling back to Polly', { error: error.message })
        // Fall through to Polly fallback
      }
    }

    // Use Polly if available
    if (this.apiClients.isPollyAvailable) {
      return await this.synthesizeWithPolly(text, voiceId, gender)
    }

    // Return fallback indicator if no service available
    console.log('[Polly API] AWS not configured, falling back to browser synthesis')
    return {
      success: true,
      usePolly: false,
      message: 'AWS Polly not configured, use browser synthesis'
    }
  }

  /**
   * Synthesize speech using SpeechGen.io
   * @param {string} text - Text to synthesize
   * @param {string} voice - Voice name (optional)
   * @returns {object} - Result with audio buffer
   */
  async synthesizeWithSpeechGen(text, voice = null) {
    try {
      if (!this.apiClients.isSpeechGenAvailable) {
        throw new Error('SpeechGen.io not configured')
      }

      const speechGenConfig = this.apiClients.speechGenConfig
      const selectedVoice = voice || speechGenConfig.voice

      this.logger.logInfo('SPEECHGEN-API', `Synthesizing with voice ${selectedVoice}`, {
        textLength: text.length
      })

      // SpeechGen.io API endpoint
      const apiUrl = 'https://speechgen.io/index.php?r=api/text'

      // Prepare request parameters
      const params = new URLSearchParams({
        token: speechGenConfig.apiToken,
        email: speechGenConfig.email,
        voice: selectedVoice,
        text: text,
        format: 'mp3',
        speed: '0.95',  // Slower, more relaxed speech
        pitch: '0',     // Neutral pitch
        lang: 'en-US'   // Explicitly set to English (US)
      })

      // Make API request
      const response = await axios.post(apiUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000 // 30 second timeout
      })

      this.logger.logInfo('SPEECHGEN-API', 'API response received', {
        status: response.data?.status,
        hasFile: !!response.data?.file,
        error: response.data?.error,
        fullResponse: response.data
      })

      if (response.data && response.data.status === 1 && response.data.file) {
        // Download the audio file
        const audioUrl = response.data.file
        this.logger.logInfo('SPEECHGEN-API', `Audio file generated`, { url: audioUrl })

        // Download audio file as buffer
        const audioResponse = await axios.get(audioUrl, {
          responseType: 'arraybuffer',
          timeout: 30000
        })

        const audioBuffer = Buffer.from(audioResponse.data)

        this.logger.logInfo('SPEECHGEN-API', `Successfully synthesized ${audioBuffer.length} bytes`, {
          voice: selectedVoice,
          cost: response.data.cost,
          balance: response.data.balance
        })

        return {
          success: true,
          audioBuffer: audioBuffer,
          voiceId: selectedVoice,
          contentType: 'audio/mpeg'
        }
      } else {
        throw new Error(`SpeechGen API returned error status: ${response.data?.status}`)
      }

    } catch (error) {
      this.logger.logError('SPEECHGEN-API', 'Synthesis failed', {
        error: error.message,
        response: error.response?.data
      })
      throw error
    }
  }

  /**
   * Synthesize speech using Amazon Polly
   * @param {string} text - Text to synthesize
   * @param {string} voiceId - Polly voice ID (optional)
   * @param {string} gender - Gender preference (optional)
   * @returns {object} - Result with audio data
   */
  async synthesizeWithPolly(text, voiceId = null, gender = null) {
    try {
      if (!this.apiClients.isPollyAvailable || this._pollyAuthFailed) {
        return {
          success: true,
          usePolly: false,
          message: 'AWS Polly not configured, use browser synthesis'
        }
      }

      // Voice selection based on gender and preference - using most natural voices
      let selectedVoice = voiceId
      let engine = 'neural'

      if (!selectedVoice) {
        // Default voice selection based on gender - using most natural Polly voices
        if (gender === 'male') {
          selectedVoice = 'Stephen'  // Very natural English (US) male neural voice
          engine = 'neural'          // Stephen works best with neural engine
        } else if (gender === 'female') {
          selectedVoice = 'Ruth'     // Very natural English (US) female neural voice
          engine = 'neural'          // Ruth works best with neural engine
        } else if (gender === 'neutral') {
          selectedVoice = 'Ivy'      // Neutral/child voice (US) - most gender-neutral option
          engine = 'neural'          // Ivy works with neural engine
        } else {
          selectedVoice = 'Ruth'     // Default to female voice
          engine = 'neural'
        }
      }

      console.log(`[Polly API] Synthesizing text with voice ${selectedVoice} (engine: ${engine}): "${text.substring(0, 50)}..."`)

      // Create synthesis command with most natural settings
      let synthCommand = {
        Text: text,
        OutputFormat: 'mp3',
        VoiceId: selectedVoice,
        Engine: engine,
        LanguageCode: 'en-US',
        TextType: 'text' // Use plain text for best neural processing
      }

      // For longer texts, try to use long-form if available
      if (text.length > 100) {
        try {
          // Try long-form neural first for longer texts
          if (selectedVoice === 'Matthew' || selectedVoice === 'Joanna') {
            synthCommand.Engine = 'long-form'
            console.log(`[Polly API] Using long-form neural for longer text (${text.length} chars)`)
          }
        } catch (error) {
          console.log(`[Polly API] Long-form not available, using neural: ${error.message}`)
          synthCommand.Engine = 'neural'
        }
      }

      const command = new SynthesizeSpeechCommand(synthCommand)

      // Execute synthesis
      const response = await this.apiClients.pollyClient.send(command)

      if (response.AudioStream) {
        // Convert stream to buffer
        const chunks = []
        for await (const chunk of response.AudioStream) {
          chunks.push(chunk)
        }
        const audioBuffer = Buffer.concat(chunks)

        // Return audio data as base64
        const audioBase64 = audioBuffer.toString('base64')

        console.log(`[Polly API] Successfully synthesized ${audioBuffer.length} bytes`)

        return {
          success: true,
          usePolly: true,
          audioData: audioBase64,
          voiceId: selectedVoice,
          contentType: 'audio/mpeg'
        }
      } else {
        throw new Error('No audio stream received from Polly')
      }

    } catch (error) {
      console.error('[Polly API Error]', error)

      // Disable Polly for this session on auth/config errors to avoid repeated failed calls
      if (error.$metadata?.httpStatusCode === 403 || error.name === 'UnrecognizedClientException' || error.name === 'InvalidClientTokenId') {
        console.warn('[Polly API] Auth failure — disabling Polly for this session, falling back to browser synthesis')
        this._pollyAuthFailed = true
      }

      return {
        success: true,
        usePolly: false,
        error: error.message,
        fallback: true
      }
    }
  }
}

module.exports = SpeechService
