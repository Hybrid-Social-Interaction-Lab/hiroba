/**
 * SessionManager
 * Manages WebSocket clients and session rooms
 */
class SessionManager {
  constructor(logger) {
    this.logger = logger
    this._wsClients = new Set()
    this._clientSessions = new Map() // WebSocket -> session info
    this._sessionRooms = new Map()   // sessionId -> { clients: Set, topic: string, createdAt: Date, maxUsers: 50 }
  }

  /**
   * Get all connected WebSocket clients
   */
  get wsClients() {
    return this._wsClients
  }

  /**
   * Get client sessions map
   */
  get clientSessions() {
    return this._clientSessions
  }

  /**
   * Get session rooms map
   */
  get sessionRooms() {
    return this._sessionRooms
  }

  /**
   * Add a new WebSocket client
   */
  addClient(ws) {
    this._wsClients.add(ws)
    this._clientSessions.set(ws, {
      connectedAt: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      userId: null,
      userName: null,
      canvasState: {
        isOffscreenTransferred: false,
        lastRenderAttempt: null,
        renderingParticipants: new Set()
      }
    })
  }

  /**
   * Remove a WebSocket client
   */
  removeClient(ws) {
    this._wsClients.delete(ws)
    this._clientSessions.delete(ws)
  }

  /**
   * Get session for a client
   */
  getClientSession(ws) {
    return this._clientSessions.get(ws)
  }

  /**
   * Update client session
   */
  updateClientSession(ws, data) {
    const session = this._clientSessions.get(ws)
    if (session) {
      Object.assign(session, data)
    }
  }

  /**
   * Get or create a session room
   */
  getOrCreateSessionRoom(sessionId, topic, password = null) {
    if (!this._sessionRooms.has(sessionId)) {
      this._sessionRooms.set(sessionId, {
        clients: new Set(),
        topic: topic || sessionId,
        createdAt: new Date(),
        maxUsers: 50,
        hostUserId: null,
        masterVideoVisible: true,
        conversationHistory: [],
        conditionId: null,
        password: password || null
      })
      this.logger.logInfo('SESSION', `Created new session room: ${sessionId}`, { topic, hasPassword: !!password })
    }
    return this._sessionRooms.get(sessionId)
  }

  /**
   * Add a client to a session
   */
  addClientToSession(ws, sessionId, userInfo) {
    const room = this.getOrCreateSessionRoom(sessionId, userInfo.topic, userInfo.password)

    // Persist the condition ID for this session, if provided.
    if (!room.conditionId && userInfo && typeof userInfo.conditionId === 'string') {
      room.conditionId = userInfo.conditionId
      this.logger.setSessionLogSuffix(sessionId, room.conditionId)
    }

    // Master observers are not subject to room capacity limits
    const session = this._clientSessions.get(ws)
    const isMasterObserver = session && session.isMasterObserver

    // Calculate number of regular participants (excluding master observers)
    const regularClientCount = Array.from(room.clients)
      .filter(client => {
        const clientSession = this._clientSessions.get(client)
        return !(clientSession && clientSession.isMasterObserver)
      }).length

    if (!isMasterObserver && regularClientCount >= room.maxUsers) {
      return { success: false, reason: 'Room is full', currentUsers: regularClientCount }
    }

    // Host determination: 
    // 1. First regular user to join is the host
    // 2. If room has no hostUserId, the current joining regular user becomes the host
    const isHost = !isMasterObserver && (regularClientCount === 0 || !room.hostUserId)

    this.logger.logInfo('SESSION', `Host check for ${userInfo.userName}`, {
      isMasterObserver,
      regularClientCount,
      isHost,
      sessionId,
      roomClientsSize: room.clients.size,
      roomHostUserId: room.hostUserId
    })

    // Record host in room when determined
    if (isHost) {
      room.hostUserId = userInfo.userId
      this.logger.logInfo('SESSION', `Set host for session: ${sessionId}`, { hostUserId: userInfo.userId })
    }

    room.clients.add(ws)
    if (session) {
      session.sessionId = sessionId
      session.userId = userInfo.userId
      session.userName = userInfo.userName
      session.topic = userInfo.topic
      session.isHost = isHost
    }

    // Emergency processing if no host exists (theoretically impossible, but for safety)
    if (!room.hostUserId && room.clients.size > 0) {
      room.hostUserId = userInfo.userId
      if (session) session.isHost = true
      this.logger.logWarn('SESSION', `Emergency host assignment for session: ${sessionId}`, { userId: userInfo.userId })
    }

    // Recalculate regular participant count (after adding master observer)
    const finalRegularClientCount = Array.from(room.clients)
      .filter(client => {
        const clientSession = this._clientSessions.get(client)
        return !(clientSession && clientSession.isMasterObserver)
      }).length

    this.logger.logInfo('SESSION', `User joined session: ${sessionId}`, {
      userId: userInfo.userId,
      userName: userInfo.userName,
      isHost: isHost,
      roomSize: finalRegularClientCount,
      totalClients: room.clients.size,
      maxUsers: room.maxUsers
    })

    // Record in session-specific log
    this.logger.logSessionInfo(sessionId, 'USER-JOIN', `User joined: ${userInfo.userName}`, {
      userId: userInfo.userId,
      isHost: isHost,
      roomSize: finalRegularClientCount
    })

    return { success: true, roomSize: finalRegularClientCount, maxUsers: room.maxUsers, isHost: isHost }
  }

  /**
   * Remove a client from their session
   */
  removeClientFromSession(ws) {
    const session = this._clientSessions.get(ws)
    if (session && session.sessionId) {
      const room = this._sessionRooms.get(session.sessionId)
      if (room) {
        room.clients.delete(ws)
        this.logger.logInfo('SESSION', `User left session: ${session.sessionId}`, {
          userId: session.userId,
          userName: session.userName,
          isHost: session.isHost,
          remainingClients: room.clients.size
        })

        // If the host is leaving, pick a new host from remaining regular participants
        if (session.isHost) {
          this.logger.logInfo('SESSION', `Host ${session.userName} left session: ${session.sessionId}. Picking new host.`)
          room.hostUserId = null
          
          // Find another regular participant to be the host
          const remainingRegularClients = Array.from(room.clients).filter(client => {
            const clientSession = this._clientSessions.get(client)
            return clientSession && !clientSession.isMasterObserver
          })
          
          if (remainingRegularClients.length > 0) {
            const newHostWs = remainingRegularClients[0]
            const newHostSession = this._clientSessions.get(newHostWs)
            if (newHostSession) {
              newHostSession.isHost = true
              room.hostUserId = newHostSession.userId
              this.logger.logInfo('SESSION', `Assigned new host: ${newHostSession.userName} (${newHostSession.userId})`)
              
              // Notify the new host and others about the change
              const sessionStatusMessage = {
                type: 'SESSION_STATUS',
                sessionId: session.sessionId,
                roomSize: room.clients.size, // This includes the leaving user still? No, it was deleted above.
                maxUsers: room.maxUsers,
                isHost: true
              }
              newHostWs.send(JSON.stringify(sessionStatusMessage))
              
              // Broadcast to others that there's a new host
              room.clients.forEach(client => {
                if (client !== newHostWs && client.readyState === 1) {
                  client.send(JSON.stringify({
                    type: 'USER_JOINED', // Reuse USER_JOINED to signal host change or send SESSION_STATUS
                    userId: newHostSession.userId,
                    userName: newHostSession.userName,
                    isHost: true,
                    timestamp: new Date().toISOString(),
                    note: 'Host reassigned'
                  }))
                }
              })
            }
          }
        }

        // Record in session-specific log
        this.logger.logSessionInfo(session.sessionId, 'USER-LEAVE', `User left: ${session.userName}`, {
          userId: session.userId,
          remainingClients: room.clients.size
        })

        // Delete room if empty
        if (room.clients.size === 0) {
          this.logger.logInfo('SESSION', `Deleted empty session room: ${session.sessionId}`)
          this.logger.logSessionInfo(session.sessionId, 'SESSION-END', 'Session ended - all users left', {
            totalDuration: Date.now() - new Date(room.createdAt).getTime()
          })
          // Close session log
          this.logger.closeSessionLog(session.sessionId)
          this._sessionRooms.delete(session.sessionId)
        }
      }
    }
  }

  /**
   * Reset all session data
   */
  resetAllSessionData(sessionId) {
    this.logger.logWarn('SESSION_RESET', `Performing complete reset for session: ${sessionId}`)

    const room = this._sessionRooms.get(sessionId)
    if (room) {
      // Disconnect all clients from the session (except master observers)
      const clientsToDisconnect = []
      room.clients.forEach(client => {
        const session = this._clientSessions.get(client)
        if (session && !session.isMasterObserver) {
          clientsToDisconnect.push(client)
        }
      })

      // Remove non-master clients from session
      clientsToDisconnect.forEach(client => {
        const session = this._clientSessions.get(client)
        if (session) {
          this.logger.logInfo('SESSION_RESET', `Removing client from session: ${session.userId}`, {
            sessionId: session.sessionId,
            userName: session.userName
          })

          room.clients.delete(client)

          // Reset client session but keep WebSocket connection
          this._clientSessions.set(client, {
            connectedAt: session.connectedAt,
            lastActivity: new Date().toISOString(),
            userId: null,
            userName: null,
            sessionId: null
          })
        }
      })

      // Reset room state but keep it for master observers
      room.hostUserId = null
      room.conversationHistory = []

      this.logger.logInfo('SESSION_RESET', `Session ${sessionId} reset complete`, {
        remainingClients: room.clients.size,
        disconnectedClients: clientsToDisconnect.length
      })
    }
  }

  /**
   * Clear all participants from a session
   */
  clearSessionParticipants(sessionId) {
    this.logger.logInfo('PARTICIPANTS_CLEAR', `Clearing participants for session: ${sessionId}`)

    const room = this._sessionRooms.get(sessionId)
    if (room) {
      // Keep track of master observers
      const masterObservers = []
      const regularClients = []

      room.clients.forEach(client => {
        const session = this._clientSessions.get(client)
        if (session && session.isMasterObserver) {
          masterObservers.push(client)
        } else if (session) {
          regularClients.push(client)
        }
      })

      // Remove regular clients
      regularClients.forEach(client => {
        const session = this._clientSessions.get(client)
        if (session) {
          this.logger.logInfo('PARTICIPANTS_CLEAR', `Removing participant: ${session.userName}`, {
            userId: session.userId,
            sessionId: session.sessionId
          })

          room.clients.delete(client)

          // Reset client session
          this._clientSessions.set(client, {
            connectedAt: session.connectedAt,
            lastActivity: new Date().toISOString(),
            userId: null,
            userName: null,
            sessionId: null
          })
        }
      })

      // Reset host
      room.hostUserId = null

      this.logger.logInfo('PARTICIPANTS_CLEAR', `Participants cleared for session ${sessionId}`, {
        removedClients: regularClients.length,
        remainingMasters: masterObservers.length
      })
    }
  }

  /**
   * Get participant count (excluding master observers)
   */
  getParticipantCount() {
    const actualParticipants = Array.from(this._wsClients).filter(client => {
      const session = this._clientSessions.get(client)
      return session && !session.isMasterObserver
    })
    return actualParticipants.length
  }

  /**
   * Get session room
   */
  getSessionRoom(sessionId) {
    return this._sessionRooms.get(sessionId)
  }

  /**
   * Validate session password
   * Returns { valid: boolean, reason?: string }
   */
  validateSessionPassword(sessionId, providedPassword) {
    const room = this._sessionRooms.get(sessionId)

    // If session doesn't exist yet, allow join (will be created with the provided password)
    if (!room) {
      this.logger.logInfo('SESSION', `Password validation: session "${sessionId}" doesn't exist yet, allowing join`, {
        sessionId,
        providedPassword
      })
      return { valid: true }
    }

    // Log current validation
    this.logger.logInfo('SESSION', `Password validation: sessionId="${sessionId}", room.password="${room.password}" (type: ${typeof room.password}), provided="${providedPassword}" (type: ${typeof providedPassword})`, {
      sessionId,
      roomPassword: room.password,
      providedPassword
    })

    if (!room.password) {
      this.logger.logInfo('SESSION', `Session has no password, allowing join`, { sessionId })
      return { valid: true }
    }

    if (!providedPassword) {
      return { valid: false, reason: 'Password is required for this session' }
    }

    if (providedPassword !== room.password) {
      this.logger.logInfo('SESSION', `Password mismatch: "${providedPassword}" !== "${room.password}"`, {
        sessionId,
        provided: providedPassword,
        stored: room.password
      })
      return { valid: false, reason: 'Invalid password' }
    }

    return { valid: true }
  }

  /**
   * Kick a participant from a session (close their WebSocket)
   */
  kickParticipant(sessionId, userId) {
    const room = this._sessionRooms.get(sessionId)
    if (!room) return false

    let kicked = false
    room.clients.forEach((ws) => {
      const session = this._clientSessions.get(ws)
      if (session && session.userId === userId) {
        ws.close(4000, 'Kicked from session')
        kicked = true
      }
    })

    return kicked
  }

  /**
   * Mute a participant (send MUTE message via WebSocket)
   */
  muteParticipant(sessionId, userId) {
    const room = this._sessionRooms.get(sessionId)
    if (!room) return false

    let muted = false
    room.clients.forEach((ws) => {
      const session = this._clientSessions.get(ws)
      if (session && session.userId === userId && ws.readyState === 1) { // 1 = OPEN
        try {
          ws.send(JSON.stringify({ type: 'MUTE' }))
          muted = true
        } catch (err) {
          this.logger.logWarn('SESSION', 'Failed to send MUTE to client', { userId, error: err.message })
        }
      }
    })

    return muted
  }
}

module.exports = SessionManager
