function buildAvatarCanvases(count) {
  const container = document.getElementById('avatar-canvases-container')
  if (!container) return
  container.innerHTML = ''
  for (let i = 0; i < count; i++) {
    const idx = i + 1
    const wrapper = document.createElement('div')
    wrapper.style.cssText = 'position: relative; width: 480px; height: 270px; border-radius: 8px; overflow: hidden; flex-shrink: 0;'
    wrapper.innerHTML = `<canvas id="vrm-canvas-${idx}" class="video-canvas"></canvas>`
    container.appendChild(wrapper)
  }
}

function updateSilenceThreshold(newThresholdSeconds) {
  const oldThreshold = agentBehaviorSettings.silenceThresholdSeconds
  
  // 設定を更新
  agentBehaviorSettings.silenceThresholdSeconds = newThresholdSeconds
  SILENCE_THRESHOLD = newThresholdSeconds * 1000
  

  if (!hasJoinedSession) {
    preJoinSilenceUiAnchor = Date.now()
  }

  // Threshold変更は「発話/アクティビティ」とは別扱い。
  // lastSpeechActivity / lastPeriodicSpeech は変更せず、沈黙タイマーだけを再スケジュールする。
  if (silenceDetectionTimer) {
    clearTimeout(silenceDetectionTimer)
    silenceDetectionTimer = null
  }
  // Do not start speech-triggering timers before a Zoom join.
  // UI countdown/progress is handled by the UI update loop.
  if (hasJoinedSession) {
    startSilenceDetection()
  } else {
  }
  
  // WebSocketで設定を同期（ホストまたはマスターモード）
  const canSync = isSessionHost || (typeof isMasterMode !== 'undefined' && isMasterMode === true)
  if (syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN && canSync) {
    const currentUserId = client?.getCurrentUserInfo()?.userId
    const syncMessage = {
      type: 'SILENCE_THRESHOLD_UPDATE',
      thresholdSeconds: newThresholdSeconds,
      timestamp: new Date().toISOString(),
      senderId: currentUserId,
      masterId: isAgentMaster ? currentUserId : null,
      forceMaster: isMasterMode === true  // サーバー側の権限チェックに必要
    }

    syncWebSocket.send(JSON.stringify(syncMessage))
  } else {
    console.warn('[Silence Threshold] Cannot sync - WebSocket:', syncWebSocket?.readyState, 'isHost:', isSessionHost, 'isMasterMode:', isMasterMode, 'canSync:', canSync)
  }
  
  // UIを更新
  updateAgentStatusUI()
  
  // サクセスメッセージ
  const successMsg = `Silence threshold updated to ${newThresholdSeconds} seconds`
  
  // ホスト側では簡単なログのみ（重複アラート防止）
}

/* ========== Update Periodic Interval ================================ */
function updatePeriodicInterval(newIntervalSeconds) {
  const oldInterval = agentBehaviorSettings.periodicIntervalSeconds

  agentBehaviorSettings.periodicIntervalSeconds = newIntervalSeconds
  PERIODIC_SPEECH_INTERVAL = newIntervalSeconds * 1000


  if (!hasJoinedSession) {
    preJoinPeriodicUiAnchor = Date.now()
  }

  // Reset timer
  if (typeof resetPeriodicSpeech === 'function') {
    resetPeriodicSpeech()
  } else {
    // Fallback for cases where resetPeriodicSpeech isn't available yet
    lastPeriodicSpeech = Date.now()
    if (periodicSpeechTimer) {
      clearInterval(periodicSpeechTimer)
      periodicSpeechTimer = null
    }
  }

  // WebSocket sync (host or master mode)
  const canSync = isSessionHost || (typeof isMasterMode !== 'undefined' && isMasterMode === true)
  if (syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN && canSync) {
    const currentUserId = client?.getCurrentUserInfo()?.userId
    const syncMessage = {
      type: 'PERIODIC_INTERVAL_UPDATE',
      intervalSeconds: newIntervalSeconds,
      timestamp: new Date().toISOString(),
      senderId: currentUserId,
      masterId: isAgentMaster ? currentUserId : null,
      forceMaster: isMasterMode === true
    }
    syncWebSocket.send(JSON.stringify(syncMessage))
  } else {
    console.warn('[Periodic Interval] Cannot sync - WebSocket:', syncWebSocket?.readyState, 'isHost:', isSessionHost, 'isMasterMode:', isMasterMode, 'canSync:', canSync)
  }

  updateAgentStatusUI()
}

/* ========== Show Temporary Message =================================== */
function showTemporaryMessage(message, type = 'success') {
  const palette = {
    success: { background: '#28a745', color: 'white' },
    warning: { background: '#ffc107', color: '#212529' },
    error: { background: '#dc3545', color: 'white' },
    info: { background: '#17a2b8', color: 'white' }
  }
  const style = palette[type] || palette.success

  const messageDiv = document.createElement('div')
  messageDiv.textContent = message
  messageDiv.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: ${style.background};
    color: ${style.color};
    padding: 10px 15px;
    border-radius: 5px;
    z-index: 9999;
    font-size: 14px;
    box-shadow: 0 2px 10px rgba(0,0,0,0.2);
  `
  
  document.body.appendChild(messageDiv)
  
  setTimeout(() => {
    if (messageDiv.parentNode) {
      messageDiv.parentNode.removeChild(messageDiv)
    }
  }, 3000)
}

/* ========== WebSocket Debug Buttons ================================= */
function setupWebSocketDebugButtons() {
  const testButton = document.getElementById('websocket-test')
  const sendTestButton = document.getElementById('websocket-send-test')
  const statusDiv = document.getElementById('websocket-status')

  if (testButton && sendTestButton && statusDiv) {
    testButton.addEventListener('click', () => {
      if (!syncWebSocket || syncWebSocket.readyState !== WebSocket.OPEN) {
        initializeWebSocketConnection()
      } else {
      }
      updateWebSocketStatus()
    })

    sendTestButton.addEventListener('click', () => {
      const testMessage = {
        type: 'TEST_MESSAGE',
        message: 'Hello from WebSocket test!',
        timestamp: Date.now(),
        sender: document.getElementById('user_name')?.value || 'Test User'
      }
      
      sendWebSocketMessage(testMessage)
      updateWebSocketStatus()
    })

    // 初期状態を表示
    updateWebSocketStatus()
  } else {
    console.warn('[WebSocket Debug] Debug buttons not found')
  }
}

function updateWebSocketStatus() {
  const statusDiv = document.getElementById('websocket-status')
  if (!statusDiv) return

  const status = {
    connected: syncWebSocket !== null,
    readyState: syncWebSocket?.readyState,
    url: syncWebSocket?.url
  }

  const readyStateText = {
    0: 'CONNECTING',
    1: 'OPEN',
    2: 'CLOSING', 
    3: 'CLOSED'
  }

  const statusText = `
Status: ${status.connected ? 'Created' : 'Not created'}
Ready State: ${status.readyState} (${readyStateText[status.readyState] || 'UNKNOWN'})
URL: ${status.url || 'Not set'}
Time: ${new Date().toLocaleTimeString()}
  `.trim()

  statusDiv.textContent = statusText
  
  // ログにも出力
}


/* =======================================================================
   1. セッション参加 - Helper Functions
   =====================================================================*/

/**
 * Join前に状態がクリーンであることを確認する
 */
function ensureCleanState() {

  hasJoinedSession = false

  // Check and cleanup any remaining timers
  if (silenceDetectionTimer) {
    clearInterval(silenceDetectionTimer)
    silenceDetectionTimer = null
  }

  if (periodicSpeechTimer) {
    clearInterval(periodicSpeechTimer)
    periodicSpeechTimer = null
  }

  if (uiUpdateTimer) {
    clearInterval(uiUpdateTimer)
    uiUpdateTimer = null
  }

  if (transcriptCompletionTimer) {
    clearTimeout(transcriptCompletionTimer)
    transcriptCompletionTimer = null
  }

  if (userSpeakingTimeout) {
    clearTimeout(userSpeakingTimeout)
    userSpeakingTimeout = null
  }

  // Clear any remaining participants data
  if (remoteParticipants.size > 0) {
    remoteParticipants.clear()
  }

  if (remoteParticipantsByUserId.size > 0) {
    remoteParticipantsByUserId.clear()
  }

  if (activeVideoUsers.size > 0) {
    activeVideoUsers.clear()
  }

  if (videoProcessingUsers.size > 0) {
    videoProcessingUsers.clear()
  }

  if (remoteCanvases.size > 0) {
    remoteCanvases.forEach((canvasInfo, displayName) => {
      removeRemoteUserCanvas(displayName)
    })
    remoteCanvases.clear()
  }

  // Reset local video track
  if (window.localVideoTrack) {
    window.localVideoTrack = null
  }

  // Close any lingering WebSocket
  if (syncWebSocket && syncWebSocket.readyState !== WebSocket.CLOSED) {
    syncWebSocket.close()
    syncWebSocket = null
  }

  // Reset state flags
  currentDisplayedUser = null
  isAgentMaster = false
  isSessionHost = false
  isActiveAgentSpeaking = false
  isUserSpeaking = false

  addDebugMessage('INFO', 'JOIN-CLEAN-STATE', 'Ensured clean state before joining')
}

/* =======================================================================
   Lobby Screen Handler
   =====================================================================*/
// Store session protection status
const sessionProtectionStatus = new Map()

async function checkServiceStatus() {
  try {
    const res = await fetch('/api/status')
    const { checks } = await res.json()
    const failed = checks.filter(c => !c.ok && c.required)
    const warnings = checks.filter(c => !c.ok && !c.required)

    // Remove any existing banner
    const existing = document.getElementById('lobby-status-banner')
    if (existing) existing.remove()

    if (failed.length === 0 && warnings.length === 0) return

    const banner = document.createElement('div')
    banner.id = 'lobby-status-banner'
    banner.style.cssText = 'width:100%;max-width:860px;margin-bottom:20px;display:flex;flex-direction:column;gap:6px;'

    const icon = (name) => `<i data-lucide="${name}" style="width:16px;height:16px;flex-shrink:0;"></i>`

    failed.forEach(c => {
      const el = document.createElement('div')
      el.style.cssText = 'background:#2e1a1a;border:1px solid #6a1f1f;border-radius:8px;padding:12px 16px;color:#f44336;font-size:13px;display:flex;align-items:center;gap:10px;'
      el.innerHTML = `${icon('x-circle')}<div><strong>${c.label} is not configured</strong> — sessions cannot be started. ${c.detail || ''} <a href="/admin" style="color:#ff6b6b;text-decoration:underline;">Fix in Admin</a></div>`
      banner.appendChild(el)
    })

    warnings.forEach(c => {
      const el = document.createElement('div')
      el.style.cssText = 'background:#2e2a10;border:1px solid #5a4a00;border-radius:8px;padding:10px 16px;color:#ffb300;font-size:13px;display:flex;align-items:center;gap:10px;'
      el.innerHTML = `${icon('alert-triangle')}<div><strong>${c.label}:</strong> ${c.detail || 'not configured'}</div>`
      banner.appendChild(el)
    })

    // Insert banner above the session cards
    const lobbyCards = document.querySelector('#lobby-screen > div:nth-child(2)')
    if (lobbyCards) lobbyCards.before(banner)
    else document.getElementById('lobby-screen').prepend(banner)
    if (window.lucide) lucide.createIcons()

    // Disable create/join buttons if required services are missing
    if (failed.length > 0) {
      const createBtn = document.getElementById('lobby-create-btn')
      const joinBtn = document.getElementById('lobby-join-btn')
      if (createBtn) { createBtn.disabled = true; createBtn.title = 'Zoom SDK not configured' }
      if (joinBtn) { joinBtn.disabled = true; joinBtn.title = 'Zoom SDK not configured' }
    }
  } catch (err) {
    console.warn('[Lobby] Could not check service status:', err)
  }
}

async function loadSessionsList() {
  try {
    const response = await fetch('/api/sessions')
    if (!response.ok) {
      console.warn('[Lobby] Failed to load sessions:', response.statusText)
      return
    }

    const sessions = await response.json()
    const selectElement = document.getElementById('lobby-join-session-name')
    if (!selectElement) return

    // Clear existing options (keep default)
    while (selectElement.options.length > 1) {
      selectElement.remove(1)
    }

    // Add options for each session
    sessions.forEach(session => {
      const option = document.createElement('option')
      option.value = session.topic
      const icon = session.hasPassword ? '🔒' : '🔓'
      option.textContent = `${icon} ${session.topic} (${session.participants}/${session.maxUsers})`
      option.dataset.hasPassword = session.hasPassword ? 'true' : 'false'
      selectElement.appendChild(option)

      // Store protection status for easy lookup
      sessionProtectionStatus.set(session.topic, session.hasPassword)
    })

  } catch (error) {
    console.error('[Lobby] Error loading sessions:', error)
  }
}

function updatePasswordFieldVisibility() {
  const selectElement = document.getElementById('lobby-join-session-name')
  const passwordWrapper = document.getElementById('join-password-wrapper')
  const passwordInput = document.getElementById('lobby-join-password')
  const passwordHelper = document.getElementById('join-password-helper')

  if (!selectElement || !passwordWrapper || !passwordInput) return

  const selectedValue = selectElement.value
  const isProtected = sessionProtectionStatus.get(selectedValue)

  if (!selectedValue) {
    // No session selected - show password field normally
    passwordWrapper.style.display = 'block'
    passwordInput.disabled = false
    if (passwordHelper) passwordHelper.style.display = 'none'
  } else if (isProtected) {
    // Password-protected session - show password field
    passwordWrapper.style.display = 'block'
    passwordInput.disabled = false
    if (passwordHelper) passwordHelper.style.display = 'none'
  } else {
    // Open session (no password) - show helper text and disable password field
    passwordWrapper.style.display = 'block'
    passwordInput.disabled = true
    passwordInput.value = ''
    if (passwordHelper) {
      passwordHelper.style.display = 'block'
    }
  }
}

function handleLobbyCreate() {
  const sessionName = document.getElementById('lobby-create-session-name').value.trim()
  const sessionPwd = document.getElementById('lobby-create-password').value.trim()
  const displayName = document.getElementById('lobby-create-display-name').value.trim()
  const conditionId = document.getElementById('lobby-create-condition')?.value?.trim() || null

  if (!sessionName) {
    alert('Please enter a session name')
    return
  }

  joinWithSession(sessionName, sessionPwd || null, displayName, conditionId)
}

function handleLobbyJoin() {
  const sessionName = document.getElementById('lobby-join-session-name').value.trim()
  const sessionPwdInput = document.getElementById('lobby-join-password')
  const sessionPwd = sessionPwdInput.value.trim()
  const displayName = document.getElementById('lobby-join-display-name').value.trim()

  if (!sessionName) {
    alert('Please select a session')
    return
  }

  joinWithSession(sessionName, sessionPwd || null, displayName)
}

function joinWithSession(sessionName, sessionPwd, displayName, conditionId) {
  // Copy values to inputs for backward compatibility
  document.getElementById('session_topic').value = sessionName
  document.getElementById('session_pwd').value = sessionPwd || ''
  document.getElementById('user_name').value = displayName || 'User'

  // Resolve conditionId: explicit arg > URL param
  if (!conditionId) {
    conditionId = new URLSearchParams(window.location.search).get('condition') || null
  }

  // Save session info to sessionStorage for F5 recovery
  sessionStorage.setItem('sessionInfo', JSON.stringify({
    sessionName: sessionName,
    sessionPwd: sessionPwd || '',
    displayName: displayName || 'User',
    conditionId: conditionId || null
  }))

  // Hide lobby and show call UI
  document.getElementById('lobby-screen').style.display = 'none'
  const mainDiv = document.getElementById('main')
  if (mainDiv) {
    mainDiv.style.display = 'flex'
  }
  const inputFormsDiv = document.getElementById('input-forms')
  if (inputFormsDiv) {
    inputFormsDiv.classList.remove('hidden')
    inputFormsDiv.style.display = 'block'
  }

  // Update toolbar session name
  const toolbarSessionName = document.getElementById('toolbar-session-name')
  if (toolbarSessionName) {
    toolbarSessionName.textContent = sessionName
  }

  // Update session invite link and password display in participants panel
  const inviteLinkEl = document.getElementById('session-invite-link')
  if (inviteLinkEl) {
    const url = new URL(window.location.href)
    url.searchParams.set('session', sessionName)
    inviteLinkEl.value = url.toString()
  }
  const pwdDisplayEl = document.getElementById('session-password-display')
  if (pwdDisplayEl) {
    pwdDisplayEl.value = sessionPwd || ''
  }

  // Apply condition appearance (models + background) then build canvases and init avatars
  console.log('[Join] conditionId resolved:', conditionId)
  console.log('[Join] FBXAvatarSystem available:', !!window.FBXAvatarSystem)
  async function applyConditionThenInit() {
    let agentCount = 1 // fallback: one agent slot if no condition is configured
    
    // Wait for FBXAvatarSystem to be ready (up to 5 seconds)
    let retries = 0
    while (!window.FBXAvatarSystem && retries < 50) {
      await new Promise(r => setTimeout(r, 100))
      retries++
    }
    
    if (!window.FBXAvatarSystem) {
      console.error('[Join] FBXAvatarSystem not available after 5s - avatars will not render!')
    }

    if (conditionId && window.FBXAvatarSystem && window.FBXAvatarSystem.setConditionAppearance) {
      try {
        const r = await fetch('/api/conditions')
        const conditions = r.ok ? await r.json() : []
        console.log('[Join] Loaded conditions:', conditions.map(c => c.id))
        const condition = conditions.find(c => c.id === conditionId)
        console.log('[Join] Matched condition:', condition)
        if (condition) {
          window.FBXAvatarSystem.setConditionAppearance(condition)
          agentCount = Array.isArray(condition.agents) && condition.agents.length > 0
            ? condition.agents.length : agentCount
          console.log('[Join] agentCount set to:', agentCount)
          const banner = document.getElementById('session-condition-banner')
          const label = document.getElementById('session-condition-label')
          if (banner && label) { label.textContent = condition.name || condition.id; banner.style.display = 'flex' }
        } else {
          console.warn('[Join] No condition matched id:', conditionId)
        }
      } catch (e) {
        console.warn('[Join] Could not load condition config:', e)
      }
    } else {
      console.warn('[Join] Skipping condition apply — conditionId:', conditionId, 'FBXAvatarSystem:', !!window.FBXAvatarSystem)
    }
    console.log('[Join] Building', agentCount, 'avatar canvases')
    buildAvatarCanvases(agentCount)
    if (typeof updateMainLayoutGrid === 'function') updateMainLayoutGrid()
    console.log('[Join] AVATAR_CONFIG after setConditionAppearance:', JSON.stringify(window.FBXAvatarSystem?.AVATAR_CONFIG?.map(c => c.name)))
    if (window.FBXAvatarSystem) {
      const initFn = window.FBXAvatarSystem.reinitializeAvatars || window.FBXAvatarSystem.initializeAvatars
      console.log('[Join] Calling', initFn.name || 'initFn')
      await initFn()
      console.log('[Join] avatars after init:', window.avatars?.length)
    }
  }
  applyConditionThenInit().catch(err => console.error('[Join] Error initializing avatars:', err))

  // Start the join process
  joinSession().catch(err => console.error('[JOIN] joinSession threw:', err))
}

/* =======================================================================
   1. セッション参加 - Main Function
   =====================================================================*/
