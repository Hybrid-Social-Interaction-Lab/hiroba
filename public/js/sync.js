function initializeWebSocketConnection() {
  
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const wsUrl = `${protocol}//${window.location.host}`
  
  // 既存の接続をクリーンアップ
  if (syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN) {
    syncWebSocket.close()
  }
  
  syncWebSocket = new WebSocket(wsUrl)
  
  syncWebSocket.onopen = () => {
    updateWebSocketStatus()
    
    // 接続時にユーザー情報を送信
    if (client && client.getCurrentUserInfo()) {
      const userInfo = client.getCurrentUserInfo()
      
      // セッション情報を含めて送信
      const sessionTopic = document.getElementById('session_topic')?.value || 'default'
      const sessionId = generateSessionId(sessionTopic)
      const sessionPassword = document.getElementById('session_pwd').value || null

      // ホスト判定はサーバー側で行う
      sendWebSocketMessage({
        type: 'USER_JOINED',
        userId: userInfo.userId,
        userName: userInfo.displayName,
        sessionId: sessionId,
        topic: sessionTopic,
        password: sessionPassword,
        condition: getConditionFromPathname(),
        timestamp: new Date().toISOString()
      })
    } else {
    }
  }
  
  syncWebSocket.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      
      // Handle canvas synchronization messages
      if (message.type === 'CANVAS_SYNC_STATE') {
        // Store canvas state for coordination but don't act on it directly
        // This helps other clients understand the current canvas state
        return;
      }
      
      if (message.type === 'VIDEO_RENDER_LOCK') {
        // Mark that another client is rendering this participant
        // Find canvas by userId - search through all remote canvas elements
        const allCanvases = document.querySelectorAll('[id^="remote-canvas-"]');
        for (let canvas of allCanvases) {
          // Check if this canvas corresponds to the target user
          const participant = Array.from(remoteParticipants.entries()).find(([name, info]) => info.userId === message.targetUserId);
          if (participant && canvas.id === `remote-canvas-${participant[0]}`) {
            canvas.style.borderColor = '#ff6b6b'; // Red border to indicate locked
            canvas.title = `Being rendered by client ${message.renderingClient}`;
            break;
          }
        }
        return;
      }
      
      if (message.type === 'VIDEO_RENDER_UNLOCK') {
        // Remove rendering lock indicator
        const allCanvases = document.querySelectorAll('[id^="remote-canvas-"]');
        for (let canvas of allCanvases) {
          const participant = Array.from(remoteParticipants.entries()).find(([name, info]) => info.userId === message.targetUserId);
          if (participant && canvas.id === `remote-canvas-${participant[0]}`) {
            canvas.style.borderColor = '#00bfff'; // Reset to normal blue
            canvas.title = '';
            break;
          }
        }
        return;
      }
      
      // パラメータ更新メッセージの特別ログ
      if (['SILENCE_THRESHOLD_UPDATE', 'PERIODIC_INTERVAL_UPDATE', 'SILENCE_MESSAGES_UPDATE', 'PERIODIC_MESSAGES_UPDATE', 'NAME_KEYWORDS_UPDATE'].includes(message.type)) {
      }
      
      handleWebSocketMessage(message)
    } catch (error) {
      console.error('<i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> [WS CLIENT] Parse error:', error)
    }
  }
  
  syncWebSocket.onclose = () => {
    updateWebSocketStatus()
    // 再接続を試行
    setTimeout(() => {
      if (client && client.getCurrentUserInfo()) {
        initializeWebSocketConnection()
      }
    }, 3000)
  }
  
  syncWebSocket.onerror = (error) => {
    console.error('<i data-lucide="zap" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> [WS CLIENT] ERROR:', error)
    updateWebSocketStatus()
  }
}

function sendWebSocketMessage(message) {
  if (syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN) {
    // セッションIDを自動で追加（USER_JOINEDではすでに設定済み）
    if (!message.sessionId && message.type !== 'USER_JOINED') {
      const sessionTopic = document.getElementById('session_topic')?.value || 'default'
      const sessionId = generateSessionId(sessionTopic)
      message.sessionId = sessionId
    }
    
    syncWebSocket.send(JSON.stringify(message))
  } else {
    console.warn(`<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> [WS CLIENT] CANNOT SEND ${message.type} - State: ${syncWebSocket?.readyState}`)
  }
}

// グローバルに公開してHTMLから使用可能にする
window.sendWebSocketMessage = sendWebSocketMessage
window.updateSessionStatusDisplay = updateSessionStatusDisplay

// Alias for agent-behavior.js compatibility
window.sendSimpleChatMessage = sendWebSocketMessage

function handleSyncMessage(message) {
  switch (message.type) {
    case 'CONNECTION_UPDATE':
      updateConnectionDisplay(message.count)
      break
      
    case 'USER_JOINED':
      // ユーザー参加通知
      currentSessionUsers.add(message.userId)
      addSystemMessage(`${message.userName} が参加しました${message.isHost ? ' (ホスト)' : ''}`)
      
      // セッション状態を更新
      updateSessionStatusDisplay()
      refreshHostParticipantFlags()
      applyMasterVideoVisibilityToHostCanvas()
      break
      
    case 'USER_LEFT':
      // ユーザー離脱通知
      currentSessionUsers.delete(message.userId)
      addSystemMessage(`${message.userName} が退出しました`)
      
      // セッション状態を更新
      updateSessionStatusDisplay()
      refreshHostParticipantFlags()
      applyMasterVideoVisibilityToHostCanvas()
      break
      
    case 'SESSION_STATUS':
      // セッション状態更新
      
      // ホスト状態を更新
      if (typeof message.isHost === 'boolean') {
        const wasHost = isSessionHost
        isSessionHost = message.isHost
        console.log(`[SYNC] SESSION_STATUS received. isHost: ${isSessionHost} (was: ${wasHost})`)
        console.trace('[SYNC] Host status update trace')
        if (isSessionHost && !wasHost) {
          console.log('[SYNC] This client is now the host')
        } else if (!isSessionHost && wasHost) {
          console.log('[SYNC] This client is no longer the host')
        }
      }
      
      updateSessionStatusDisplay(message.roomSize, message.maxUsers)
      refreshHostParticipantFlags()
      applyMasterVideoVisibilityToHostCanvas()
      break

    case 'MASTER_VIDEO_VISIBILITY_UPDATE':
      handleMasterVideoVisibilityUpdate(message)
      break
      
    case 'CONVERSATION_UPDATE':
      // 会話履歴の同期
      if (message.conversation) {
        const conv = message.conversation
        // 重複チェック
        const existingConv = conversationHistory.find(c => c.id === conv.id)
        if (!existingConv) {
          conversationHistory.push(conv)
          updateConversationDisplay()

          // ユーザーメッセージの場合、タイマーをリセット
          if (conv.type === 'user' && window.agentBehaviorManager) {
            window.agentBehaviorManager.resetTimers()
          }

          // ユーザーメッセージの場合、マスターがキーワード検知を実行（リモートユーザーの発話にも対応）
          if (conv.type === 'user' && isAgentMaster) {
            const shouldTriggerAI = checkKeywordDetection(conv.message)

            if (shouldTriggerAI) {
              // キーワード検知のクールダウンチェック
              const lastTriggerTime = lastKeywordTriggerMap.get(conv.speaker)
              const now = Date.now()

              if (lastTriggerTime && (now - lastTriggerTime) < KEYWORD_TRIGGER_COOLDOWN) {
                const remainingTime = ((KEYWORD_TRIGGER_COOLDOWN - (now - lastTriggerTime)) / 1000).toFixed(1)
              } else {
                lastKeywordTriggerMap.set(conv.speaker, now)
                // 古いエントリを削除（メモリリーク防止）
                if (lastKeywordTriggerMap.size > 50) {
                  const oldestKey = lastKeywordTriggerMap.keys().next().value
                  lastKeywordTriggerMap.delete(oldestKey)
                }
                generateNameMentionResponse(conv.message, conv.speaker)
              }
            }
          }

          // AIエージェントの発話の場合、音声も再生（スレーブクライアントで）
          if (!isAgentMaster && (conv.type === 'ai' || conv.type === 'ai_response' || conv.type === 'agent') && window.avatars && window.avatars[0]) {
            window.avatars[0].speak(conv.message)
          }
        }
      } else {
      }
      break

    case 'AI_RESPONSE_REQUEST':
      // 非マスタークライアントからのAI応答リクエスト

      // If name detection is disabled, ignore requests.
      if (typeof agentBehaviorSettings !== 'undefined' && !agentBehaviorSettings.nameDetection) {
        break
      }

      if (isAgentMaster) {
        // マスターの場合、クールダウンチェックを行ってからAI応答を生成
        const lastTriggerTime = lastKeywordTriggerMap.get(message.speaker)
        const now = Date.now()

        if (lastTriggerTime && (now - lastTriggerTime) < KEYWORD_TRIGGER_COOLDOWN) {
          const remainingTime = ((KEYWORD_TRIGGER_COOLDOWN - (now - lastTriggerTime)) / 1000).toFixed(1)
        } else {
          lastKeywordTriggerMap.set(message.speaker, now)
          generateNameMentionResponse(message.message, message.speaker)
        }
      } else {
      }
      break

    case 'AGENT_SPEECH':
      // エージェント発話の同期（廃止 - CONVERSATION_UPDATEを使用）
      if (message.text && message.agentName) {
        // アバター発話のみ実行（会話履歴追加はCONVERSATION_UPDATEで処理）
        if (!isAgentMaster && window.avatars && window.avatars[0]) {
          window.avatars[0].speak(message.text)
        }
      }
      break
      
    case 'DEBUG_INPUT':
      // デバッグ入力の同期（廃止 - CONVERSATION_UPDATEを使用）
      break
      
    case 'SILENCE_RESET':
      // 沈黙検知リセットの同期
      if (!isTimerMasterClient()) {
        updateSpeechActivity()
      }
      break
      
    case 'PERIODIC_SPEECH_RESET':
      // 定期発話リセットの同期
      if (!isTimerMasterClient()) {
        lastPeriodicSpeech = Date.now()
      }
      break
      
    case 'AGENT_STATUS_UPDATE':
      // エージェント状態の同期
      if (message.status && !isTimerMasterClient()) {
        isActiveAgentSpeaking = message.status.isActiveAgentSpeaking || false
        isUserSpeaking = message.status.isUserSpeaking || false
      }
      break
      
    case 'SILENCE_THRESHOLD_UPDATE':
      handleSilenceThresholdUpdate(message)
      break
      
    case 'PERIODIC_INTERVAL_UPDATE':
      handlePeriodicIntervalUpdate(message)
      break
      
    case 'SILENCE_MESSAGES_UPDATE':
      handleSilenceMessagesUpdate(message)
      break
      
    case 'PERIODIC_MESSAGES_UPDATE':
      handlePeriodicMessagesUpdate(message)
      break
      
    case 'NAME_KEYWORDS_UPDATE':
      handleNameKeywordsUpdate(message)
      break
      
    case 'SPEECH_ACTIVITY_UPDATE':
      handleSpeechActivityUpdate(message)
      break
      
    case 'TEST_MESSAGE':
      alert(`WebSocket test message received: "${message.message}" from ${message.sender}`)
      break
      
    case 'TIMER_SYNC':
      handleTimerSyncMessage(message)
      break
      
    case 'MASTER_SETTINGS_UPDATE':
      handleMasterSettingsUpdate(message)
      break

    case 'SETTINGS_UPDATE':
      handleSettingsBroadcastUpdate(message)
      break
      
    case 'MASTER_OBSERVER_JOIN':
      handleMasterObserverJoin(message)
      break
      
    case 'MASTER_OBSERVER_LEFT':
      handleMasterObserverLeft(message)
      break
      
    case 'SETTING_CHANGE_DENIED':
      console.warn('[Settings] Setting change denied by server:', message.reason)
      showTemporaryMessage(`Setting change denied: ${message.reason}`, 'error')
      break
      
    default:
  }
}

function syncConversationUpdate(conversation) {
  sendWebSocketMessage({
    type: 'CONVERSATION_UPDATE',
    conversation: conversation
  })
}

function syncConversationDisplayOnly(conversation) {
  sendWebSocketMessage({
    type: 'CONVERSATION_DISPLAY_ONLY',
    conversation: conversation
  })
}

function syncAgentSpeech(text, agentName) {
  sendWebSocketMessage({
    type: 'AGENT_SPEECH',
    text: text,
    agentName: agentName
  })
}

function syncDebugInput(userText, userName) {
  sendWebSocketMessage({
    type: 'DEBUG_INPUT',
    userText: userText,
    userName: userName
  })
}

function syncSilenceReset() {
  sendWebSocketMessage({
    type: 'SILENCE_RESET'
  })
}

function syncPeriodicSpeechReset() {
  sendWebSocketMessage({
    type: 'PERIODIC_SPEECH_RESET'
  })
}

function syncAgentStatus() {
  sendWebSocketMessage({
    type: 'AGENT_STATUS_UPDATE',
    status: {
      isActiveAgentSpeaking: isActiveAgentSpeaking,
      isUserSpeaking: isUserSpeaking
    }
  })
}

function handleRemoteDebugInput(userText, userName) {
  // リモートからのデバッグ入力を処理（画面には表示しない）

  // 会話履歴に追加（同期しない）
  addToConversationHistoryLocal(userName, userText, 'user')

  // キーワード検知（名前呼び検知）
  const shouldTriggerAI = checkKeywordDetection(userText)
  if (shouldTriggerAI) {
    generateNameMentionResponse(userText, userName)
  } else {
  }
}

function updateConnectionDisplay(count) {
  const connectionEl = document.getElementById('connection-count')
  if (connectionEl) {
    connectionEl.textContent = count
  } else {
    console.warn('<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> [UI] connection-count element not found!')
  }
}

/* ========== Session Status Display Update ============================ */
function updateSessionStatusDisplay(roomSize = null, maxUsers = 50) {
  const actualRoomSize = roomSize !== null ? roomSize : currentSessionUsers.size
  
  
  // セッション状態表示を更新
  const sessionStatus = document.getElementById('session-status')
  if (sessionStatus) {
    const hostIndicator = isSessionHost ? ' <i data-lucide="crown" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>' : ''
    sessionStatus.innerHTML = `<i data-lucide="tv" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> ${actualRoomSize}/${maxUsers} participants${hostIndicator}`
    if (window.lucide) lucide.createIcons()
    
    // 部屋が満員の場合の色変更
    if (actualRoomSize >= maxUsers) {
      sessionStatus.style.color = '#dc3545'  // 赤
    } else {
      sessionStatus.style.color = '#28a745'  // 緑
    }
  }
  
  // ホスト限定の設定パネルを表示/非表示
  updateHostOnlyElements()
  
  // エージェント設定コントロールを更新
  updateAgentSettingControls()
  updateMasterVideoVisibilityToggleUI()
}

/* ========== Host-Only Elements Control =============================== */
function updateHostOnlyElements() {
  const hostOnlyElements = document.querySelectorAll('.host-only')
  const masterOnlyElements = document.querySelectorAll('.master-only-setting')
  const canShowHostControls = isSessionHost || window.isMasterMode
  
  console.log(`[SYNC] Updating host/master UI elements. isHost: ${isSessionHost}, isMaster: ${window.isMasterMode}`)
  hostOnlyElements.forEach(element => {
    if (canShowHostControls) {
      element.style.display = 'block'
      element.style.opacity = '1'
    } else {
      element.style.display = 'none'
      element.style.opacity = '0.5'
    }
  })

  masterOnlyElements.forEach(element => {
    if (canShowHostControls) {
      element.style.display = 'block'
      element.style.opacity = '1'
    } else {
      element.style.display = 'none'
      element.style.opacity = '0.5'
    }
  })
}

/* ========== Agent Setting Controls (Host/Client Mode) =============== */
function updateAgentSettingControls() {
  const agentSettingsPanel = document.getElementById('agent-settings-panel')
  const agentSettingControls = document.querySelectorAll('.agent-setting-control')


  // Master mode overrides everything
  if (window.isMasterMode) {
    if (agentSettingsPanel) {
      agentSettingsPanel.classList.remove('host-mode', 'client-mode')
      agentSettingsPanel.classList.add('master-mode')
    }

    agentSettingControls.forEach(control => {
      control.disabled = false
      control.style.pointerEvents = 'auto'
      control.style.opacity = '1'
    })

    return
  }

  if (agentSettingsPanel) {
    // パネル全体のクラスを設定
    agentSettingsPanel.classList.remove('host-mode', 'client-mode', 'master-mode')
    if (isSessionHost) {
      agentSettingsPanel.classList.add('host-mode')
    } else {
      agentSettingsPanel.classList.add('client-mode')
    }
  }

  // 個別のコントロール要素を無効化/有効化
  agentSettingControls.forEach(control => {
    if (isSessionHost) {
      console.log(`[SYNC] Enabling control for host: ${control.id || control.name || 'unnamed'}`)
      control.disabled = false
      control.style.pointerEvents = 'auto'
      control.style.opacity = '1'
    } else {
      control.disabled = true
      control.style.pointerEvents = 'none'
      control.style.opacity = '0.6'
    }
  })
  
}

function setupAgentBehaviorToggleListeners() {
  const silenceToggle = document.getElementById('silence-detection-toggle')
  const periodicToggle = document.getElementById('periodic-speech-toggle')
  const nameToggle = document.getElementById('name-detection-toggle')

  if (silenceToggle && silenceToggle.dataset.listenerBound !== 'true') {
    silenceToggle.dataset.listenerBound = 'true'
    silenceToggle.addEventListener('change', (e) => {
      const enabled = Boolean(e.target.checked)
      agentBehaviorSettings.silenceDetection = enabled

      if (window.agentBehaviorManager?.settings?.silenceDetection) {
        window.agentBehaviorManager.settings.silenceDetection.enabled = enabled
        if (!enabled) {
          window.agentBehaviorManager.stopSilenceTimer?.()
        } else {
          window.agentBehaviorManager.loadSettingsFromUI?.()
          window.agentBehaviorManager.startSilenceTimer?.()
        }
      }

      if (!enabled) {
        resetSilenceDetection()
      } else {
        if (!hasJoinedSession) {
          preJoinSilenceUiAnchor = Date.now()
        }
        lastSpeechActivity = Date.now()
        resetSilenceDetection()
        updateSpeechActivity()
        startUIUpdates()
        if (isTimerMasterClient()) {
          startSilenceDetection()
        }
        updateAgentStatusUI()
      }
    })
  }

  if (periodicToggle && periodicToggle.dataset.listenerBound !== 'true') {
    periodicToggle.dataset.listenerBound = 'true'
    periodicToggle.addEventListener('change', (e) => {
      const enabled = Boolean(e.target.checked)
      agentBehaviorSettings.periodicSpeech = enabled

      if (!enabled) {
        resetPeriodicSpeech()
      } else {
        if (!hasJoinedSession) {
          preJoinPeriodicUiAnchor = Date.now()
        }
        lastPeriodicSpeech = Date.now()
        resetPeriodicSpeech()
        startUIUpdates()
        if (isTimerMasterClient()) {
          startPeriodicSpeech()
        }
        updateAgentStatusUI()
      }
    })
  }

  if (nameToggle && nameToggle.dataset.listenerBound !== 'true') {
    nameToggle.dataset.listenerBound = 'true'
    nameToggle.addEventListener('change', (e) => {
      const enabled = Boolean(e.target.checked)
      agentBehaviorSettings.nameDetection = enabled

      if (window.agentBehaviorManager?.settings?.nameDetection) {
        window.agentBehaviorManager.settings.nameDetection.enabled = enabled
        if (enabled) {
          window.agentBehaviorManager.loadSettingsFromUI?.()
        }
      }
    })
  }
}

function addSystemMessage(message) {
  // システムメッセージを会話履歴に追加
  addToConversationHistoryLocal('System', message, 'system')
}

/* =======================================================================
   Agent Behavior Management System
   ======================================================================*/

function initAgentBehaviorManagement() {
  
  // UI要素のイベントリスナー設定
  setupAgentBehaviorToggleListeners()
  
  // UIの定期更新開始（1秒間隔）
  startUIUpdates()
  
}

function updateUIElements() {
  // 沈黙検知
  const silenceCountdownEl = document.getElementById('silence-countdown')
  const silenceProgressEl = document.getElementById('silence-progress')
  
  if (silenceCountdownEl) {
    silenceCountdownEl.textContent = agentStatus.silenceCountdown
  }

  if (silenceProgressEl) {
    silenceProgressEl.style.width = `${agentStatus.silenceProgress}%`
  }

  // 定期発話
  const periodicCountdownEl = document.getElementById('periodic-countdown')
  const periodicProgressEl = document.getElementById('periodic-progress')

  if (periodicCountdownEl) {
    periodicCountdownEl.textContent = agentStatus.periodicCountdown
  }

  if (periodicProgressEl) {
    periodicProgressEl.style.width = `${agentStatus.periodicProgress}%`
  }

  // エージェント状態
  const stateEl = document.getElementById('agent-current-state')
  const lastResponseEl = document.getElementById('agent-last-response')
  const nameDetectionEl = document.getElementById('name-detection-last')

  if (stateEl) {
    stateEl.textContent = agentStatus.state
    stateEl.style.color = agentStatus.state === 'Speaking' ? '#dc3545' : '#28a745'
  }

  if (lastResponseEl) {
    lastResponseEl.textContent = agentStatus.lastResponse
  }

  if (nameDetectionEl) {
    nameDetectionEl.textContent = agentStatus.lastNameDetection
  }
}

function resetSilenceDetection() {
  lastSpeechActivity = Date.now()
  if (silenceDetectionTimer) {
    clearTimeout(silenceDetectionTimer)
    silenceDetectionTimer = null
  }
}

function resetPeriodicSpeech() {
  const periodicToggleEl = document.getElementById('periodic-speech-toggle')
  if (periodicToggleEl && periodicToggleEl.checked === false) {
    agentBehaviorSettings.periodicSpeech = false
  }

  lastPeriodicSpeech = Date.now()
  if (periodicSpeechTimer) {
    clearInterval(periodicSpeechTimer)
    periodicSpeechTimer = null
  }

  // If periodic speech is enabled, restart the timer-master periodic timer.
  // Without this, applying interval updates can stop periodic speech permanently.
  if (isTimerMasterClient() && agentBehaviorSettings.periodicSpeech) {
    startPeriodicSpeech()
  }
}

// FUNCTION DEFINITION MARKER - checkForNameMention defined here at line ~5666

function checkForNameMention(text, speakerName) {
  // Hard gate: if UI toggle is OFF, never do name-mention detection.
  const nameToggleEl = document.getElementById('name-detection-toggle')
  if (nameToggleEl && nameToggleEl.checked === false) {
    agentBehaviorSettings.nameDetection = false
    if (window.agentBehaviorManager?.settings?.nameDetection) {
      window.agentBehaviorManager.settings.nameDetection.enabled = false
    }
    return false
  }


  if (!agentBehaviorSettings.nameDetection || !text) {
    return false
  }

  const lowerText = text.toLowerCase()
  const detected = agentBehaviorSettings.keywords.some(keyword =>
    lowerText.includes(keyword.toLowerCase())
  )


  if (detected) {
    lastNameMentionDetectedAt = Date.now()
    agentStatus.lastNameDetection = new Date().toLocaleTimeString()

    // 名前呼び専用の応答を生成
    generateNameMentionResponse(text, speakerName)
    return true
  }

  return false
}

/* =======================================================================
   Speaking Indicators Functions
   =====================================================================*/

function clearAllSpeakingIndicators() {
  // Clear green speaking indicator from all video canvases
  document.querySelectorAll('.video-canvas.speaking').forEach(canvas => {
    canvas.classList.remove('speaking')
  })
}

function setSpeakingIndicator(userId, clearFirst = true) {
  // Find and highlight the canvas for the speaking user
  if (!userId) {
    clearAllSpeakingIndicators()
    return
  }

  if (clearFirst) clearAllSpeakingIndicators()

  const currentUserId = client?.getCurrentUserInfo()?.userId
  const isCurrentUser = userId === currentUserId

  if (isCurrentUser) {
    // Don't show speaking indicator on self-video — the user knows they're talking
  } else {
    // Find the remote user by userId
    const displayName = Array.from(remoteParticipantsByUserId.entries())
      .find(([uId]) => uId === userId)?.[1]

    if (displayName) {
      const canvasInfo = remoteCanvases.get(displayName)
      if (canvasInfo?.canvas) {
        canvasInfo.canvas.classList.add('speaking')
      }
    }
  }
}

function showActiveAgentSpeaking() {
  // Active agent speaking - add green speaking indicator
  const activeAgentCanvas = document.getElementById('vrm-canvas-1')
  if (activeAgentCanvas) {
    activeAgentCanvas.classList.add('speaking')
  }
}

function hideActiveAgentSpeaking() {
  // Hide agent speaking indicator
  const activeAgentCanvas = document.getElementById('vrm-canvas-1')
  if (activeAgentCanvas) {
    activeAgentCanvas.classList.remove('speaking')
  }
}

function showRemoteUserSpeaking(displayName) {
  // Remote user speaking - add green speaking indicator
  if (!displayName) return

  const canvasInfo = remoteCanvases.get(displayName)
  if (canvasInfo?.canvas) {
    canvasInfo.canvas.classList.add('speaking')
  }
}

function hideRemoteUserSpeaking(displayName) {
  // Hide remote user speaking indicator
  if (!displayName) return

  const canvasInfo = remoteCanvases.get(displayName)
  if (canvasInfo?.canvas) {
    canvasInfo.canvas.classList.remove('speaking')
  }
}

function hideAllSpeakingIndicators() {
  // Clear all speaking indicators
  clearAllSpeakingIndicators()
}

// Export to global scope
window.clearAllSpeakingIndicators = clearAllSpeakingIndicators
window.setSpeakingIndicator = setSpeakingIndicator
window.showActiveAgentSpeaking = showActiveAgentSpeaking
window.hideActiveAgentSpeaking = hideActiveAgentSpeaking
window.showRemoteUserSpeaking = showRemoteUserSpeaking
window.hideRemoteUserSpeaking = hideRemoteUserSpeaking
window.hideAllSpeakingIndicators = hideAllSpeakingIndicators

/* =======================================================================
   Agent Synchronization System
   =====================================================================*/

function initializeMessaging() {
  try {
    // 複数の方法でメッセージング機能を試す
    
    // 方法1: Chat Client
    try {
      messageChannel = client.getChatClient()
      if (messageChannel) {
        messageChannel.on('chat-on-message', (payload) => {
          handleSyncMessage(payload)
        })
        return
      }
    } catch (chatError) {
    }
    
    // 方法2: Command Channel (カスタムコマンド)
    try {
      if (client.getCommandClient) {
        const commandChannel = client.getCommandClient()
        if (commandChannel) {
          commandChannel.on('command-channel-message', (payload) => {
            handleSyncMessage(payload)
          })
          messageChannel = commandChannel
          return
        }
      }
    } catch (commandError) {
    }
    
    // 方法3: WebSocket alternative (localStorage + polling)
    initializeLocalStorageMessaging()
    
  } catch (error) {
    console.error('[Sync] Failed to initialize any messaging method:', error)
  }
}

// LocalStorage + polling based messaging fallback
function initializeLocalStorageMessaging() {
  const sessionKey = `zoom_sync_${document.getElementById('session_topic').value}`
  
  // メッセージポーリング
  setInterval(() => {
    try {
      const messages = JSON.parse(localStorage.getItem(sessionKey) || '[]')
      const currentUser = client.getCurrentUserInfo()
      
      // 新しいメッセージをチェック
      messages.forEach(message => {
        if (message.senderId !== currentUser.userId && 
            !message.processed && 
            (Date.now() - message.timestamp) < 30000) { // 30秒以内のメッセージ
          
          handleSyncMessage({ message: JSON.stringify(message) })
          message.processed = true
        }
      })
      
      // 古いメッセージを削除
      const filteredMessages = messages.filter(msg => 
        (Date.now() - msg.timestamp) < 60000 // 1分以内のメッセージのみ保持
      )
      
      localStorage.setItem(sessionKey, JSON.stringify(filteredMessages))
      
    } catch (error) {
      console.error('[Sync] LocalStorage polling error:', error)
    }
  }, 1000) // 1秒ごとにポーリング
  
  messageChannel = {
    send: (messageString) => {
      try {
        const sessionKey = `zoom_sync_${document.getElementById('session_topic').value}`
        const messages = JSON.parse(localStorage.getItem(sessionKey) || '[]')
        const message = JSON.parse(messageString)
        
        messages.push({
          ...message,
          processed: false
        })
        
        localStorage.setItem(sessionKey, JSON.stringify(messages))
      } catch (error) {
        console.error('[Sync] Failed to store message in localStorage:', error)
      }
    }
  }
  
}

function initializeAgentSynchronization() {
  // 参加者数をチェックしてマスターを決定
  const participants = client.getAllUser()
  participantCount = participants.length
  
  // 最初に参加した人（最小のユーザーID）がマスターになる
  const currentUserId = client.getCurrentUserInfo().userId
  const allUserIds = participants.map(p => p.userId).sort()
  isAgentMaster = (allUserIds[0] === currentUserId)
  

  // 参加者の変更を監視
  client.on('user-added', handleUserAdded)
  client.on('user-removed', handleUserRemoved)

  // Start silence timer after joining
  if (window.agentBehaviorManager) {
    window.agentBehaviorManager.isMasterClient = isAgentMaster;
    // Start timer - startSilenceTimer will check activeAgent internally
    setTimeout(() => {

      // Force start silence timer even without activeAgent - it will set silenceTimerStartTime
      window.agentBehaviorManager.silenceTimerStartTime = Date.now();

      // Also try to start normal timers
      window.agentBehaviorManager.startTimers();
    }, 3000); // Wait 3 seconds for avatar initialization
  }

}

function handleUserAdded(payload) {
  participantCount++

  // 新しい参加者を参加者管理に追加
  if (payload && payload.userId) {
    try {
      const allUsers = client.getAllUser()
      const user = allUsers.find(u => u.userId === payload.userId)
      const displayName = user?.displayName || `User${payload.userId}`
      addRemoteParticipant(payload.userId, displayName)

      // 会話履歴に入室イベントを追加
      const joinConversation = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        speaker: displayName,
        userId: payload.userId,
        displayName: displayName,
        type: 'user_join',
        triggerEvent: 'join',
        message: `${displayName} joined the session`
      }
      conversationHistory.push(joinConversation)
      updateConversationDisplay()
      syncConversationUpdate(joinConversation)
    } catch (e) {
      console.error(`[USER JOINED] getAllUser failed for ${payload.userId}:`, e)
      const displayName = `User${payload.userId}`
      addRemoteParticipant(payload.userId, displayName)

      // エラーの場合でも入室イベントを記録
      const joinConversation = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        speaker: displayName,
        userId: payload.userId,
        displayName: displayName,
        type: 'user_join',
        triggerEvent: 'join',
        message: `${displayName} joined the session`
      }
      conversationHistory.push(joinConversation)
      updateConversationDisplay()
      syncConversationUpdate(joinConversation)
    }
  }
  
  // マスターの場合、新しい参加者に現在の状態を送信
  if (isAgentMaster) {
    setTimeout(() => {
      broadcastAgentState()
    }, 2000) // 新しい参加者が準備できるまで少し待つ
  }
  
  // CRITICAL FIX: Re-enable cleanup to fix duplicate participant issues
  setTimeout(() => {
    cleanupInvalidParticipants();
  }, 2000); // Increased delay to allow proper initialization
}

function handleUserRemoved(payload) {
  participantCount--

  // 参加者を参加者管理から削除
  if (payload && payload.userId) {
    // 削除前に表示名を取得
    const displayName = remoteParticipantsByUserId.get(payload.userId) || `User${payload.userId}`

    // 会話履歴に退室イベントを追加
    const leaveConversation = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      speaker: displayName,
      userId: payload.userId,
      displayName: displayName,
      type: 'user_leave',
      triggerEvent: 'leave',
      message: `${displayName} left the session`
    }
    conversationHistory.push(leaveConversation)
    updateConversationDisplay()
    syncConversationUpdate(leaveConversation)

    removeRemoteParticipant(payload.userId)
  }
  
  // マスターが離脱した場合、新しいマスターを選出
  if (payload.userId && !isAgentMaster) {
    const participants = client.getAllUser()
    const currentUserId = client.getCurrentUserInfo().userId
    const allUserIds = participants.map(p => p.userId).sort()
    
    if (allUserIds.length > 0 && allUserIds[0] === currentUserId) {
      isAgentMaster = true
      
      // 新マスターとして他の参加者に通知
      broadcastMessage({
        type: 'MASTER_ANNOUNCEMENT',
        masterId: currentUserId,
        timestamp: Date.now()
      })
      
      // エージェント機能を開始
      setTimeout(() => {
        startPeriodicSpeech()
        updateSpeechActivity()
      }, 1000)
    }
  }
}

function broadcastMessage(message) {
  if (!messageChannel) {
    console.warn('[Sync] Message channel not available')
    return
  }
  
  try {
    const currentUser = client.getCurrentUserInfo()
    const messageData = {
      ...message,
      senderId: currentUser.userId,
      senderName: currentUser.displayName || 'Unknown',
      timestamp: Date.now()
    }
    
    const messageString = JSON.stringify(messageData)
    
    
    // Zoom Video SDKのチャット送信
    messageChannel.send(messageString)
      .then(() => {
      })
      .catch((error) => {
        console.error('[Sync] Failed to send message:', error)
        
        // 代替手段として、より直接的な方法を試す
        try {
          messageChannel.sendToAll(messageString)
        } catch (altError) {
          console.error('[Sync] Alternative send method also failed:', altError)
        }
      })
      
  } catch (error) {
    console.error('[Sync] Failed to prepare/broadcast message:', error)
    console.error('[Sync] Error details:', error.stack)
  }
}

// WebSocketテストページから移植したメッセージハンドラー
function handleWebSocketMessage(message) {
  
  switch (message.type) {
    case 'DEBUG_COMMAND':
      addDebugMessage('INFO', 'WS-DEBUG', `Received debug command: ${message.command}`, message.data);
      handleDebugCommand(message.command, message.data);
      break;
      
    case 'CONNECTION_UPDATE':
      const connectionCountEl = document.getElementById('connection-count')
      if (connectionCountEl) {
        connectionCountEl.textContent = `${message.count}/${message.maxUsers || 2}`
      }
      
      // 2人制限の警告表示
      if (message.isRoomFull && message.count > 2) {
        console.warn('<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> [WS] Room is full! Maximum 2 users allowed.')
        addSystemMessage('<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> 会議室が満員です。最大2人まで参加できます。')
      }
      break
      
    case 'USER_JOINED':
      addSystemMessage(`${message.userName} が参加しました`)
      refreshHostParticipantFlags()
      applyMasterVideoVisibilityToHostCanvas()
      break
      
    case 'USER_LEFT':
      addSystemMessage(`${message.userName} が退出しました`)
      refreshHostParticipantFlags()
      applyMasterVideoVisibilityToHostCanvas()
      break
      
    case 'SESSION_ERROR':
      console.error('<i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> [SESSION] Error:', message.error)

      if (message.code === 'INVALID_PASSWORD') {
        alert('Invalid password for this session. Please try again.')
        resetToLobby()
      } else if (message.code === 'JOIN_DISABLED') {
        alert('The host has disabled joining for this session.')
        resetToLobby()
      } else {
        alert(`Session error: ${message.error}`)
      }
      break

    case 'YOU_WERE_KICKED':
      alert(`You have been removed from the session by ${message.kickedBy || 'the host'}.`)
      resetToLobby()
      break

    case 'PARTICIPANT_KICKED':
      if (typeof removeRemoteParticipant === 'function') {
        removeRemoteParticipant(message.targetUserId)
      }
      addSystemMessage(`${message.targetDisplayName} was removed from the session.`)
      break

    case 'PARTICIPANT_RENAMED': {
      const oldName = message.oldDisplayName
      const newName = message.newDisplayName
      const userId = message.targetUserId
      // Update remoteParticipants map
      if (typeof remoteParticipants !== 'undefined' && remoteParticipants.has(oldName)) {
        const p = remoteParticipants.get(oldName)
        p.displayName = newName
        remoteParticipants.set(newName, p)
        remoteParticipants.delete(oldName)
      }
      if (typeof remoteParticipantsByUserId !== 'undefined') {
        remoteParticipantsByUserId.set(userId, newName)
      }
      // Update canvas label
      if (typeof remoteCanvases !== 'undefined' && remoteCanvases.has(oldName)) {
        const info = remoteCanvases.get(oldName)
        if (info.label) info.label.textContent = newName
        remoteCanvases.set(newName, info)
        remoteCanvases.delete(oldName)
      }
      if (typeof updateParticipantsUI === 'function') updateParticipantsUI()
      addSystemMessage(`${oldName} was renamed to ${newName}.`)
      break
    }

    case 'SESSION_PASSWORD_UPDATED':
      addSystemMessage(message.hasPassword ? 'Session password updated.' : 'Session password removed.')
      break
      
    case 'SESSION_STATUS':
      
      // ホスト状態を更新
      if (typeof message.isHost === 'boolean') {
        const wasHost = isSessionHost
        isSessionHost = message.isHost
        if (isSessionHost && !wasHost) {
          isAgentMaster = true  // ホストはエージェントマスターにもする
        } else if (!isSessionHost && wasHost) {
        }
      }
      
      const sessionStatusEl = document.getElementById('session-status')
      if (sessionStatusEl) {
        sessionStatusEl.textContent = `${message.roomSize}/${message.maxUsers}`
      }
      if (message.isRoomFull && message.roomSize > message.maxUsers) {
        addSystemMessage('<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> セッションが満員です')
      }
      
      // UI状態を更新
      updateSessionStatusDisplay(message.roomSize, message.maxUsers)
      refreshHostParticipantFlags()
      applyMasterVideoVisibilityToHostCanvas()
      break
      
    case 'CONVERSATION_UPDATE':
      if (message.conversation) {
        const conv = message.conversation
        // 重複チェック
        if (!conversationHistory.find(c => c.id === conv.id)) {
          conversationHistory.push(conv)
          updateConversationDisplay()

          // ユーザーメッセージの場合、タイマーをリセット
          if (conv.type === 'user' && window.agentBehaviorManager) {
            window.agentBehaviorManager.resetTimers()
          }

          // AIエージェントの発話の場合、音声も再生（WebSocketページでも）
          if (!isAgentMaster && (conv.type === 'ai' || conv.type === 'ai_response' || conv.type === 'agent') && window.avatars && window.avatars[0]) {
            window.avatars[0].speak(conv.message)
          }
        } else {
        }
      }
      break

    case 'USER_SPEAKING':
      // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> 中央集中管理: ユーザー発話通知を受信したらタイマーをリセット（Agent Masterのみ）
      if (isAgentMaster) {

        // window.agentBehaviorのタイマーをリセット
        if (window.agentBehavior) {
          window.agentBehavior.stopSilenceTimer()
          window.agentBehavior.startSilenceTimer()
        }

        // レガシータイマーもリセット
        if (typeof resetSilenceDetection === 'function') {
          resetSilenceDetection()
        }

        // lastSpeechActivityを更新
        lastSpeechActivity = Date.now()
      }
      break

    case 'AI_RESPONSE_REQUEST':
      // 非マスタークライアントからのAI応答リクエスト

      // If name detection is disabled, ignore requests.
      if (typeof agentBehaviorSettings !== 'undefined' && !agentBehaviorSettings.nameDetection) {
        break
      }

      if (isAgentMaster) {
        // マスターの場合、クールダウンチェックを行ってからAI応答を生成
        const lastTriggerTime = lastKeywordTriggerMap.get(message.speaker)
        const now = Date.now()

        if (lastTriggerTime && (now - lastTriggerTime) < KEYWORD_TRIGGER_COOLDOWN) {
          const remainingTime = ((KEYWORD_TRIGGER_COOLDOWN - (now - lastTriggerTime)) / 1000).toFixed(1)
        } else {
          lastKeywordTriggerMap.set(message.speaker, now)
          generateNameMentionResponse(message.message, message.speaker)
        }
      } else {
      }
      break

    case 'TEST_MESSAGE':
      addSystemMessage(`テストメッセージ受信: ${message.message}`)
      break
      
    case 'TIMER_SYNC':
      handleTimerSyncMessage(message)
      break
      
    case 'SPEECH_ACTIVITY_UPDATE':
      handleSpeechActivityUpdate(message)
      break
      
    case 'MASTER_SETTINGS_UPDATE':
      handleMasterSettingsUpdate(message)
      break

    case 'MASTER_VIDEO_VISIBILITY_UPDATE':
      handleMasterVideoVisibilityUpdate(message)
      break

    case 'SETTINGS_UPDATE':
      handleSettingsBroadcastUpdate(message)
      break
      
    case 'MASTER_OBSERVER_JOIN':
      handleMasterObserverJoin(message)
      break
      
    case 'MASTER_OBSERVER_LEFT':
      handleMasterObserverLeft(message)
      break
      
    case 'SETTING_CHANGE_DENIED':
      console.warn('[Settings] Setting change denied:', message.reason)
      showTemporaryMessage(`Setting change denied: ${message.reason}`, 'error')
      break
      
    case 'SILENCE_THRESHOLD_UPDATE':
      handleSilenceThresholdUpdate(message)
      break
      
    case 'PERIODIC_INTERVAL_UPDATE':
      handlePeriodicIntervalUpdate(message)
      break
      
    case 'SILENCE_MESSAGES_UPDATE':
      handleSilenceMessagesUpdate(message)
      break
      
    case 'PERIODIC_MESSAGES_UPDATE':
      handlePeriodicMessagesUpdate(message)
      break
      
    case 'NAME_KEYWORDS_UPDATE':
      handleNameKeywordsUpdate(message)
      break
      
    case 'RESET_TIMERS':
      handleTimerReset(message)
      break
      
    case 'AI_STYLE_UPDATE':
      handleAIStyleUpdate(message)
      break
      
    case 'SESSION_RESET_COMPLETE':
      handleSessionResetComplete(message)
      break
      
    case 'PARTICIPANTS_CLEARED':
      handleParticipantsCleared(message)
      break
      
    default:
  }
}

/* ========== Handle Master Observer Join/Leave ================== */
function handleMasterObserverJoin(message) {
  
  // Master Control Panel が接続されたことを通知
  addSystemMessage(`<i data-lucide="sliders" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Master Control Panel connected (${message.masterId})`)
  
  // 設定フィールドをグレーアウト
  disableUserInputs()
}

function handleMasterObserverLeft(message) {
  
  // Master Control Panel が切断されたことを通知
  addSystemMessage(`<i data-lucide="sliders" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Master Control Panel disconnected (${message.masterId})`)
  
  // 設定フィールドを有効化
  enableUserInputs()
}

/* ========== Handle Master Settings Update ========================== */
function handleMasterSettingsUpdate(message) {
  
  // Master Control Panelからの設定更新を適用
  if (message.settings) {
    const settings = message.settings
    
    // 沈黙検知設定
    if (settings.silenceDetection) {
      const silenceSettings = settings.silenceDetection
      if (silenceSettings.threshold !== undefined) {
        SILENCE_THRESHOLD = silenceSettings.threshold * 1000
        agentBehaviorSettings.silenceThresholdSeconds = silenceSettings.threshold

        // UIを更新
        const thresholdInput = document.getElementById('silence-threshold-input')
        const thresholdRange = document.getElementById('silence-threshold-range')
        if (thresholdInput) thresholdInput.value = silenceSettings.threshold
        if (thresholdRange) thresholdRange.value = silenceSettings.threshold


        // タイマーをリセット
        updateSpeechActivity()
      }
      
      // 沈黙時メッセージを更新
      if (silenceSettings.messages) {
        window.silenceMessages = silenceSettings.messages
      }
    }
    
    // 定期発話設定
    if (settings.periodicSpeech) {
      const periodicSettings = settings.periodicSpeech
      if (periodicSettings.interval !== undefined) {
        PERIODIC_SPEECH_INTERVAL = periodicSettings.interval * 1000
        agentBehaviorSettings.periodicIntervalSeconds = periodicSettings.interval

        // UIを更新
        const intervalInput = document.getElementById('periodic-interval-input')
        if (intervalInput) intervalInput.value = periodicSettings.interval

        // タイマーをリセット
        resetPeriodicSpeech()
      }
      
      // 定期発話メッセージを更新
      if (periodicSettings.messages) {
        window.periodicSpeechMessages = periodicSettings.messages
      }
    }
    
    // 入力フィールドを無効化（Master Control Panelが制御中）
    disableUserInputs()
    
    // 設定変更をユーザーに通知
    addSystemMessage('<i data-lucide="sliders" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> 設定がMaster Control Panelから更新されました')
  }
}

function disableUserInputs() {

  // 沈黙検知設定を無効化
  const silenceInputs = [
    'silence-threshold-input',
    'silence-threshold-range',
    'apply-silence-threshold'
  ]

  silenceInputs.forEach(id => {
    const element = document.getElementById(id)
    if (element) {
      element.disabled = true
      element.title = 'この設定はMaster Control Panelで制御されています'
    }
  })

  // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> REMOVED: Periodic speech settings disabling (periodic speech disabled)
  const periodicInputs = [
    'periodic-interval-input',
    'apply-periodic-interval',
    'periodic-speech-toggle'
  ]

  periodicInputs.forEach(id => {
    const element = document.getElementById(id)
    if (element) {
      element.disabled = true
      element.title = 'この設定はMaster Control Panelで制御されています'
    }
  })

  // AI Style設定を無効化
  const aiStyleInputs = [
    'ai-style',
    'open-ai-style-modal',
    'open-periodic-prompt-modal',
    'open-condition-prompt-modal',
    'manual-generate-btn'
  ]

  aiStyleInputs.forEach(id => {
    const element = document.getElementById(id)
    if (element) {
      element.disabled = true
      element.title = 'この設定はMaster Control Panelで制御されています'
    }
  })
  
  // 視覚的にも無効化されていることを示す
  const settingGroups = document.querySelectorAll('.setting-group')
  settingGroups.forEach(group => {
    group.style.opacity = '0.6'
    group.style.pointerEvents = 'none'
  })
  
  // 不要なメッセージ表示を削除（会議ビューは常に読み取り専用）
}

function enableUserInputs() {

  // 全ての入力フィールドを有効化
  const allInputs = [
    'silence-threshold-input',
    'silence-threshold-range',
    'apply-silence-threshold',
    'periodic-interval-input',
    'apply-periodic-interval',
    'periodic-speech-toggle',
    'ai-style',
    'open-ai-style-modal',
    'open-periodic-prompt-modal',
    'open-condition-prompt-modal',
    'manual-generate-btn'
  ]
  
  allInputs.forEach(id => {
    const element = document.getElementById(id)
    if (element) {
      element.disabled = false
      element.title = ''
    }
  })
  
  // 視覚的な制限を解除
  const settingGroups = document.querySelectorAll('.setting-group')
  settingGroups.forEach(group => {
    group.style.opacity = ''
    group.style.pointerEvents = ''
  })
  
  // 状態メッセージを削除
  const statusMessage = document.getElementById('master-control-status')
  if (statusMessage) {
    statusMessage.remove()
  }
}

/* ========== Handle Timer Sync Message ================================ */
function handleTimerSyncMessage(message) {
  
  // タイマー・マスター（セッションマスター or ?master）は他マスターの同期を受け取らない
  if (isTimerMasterClient()) {
    return
  }
  
  try {
    // タイマー設定を同期
    if (message.timers) {
      const timers = message.timers
      
      // 沈黙検知闾値を更新
      if (timers.silenceThreshold && timers.silenceThresholdSeconds) {
        SILENCE_THRESHOLD = timers.silenceThreshold
        agentBehaviorSettings.silenceThresholdSeconds = timers.silenceThresholdSeconds
        
        // UIを更新
        const thresholdInput = document.getElementById('silence-threshold-input')
        if (thresholdInput) {
          thresholdInput.value = timers.silenceThresholdSeconds
        }
      }
      
      // タイムスタンプを同期
      if (timers.lastSpeechActivity) {
        lastSpeechActivity = timers.lastSpeechActivity
      }
      
      if (timers.lastPeriodicSpeech) {
        lastPeriodicSpeech = timers.lastPeriodicSpeech
      }
    }
    
    // エージェント状態を同期
    if (message.agentStatus) {
      agentStatus = { ...agentStatus, ...message.agentStatus }
    }
    
    // UIを更新
    updateAgentStatusUI()
    
    
  } catch (error) {
    console.error('[Timer Sync] Error processing sync message:', error)
  }
}

/* ========== Handle Silence Threshold Update ========================== */
function handleSilenceThresholdUpdate(message) {
  
  // 自分自身が送信したメッセージは無視
  const currentUserId = client?.getCurrentUserInfo()?.userId
  if (message.senderId && message.senderId === currentUserId) {
    return
  }
  
  try {
    const newThreshold = message.thresholdSeconds

    if (newThreshold >= 5 && newThreshold <= 1000) {
      // 設定を更新
      agentBehaviorSettings.silenceThresholdSeconds = newThreshold
      SILENCE_THRESHOLD = newThreshold * 1000
      if (!hasJoinedSession) {
        preJoinSilenceUiAnchor = Date.now()
      }
      
      // UIを更新
      const thresholdInput = document.getElementById('silence-threshold-input')
      if (thresholdInput) {
        thresholdInput.value = newThreshold
      } else {
        console.warn('[Silence Threshold] UI input element not found')
      }

      // Threshold更新は lastSpeechActivity を変更しない（他パネルへの影響を防ぐ）。
      // タイマー・マスターは残り時間ベースで再スケジュールし、スレーブは表示更新のみ。
      if (isTimerMasterClient()) {
        if (silenceDetectionTimer) {
          clearTimeout(silenceDetectionTimer)
          silenceDetectionTimer = null
        }
        startSilenceDetection()
      }
      
      // UIを更新
      updateAgentStatusUI()
      
      // UI要素の存在と値を確認
      const silenceCountdownEl = document.getElementById('silence-countdown')
      const silenceProgressEl = document.getElementById('silence-progress')
      const thresholdInputElement = document.getElementById('silence-threshold-input')
      
      
      
      // サクセスメッセージを表示（受信側のみ）
      if (!isSessionHost) {
        showTemporaryMessage(`Silence threshold updated to ${newThreshold}s by host`)
      }
      
      // UI状態を更新（ホスト・クライアント問わず）
      setTimeout(() => {
        updateAgentSettingControls()
      }, 100)
      
    } else {
      console.warn('[Silence Threshold] Invalid threshold value:', newThreshold)
    }
    
  } catch (error) {
    console.error('[Silence Threshold] Error processing threshold update:', error)
  }
}

/* ========== Handle Periodic Interval Update ======================== */
function handlePeriodicIntervalUpdate(message) {
  
  // 自分自身が送信したメッセージは無視
  const currentUserId = client?.getCurrentUserInfo()?.userId
  if (message.senderId && message.senderId === currentUserId) {
    return
  }
  
  try {
    const newInterval = message.intervalSeconds
    
    if (newInterval >= 30 && newInterval <= 600) {
      // 設定を更新
      agentBehaviorSettings.periodicIntervalSeconds = newInterval
      PERIODIC_SPEECH_INTERVAL = newInterval * 1000
      if (!hasJoinedSession) {
        preJoinPeriodicUiAnchor = Date.now()
      }

      // UIを更新
      const intervalInput = document.getElementById('periodic-interval-input')
      if (intervalInput) {
        intervalInput.value = newInterval
      }
      
      // CRITICAL FIX: Reset periodic timer like silence detection does
      resetPeriodicSpeech()
      
      // UIを更新
      updateAgentStatusUI()
      
      // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> REMOVED: Periodic UI elements verification (periodic speech disabled)
      
      
      // サクセスメッセージを表示（受信側のみ）
      if (!isSessionHost) {
        showTemporaryMessage(`Periodic interval updated to ${newInterval}s by host`)
      }
      
      // UI状態を更新（ホスト・クライアント問わず）
      setTimeout(() => {
        updateAgentSettingControls()
      }, 100)
      
    } else {
      console.warn('[Periodic Interval] Invalid interval value:', newInterval)
    }
    
  } catch (error) {
    console.error('[Periodic Interval] Error processing interval update:', error)
  }
}

/* ========== Handle Silence Messages Update ======================= */
function handleSilenceMessagesUpdate(message) {
  
  // 自分自身が送信したメッセージは無視
  const currentUserId = client?.getCurrentUserInfo()?.userId
  if (message.senderId && message.senderId === currentUserId) {
    return
  }
  
  try {
    const newMessages = message.messages
    
    if (newMessages && newMessages.length > 0) {
      // グローバル設定を更新
      window.silenceDetectionMessages = newMessages
      
      // UI フィールドを更新
      updateSilenceMessageFields(newMessages)
      
      
      // メッセージは受信側でのみ表示（送信側では表示しない）
      if (!isSessionHost) {
        showTemporaryMessage(`Silence messages updated (${newMessages.length} messages) by host`)
        setTimeout(() => updateAgentSettingControls(), 100)
      }
    }
    
  } catch (error) {
    console.error('[Silence Messages] Error processing messages update:', error)
  }
}

/* ========== Handle Periodic Messages Update ====================== */
function handlePeriodicMessagesUpdate(message) {
  
  // 自分自身が送信したメッセージは無視
  const currentUserId = client?.getCurrentUserInfo()?.userId
  if (message.senderId && message.senderId === currentUserId) {
    return
  }
  
  try {
    const newMessages = message.messages
    
    if (newMessages && newMessages.length > 0) {
      // グローバル設定を更新
      window.periodicSpeechMessages = newMessages
      
      // UI フィールドを更新
      updatePeriodicMessageFields(newMessages)
      
      
      // メッセージは受信側でのみ表示（送信側では表示しない）
      if (!isSessionHost) {
        showTemporaryMessage(`Periodic messages updated (${newMessages.length} messages) by host`)
        setTimeout(() => updateAgentSettingControls(), 100)
      }
    }
    
  } catch (error) {
    console.error('[Periodic Messages] Error processing messages update:', error)
  }
}

/* ========== Update Message Fields ==================================== */
function updateSilenceMessageFields(messages) {
  // silence-speech-input クラスの入力フィールドを更新
  const container = document.querySelector('.silence-speech-input')?.parentElement?.parentElement
  if (!container) {
    console.warn('[Silence Messages] Container not found')
    return
  }
  
  // 既存のフィールドを削除
  const existingInputs = container.querySelectorAll('.silence-speech-input')
  existingInputs.forEach(input => input.parentElement?.remove())
  
  // 新しいフィールドを作成
  messages.forEach((message, index) => {
    const inputDiv = document.createElement('div')
    inputDiv.className = 'mb-1'
    
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'form-control form-control-sm silence-speech-input agent-setting-control'
    input.placeholder = `Silence message ${index + 1}`
    input.value = message
    input.style.fontSize = '10px'
    input.disabled = true
    input.style.backgroundColor = '#f8f9fa'
    input.style.color = '#6c757d'
    
    inputDiv.appendChild(input)
    container.appendChild(inputDiv)
  })
  
}

function updatePeriodicMessageFields(messages) {
  // periodic-speech-input クラスの入力フィールドを更新
  const container = document.querySelector('.periodic-speech-input')?.parentElement?.parentElement
  if (!container) {
    console.warn('[Periodic Messages] Container not found')
    return
  }
  
  // 既存のフィールドを削除
  const existingInputs = container.querySelectorAll('.periodic-speech-input')
  existingInputs.forEach(input => input.parentElement?.remove())
  
  // 新しいフィールドを作成
  messages.forEach((message, index) => {
    const inputDiv = document.createElement('div')
    inputDiv.className = 'mb-1'
    
    const input = document.createElement('input')
    input.type = 'text'
    input.className = 'form-control form-control-sm periodic-speech-input agent-setting-control'
    input.placeholder = `Periodic message ${index + 1}`
    input.value = message
    input.style.fontSize = '10px'
    input.disabled = true
    input.style.backgroundColor = '#f8f9fa'
    input.style.color = '#6c757d'
    
    inputDiv.appendChild(input)
    container.appendChild(inputDiv)
  })
  
}

/* ========== Handle Speech Activity Update ========================== */
function handleSpeechActivityUpdate(message) {
  
  // タイマー・マスター（セッションマスター or ?master）は他マスターの更新を受け取らない
  if (isTimerMasterClient()) {
    return
  }
  
  try {
    // 最後の音声アクティビティ時刻を同期
    if (message.lastSpeechActivity) {
      lastSpeechActivity = message.lastSpeechActivity
    }

    // UI用の最小ステータスのみ同期（タイマー/カウントダウンは同期しない）
    if (message.uiStatus) {
      if (typeof message.uiStatus.state === 'string') {
        agentStatus.state = message.uiStatus.state
      }
      if (typeof message.uiStatus.lastResponse === 'string') {
        agentStatus.lastResponse = message.uiStatus.lastResponse
      }
      if (typeof message.uiStatus.lastNameDetection === 'string') {
        agentStatus.lastNameDetection = message.uiStatus.lastNameDetection
      }
    }
    
    // UIを更新
    updateAgentStatusUI()
    
    
  } catch (error) {
    console.error('[Speech Activity] Error processing activity update:', error)
  }
}

/* ========== Update Speech Activity ================================== */
function updateSpeechActivity() {
  const now = Date.now()
  
  // 最後の音声アクティビティ時刻を更新
  lastSpeechActivity = now
  
  // 沈黙検知タイマーをリセットして新しく開始
  startSilenceDetection()
  
  // エージェント状態を更新
  agentStatus.state = 'Listening'
  agentStatus.silenceProgress = 0
  
  // タイマー・マスターの場合、タイマー状態を同期
  if (isTimerMasterClient() && syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN) {
    const syncMessage = {
      type: 'SPEECH_ACTIVITY_UPDATE',
      masterId: client?.getCurrentUserInfo()?.userId || 'unknown',
      timestamp: new Date().toISOString(),
      lastSpeechActivity: now,
      uiStatus: {
        state: agentStatus.state,
        lastResponse: agentStatus.lastResponse,
        lastNameDetection: agentStatus.lastNameDetection
      }
    }
    
    syncWebSocket.send(JSON.stringify(syncMessage))
  }
  
  // UIを更新
  updateAgentStatusUI()

}
window.updateSpeechActivity = updateSpeechActivity

/* ========== Update Conversation Display ============================= */
function updateConversationDisplay() {

  // Sync conversationHistory to window.simpleChatHistory for HTML functions
  if (typeof window.simpleChatHistory !== 'undefined') {
    window.simpleChatHistory = conversationHistory.slice()  // Create a copy
  }

  // Also trigger HTML update if function exists
  if (typeof window.updateSimpleChatDisplay === 'function') {
    window.updateSimpleChatDisplay()
    return  // Let HTML handle the display
  }

  // Update the existing conversation display (fallback)
  const conversationLog = document.getElementById('conversation-log')

  if (conversationLog) {
    let html = ''
    conversationHistory.forEach((conv, index) => {
      let colorClass, bgClass, iconClass, speechTypeDisplay = ''

      switch (conv.type) {
        case 'user':
          colorClass = 'text-primary'
          bgClass = 'bg-light'
          iconClass = '<i data-lucide="user" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
          break
        case 'user_join':
          colorClass = 'text-info'
          bgClass = 'bg-info-subtle'
          iconClass = '<i data-lucide="download" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
          break
        case 'user_leave':
          colorClass = 'text-secondary'
          bgClass = 'bg-secondary-subtle'
          iconClass = '<i data-lucide="upload" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
          break
        case 'agent':
        case 'agent_initiated':
        case 'ai_response':
          colorClass = 'text-success'
          bgClass = 'bg-success-subtle'
          iconClass = '<i data-lucide="bot" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
          // 発話種類の表示を追加
          if (conv.speechType) {
            const typeIcons = {
              silence: '<i data-lucide="volume-x" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>',
              periodic: '<i data-lucide="clock" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>',
              name: '<i data-lucide="ear" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>',
              manual: '<i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>',
              chat: '<i data-lucide="message-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
            }
            const typeIcon = typeIcons[conv.speechType] || '<i data-lucide="help-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
            speechTypeDisplay = ` <small class="badge bg-success">${typeIcon} ${conv.speechType}</small>`
          }
          break
        case 'system':
          colorClass = 'text-warning'
          bgClass = 'bg-warning-subtle'
          iconClass = '<i data-lucide="settings" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
          break
        case 'parameter_change':
          colorClass = 'text-info'
          bgClass = 'bg-info-subtle'
          iconClass = '<i data-lucide="settings" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
          break
        default:
          colorClass = 'text-secondary'
          bgClass = 'bg-light'
          iconClass = '<i data-lucide="message-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
      }
      
      html += `
        <div class="mb-2 p-2 border-start border-3 ${colorClass} ${bgClass}" style="border-radius: 5px;">
          <small class="fw-bold">${iconClass} ${conv.speaker}${speechTypeDisplay}</small>
          <small class="text-muted float-end">${conv.timestamp}</small><br>
          <span style="margin-left: 15px;">${escapeHtml(conv.message)}</span>
        </div>
      `
    })
    conversationLog.innerHTML = html
    conversationLog.scrollTop = conversationLog.scrollHeight
  }
}

/* ========== Escape HTML ============================================== */
function escapeHtml(text) {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function addSystemMessage(message) {
  const conversation = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toLocaleTimeString(),
    speaker: 'System',
    message: message,
    type: 'system'
  }
  
  conversationHistory.push(conversation)
  updateConversationDisplay()
}

function handleSyncMessage(payload) {
  try {
    const message = JSON.parse(payload.message)
    const senderId = message.senderId
    const currentUserId = client.getCurrentUserInfo().userId
    
    // 自分が送信したメッセージは無視
    if (senderId === currentUserId) return
    
    
    switch (message.type) {
      case 'MASTER_ANNOUNCEMENT':
        handleMasterAnnouncement(message)
        break
      case 'AGENT_SPEECH':
        handleAgentSpeech(message)
        break
      case 'DEBUG_USER_INPUT':
        handleDebugUserInput(message)
        break
      case 'TIMER_SYNC':
        handleTimerSync(message)
        break
      case 'AGENT_STATE':
        handleAgentState(message)
        break
      default:
    }
  } catch (error) {
    console.error('[Sync] Failed to handle sync message:', error)
  }
}

function handleMasterAnnouncement(message) {
  const currentUserId = client.getCurrentUserInfo().userId
  if (message.masterId !== currentUserId) {
    isAgentMaster = false
  }
}

function handleAgentSpeech(message) {
  if (!isAgentMaster && window.avatars && window.avatars[0]) {
    
    // アバターに発話させる（マスター以外）
    window.avatars[0].speak(message.text)
    
    // 会話履歴に追加
    addToConversationHistory(message.agentName || 'AI Assistant', message.text, 'ai')
  }
}

function handleDebugUserInput(message) {
  
  // デバッグ用テキストフィールドに表示（同期されたことを示す）
  const debugInput = document.getElementById('debug-user-text')
  if (debugInput) {
    debugInput.value = `[Synced from ${message.userName}] ${message.text}`
  }
  
  // 全参加者で同じ処理を実行
  handleDebugUserInputLocally(message.text, message.userName)
}

function handleTimerSync(message) {
  if (!isAgentMaster) {
    
    // タイマー状態を同期
    if (message.timerType === 'silence') {
      lastSpeechActivity = message.lastActivity
      agentStatus.silenceCountdown = message.countdown
    } else if (message.timerType === 'periodic') {
      lastPeriodicSpeech = message.lastActivity
      agentStatus.periodicCountdown = message.countdown
    }
  }
}

function handleAgentState(message) {
  if (!isAgentMaster) {
    
    // エージェント状態を同期
    Object.assign(agentStatus, message.agentStatus)
    Object.assign(agentBehaviorSettings, message.agentBehaviorSettings)
    
    // UI更新
    updateUIElements()
  }
}

function broadcastAgentState() {
  broadcastMessage({
    type: 'AGENT_STATE',
    agentStatus: agentStatus,
    agentBehaviorSettings: agentBehaviorSettings
  })
}

/* =======================================================================
   Debug Input Synchronization
   =====================================================================*/

function setupDebugInputSynchronization() {
  try {
    const debugSendButton = document.getElementById('debug-send-text')
    const debugTextInput = document.getElementById('debug-user-text')
    
    
    if (debugSendButton && debugTextInput) {
      
      const handleDebugSend = () => {
        try {
          const userText = debugTextInput.value.trim()
          
          if (!userText) {
            return
          }
          
          const userName = document.getElementById('user_name')?.value || 'User'
          
          // WebSocketテストページと同じ方式で処理
          addToConversationHistory(userName, userText, 'user')
          
          // 入力フィールドをクリア
          debugTextInput.value = ''
          debugTextInput.focus()
        } catch (error) {
          console.error('[DEBUG] Error in handleDebugSend:', error)
        }
      }
      
      try {
        debugSendButton.addEventListener('click', (e) => {
          e.preventDefault()
          handleDebugSend()
        })
      } catch (error) {
        console.error('[DEBUG] Error adding click listener:', error)
      }
      
      try {
        // Enterキーでも送信できるように
        debugTextInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            handleDebugSend()
          }
        })
      } catch (error) {
        console.error('[DEBUG] Error adding keypress listener:', error)
      }
      
    } else {
      console.warn('[Sync] Debug input elements not found:', { debugSendButton, debugTextInput })
      
      // 全ての要素をリストアップしてデバッグ
      const allElements = document.querySelectorAll('*[id]')
    }
  } catch (error) {
    console.error('[DEBUG] Error in setupDebugInputSynchronization:', error)
  }
}

// WebSocketテストページから移植した関数
function handleDebugUserInputLocally(userText, userName) {
  
  // 音声活動を更新（沈黙検知タイマーリセット）
  updateSpeechActivity()
  
  // 会話履歴に追加（送信者側、同期しない）
  const conversation = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toLocaleTimeString('en-US', { 
      hour12: false, 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    }),
    speaker: userName,
    message: userText,
    type: 'manual'
  }
  
  conversationHistory.push(conversation)
  updateConversationDisplay()
  
  // 他の参加者に会話履歴を同期
  syncConversationUpdate(conversation)
  

  // キーワード検知（名前呼び検知）
  const shouldTriggerAI = checkKeywordDetection(userText)
  if (shouldTriggerAI && isAgentMaster) {
    generateNameMentionResponse(userText, userName)
  } else {
  }
}

/* ========== Active Agent Settings Update Functions =================== */

// Silence Detection設定をアップデート
function updateSilenceDetectionSettings() {
  
  // UI入力フィールドから設定を取得
  const silenceInputs = document.querySelectorAll('.silence-speech-input')
  const silenceMessages = Array.from(silenceInputs)
    .map(input => input.value.trim())
    .filter(value => value !== '')
  
  if (silenceMessages.length === 0) {
    alert('At least one silence detection message is required')
    return
  }
  
  // グローバル設定を更新
  window.silenceDetectionMessages = silenceMessages

  // Save to server
  updateSetting('silenceDetection.messages', silenceMessages).then(() => {
  }).catch(err => {
    console.error('[Settings] Failed to persist silence detection messages:', err)
  })

  // WebSocketで設定を同期（ホストまたはマスターモード）
  const canSync = isSessionHost || (typeof isMasterMode !== 'undefined' && isMasterMode === true)
  if (syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN && canSync) {
    const currentUserId = client?.getCurrentUserInfo()?.userId
    const syncMessage = {
      type: 'SILENCE_MESSAGES_UPDATE',
      messages: silenceMessages,
      timestamp: new Date().toISOString(),
      senderId: currentUserId,
      forceMaster: isMasterMode === true
    }

    syncWebSocket.send(JSON.stringify(syncMessage))
  } else if (!canSync) {
    console.warn('[Silence Messages] Cannot modify settings - not host or master mode')
    showTemporaryMessage('Only host or master mode can modify settings', 'warning')
  }
  
  // マスターの場合、設定に基づいてすぐに発話をテスト
  if (isAgentMaster && agentBehaviorSettings.silenceDetection) {
    const testMessage = silenceMessages[Math.floor(Math.random() * silenceMessages.length)]
    
    // アバターに発話させる
    if (window.avatars && window.avatars[0]) {
      window.avatars[0].speak(testMessage)
      
      // 会話履歴に追加
      const conversation = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString('en-US', { 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        }),
        speaker: window.avatars[0].config?.name || 'Active Agent',
        message: testMessage,
        type: 'agent',
        speechType: 'silence'
      }
      
      conversationHistory.push(conversation)
      updateConversationDisplay()
      syncConversationUpdate(conversation)
    }
  }
  
  alert('Silence detection settings updated successfully!')
}

// Periodic Speech設定をアップデート
function updatePeriodicSpeechSettings() {
  
  // UI入力フィールドから設定を取得
  const periodicInputs = document.querySelectorAll('.periodic-speech-input')
  const periodicMessages = Array.from(periodicInputs)
    .map(input => input.value.trim())
    .filter(value => value !== '')
  
  if (periodicMessages.length === 0) {
    alert('At least one periodic speech message is required')
    return
  }
  
  // グローバル設定を更新
  window.periodicSpeechMessages = periodicMessages
  
  // WebSocketで設定を同期（ホストまたはマスターモード）
  const canSync = isSessionHost || (typeof isMasterMode !== 'undefined' && isMasterMode === true)
  if (syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN && canSync) {
    const currentUserId = client?.getCurrentUserInfo()?.userId
    const syncMessage = {
      type: 'PERIODIC_MESSAGES_UPDATE',
      messages: periodicMessages,
      timestamp: new Date().toISOString(),
      senderId: currentUserId,
      forceMaster: isMasterMode === true
    }

    syncWebSocket.send(JSON.stringify(syncMessage))
  } else if (!canSync) {
    console.warn('[Periodic Messages] Cannot modify settings - not host or master mode')
    showTemporaryMessage('Only host or master mode can modify settings', 'warning')
  }
  
  // マスターの場合、設定に基づいてすぐに発話をテスト
  if (isAgentMaster && agentBehaviorSettings.periodicSpeech) {
    const testMessage = periodicMessages[Math.floor(Math.random() * periodicMessages.length)]
    
    // アバターに発話させる
    if (window.avatars && window.avatars[0]) {
      window.avatars[0].speak(testMessage)
      
      // 会話履歴に追加
      const conversation = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString('en-US', { 
          hour12: false, 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        }),
        speaker: window.avatars[0].config?.name || 'Active Agent',
        message: testMessage,
        type: 'agent',
        speechType: 'periodic'
      }
      
      conversationHistory.push(conversation)
      updateConversationDisplay()
      syncConversationUpdate(conversation)
    }
  }
  
  alert('Periodic speech settings updated successfully!')
}

// Name Detection設定をアップデート
async function updateNameDetectionSettings() {
  
  // UI入力フィールドから設定を取得
  const keywordsInput = document.getElementById('agent-keywords')
  const keywordsStr = keywordsInput.value.trim()
  
  if (!keywordsStr) {
    alert('Keywords are required for name detection')
    return
  }
  
  // キーワードを配列に変換
  const keywords = keywordsStr.split(',').map(k => k.trim()).filter(k => k !== '')
  
  if (keywords.length === 0) {
    alert('At least one keyword is required')
    return
  }
  
  const preferredName = keywords[0]
  const syncResult = await synchronizeActiveNameForCurrentCondition(preferredName, keywords)
  if (!syncResult || !syncResult.success) {
    alert('Failed to update name settings')
    return
  }

  const syncedKeywords = syncResult && syncResult.settings && syncResult.settings.nameDetection && Array.isArray(syncResult.settings.nameDetection.keywords)
    ? syncResult.settings.nameDetection.keywords
    : [preferredName]

  // グローバル設定を更新
  agentBehaviorSettings.keywords = syncedKeywords
  if (window.agentBehaviorManager && window.agentBehaviorManager.settings?.nameDetection) {
    window.agentBehaviorManager.settings.nameDetection.keywords = syncedKeywords
  }

  // Add parameter change to conversation history
  const parameterChange = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }),
    speaker: 'System',
    type: 'parameter_change',
    triggerEvent: 'name_detection_keywords_update',
    message: `Name detection keywords updated: ${syncedKeywords.join(', ')}`
  }
  conversationHistory.push(parameterChange)
  updateConversationDisplay()
  syncConversationUpdate(parameterChange)

  // WebSocketで設定を同期（ホストまたはマスターモード）
  const canSync = isSessionHost || (typeof isMasterMode !== 'undefined' && isMasterMode === true)
  if (syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN && canSync) {
    const currentUserId = client?.getCurrentUserInfo()?.userId
    const syncMessage = {
      type: 'NAME_KEYWORDS_UPDATE',
      keywords: syncedKeywords,
      timestamp: new Date().toISOString(),
      senderId: currentUserId,
      forceMaster: isMasterMode === true,
      condition: getConditionFromPathname()
    }

    syncWebSocket.send(JSON.stringify(syncMessage))

    alert('Name detection keywords updated successfully!')
  } else if (!canSync) {
    console.warn('[Name Detection] Cannot modify settings - not host or master mode')
    showTemporaryMessage('Only host or master mode can modify settings', 'warning')
  } else {
    console.warn('[Name Detection] Cannot sync - WebSocket:', syncWebSocket?.readyState, 'canSync:', canSync)
    alert('Name detection keywords updated successfully!')
  }
}

/* ========== Handle Name Keywords Update ============================= */
function handleNameKeywordsUpdate(message) {
  
  // 自分自身が送信したメッセージは無視
  const currentUserId = client?.getCurrentUserInfo()?.userId
  if (message.senderId && message.senderId === currentUserId) {
    return
  }
  
  try {
    const newKeywords = message.keywords
    
    if (newKeywords && newKeywords.length > 0) {
      // グローバル設定を更新
      agentBehaviorSettings.keywords = newKeywords
      
      // UIを更新
      const keywordsInput = document.getElementById('agent-keywords')
      if (keywordsInput) {
        keywordsInput.value = newKeywords.join(', ')
        keywordsInput.placeholder = newKeywords[0]
      }

      if (message.activeModelPath && window.avatars && window.avatars[0] && window.avatars[0].config) {
        window.avatars[0].config.displayName = newKeywords[0]
      }
      const activeNameEl = document.getElementById('avatar-display-name-vrm-canvas-1')
      if (activeNameEl && newKeywords[0]) {
        activeNameEl.textContent = newKeywords.join(', ')
      }
      
      
      // メッセージは受信側でのみ表示（送信側では表示しない）
      if (!isSessionHost) {
        showTemporaryMessage(`Name detection keywords updated by host`)
        setTimeout(() => updateAgentSettingControls(), 100)
      }
    }
    
  } catch (error) {
    console.error('[Name Keywords] Error processing keywords update:', error)
  }
}

/* ========== Handle Timer Reset from Master ========================== */
function handleTimerReset(message) {
  
  try {
    // Silence Detection Timer をリセット
    if (typeof resetSilenceDetection === 'function') {
      resetSilenceDetection()
    } else {
      // 直接タイマーをリセット
      lastSpeechActivity = Date.now()
      if (silenceDetectionTimer) {
        clearTimeout(silenceDetectionTimer)
        silenceDetectionTimer = null
      }
    }
    
    // Periodic Speech Timer をリセット
    if (typeof resetPeriodicSpeech === 'function') {
      resetPeriodicSpeech()
    } else {
      // 直接タイマーをリセット
      lastPeriodicSpeech = Date.now()
      if (periodicSpeechTimer) {
        clearInterval(periodicSpeechTimer)
        periodicSpeechTimer = null
      }
    }
    
    // UIを更新
    updateAgentStatusUI()
    
    
    // 成功メッセージを表示
    showTemporaryMessage('<i data-lucide="clock" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Timers reset by Master Control Panel')
    
  } catch (error) {
    console.error('[Timer Reset] Error processing timer reset:', error)
  }
}

/* ========== Handle AI Style Update from Master ===================== */
function handleAIStyleUpdate(message) {
  
  try {
    const newAIStyle = message.aiStyle
    
    if (newAIStyle && typeof newAIStyle === 'string') {
      // AI Style テキストエリアを更新
      const aiStyleTextarea = document.getElementById('ai-style')
      if (aiStyleTextarea) {
        aiStyleTextarea.value = newAIStyle
      } else {
        console.warn('[AI Style] AI style textarea element not found')
      }
      
      // グローバル変数があれば更新（実際の AI 応答に使用される）
      if (typeof window.currentAIStyle !== 'undefined') {
        window.currentAIStyle = newAIStyle
      } else {
        window.currentAIStyle = newAIStyle
      }
      
      
      // 成功メッセージを表示
      showTemporaryMessage('<i data-lucide="brain" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> AI Agent Style updated by Master Control Panel')
      
    } else {
      console.warn('[AI Style] Invalid AI style received:', message.aiStyle)
    }
    
  } catch (error) {
    console.error('[AI Style] Error processing AI style update:', error)
  }
}

function handleSettingsBroadcastUpdate(message) {
  const settings = message && message.settings
  if (!settings || typeof settings !== 'object') {
    return
  }

  if (typeof settings.aiStyle === 'string' && settings.aiStyle.trim()) {
    const aiStyleTextarea = document.getElementById('ai-style')
    if (aiStyleTextarea) {
      aiStyleTextarea.value = settings.aiStyle
    }
    window.currentAIStyle = settings.aiStyle
  }

  if (settings.avatarBackground && window.FBXAvatarSystem) {
    window.FBXAvatarSystem.setAvatarBackground(settings.avatarBackground)
  }

  if (settings.silenceDetection && settings.silenceDetection.botSelection) {
    window.silenceBotSelection = settings.silenceDetection.botSelection
  }

  if (settings.periodicSpeech && settings.periodicSpeech.botSelection) {
    window.periodicBotSelection = settings.periodicSpeech.botSelection
  }

  applyNameSettingsToUI(settings)
}

/* ========== Debug Functions for Parameter Sync ==================== */
async function fetchCurrentParameters() {
  try {
    const sessionTopic = document.getElementById('session_topic')?.value || 'default'
    const sessionId = generateSessionId(sessionTopic)
    
    
    const response = await fetch(`/api/session/${sessionId}/parameters`)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    
    const data = await response.json()
    
    return data.parameters
  } catch (error) {
    console.error('[DEBUG] Failed to fetch parameters:', error)
    return null
  }
}

async function debugParameterSync() {
  
  // 現在のローカル状態を表示
  
  // サーバーから最新状態を取得
  const serverParams = await fetchCurrentParameters()
  if (serverParams) {
  }
  
  // UI要素の現在値を表示
  const thresholdInput = document.getElementById('silence-threshold-input')
  const keywordsInput = document.getElementById('agent-keywords')

  // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> REMOVED: periodic interval input (periodic speech disabled)
  
  // フィールド数を確認
  const silenceFields = document.querySelectorAll('.silence-speech-input')
  const periodicFields = document.querySelectorAll('.periodic-speech-input')
  
}

async function testParameterSync() {
  
  if (!isSessionHost) {
    alert('Only host can test parameter changes')
    return
  }
  
  const originalThreshold = agentBehaviorSettings.silenceThresholdSeconds
  const testThreshold = originalThreshold === 10 ? 15 : 10
  
  
  // パラメータを変更
  updateSilenceThreshold(testThreshold)
  
  // 2秒後に変更を確認
  setTimeout(async () => {
    
    // ローカル状態確認
    
    // UI状態確認
    const thresholdInput = document.getElementById('silence-threshold-input')
    
    // サーバー状態確認
    const serverParams = await fetchCurrentParameters()
    if (serverParams) {
    }
    
  }, 2000)
}

// デバッグ用のグローバル関数として登録
window.debugParameterSync = debugParameterSync
window.fetchCurrentParameters = fetchCurrentParameters
window.testParameterSync = testParameterSync

/* ========== Session Reset Handlers ================================== */
function handleSessionResetComplete(message) {
  
  try {
    // Clear all local participant data structures
    remoteParticipants.clear()
    remoteParticipantsByUserId.clear()
    currentDisplayedUser = null
    activeVideoUsers.clear()
    
    // Clear all remote canvases
    remoteCanvases.forEach((canvasInfo, displayName) => {
      removeRemoteUserCanvas(displayName)
    })
    
    // Reset layout to default
    updateMainLayoutGrid();
    
    
    // Clear video canvas
    const canvas = document.getElementById('video-player-container')
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // Draw reset message on canvas
      ctx.fillStyle = '#333'
      ctx.font = '20px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('Session Reset - Waiting for participants...', canvas.width / 2, canvas.height / 2)
    }
    
    // Clear participant selection buttons
    const participantButtons = document.getElementById('participant-buttons')
    if (participantButtons) {
      participantButtons.innerHTML = '<p class="text-muted">No remote participants after reset</p>'
    }
    
    // Update current user display
    const currentUserLabel = document.getElementById('current-displayed-user')
    if (currentUserLabel) {
      currentUserLabel.textContent = 'None (Session Reset)'
    }
    
    // Clear conversation history if exists
    if (typeof conversationHistory !== 'undefined') {
      conversationHistory = []
    }
    
    // Show system notification
    addSystemMessage(`<i data-lucide="trash-2" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Session data completely reset by ${message.masterId}`)
    
    // Re-initialize participant discovery after a short delay
    setTimeout(() => {
      if (typeof discoverExistingParticipants === 'function') {
        discoverExistingParticipants()
      }
    }, 2000)
    
    
  } catch (error) {
    console.error('[Session Reset] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Error during local reset:', error)
    addSystemMessage('<i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Error during session reset - check console for details')
  }
}

function handleParticipantsCleared(message) {
  
  try {
    // Clear participant data but keep session connection
    remoteParticipants.clear()
    remoteParticipantsByUserId.clear()
    currentDisplayedUser = null
    activeVideoUsers.clear()
    
    // Clear all remote canvases
    remoteCanvases.forEach((canvasInfo, displayName) => {
      removeRemoteUserCanvas(displayName)
    })
    
    // Reset layout to default
    updateMainLayoutGrid();
    
    
    // Clear video display
    const canvas = document.getElementById('video-player-container')
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      
      // Draw cleared message
      ctx.fillStyle = '#666'
      ctx.font = '18px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('Participants Cleared', canvas.width / 2, canvas.height / 2)
    }
    
    // Clear participant buttons
    const participantButtons = document.getElementById('participant-buttons')
    if (participantButtons) {
      participantButtons.innerHTML = '<p class="text-muted">All participants cleared</p>'
    }
    
    // Update current user display
    const currentUserLabel = document.getElementById('current-displayed-user')
    if (currentUserLabel) {
      currentUserLabel.textContent = 'None (Cleared)'
    }
    
    // Show system notification  
    addSystemMessage(`<i data-lucide="users" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> All participants cleared by ${message.masterId}`)
    
    // Re-discover participants after delay
    setTimeout(() => {
      if (typeof discoverExistingParticipants === 'function') {
        discoverExistingParticipants()
      }
    }, 1500)
    
    
  } catch (error) {
    console.error('[Participants Clear] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Error during participants clear:', error)
    addSystemMessage('<i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Error during participants clear - check console for details')
  }
}
