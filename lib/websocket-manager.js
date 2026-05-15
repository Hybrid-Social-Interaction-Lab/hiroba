const WebSocket = require('ws')

/**
 * WebSocketManager
 * Manages WebSocket connections and message handling
 */
class WebSocketManager {
  constructor(server, sessionManager, logger, options = {}) {
    this.sessionManager = sessionManager
    this.logger = logger
    this.settingsManager = options.settingsManager
    this.apiClients = options.apiClients

    // Create WebSocket server
    this._wss = new WebSocket.Server({ server })
    this._setupConnectionHandler(this._wss)

    this.logger.logInfo('WS', 'WebSocket server ready')
  }

  /**
   * Get the WebSocket server instance
   */
  get wss() {
    return this._wss
  }

  /**
   * Attach WebSocket handling to an HTTPS server
   */
  attachToHttpsServer(httpsServer) {
    const httpsWss = new WebSocket.Server({ server: httpsServer })
    httpsWss.on('connection', (ws) => {
      this.logger.logInfo('WS-HTTPS', 'New client connected via HTTPS')
      // Use the same connection logic
      this._wss.emit('connection', ws)
    })
  }

  /**
   * Setup connection handler for WebSocket server
   */
  _setupConnectionHandler(wss) {
    wss.on('connection', (ws) => {
      this._handleConnection(ws)
    })
  }

  /**
   * Handle new WebSocket connection
   */
  _handleConnection(ws) {
    this.logger.logInfo('WS', 'NEW CONNECTION', { totalClients: this.sessionManager.wsClients.size + 1 })

    // Add client to session manager
    this.sessionManager.addClient(ws)

    // Get actual participant count (excluding Master Control Panel)
    const participantCount = this.sessionManager.getParticipantCount()

    // Send connection count to all clients (including self)
    const connectionMessage = {
      type: 'CONNECTION_UPDATE',
      count: participantCount,
      timestamp: new Date().toISOString(),
      maxUsers: 50,
      isRoomFull: participantCount >= 50
    }
    this.logger.logInfo('WS', 'Broadcasting connection count', { count: participantCount, maxUsers: 50, totalConnections: this.sessionManager.wsClients.size })
    this.broadcastToAllIncludingSelf(connectionMessage)

    // Set up message handler
    ws.on('message', async (data) => {
      await this._handleMessage(ws, data)
    })

    // Set up close handler
    ws.on('close', () => {
      this._handleClose(ws)
    })

    // Set up error handler
    ws.on('error', (error) => {
      this.logger.logError('WS', 'WebSocket error occurred', { error: error.message })
      this.sessionManager.removeClient(ws)
    })
  }

  /**
   * Handle incoming WebSocket message
   */
  async _handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString())
      this.logger.logDebug('WS-RECEIVE', `Received message type: ${message.type}`, message)

      // Route message to appropriate handler
      switch (message.type) {
        case 'DETAILED_LOG':
          this._handleDetailedLog(ws, message)
          return

        case 'CANVAS_STATE_UPDATE':
          this._handleCanvasStateUpdate(ws, message)
          return

        case 'VIDEO_RENDER_REQUEST':
          this._handleVideoRenderRequest(ws, message)
          return

        case 'VIDEO_RENDER_COMPLETE':
          this._handleVideoRenderComplete(ws, message)
          return

        case 'MASTER_OBSERVER_JOIN':
          this._handleMasterObserverJoin(ws, message)
          return

        case 'MASTER_OBSERVER_LEFT':
          this._handleMasterObserverLeft(ws, message)
          return

        case 'USER_JOINED':
          this._handleUserJoined(ws, message)
          return

        case 'CONVERSATION_UPDATE':
          this._handleConversationUpdate(ws, message)
          break

        case 'CONVERSATION_DISPLAY_ONLY':
          this._handleConversationDisplayOnly(ws, message)
          break

        case 'AI_RESPONSE_REQUEST':
          this._handleAIResponseRequest(ws, message)
          break

        case 'DEBUG_COMMAND':
          this._handleDebugCommand(ws, message)
          return

        case 'SILENCE_THRESHOLD_UPDATE':
        case 'PERIODIC_INTERVAL_UPDATE':
        case 'SILENCE_MESSAGES_UPDATE':
        case 'PERIODIC_MESSAGES_UPDATE':
        case 'NAME_KEYWORDS_UPDATE':
        case 'MASTER_VIDEO_VISIBILITY_UPDATE':
        case 'AI_STYLE_UPDATE':
        case 'RESET_TIMERS':
        case 'TEST_SILENCE_DETECTION':
        case 'TEST_PERIODIC_SPEECH':
        case 'RESET_ALL_SESSION_DATA':
        case 'CLEAR_ALL_PARTICIPANTS':
          this._handleSettingsUpdate(ws, message)
          return

        case 'KICK_PARTICIPANT':
          this._handleKickParticipant(ws, message)
          return

        case 'UPDATE_SESSION_PASSWORD':
          this._handleUpdateSessionPassword(ws, message)
          return

        case 'TOGGLE_JOIN_ENABLED':
          this._handleToggleJoinEnabled(ws, message)
          return

        case 'RENAME_PARTICIPANT':
          this._handleRenameParticipant(ws, message)
          return

        default:
          this.logger.logDebug('WS-SKIP', 'Not processing message', {
            type: message.type,
            hasConversation: !!message.conversation,
            reason: 'Not a recognized message type'
          })
      }

      // General message broadcast (excluding settings changes)
      if (message.type === 'SPEECH_ACTIVITY_UPDATE' ||
          message.type === 'CONVERSATION_UPDATE' ||
          message.type === 'CONVERSATION_DISPLAY_ONLY' ||
          message.type === 'AI_RESPONSE_REQUEST' ||
          message.type === 'USER_JOINED' ||
          message.type === 'USER_LEFT') {
        const session = this.sessionManager.getClientSession(ws)
        if (session && session.sessionId) {
          this.broadcastToSession(session.sessionId, message, ws)
        } else {
          this.broadcastToAll(message, ws)
        }
      }

    } catch (error) {
      this.logger.logError('WS-PARSE', 'Failed to parse WebSocket message', { error: error.message, data: data.toString() })
    }
  }

  /**
   * Handle WebSocket close
   */
  _handleClose(ws) {
    const session = this.sessionManager.getClientSession(ws)
    this.logger.logInfo('WS', 'Client disconnected', {
      remainingClients: this.sessionManager.wsClients.size - 1,
      session: session ? {
        userId: session.userId,
        userName: session.userName,
        sessionId: session.sessionId,
        isMasterObserver: session.isMasterObserver
      } : null
    })

    // Master observer disconnect handling
    if (session && session.isMasterObserver) {
      this.logger.logInfo('MASTER', `Master observer disconnected from session: ${session.sessionId}`, {
        masterId: session.userId,
        masterName: session.userName
      })
    }

    // Remove from session
    this.sessionManager.removeClientFromSession(ws)

    // Clean up canvas rendering locks for this client
    if (session && session.canvasState) {
      session.canvasState.renderingParticipants.forEach(targetUserId => {
        if (session.sessionId) {
          this.broadcastToSession(session.sessionId, {
            type: 'VIDEO_RENDER_UNLOCK',
            renderingClient: session.userId,
            targetUserId: targetUserId,
            reason: 'Client disconnected',
            timestamp: new Date().toISOString()
          })
        }
      })
    }

    // Remove client and session info
    this.sessionManager.removeClient(ws)

    // Notify other users in session about departure
    if (session && session.sessionId) {
      this.broadcastToSession(session.sessionId, {
        type: 'USER_LEFT',
        userId: session.userId,
        userName: session.userName,
        timestamp: new Date().toISOString()
      })
    }

    // Update connection counts
    this._broadcastConnectionUpdate()
  }

  /**
   * Handle detailed log message
   */
  _handleDetailedLog(ws, message) {
    const logEntry = message.logEntry
    this.logger.writeLog(logEntry.level, `CLIENT-${logEntry.category}`,
      `[${logEntry.userName}(${logEntry.userId})] ${logEntry.message}`,
      logEntry.data)
  }

  /**
   * Handle canvas state update
   */
  _handleCanvasStateUpdate(ws, message) {
    const session = this.sessionManager.getClientSession(ws)
    if (session) {
      session.canvasState.isOffscreenTransferred = message.isOffscreenTransferred
      session.canvasState.lastRenderAttempt = new Date().toISOString()

      // Broadcast canvas state to session participants for synchronization
      const room = this.sessionManager.getSessionRoom(session.sessionId)
      if (room) {
        this.broadcastToSession(session.sessionId, {
          type: 'CANVAS_SYNC_STATE',
          userId: session.userId,
          userName: session.userName,
          canvasState: session.canvasState,
          timestamp: new Date().toISOString()
        }, ws)
      }

      this.logger.logInfo('CANVAS-SYNC', `Canvas state updated for ${session.userName}(${session.userId})`, {
        isOffscreenTransferred: message.isOffscreenTransferred,
        sessionId: session.sessionId
      })
    }
  }

  /**
   * Handle video render request
   */
  _handleVideoRenderRequest(ws, message) {
    const session = this.sessionManager.getClientSession(ws)
    if (session && session.sessionId) {
      const room = this.sessionManager.getSessionRoom(session.sessionId)
      if (room) {
        // Check if any other client is currently rendering this participant
        let canRender = true
        const targetUserId = message.targetUserId

        for (let client of room.clients) {
          const clientSession = this.sessionManager.getClientSession(client)
          if (clientSession && client !== ws) {
            if (clientSession.canvasState.renderingParticipants.has(targetUserId)) {
              canRender = false
              break
            }
          }
        }

        if (canRender) {
          session.canvasState.renderingParticipants.add(targetUserId)

          // Send approval to requesting client
          ws.send(JSON.stringify({
            type: 'VIDEO_RENDER_APPROVED',
            targetUserId: targetUserId,
            timestamp: new Date().toISOString()
          }))

          // Notify other clients to avoid duplicate rendering
          this.broadcastToSession(session.sessionId, {
            type: 'VIDEO_RENDER_LOCK',
            renderingClient: session.userId,
            targetUserId: targetUserId,
            timestamp: new Date().toISOString()
          }, ws)

          this.logger.logInfo('VIDEO-RENDER', `Approved video rendering for ${session.userName}(${session.userId})`, {
            targetUserId: targetUserId,
            sessionId: session.sessionId
          })
        } else {
          // Send denial to requesting client
          ws.send(JSON.stringify({
            type: 'VIDEO_RENDER_DENIED',
            targetUserId: targetUserId,
            reason: 'Another client is already rendering this participant',
            timestamp: new Date().toISOString()
          }))

          this.logger.logWarn('VIDEO-RENDER', `Denied video rendering for ${session.userName}(${session.userId})`, {
            targetUserId: targetUserId,
            reason: 'Already being rendered by another client',
            sessionId: session.sessionId
          })
        }
      }
    }
  }

  /**
   * Handle video render complete
   */
  _handleVideoRenderComplete(ws, message) {
    const session = this.sessionManager.getClientSession(ws)
    if (session) {
      session.canvasState.renderingParticipants.delete(message.targetUserId)

      // Notify other clients that rendering is complete
      if (session.sessionId) {
        this.broadcastToSession(session.sessionId, {
          type: 'VIDEO_RENDER_UNLOCK',
          renderingClient: session.userId,
          targetUserId: message.targetUserId,
          timestamp: new Date().toISOString()
        }, ws)
      }

      this.logger.logInfo('VIDEO-RENDER', `Completed video rendering for ${session.userName}(${session.userId})`, {
        targetUserId: message.targetUserId,
        sessionId: session.sessionId
      })
    }
  }

  /**
   * Handle master observer join
   */
  _handleMasterObserverJoin(ws, message) {
    const session = this.sessionManager.getClientSession(ws)
    if (session) {
      session.sessionId = message.sessionId
      session.userId = message.masterId
      session.userName = message.masterName
      session.topic = message.topic
      session.isMasterObserver = true
      session.isHost = true // Master has host privileges
    }

    // Join session room (to receive conversation logs)
    const room = this.sessionManager.getOrCreateSessionRoom(message.sessionId, message.topic)
    room.clients.add(ws)

    this.logger.logInfo('MASTER', `Master observer joined session room with ${room.clients.size} total clients`, {
      sessionId: message.sessionId,
      masterId: message.masterId,
      masterName: message.masterName
    })

    // Send session info (participant list and conversation history)
    const participants = Array.from(room.clients)
      .map(client => this.sessionManager.getClientSession(client))
      .filter(s => s && !s.isMasterObserver)
      .map(s => ({
        userId: s.userId,
        userName: s.userName,
        isHost: s.isHost,
        joinedAt: new Date().toISOString()
      }))

    // Send session info response (including conversation history)
    ws.send(JSON.stringify({
      type: 'SESSION_INFO_RESPONSE',
      participants: participants,
      conversation: room.conversationHistory || [],
      sessionId: message.sessionId,
      timestamp: new Date().toISOString()
    }))

    this.logger.logInfo('MASTER', `Master observer joined session: ${message.sessionId}`, {
      masterId: message.masterId,
      masterName: message.masterName,
      participantCount: participants.length
    })

    const roomState = this.sessionManager.getSessionRoom(message.sessionId)
    if (roomState && ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'MASTER_VIDEO_VISIBILITY_UPDATE',
        visible: roomState.masterVideoVisible !== false,
        timestamp: new Date().toISOString()
      }))
    }

    // Send current status to master
    ws.send(JSON.stringify({
      type: 'MASTER_OBSERVER_STATUS',
      status: 'connected',
      sessionId: message.sessionId,
      timestamp: new Date().toISOString()
    }))
  }

  /**
   * Handle master observer left
   */
  _handleMasterObserverLeft(ws, message) {
    const session = this.sessionManager.getClientSession(ws)
    if (session && session.isMasterObserver) {
      // Notify other clients in session
      this.broadcastToSession(session.sessionId, {
        type: 'MASTER_OBSERVER_LEFT',
        masterId: message.masterId,
        masterName: message.masterName,
        timestamp: new Date().toISOString()
      }, ws)

      this.logger.logInfo('MASTER_OBSERVER', `Master observer left: ${message.masterId}`, {
        sessionId: session.sessionId,
        masterId: message.masterId
      })
    }
  }

  /**
   * Handle user joined
   */
  _handleUserJoined(ws, message) {
    const sessionId = message.sessionId || 'default'

    // Check if joining is disabled for this session (only blocks non-hosts joining existing rooms)
    const existingRoom = this.sessionManager.getSessionRoom(sessionId)
    if (existingRoom && existingRoom.joinEnabled === false) {
      ws.send(JSON.stringify({
        type: 'SESSION_ERROR',
        error: 'The host has disabled joining for this session.',
        code: 'JOIN_DISABLED'
      }))
      return
    }

    // Debug: Log the password value being received
    this.logger.logInfo('WS', `USER_JOINED password validation: sessionId=${sessionId}, providedPassword="${message.password}" (type: ${typeof message.password})`, {
      sessionId,
      providedPassword: message.password,
      passwordType: typeof message.password
    })

    // Validate password before allowing join
    const passwordValidation = this.sessionManager.validateSessionPassword(sessionId, message.password)
    if (!passwordValidation.valid) {
      ws.send(JSON.stringify({
        type: 'SESSION_ERROR',
        error: passwordValidation.reason || 'Password validation failed',
        code: 'INVALID_PASSWORD'
      }))
      this.logger.logWarn('WS', 'Join rejected due to invalid password', {
        sessionId,
        userName: message.userName,
        providedPassword: message.password,
        validationResult: passwordValidation
      })
      return
    }

    const result = this.sessionManager.addClientToSession(ws, sessionId, {
      userId: message.userId,
      userName: message.userName,
      topic: message.topic || 'default',
      password: message.password,
      conditionId: message.conditionId
    })

    // Debug: Log password after creation
    this.logger.logInfo('WS', `Client added to session with password: "${message.password}"`, {
      sessionId,
      password: message.password
    })

    if (!result.success) {
      // Room is full - send error
      ws.send(JSON.stringify({
        type: 'SESSION_ERROR',
        error: result.reason,
        currentUsers: result.currentUsers
      }))
      return
    }

    // Notify other users in session about join
    const session = this.sessionManager.getClientSession(ws)
    if (session && session.sessionId) {
      this.broadcastToSession(session.sessionId, {
        type: 'USER_JOINED',
        userId: message.userId,
        userName: message.userName,
        isHost: result.isHost,
        timestamp: new Date().toISOString()
      }, ws)

      // Send room status to joining participant (including host info)
      ws.send(JSON.stringify({
        type: 'SESSION_STATUS',
        sessionId: session.sessionId,
        roomSize: result.roomSize,
        maxUsers: result.maxUsers,
        isRoomFull: result.roomSize >= result.maxUsers,
        isHost: result.isHost
      }))

      const roomState = this.sessionManager.getSessionRoom(session.sessionId)
      if (roomState && ws.readyState === 1) {
        ws.send(JSON.stringify({
          type: 'MASTER_VIDEO_VISIBILITY_UPDATE',
          visible: roomState.masterVideoVisible !== false,
          timestamp: new Date().toISOString()
        }))
      }

      // Send status update to other users in session
      const room = this.sessionManager.getSessionRoom(session.sessionId)
      if (room) {
        room.clients.forEach(otherWs => {
          if (otherWs !== ws && otherWs.readyState === 1) {
            const otherSession = this.sessionManager.getClientSession(otherWs)
            const otherIsHost = otherSession ? otherSession.isHost : false

            otherWs.send(JSON.stringify({
              type: 'SESSION_STATUS',
              sessionId: session.sessionId,
              roomSize: result.roomSize,
              maxUsers: result.maxUsers,
              isRoomFull: result.roomSize >= result.maxUsers,
              isHost: otherIsHost
            }))

            this.logger.logInfo('SESSION', `Sent status to existing user`, {
              userId: otherSession?.userId,
              isHost: otherIsHost,
              roomSize: result.roomSize
            })
          }
        })
      }
    }
  }

  /**
   * Handle conversation update
   */
  _handleConversationUpdate(ws, message) {
    if (!message.conversation) return

    const conv = message.conversation
    this.logger.logDebug('CONVERSATION', 'Processing conversation data', conv)

    // Save to session conversation history
    const session = this.sessionManager.getClientSession(ws)
    if (session && session.sessionId) {
      const room = this.sessionManager.getSessionRoom(session.sessionId)
      if (room) {
        room.conversationHistory.push({
          ...conv,
          timestamp: conv.timestamp || new Date().toISOString()
        })

        // Record in session-specific log
        this.logger.logSessionInfo(session.sessionId, 'CONVERSATION', `${conv.type}: ${conv.message}`, {
          speaker: conv.speaker || 'unknown',
          type: conv.type,
          messageLength: conv.message ? conv.message.length : 0
        })

        // Limit history to prevent memory issues (keep latest 500)
        if (room.conversationHistory.length > 500) {
          room.conversationHistory = room.conversationHistory.slice(-500)
        }
      }
    }

    // Handle AI response logic (skip if noAiResponse flag is set)
    if (conv.noAiResponse) {
      this.logger.logDebug('AI-SKIP', 'Skipping AI response due to noAiResponse flag', {
        speaker: conv.speaker,
        message: conv.message
      })
    } else if (conv.type === 'user' && conv.shouldTriggerAI !== true) {
      this.logger.logDebug('AI-SKIP', 'Skipping AI response - keyword not detected', {
        speaker: conv.speaker,
        message: conv.message,
        shouldTriggerAI: conv.shouldTriggerAI
      })
    } else if (conv.type === 'user' && conv.speaker !== 'System' && conv.speaker !== 'Active Agent' && conv.shouldTriggerAI === true) {
      this.logger.logDebug('AI-SKIP', `Skipping server-side AI response (handled by client)`, {
        speaker: conv.speaker,
        message: conv.message,
        keywordDetected: conv.shouldTriggerAI
      })
    } else {
      this.logger.logDebug('AI-SKIP', 'Skipping AI response', {
        type: conv.type,
        speaker: conv.speaker,
        reason: 'Not a user message or from system/agent'
      })
    }
  }

  /**
   * Handle conversation display only
   */
  _handleConversationDisplayOnly(ws, message) {
    if (!message.conversation) return

    const conv = message.conversation
    this.logger.logDebug('CONVERSATION-DISPLAY', 'Processing display-only conversation data', conv)

    // Save to session conversation history
    const session = this.sessionManager.getClientSession(ws)
    if (session && session.sessionId) {
      const room = this.sessionManager.getSessionRoom(session.sessionId)
      if (room) {
        room.conversationHistory.push({
          ...conv,
          timestamp: conv.timestamp || new Date().toISOString()
        })

        // Record in session-specific log
        this.logger.logSessionInfo(session.sessionId, 'CONVERSATION', `${conv.type}: ${conv.message}`, {
          speaker: conv.speaker || 'unknown',
          type: conv.type,
          messageLength: conv.message ? conv.message.length : 0
        })

        // Limit history
        if (room.conversationHistory.length > 500) {
          room.conversationHistory = room.conversationHistory.slice(-500)
        }
      }
    }
    // No AI response generated - display only
  }

  /**
   * Handle AI response request
   */
  _handleAIResponseRequest(ws, message) {
    this.logger.logDebug('AI-RESPONSE-REQUEST', 'Received AI response request from client', {
      speaker: message.speaker,
      message: message.message,
      timestamp: message.timestamp
    })
    // Will be broadcast to master client in the general broadcast processing
  }

  /**
   * Handle debug command
   */
  _handleDebugCommand(ws, message) {
    const session = this.sessionManager.getClientSession(ws)
    this.logger.logInfo('DEBUG-CMD', `Debug command received: ${message.command}`, {
      command: message.command,
      masterId: message.masterId,
      sessionId: message.sessionId
    })

    // Forward debug command to all clients in session
    if (session && session.sessionId) {
      this.broadcastToSession(session.sessionId, {
        type: 'DEBUG_COMMAND',
        command: message.command,
        data: message.data,
        masterId: message.masterId,
        timestamp: new Date().toISOString()
      }, ws)

      this.logger.logInfo('DEBUG-CMD', `Debug command broadcasted to session clients`, {
        command: message.command,
        sessionId: session.sessionId
      })
    }
  }

  /**
   * Handle settings update messages
   */
  _handleSettingsUpdate(ws, message) {
    const session = this.sessionManager.getClientSession(ws)

    console.log(`[Setting] ${message.type} from user ${session?.userId || 'unknown'}`)

    // Handle session management commands separately
    if (message.type === 'RESET_ALL_SESSION_DATA') {
      this.logger.logWarn('SESSION_RESET', `Complete session reset requested`, {
        sessionId: message.sessionId,
        masterName: message.masterName
      })

      // Perform complete reset
      this.sessionManager.resetAllSessionData(message.sessionId)

      // Notify all clients about the reset
      this.broadcastToSession(message.sessionId, {
        type: 'SESSION_RESET_COMPLETE',
        masterId: message.masterId,
        masterName: message.masterName,
        timestamp: new Date().toISOString(),
        resetType: 'complete'
      })

      // Send confirmation to sender
      ws.send(JSON.stringify({
        type: 'SESSION_RESET_CONFIRMED',
        status: 'success',
        resetType: 'complete',
        timestamp: new Date().toISOString()
      }))

      // Update connection counts
      this._broadcastConnectionUpdate()
      return
    } else if (message.type === 'CLEAR_ALL_PARTICIPANTS') {
      this.logger.logWarn('PARTICIPANTS_CLEAR', `Clear all participants requested`, {
        sessionId: message.sessionId
      })

      // Clear participants from the session
      this.sessionManager.clearSessionParticipants(message.sessionId)

      // Notify all clients
      this.broadcastToSession(message.sessionId, {
        type: 'PARTICIPANTS_CLEARED',
        masterId: message.masterId,
        masterName: message.masterName,
        timestamp: new Date().toISOString()
      })

      // Send confirmation to sender
      ws.send(JSON.stringify({
        type: 'PARTICIPANTS_CLEAR_CONFIRMED',
        status: 'success',
        timestamp: new Date().toISOString()
      }))

      // Update connection counts
      this._broadcastConnectionUpdate()
      return
    }

    if (message.type === 'MASTER_VIDEO_VISIBILITY_UPDATE' && session && session.sessionId) {
      const roomState = this.sessionManager.getSessionRoom(session.sessionId)
      if (roomState) {
        roomState.masterVideoVisible = message.visible !== false
      }
    }

    // Broadcast to all clients in session (except sender)
    if (session && session.sessionId) {
      const room = this.sessionManager.getSessionRoom(session.sessionId)
      if (room) {
        let broadcastCount = 0
        room.clients.forEach(client => {
          if (client !== ws && client.readyState === 1) {
            try {
              client.send(JSON.stringify(message))
              broadcastCount++
            } catch (error) {
              this.logger.logError('SETTING-BROADCAST', 'Failed to send message to client', { error: error.message })
            }
          }
        })
        console.log(`[Setting] Broadcasted ${message.type} to ${broadcastCount} clients`)
        this.logger.logInfo('SETTING-BROADCAST', `Broadcasted ${message.type} to ${broadcastCount} clients`)
      }
    }
  }

  /**
   * Rename a participant: broadcast new name to all session members
   */
  _handleRenameParticipant(ws, message) {
    const session = this.sessionManager.getClientSession(ws)
    if (!session || !session.sessionId) return

    this.broadcastToSession(session.sessionId, {
      type: 'PARTICIPANT_RENAMED',
      targetUserId: message.targetUserId,
      oldDisplayName: message.oldDisplayName,
      newDisplayName: message.newDisplayName,
      renamedBy: message.masterName || 'host',
      timestamp: new Date().toISOString()
    })

    this.logger.logInfo('RENAME', `Participant renamed: ${message.oldDisplayName} -> ${message.newDisplayName}`, {
      sessionId: session.sessionId, targetUserId: message.targetUserId
    })
  }

  /**
   * Kick a participant: notify the target and all session members
   */
  _handleKickParticipant(ws, message) {
    const session = this.sessionManager.getClientSession(ws)
    if (!session || !session.sessionId) return

    const sessionId = session.sessionId
    const room = this.sessionManager.getSessionRoom(sessionId)
    if (!room) return

    // Notify the kicked user specifically
    room.clients.forEach(clientWs => {
      const clientSession = this.sessionManager.getClientSession(clientWs)
      if (clientSession && clientSession.userId === message.targetUserId && clientWs.readyState === 1) {
        clientWs.send(JSON.stringify({
          type: 'YOU_WERE_KICKED',
          kickedBy: message.masterName || 'host',
          timestamp: new Date().toISOString()
        }))
      }
    })

    // Broadcast to everyone in session so all clients remove the participant locally
    this.broadcastToSession(sessionId, {
      type: 'PARTICIPANT_KICKED',
      targetUserId: message.targetUserId,
      targetDisplayName: message.targetDisplayName,
      kickedBy: message.masterName || 'host',
      timestamp: new Date().toISOString()
    })

    this.logger.logInfo('KICK', `Participant kicked: ${message.targetDisplayName}`, {
      sessionId, targetUserId: message.targetUserId, by: message.masterName
    })
  }

  /**
   * Update session password
   */
  _handleUpdateSessionPassword(ws, message) {
    const session = this.sessionManager.getClientSession(ws)
    if (!session || !session.sessionId) return

    const room = this.sessionManager.getSessionRoom(session.sessionId)
    if (!room) return

    room.password = message.password || null

    ws.send(JSON.stringify({
      type: 'SESSION_PASSWORD_UPDATED',
      hasPassword: !!room.password,
      timestamp: new Date().toISOString()
    }))

    this.logger.logInfo('SESSION', `Session password updated`, {
      sessionId: session.sessionId, hasPassword: !!room.password
    })
  }

  /**
   * Toggle whether new participants can join
   */
  _handleToggleJoinEnabled(ws, message) {
    const session = this.sessionManager.getClientSession(ws)
    if (!session || !session.sessionId) return

    const room = this.sessionManager.getSessionRoom(session.sessionId)
    if (!room) return

    room.joinEnabled = message.enabled !== false

    ws.send(JSON.stringify({
      type: 'JOIN_TOGGLE_UPDATED',
      enabled: room.joinEnabled,
      timestamp: new Date().toISOString()
    }))

    this.logger.logInfo('SESSION', `Join enabled toggled: ${room.joinEnabled}`, { sessionId: session.sessionId })
  }

  /**
   * Broadcast connection update to all clients
   */
  _broadcastConnectionUpdate() {
    const participantCount = this.sessionManager.getParticipantCount()

    const connectionMessage = {
      type: 'CONNECTION_UPDATE',
      count: participantCount,
      timestamp: new Date().toISOString(),
      maxUsers: 50,
      isRoomFull: participantCount >= 50
    }

    this.logger.logInfo('WS', 'Broadcasting updated connection count', {
      count: participantCount,
      totalConnections: this.sessionManager.wsClients.size
    })

    this.broadcastToAllIncludingSelf(connectionMessage)
  }

  /**
   * Broadcast to all clients except specified one
   */
  broadcastToAll(message, excludeWs = null) {
    const messageStr = JSON.stringify(message)
    let sentCount = 0
    let failedCount = 0

    this.sessionManager.wsClients.forEach(client => {
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr)
          sentCount++
        } catch (error) {
          this.logger.logError('WS-BROADCAST', 'Send failed', { error: error.message })
          this.sessionManager.removeClient(client)
          failedCount++
        }
      }
    })

    this.logger.logDebug('WS-BROADCAST', `Message broadcasted`, {
      type: message.type,
      sentCount,
      failedCount,
      totalClients: this.sessionManager.wsClients.size
    })
  }

  /**
   * Broadcast to all clients including self
   */
  broadcastToAllIncludingSelf(message) {
    const messageStr = JSON.stringify(message)
    let sentCount = 0
    let failedCount = 0

    this.sessionManager.wsClients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr)
          sentCount++
        } catch (error) {
          this.logger.logError('WS-BROADCAST-ALL', 'Send failed', { error: error.message })
          this.sessionManager.removeClient(client)
          failedCount++
        }
      }
    })

    this.logger.logDebug('WS-BROADCAST-ALL', `Message broadcasted to all`, {
      type: message.type,
      sentCount,
      failedCount,
      totalClients: this.sessionManager.wsClients.size
    })
  }

  /**
   * Broadcast to all clients in a session
   */
  broadcastToSession(sessionId, message, excludeWs = null) {
    const room = this.sessionManager.getSessionRoom(sessionId)
    if (room) {
      let sentCount = 0
      let failedCount = 0
      room.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === 1) { // OPEN state
          try {
            client.send(JSON.stringify(message))
            sentCount++
          } catch (error) {
            failedCount++
            this.logger.logError('WS-BROADCAST-SESSION', 'Failed to send message', { error: error.message })
          }
        }
      })
      this.logger.logDebug('WS-BROADCAST-SESSION', `Message broadcasted to session ${sessionId}`, {
        type: message.type,
        sentCount: sentCount,
        failedCount: failedCount,
        totalClientsInRoom: room.clients.size,
        excludedSender: excludeWs ? 'yes' : 'no'
      })
    } else {
      this.logger.logDebug('WS-BROADCAST-SESSION', `Session ${sessionId} not found - cannot broadcast`)
    }
  }

  /**
   * Broadcast settings update to all connected clients
   */
  broadcastSettingsUpdate(settings) {
    const message = {
      type: 'SETTINGS_UPDATE',
      settings: settings,
      timestamp: new Date().toISOString()
    }

    // Broadcast to all rooms
    let broadcastCount = 0
    this.sessionManager.sessionRooms.forEach((room, sessionId) => {
      room.clients.forEach((client) => {
        if (client.readyState === 1) { // OPEN state
          try {
            client.send(JSON.stringify(message))
            broadcastCount++
          } catch (err) {
            this.logger.logError('SETTINGS-BROADCAST', 'Failed to send settings update', {
              sessionId,
              error: err.message
            })
          }
        }
      })
    })

    this.logger.logInfo('SETTINGS-BROADCAST', 'Settings broadcasted to all clients', {
      roomCount: this.sessionManager.sessionRooms.size,
      clientCount: broadcastCount
    })
  }
}

module.exports = WebSocketManager
