const KJUR = require('jsrsasign')
const path = require('path')

/**
 * ApiRoutes
 * Express API endpoint definitions
 */
class ApiRoutes {
  constructor(app, dependencies) {
    this.app = app
    this.sessionManager = dependencies.sessionManager
    this.settingsManager = dependencies.settingsManager
    this.apiClients = dependencies.apiClients
    this.speechService = dependencies.speechService
    this.logger = dependencies.logger
    this.broadcastSettingsUpdate = dependencies.broadcastSettingsUpdate

  }

  _getConditionIdFromRequest(req, body) {
    // 1. Check body.conditionId
    if (body && typeof body.conditionId === 'string') {
      const id = body.conditionId.trim()
      if (id) return id
    }

    // 2. Check query string: ?condition=<id>
    const qCondition = req.query && req.query.condition
    if (typeof qCondition === 'string') {
      const id = qCondition.trim()
      if (id) return id
    }

    // 3. Check referer URL for ?condition=<id>
    const referer = req.get('referer') || req.get('referrer')
    if (referer) {
      try {
        const url = new URL(referer)
        const condParam = url.searchParams.get('condition')
        if (condParam) return condParam.trim()
      } catch (e) {
        // ignore invalid referer
      }
    }

    return null
  }

  _resolveConditionConfig(conditionId, settings) {
    if (!conditionId || !settings) return null

    const conditions = Array.isArray(settings.conditions) ? settings.conditions : []
    return conditions.find((c) => c && c.id === conditionId) || null
  }

  _resolveAgentFromCondition(conditionConfig, spokenText) {
    if (!conditionConfig || !Array.isArray(conditionConfig.agents) || conditionConfig.agents.length === 0) return null

    if (spokenText && typeof spokenText === 'string') {
      const lower = spokenText.toLowerCase()
      const matched = conditionConfig.agents.find(agent =>
        Array.isArray(agent.triggerKeywords) &&
        agent.triggerKeywords.some(kw => lower.includes(kw.toLowerCase()))
      )
      if (matched) return matched
    }

    // Fall back to first agent
    return conditionConfig.agents[0]
  }

  // Returns all agents that should respond to a user message.
  // An agent responds if: its triggerKeywords list is empty, OR one of its keywords appears in the text.
  _resolveTriggeredAgents(conditionConfig, spokenText) {
    if (!conditionConfig || !Array.isArray(conditionConfig.agents) || conditionConfig.agents.length === 0) return []

    const lower = spokenText && typeof spokenText === 'string' ? spokenText.toLowerCase() : ''

    return conditionConfig.agents.filter(agent => {
      const keywords = Array.isArray(agent.triggerKeywords) ? agent.triggerKeywords : []
      if (keywords.length === 0) return true
      return keywords.some(kw => lower.includes(kw.toLowerCase()))
    })
  }

  _isPeriodicSpeechTrigger(body, speakerName) {
    const triggerType = body && body.triggerType
    if (typeof triggerType === 'string' && triggerType.trim().toLowerCase() === 'periodic_triggered') {
      return true
    }

    const speechType = body && body.speechType
    if (typeof speechType === 'string' && speechType.trim().toLowerCase() === 'periodic') {
      return true
    }

    const spk = typeof speakerName === 'string' ? speakerName.trim().toLowerCase() : ''
    return spk === 'periodic'
  }

  _getPeriodicSpeechPrompt(settings) {
    if (!settings || typeof settings.periodicSpeechPrompt !== 'string') return ''
    return settings.periodicSpeechPrompt.trim()
  }

  _normalizeNameAliases(raw) {
    if (typeof raw === 'string') {
      const trimmed = raw.trim()
      return trimmed ? [trimmed] : []
    }

    if (!Array.isArray(raw)) {
      return []
    }

    const out = []
    for (const item of raw) {
      if (typeof item !== 'string') continue
      const trimmed = item.trim()
      if (!trimmed) continue
      if (out.some((v) => v.toLowerCase() === trimmed.toLowerCase())) continue
      out.push(trimmed)
    }
    return out
  }


  _buildNameSpecifyPrompt(agentName) {
    const name = (typeof agentName === 'string' && agentName.trim()) ? agentName.trim() : 'Alex'
    return `You're name is **${name}**.`
  }

  _resolvePromptTemplate(template, { agentName, botPrompt, history, participants, conditionName }) {
    const now = new Date()
    const date = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })

    const historyText = Array.isArray(history) && history.length > 0
      ? history.map(m => {
          const role = m.role === 'assistant' ? (agentName || 'Agent') : (m.name || 'User')
          const content = typeof m.content === 'string' ? m.content : ''
          return `${role}: ${content}`
        }).join('\n')
      : '(no conversation yet)'

    const userList = Array.isArray(participants) && participants.length > 0
      ? participants.join(', ')
      : 'unknown'

    return template
      .replace(/%agent_name%/g, agentName || 'Agent')
      .replace(/%bot_prompt%/g, botPrompt || '')
      .replace(/%conversation_history%/g, historyText)
      .replace(/%date%/g, date)
      .replace(/%time%/g, time)
      .replace(/%user_list%/g, userList)
      .replace(/%condition_name%/g, conditionName || '')
  }

  _normalizeHistory(rawHistory) {
    if (!Array.isArray(rawHistory)) return []

    const maxItems = Math.max(0, Math.min(50, parseInt(process.env.CHAT_HISTORY_MAX_ITEMS || '20', 10) || 20))
    const maxCharsTotal = Math.max(500, Math.min(20000, parseInt(process.env.CHAT_HISTORY_MAX_CHARS || '6000', 10) || 6000))
    const maxCharsPerItem = Math.max(100, Math.min(2000, parseInt(process.env.CHAT_HISTORY_MAX_CHARS_PER_ITEM || '600', 10) || 600))

    const allowedTypes = new Set(['user', 'ai', 'assistant', 'system', 'manual', 'agent_initiated'])

    const trimmed = rawHistory.slice(-maxItems)
    const normalized = []
    let totalChars = 0

    for (const item of trimmed) {
      if (!item || typeof item !== 'object') continue

      const speaker = (typeof item.speaker === 'string' ? item.speaker : '').trim().slice(0, 80)
      let message = (typeof item.message === 'string' ? item.message : '').trim()
      const type = (typeof item.type === 'string' ? item.type : '').trim().toLowerCase()

      if (!message) continue
      if (speaker.toLowerCase() === 'system' && type === 'system') continue
      if (type && !allowedTypes.has(type)) continue

      if (message.length > maxCharsPerItem) {
        message = message.slice(0, maxCharsPerItem)
      }

      const content = `Speaker: ${speaker || (type === 'user' ? 'User' : 'Assistant')}\nMessage: ${message}`
      const role = (type === 'user') ? 'user' : 'assistant'

      totalChars += content.length
      if (totalChars > maxCharsTotal) break

      normalized.push({ role, content })
    }

    return normalized
  }


  _getSessionId(body) {
    const candidate = body && body.sessionId
    if (typeof candidate !== 'string') return null
    const trimmed = candidate.trim()
    return trimmed ? trimmed : null
  }


  /**
   * Register all API routes
   */
  register() {
    this._registerSessionRoutes()
    this._registerConditionRoutes()
    this._registerAuthRoutes()
    this._registerChatRoutes()
    this._registerSynthesizeRoutes()
    this._registerVersionRoutes()
    this._registerSettingsRoutes()
  }

  /**
   * Session parameter routes
   */
  _registerSessionRoutes() {
    // GET /api/session/:sessionId/parameters
    this.app.get('/api/session/:sessionId/parameters', (req, res) => {
      const sessionId = req.params.sessionId
      const room = this.sessionManager.getSessionRoom(sessionId)

      if (!room) {
        return res.status(404).json({ error: 'Session not found' })
      }

      // Get latest parameters from host in session
      let hostParameters = null
      for (const [ws, session] of this.sessionManager.clientSessions) {
        if (session.sessionId === sessionId && session.isHost && room.clients.has(ws)) {
          hostParameters = {
            silenceThreshold: 10,
            periodicInterval: 120,
            silenceMessages: [
              'Sorry, do you have any questions?',
              'Is there anything I can help clarify?',
              'Please feel free to share your thoughts.'
            ],
            periodicMessages: [
              'How is the meeting progressing?',
              'Would you like to discuss any specific topics?',
              'Are there any important points to cover?'
            ],
            nameKeywords: ['agent', 'assistant', 'AI', 'bot']
          }
          break
        }
      }

      if (!hostParameters) {
        return res.status(404).json({ error: 'Host not found in session' })
      }

      res.json({
        sessionId,
        parameters: hostParameters,
        timestamp: new Date().toISOString()
      })
    })

    // POST /api/session/:sessionId/kick - Kick a participant
    this.app.post('/api/session/:sessionId/kick', (req, res) => {
      const { sessionId } = req.params
      const { userId } = req.body

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' })
      }

      const result = this.sessionManager.kickParticipant(sessionId, userId)
      if (!result) {
        return res.status(404).json({ error: 'Participant not found' })
      }

      this.logger.logInfo('SESSION-API', 'Participant kicked', { sessionId, userId })
      res.json({ success: true, sessionId, userId })
    })

    // POST /api/session/:sessionId/mute - Mute a participant
    this.app.post('/api/session/:sessionId/mute', (req, res) => {
      const { sessionId } = req.params
      const { userId } = req.body

      if (!userId) {
        return res.status(400).json({ error: 'userId is required' })
      }

      const result = this.sessionManager.muteParticipant(sessionId, userId)
      if (!result) {
        return res.status(404).json({ error: 'Participant not found' })
      }

      this.logger.logInfo('SESSION-API', 'Participant muted', { sessionId, userId })
      res.json({ success: true, sessionId, userId })
    })
  }

  /**
   * Experiment Condition routes
   */
  _registerConditionRoutes() {
    // GET /api/conditions - List all conditions
    this.app.get('/api/conditions', async (req, res) => {
      try {
        const settings = await this.settingsManager.load()
        const conditions = Array.isArray(settings.conditions) ? settings.conditions : []
        this.logger.logInfo('CONDITIONS-API', 'Conditions retrieved', { count: conditions.length })
        res.json(conditions)
      } catch (err) {
        this.logger.logError('CONDITIONS-API', 'Failed to load conditions', {
          error: err.message,
          name: err.name
        })
        res.status(500).json({ error: 'Failed to load conditions', message: err.message })
      }
    })

    // POST /api/conditions - Create a new condition
    this.app.post('/api/conditions', async (req, res) => {
      try {
        const { id, name, background, agents } = req.body

        if (!id || !name) {
          return res.status(400).json({ error: 'Missing required fields: id, name' })
        }

        const settings = await this.settingsManager.load()
        const conditions = Array.isArray(settings.conditions) ? settings.conditions : []

        if (conditions.some((c) => c.id === id)) {
          return res.status(400).json({ error: `Condition with id "${id}" already exists` })
        }

        const newCondition = {
          id,
          name,
          ...(background && { background }),
          agents: Array.isArray(agents) ? agents : []
        }
        conditions.push(newCondition)

        const updatedSettings = await this.settingsManager.save({ ...settings, conditions })
        if (this.broadcastSettingsUpdate) {
          this.broadcastSettingsUpdate(updatedSettings)
        }

        this.logger.logInfo('CONDITIONS-API', 'Condition created', { id, name })
        res.json(newCondition)
      } catch (err) {
        this.logger.logError('CONDITIONS-API', 'Failed to create condition', {
          error: err.message,
          name: err.name
        })
        res.status(500).json({ error: 'Failed to create condition', message: err.message })
      }
    })

    // PUT /api/conditions/:id - Update a condition
    this.app.put('/api/conditions/:id', async (req, res) => {
      try {
        const { id } = req.params
        const { name, background, agents } = req.body

        const settings = await this.settingsManager.load()
        const conditions = Array.isArray(settings.conditions) ? settings.conditions : []

        const conditionIndex = conditions.findIndex((c) => c.id === id)
        if (conditionIndex < 0) {
          return res.status(404).json({ error: `Condition "${id}" not found` })
        }

        const updated = {
          ...conditions[conditionIndex],
          ...(name !== undefined && { name }),
          ...(background !== undefined && { background }),
          ...(agents !== undefined && { agents: Array.isArray(agents) ? agents : conditions[conditionIndex].agents })
        }
        conditions[conditionIndex] = updated

        const updatedSettings = await this.settingsManager.save({ ...settings, conditions })
        if (this.broadcastSettingsUpdate) {
          this.broadcastSettingsUpdate(updatedSettings)
        }

        this.logger.logInfo('CONDITIONS-API', 'Condition updated', { id })
        res.json(updated)
      } catch (err) {
        this.logger.logError('CONDITIONS-API', 'Failed to update condition', {
          error: err.message,
          name: err.name
        })
        res.status(500).json({ error: 'Failed to update condition', message: err.message })
      }
    })

    // DELETE /api/conditions/:id - Delete a condition
    this.app.delete('/api/conditions/:id', async (req, res) => {
      try {
        const { id } = req.params

        const settings = await this.settingsManager.load()
        const conditions = Array.isArray(settings.conditions) ? settings.conditions : []

        const conditionIndex = conditions.findIndex((c) => c.id === id)
        if (conditionIndex < 0) {
          return res.status(404).json({ error: `Condition "${id}" not found` })
        }

        const deleted = conditions[conditionIndex]
        conditions.splice(conditionIndex, 1)

        const updatedSettings = await this.settingsManager.save({ ...settings, conditions })
        if (this.broadcastSettingsUpdate) {
          this.broadcastSettingsUpdate(updatedSettings)
        }

        this.logger.logInfo('CONDITIONS-API', 'Condition deleted', { id })
        res.json({ success: true, deleted })
      } catch (err) {
        this.logger.logError('CONDITIONS-API', 'Failed to delete condition', {
          error: err.message,
          name: err.name
        })
        res.status(500).json({ error: 'Failed to delete condition', message: err.message })
      }
    })
  }

  /**
   * Authentication/JWT routes
   */
  _registerAuthRoutes() {
    // POST /api/ - JWT signature generation
    this.app.post('/api/', (req, res) => {
      const iat = Math.floor(new Date().getTime() / 1000)
      const exp = iat + 60 * 60 * 2

      const oHeader = { alg: 'HS256', typ: 'JWT' }
      const oPayload = {
        app_key: process.env.ZOOM_VSDK_KEY,
        tpc: req.body.topic,
        role_type: req.body.role,
        pwd: req.body.password,
        iat: iat,
        exp: exp,
      }
      const sHeader = JSON.stringify(oHeader)
      const sPayload = JSON.stringify(oPayload)
      const signature = KJUR.jws.JWS.sign('HS256', sHeader, sPayload, process.env.ZOOM_VSDK_SECRET)
      res.json({
        signature: signature
      })
    })
  }

  /**
   * Chat/AI response routes
   */
  _registerChatRoutes() {
    // POST /api/chat - OpenAI chat endpoint
    this.app.post('/api/chat', async (req, res) => {
      try {
        const { userMessage, speakerName, aiStyle } = req.body

        if (!userMessage || !userMessage.trim()) {
          return res.status(400).json({ error: 'User message is required' })
        }

        // Check if OpenAI is available
        if (!this.apiClients.isOpenAIAvailable) {
          console.log(`[OpenAI API] API key not configured, using fallback for: ${userMessage}`)
          const fallbackResponses = [
            'Thank you for sharing that!',
            'That\'s interesting, tell me more.',
            'I appreciate your input.',
            'Thanks for letting me know.',
            'That sounds great!'
          ]

          const fallbackResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)]

          return res.json({
            success: true,
            response: fallbackResponse,
            originalMessage: userMessage,
            speakerName: speakerName,
            fallback: true
          })
        }

        console.log(`[OpenAI API] Processing message from ${speakerName}: ${userMessage}`)

        // Load server settings once per request (works for both file and DynamoDB backends)
        let savedSettings = null
        try {
          savedSettings = await this.settingsManager.load()
        } catch (settingsErr) {
          console.warn('[OpenAI API] Failed to load settings:', settingsErr.message)
        }

        // Determine AI style: client-provided > server-saved > default
        const defaultStyle = "You are a helpful and neutral AI assistant. Respond in a friendly, professional, and informative manner. Keep responses concise but engaging. Avoid being overly casual or formal."
        let customStyle = defaultStyle

        if (aiStyle && aiStyle.trim() !== '') {
          customStyle = aiStyle.trim()
          console.log(`[OpenAI API] Using client-provided AI style: ${customStyle.substring(0, 50)}...`)
        } else if (savedSettings && savedSettings.aiStyle && savedSettings.aiStyle.trim() !== '') {
          customStyle = savedSettings.aiStyle.trim()
          console.log(`[OpenAI API] Using server-saved AI style: ${customStyle.substring(0, 50)}...`)
        } else {
          console.log('[OpenAI API] Using default AI style')
        }

        // Resolve condition config from generic condition ID
        const sessionId = this._getSessionId(req.body)
        const conditionId = this._getConditionIdFromRequest(req, req.body)
        const conditionConfig = this._resolveConditionConfig(conditionId, savedSettings)
        const spokenText = req.body && (req.body.text || req.body.transcript || '')
        const agentConfig = this._resolveAgentFromCondition(conditionConfig, spokenText)
        const agentName = agentConfig ? agentConfig.name : 'Alex'
        const conditionPrompt = agentConfig ? agentConfig.prompt : ''

        const isPeriodicTriggered = this._isPeriodicSpeechTrigger(req.body, speakerName)
        const periodicSpeechPrompt = isPeriodicTriggered ? this._getPeriodicSpeechPrompt(savedSettings) : ''

        console.log(`[OpenAI API] Condition: id=${conditionId || 'none'} agent=${agentName} periodic=${isPeriodicTriggered}`)

        // Include optional client-provided conversation history (last N turns)
        const historyMessages = this._normalizeHistory(req.body && req.body.history)

        // Build system prompt from template
        const promptTemplate = (savedSettings && savedSettings.promptTemplate) || this.settingsManager.defaults.promptTemplate
        const participants = Array.isArray(req.body && req.body.participants) ? req.body.participants : []
        let botPromptParts = [conditionPrompt, customStyle].filter(Boolean)
        if (periodicSpeechPrompt) botPromptParts.push(periodicSpeechPrompt)
        const systemPrompt = this._resolvePromptTemplate(promptTemplate, {
          agentName,
          botPrompt: botPromptParts.join('\n\n'),
          history: historyMessages,
          participants,
          conditionName: conditionConfig ? conditionConfig.name : ''
        })

        if (isPeriodicTriggered) {
          console.log(`[OpenAI API] Periodic speech prompt applied (${(periodicSpeechPrompt || '').length} chars)`)
        }

        // Get LLM config from settings
        const llmConfig = (savedSettings && savedSettings.llm) || {}
        const llmModel = llmConfig.model || 'gpt-3.5-turbo'
        const llmMaxTokens = llmConfig.maxTokens || 150
        const llmTemperature = llmConfig.temperature !== undefined ? llmConfig.temperature : 0.7

        // OpenAI API call
        const completion = await this.apiClients.openai.chat.completions.create({
          model: llmModel,
          messages: [
            {
              role: "system",
              content: systemPrompt
            },
            ...historyMessages,
            {
              role: "user",
              content: `Speaker: ${speakerName || 'User'}\nMessage: ${userMessage}`
            }
          ],
          max_tokens: llmMaxTokens,
          temperature: llmTemperature
        })

        const aiResponse = completion.choices[0]?.message?.content || 'Sorry, I didn\'t catch that clearly.'

        console.log(`[OpenAI API] Generated response: ${aiResponse}`)

        res.json({
          success: true,
          response: aiResponse,
          originalMessage: userMessage,
          speakerName: speakerName
        })

      } catch (error) {
        console.error('[OpenAI API Error]', error)
        console.error('[OpenAI API Error Details]', {
          message: error.message,
          status: error.status,
          code: error.code,
          type: error.type
        })

        // Fallback response on error
        const fallbackResponses = [
          'Thank you for sharing!',
          'That\'s very interesting.',
          'I understand what you mean.',
          'That\'s a great point.',
          'Thanks for your input!'
        ]

        const fallbackResponse = fallbackResponses[Math.floor(Math.random() * fallbackResponses.length)]

        res.json({
          success: true,
          response: fallbackResponse,
          originalMessage: req.body.userMessage,
          speakerName: req.body.speakerName,
          fallback: true,
          error: error.message
        })
      }
    })

    // POST /api/chat/agents - Get responses from all triggered agents (multi-agent support)
    // Each agent with empty triggerKeywords always responds; others respond only if their keyword matches.
    // Agents are ordered randomly. Each agent receives the prior agents' responses in its history.
    this.app.post('/api/chat/agents', async (req, res) => {
      try {
        const { userMessage, speakerName, aiStyle } = req.body

        if (!userMessage || !userMessage.trim()) {
          return res.status(400).json({ error: 'User message is required' })
        }

        if (!this.apiClients.isOpenAIAvailable) {
          return res.json({ success: true, responses: [] })
        }

        let savedSettings = null
        try {
          savedSettings = await this.settingsManager.load()
        } catch (settingsErr) {
          console.warn('[MultiAgent API] Failed to load settings:', settingsErr.message)
        }

        const conditionId = this._getConditionIdFromRequest(req, req.body)
        const conditionConfig = this._resolveConditionConfig(conditionId, savedSettings)
        const spokenText = req.body && (req.body.text || req.body.transcript || userMessage || '')
        const triggeredAgents = this._resolveTriggeredAgents(conditionConfig, spokenText)

        if (triggeredAgents.length === 0) {
          return res.json({ success: true, responses: [] })
        }

        // Shuffle agents into random order
        const shuffled = [...triggeredAgents].sort(() => Math.random() - 0.5)

        const defaultStyle = 'You are a helpful and neutral AI assistant.'
        const customStyle = (aiStyle && aiStyle.trim())
          ? aiStyle.trim()
          : ((savedSettings && savedSettings.aiStyle && savedSettings.aiStyle.trim()) || defaultStyle)

        const llmConfig = (savedSettings && savedSettings.llm) || {}
        const llmModel = llmConfig.model || 'gpt-3.5-turbo'
        const llmMaxTokens = llmConfig.maxTokens || 150
        const llmTemperature = llmConfig.temperature !== undefined ? llmConfig.temperature : 0.7

        const baseHistory = this._normalizeHistory(req.body && req.body.history)
        const promptTemplate = (savedSettings && savedSettings.promptTemplate) || this.settingsManager.defaults.promptTemplate
        const participants = Array.isArray(req.body && req.body.participants) ? req.body.participants : []

        const responses = []

        for (const agent of shuffled) {
          const systemPrompt = this._resolvePromptTemplate(promptTemplate, {
            agentName: agent.name,
            botPrompt: [agent.prompt || '', customStyle].filter(Boolean).join('\n\n'),
            history: baseHistory,
            participants,
            conditionName: conditionConfig ? conditionConfig.name : ''
          })

          // Build history including prior agents' responses in this same turn
          const priorAgentMessages = responses.map(r => ({
            role: 'assistant',
            content: `Speaker: ${r.agentName}\nMessage: ${r.response}`
          }))

          try {
            const completion = await this.apiClients.openai.chat.completions.create({
              model: llmModel,
              messages: [
                { role: 'system', content: systemPrompt },
                ...baseHistory,
                ...priorAgentMessages,
                { role: 'user', content: `Speaker: ${speakerName || 'User'}\nMessage: ${userMessage}` }
              ],
              max_tokens: llmMaxTokens,
              temperature: llmTemperature
            })

            const text = completion.choices[0]?.message?.content || ''
            responses.push({ agentName: agent.name, avatarModel: agent.avatarModel, gender: agent.gender || 'auto', response: text })
          } catch (agentErr) {
            console.error(`[MultiAgent API] Agent ${agent.name} failed:`, agentErr.message)
            responses.push({ agentName: agent.name, avatarModel: agent.avatarModel, gender: agent.gender || 'auto', response: '', error: agentErr.message })
          }
        }

        res.json({ success: true, responses })
      } catch (error) {
        console.error('[MultiAgent API Error]', error)
        res.status(500).json({ error: 'Multi-agent chat failed', message: error.message })
      }
    })
  }

  /**
   * Speech synthesis routes
   */
  _registerSynthesizeRoutes() {
    // POST /api/synthesize - Speech synthesis endpoint
    this.app.post('/api/synthesize', async (req, res) => {
      try {
        const { text, voiceId, gender } = req.body

        if (!text || !text.trim()) {
          return res.status(400).json({ error: 'Text is required' })
        }

        const result = await this.speechService.synthesize(text, { voiceId, gender })
        res.json(result)

      } catch (error) {
        console.error('[Synthesize API Error]', error)
        res.json({
          success: true,
          usePolly: false,
          error: error.message,
          fallback: true
        })
      }
    })
  }

  /**
   * Version information routes
   */
  _registerVersionRoutes() {
    // GET /api/version
    this.app.get('/api/version', (req, res) => {
      const versionInfo = {
        taskFamily: process.env.ECS_TASK_FAMILY || 'vsdk-task',
        taskRevision: process.env.ECS_TASK_REVISION || null,
        imageTag: process.env.IMAGE_TAG || process.env.npm_package_version || 'unknown',
        deployTime: process.env.DEPLOY_TIME || new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        awsRegion: process.env.AWS_REGION || null
      }

      res.json(versionInfo)
      this.logger.logInfo('VERSION-API', 'Version info requested', versionInfo)
    })
  }

  /**
   * Settings management routes
   */
  _registerSettingsRoutes() {
    const awsMeta = (err) => {
      if (!err || !err.$metadata) return undefined
      return {
        httpStatusCode: err.$metadata.httpStatusCode,
        requestId: err.$metadata.requestId,
        attempts: err.$metadata.attempts,
        totalRetryDelay: err.$metadata.totalRetryDelay
      }
    }

    // GET /api/settings - Get all settings
    this.app.get('/api/settings', async (req, res) => {
      try {
        const settings = await this.settingsManager.load()
        this.logger.logInfo('SETTINGS-API', 'Settings retrieved', { keys: Object.keys(settings) })
        res.json(settings)
      } catch (err) {
        this.logger.logError('SETTINGS-API', 'Failed to load settings', {
          error: err.message,
          name: err.name,
          awsMetadata: awsMeta(err),
          details: err.details
        })
        res.status(500).json({ error: 'Failed to load settings', message: err.message })
      }
    })

    // GET /api/settings/:key - Get specific setting
    this.app.get('/api/settings/:key', async (req, res) => {
      try {
        const { key } = req.params
        const value = await this.settingsManager.get(key)

        if (value === undefined) {
          this.logger.logInfo('SETTINGS-API', 'Setting not found', { key })
          return res.status(404).json({ error: 'Setting not found', key })
        }

        this.logger.logInfo('SETTINGS-API', 'Setting retrieved', { key })
        res.json({ key, value })
      } catch (err) {
        this.logger.logError('SETTINGS-API', 'Failed to get setting', {
          key: req.params.key,
          error: err.message,
          name: err.name,
          awsMetadata: awsMeta(err),
          details: err.details
        })
        res.status(500).json({ error: 'Failed to get setting', message: err.message })
      }
    })

    // POST /api/settings - Save all settings
    this.app.post('/api/settings', async (req, res) => {
      try {
        const settings = req.body
        const savedSettings = await this.settingsManager.save(settings)
        this.logger.logInfo('SETTINGS-API', 'Settings saved', { keys: Object.keys(savedSettings) })

        // Broadcast settings update to all connected WebSocket clients
        if (this.broadcastSettingsUpdate) {
          this.broadcastSettingsUpdate(savedSettings)
        }

        res.json(savedSettings)
      } catch (err) {
        this.logger.logError('SETTINGS-API', 'Failed to save settings', {
          error: err.message,
          name: err.name,
          awsMetadata: awsMeta(err),
          details: err.details
        })
        res.status(500).json({ error: 'Failed to save settings', message: err.message })
      }
    })

    // PUT /api/settings/:key - Update specific setting
    this.app.put('/api/settings/:key', async (req, res) => {
      try {
        const { key } = req.params
        const { value } = req.body

        if (value === undefined) {
          return res.status(400).json({ error: 'Missing value in request body' })
        }

        const updatedSettings = await this.settingsManager.update(key, value)
        this.logger.logInfo('SETTINGS-API', 'Setting updated', { key, value })

        // Broadcast settings update to all connected WebSocket clients
        if (this.broadcastSettingsUpdate) {
          this.broadcastSettingsUpdate(updatedSettings)
        }

        res.json({ key, value, settings: updatedSettings })
      } catch (err) {
        this.logger.logError('SETTINGS-API', 'Failed to update setting', {
          key: req.params.key,
          error: err.message,
          name: err.name,
          awsMetadata: awsMeta(err),
          details: err.details
        })
        res.status(500).json({ error: 'Failed to update setting', message: err.message })
      }
    })

    // POST /api/settings/name-sync - Return name detection settings merged with condition's triggerKeywords
    this.app.post('/api/settings/name-sync', async (req, res) => {
      try {
        const { condition } = req.body
        const settings = await this.settingsManager.load()

        let keywords = Array.isArray(settings.nameDetection?.keywords) ? settings.nameDetection.keywords : ['agent', 'assistant', 'AI', 'bot']

        if (condition) {
          const conditions = Array.isArray(settings.conditions) ? settings.conditions : []
          const conditionObj = conditions.find((c) => c.id === condition)
          if (conditionObj && Array.isArray(conditionObj.agents)) {
            const allKeywords = conditionObj.agents.flatMap(a => Array.isArray(a.triggerKeywords) ? a.triggerKeywords : [])
            if (allKeywords.length > 0) keywords = [...new Set(allKeywords)]
          }
        }

        const mergedSettings = {
          ...settings,
          nameDetection: {
            ...(settings.nameDetection || {}),
            keywords
          }
        }

        res.json({ settings: mergedSettings })
      } catch (err) {
        res.status(500).json({ error: 'Failed to sync name settings', message: err.message })
      }
    })

    // POST /api/settings/reset - Reset to defaults
    this.app.post('/api/settings/reset', async (req, res) => {
      try {
        const defaultSettings = await this.settingsManager.reset()
        this.logger.logInfo('SETTINGS-API', 'Settings reset to defaults')

        // Broadcast settings update to all connected WebSocket clients
        if (this.broadcastSettingsUpdate) {
          this.broadcastSettingsUpdate(defaultSettings)
        }

        res.json(defaultSettings)
      } catch (err) {
        this.logger.logError('SETTINGS-API', 'Failed to reset settings', {
          error: err.message,
          name: err.name,
          awsMetadata: awsMeta(err),
          details: err.details
        })
        res.status(500).json({ error: 'Failed to reset settings', message: err.message })
      }
    })

    // GET /api/sessions - List active sessions
    this.app.get('/api/sessions', (req, res) => {
      try {
        const sessionRooms = this.sessionManager.sessionRooms
        const sessions = Array.from(sessionRooms.entries()).map(([sessionId, room]) => ({
          sessionId,
          topic: room.topic,
          createdAt: room.createdAt,
          participants: room.clients.size,
          maxUsers: room.maxUsers,
          hasPassword: !!room.password
        }))

        this.logger.logInfo('SESSION-LIST-API', `Listed ${sessions.length} active sessions`)
        res.json(sessions)
      } catch (err) {
        this.logger.logError('SESSION-LIST-API', 'Failed to list sessions', {
          error: err.message
        })
        res.status(500).json({ error: 'Failed to list sessions', message: err.message })
      }
    })
  }
}

module.exports = ApiRoutes
