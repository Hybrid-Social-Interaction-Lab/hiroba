async function getSignature(topic, password) {
  const body = { topic, role: 1, password }
  const res  = await fetch('/api/', {
    method : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body   : JSON.stringify(body)
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `Signature API ${res.status}`)
  }
  const { signature } = await res.json()
  return signature
}

/* =======================================================================
   8. Conversation History Functions
   =====================================================================*/

function addToConversationHistory(speaker, message, type = 'user') {
  const timestamp = new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  const conversation = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: timestamp,
    speaker: speaker,
    message: message,
    type: type // 'user' or 'ai'
  }

  // ユーザーメッセージの場合、キーワード検出チェックを行う
  if (type === 'user') {
    const shouldTriggerAI = checkKeywordDetection(message)
    conversation.shouldTriggerAI = shouldTriggerAI

    // ユーザー発話時にタイマーをリセット
    if (window.agentBehaviorManager) {
      window.agentBehaviorManager.resetTimers()
    }
  }

  conversationHistory.push(conversation)
  updateConversationDisplay()
  showSubtitle(conversation.speaker, conversation.message)

  // 会話履歴を同期
  syncConversationUpdate(conversation)

}

// Always trigger AI response for every transcript turn.
// Per-agent triggerKeywords filtering happens server-side in _resolveTriggeredAgents:
// agents with an empty triggerKeywords list respond to everything; others only when their keyword matches.
function checkKeywordDetection(text) {
  return true
}

function wasNameMentionDetectedRecently() {
  return lastNameMentionDetectedAt > 0 &&
    (Date.now() - lastNameMentionDetectedAt) < PERIODIC_SUPPRESS_AFTER_NAME_MENTION_MS
}

// 名前検知時のAI応答生成関数（checkKeywordDetectionの直後に配置）
function getParticipantNames() {
  const names = []
  if (typeof remoteParticipants !== 'undefined') {
    remoteParticipants.forEach((_, displayName) => names.push(displayName))
  }
  return names
}

async function generateNameMentionResponse(userMessage, speakerName) {
  try {

    agentStatus.state = 'Responding to name mention'
    agentStatus.lastResponse = new Date().toLocaleTimeString()

    // マスター以外は何もしない
    if (!isTimerMasterClient()) {
      return
    }

    const aiStyleElement = document.getElementById('ai-style')
    const aiStyle = aiStyleElement ? aiStyleElement.value.trim() :
                   (window.currentAIStyle || 'You are a helpful and neutral AI assistant.')

    const recentHistory = (typeof conversationHistory !== 'undefined' && Array.isArray(conversationHistory))
      ? conversationHistory.slice(-20).map(c => ({ speaker: c.speaker, message: c.message, type: c.type }))
      : []

    // Use multi-agent endpoint: agents with empty triggerKeywords always respond,
    // others respond if their keyword appears in the message. Responses arrive in random order,
    // each agent seeing what prior agents said in the same turn.
    const response = await fetch('/api/chat/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: userMessage,
        speakerName: speakerName,
        aiStyle: aiStyle,
        history: recentHistory,
        participants: getParticipantNames(),
        sessionId: generateSessionId(document.getElementById('session_topic')?.value || 'default'),
        condition: getConditionFromPathname()
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()

    if (data.success && Array.isArray(data.responses)) {
      const validResponses = data.responses.filter(r => r.response && r.response.trim())
      if (validResponses.length === 0) return

      // Queue responses: each plays after the previous one finishes (estimated by text length)
      let delayMs = 0
      for (const agentResponse of validResponses) {
        const text = agentResponse.response.trim()
        setTimeout(() => {
          speakAsActiveAgent(text, 'name_mention_triggered', agentResponse.agentName)
        }, delayMs)
        delayMs += text.length * 100 + 500 // match speakAsActiveAgent's estimatedDuration + gap
      }
    }

  } catch (error) {
    console.error('[Agent Behavior] Name mention response error:', error)
  }
}

function addToConversationHistoryLocal(speaker, message, type = 'user') {
  // 同期しないでローカルにのみ追加する関数
  const timestamp = new Date().toLocaleTimeString('en-US', { 
    hour12: false, 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit' 
  })
  
  const conversation = {
    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: timestamp,
    speaker: speaker,
    message: message,
    type: type
  }
  
  conversationHistory.push(conversation)
  updateConversationDisplay()
  showSubtitle(speaker, message)

}

let _subtitleHideTimer = null

function showSubtitle(speaker, text) {
  const el = document.getElementById('call-subtitle')
  const speakerEl = document.getElementById('call-subtitle-speaker')
  const textEl = document.getElementById('call-subtitle-text')
  if (!el || !speakerEl || !textEl) return

  speakerEl.textContent = speaker
  textEl.textContent = text
  el.style.display = 'block'

  if (_subtitleHideTimer) clearTimeout(_subtitleHideTimer)
  // keep visible for ~5s or length of text, whichever is longer
  const duration = Math.max(5000, text.length * 60)
  _subtitleHideTimer = setTimeout(() => { el.style.display = 'none' }, duration)
}

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

  const logEl = document.getElementById('conversation-log')
  if (!logEl) return

  // 最新の10件のみ表示
  const recentConversations = conversationHistory.slice(-10)
  
  logEl.innerHTML = ''
  
  recentConversations.forEach(conv => {
    const div = document.createElement('div')
    div.style.marginBottom = '8px'
    div.style.padding = '6px 8px'
    div.style.borderRadius = '4px'
    div.style.borderLeft = '3px solid ' + (
      conv.type === 'ai' ? '#007bff' : 
      conv.type === 'manual' ? '#ff9800' : 
      conv.type === 'agent_initiated' ? '#9c27b0' : 
      '#28a745'
    )
    div.style.backgroundColor = (
      conv.type === 'ai' ? '#e3f2fd' : 
      conv.type === 'manual' ? '#fff3e0' : 
      conv.type === 'agent_initiated' ? '#f3e5f5' : 
      '#f1f8e9'
    )
    
    // タイムスタンプとスピーカー
    const header = document.createElement('div')
    header.style.fontSize = '11px'
    header.style.color = '#666'
    header.style.marginBottom = '2px'
    header.style.fontWeight = 'bold'
    
    const speakerIcon = (
      conv.type === 'ai' ? '<i data-lucide="bot" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>' : 
      conv.type === 'manual' ? '<i data-lucide="mic" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>' : 
      conv.type === 'agent_initiated' ? '<i data-lucide="hand-raised" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>' : 
      '<i data-lucide="user" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
    )
    header.textContent = `${conv.timestamp} ${speakerIcon} ${conv.speaker}`
    
    // メッセージ内容
    const content = document.createElement('div')
    content.style.fontSize = '13px'
    content.style.color = '#333'
    content.style.lineHeight = '1.3'
    content.textContent = conv.message
    
    div.appendChild(header)
    div.appendChild(content)
    logEl.appendChild(div)
  })
  
  // 自動スクロール
  logEl.scrollTop = logEl.scrollHeight
}

function clearConversationHistory() {
  conversationHistory = []
  conversationCounter = 0
  updateConversationDisplay()
}

/* =======================================================================
   9. Active Agent Silence Detection Functions
   =====================================================================*/

// updateSpeechActivity is defined in sync.js and exposed as window.updateSpeechActivity there

function resolveTriggeredBot(botSelection) {
  const avatars = window.avatars
  if (!avatars || avatars.length === 0) return undefined
  if (!botSelection || botSelection.mode === 'random') {
    const randomAvatar = avatars[Math.floor(Math.random() * avatars.length)]
    return randomAvatar.config?.name
  }
  if (botSelection.mode === 'specific' && botSelection.botName) {
    return botSelection.botName
  }
  return undefined
}

function triggerSilenceResponse() {
  if (!hasJoinedSession) {
    return
  }
  const silenceToggleEl = document.getElementById('silence-detection-toggle')
  if (silenceToggleEl && silenceToggleEl.checked === false) {
    // Keep internal flags in sync with the UI.
    agentBehaviorSettings.silenceDetection = false
  }

  if (isActiveAgentSpeaking || isUserSpeaking || !agentBehaviorSettings.silenceDetection) {
    return
  }
  
  // 沈黙応答はマスターのみが実行
  if (!isTimerMasterClient()) {
    return
  }
  
  
  agentStatus.state = 'Responding to silence'
  agentStatus.lastResponse = new Date().toLocaleTimeString()
  
  // UI設定から取得、またはデフォルト値を使用
  const silencePrompts = window.silenceDetectionMessages || [
    "Sorry, do you have any questions?",
    "Is there anything I can help clarify?",
    "Please feel free to share your thoughts."
  ]
  
  const randomPrompt = silencePrompts[Math.floor(Math.random() * silencePrompts.length)]
  
  // ログに記録
  logAgentAction('silence_triggered', {
    silenceDuration: SILENCE_THRESHOLD,
    prompt: randomPrompt,
    timestamp: new Date().toISOString()
  })

  // アクティブエージェントに発話させる
  speakAsActiveAgent(randomPrompt, 'silence_triggered', resolveTriggeredBot(window.silenceBotSelection))

  // タイマーをリセット（沈黙検知を再開）
  updateSpeechActivity()
}

function startPeriodicSpeech() {
  // 定期発話タイマーはマスターのみが実行
  if (!isTimerMasterClient()) {
    return
  }

  // Before joining a Zoom session, never schedule speech triggers.
  if (!hasJoinedSession) {
    return
  }

  // Hard gate: if the UI toggle is OFF, never start periodic speech.
  const periodicToggleEl = document.getElementById('periodic-speech-toggle')
  if (periodicToggleEl && periodicToggleEl.checked === false) {
    agentBehaviorSettings.periodicSpeech = false
    if (periodicSpeechTimer) {
      clearInterval(periodicSpeechTimer)
      periodicSpeechTimer = null
    }
    return
  }

  // Ensure only one periodic timer is running.
  if (periodicSpeechTimer) {
    clearInterval(periodicSpeechTimer)
    periodicSpeechTimer = null
  }
  
  periodicSpeechTimer = setInterval(() => {
    const periodicToggleEl = document.getElementById('periodic-speech-toggle')
    if (periodicToggleEl && periodicToggleEl.checked === false) {
      agentBehaviorSettings.periodicSpeech = false
      if (periodicSpeechTimer) {
        clearInterval(periodicSpeechTimer)
        periodicSpeechTimer = null
      }
      return
    }

    if (!isActiveAgentSpeaking && !isUserSpeaking && agentBehaviorSettings.periodicSpeech &&
        (Date.now() - lastPeriodicSpeech) >= PERIODIC_SPEECH_INTERVAL) {
      // New definition: do not proactively speak if users are actively calling the agent.
      if (wasNameMentionDetectedRecently()) {
        lastPeriodicSpeech = Date.now()
        // Keep all clients' periodic countdown in sync even when skipping.
        syncPeriodicSpeechReset()
        return
      }

      triggerPeriodicResponse()
      lastPeriodicSpeech = Date.now()
    }
  }, 1000) // 1秒ごとにチェック（カウントダウン0で確実に発火させる）
  
}

async function triggerPeriodicResponse() {
  if (!hasJoinedSession) {
    return
  }
  const periodicToggleEl = document.getElementById('periodic-speech-toggle')
  if (periodicToggleEl && periodicToggleEl.checked === false) {
    agentBehaviorSettings.periodicSpeech = false
    if (periodicSpeechTimer) {
      clearInterval(periodicSpeechTimer)
      periodicSpeechTimer = null
    }
    return
  }

  if (!agentBehaviorSettings.periodicSpeech) {
    return
  }

  // 定期発話はマスターのみが実行
  if (!isTimerMasterClient()) {
    return
  }
  
  
  agentStatus.state = 'Proactive speaking'
  agentStatus.lastResponse = new Date().toLocaleTimeString()
  lastPeriodicSpeech = Date.now()

  // 定期発話リセットを同期
  syncPeriodicSpeechReset()

  try {
    // Generate proactive periodic speech using recent history.
    const aiStyleElement = document.getElementById('ai-style')
    const aiStyle = aiStyleElement ? aiStyleElement.value.trim() :
      (window.currentAIStyle || 'You are a discussion collaborator.')

    const recentHistory = (typeof conversationHistory !== 'undefined' && Array.isArray(conversationHistory))
      ? conversationHistory.slice(-20).map(c => ({ speaker: c.speaker, message: c.message, type: c.type }))
      : []

    const periodicPrompt = `You are a discussion collaborator. Follow the instructions to join the conversation. Nobody has called you recently.\n` +
      `Based on the recent conversation history, proactively say one short, helpful sentence (a gentle check-in or a useful next step). ` +
      `Do not claim you were called. Keep it brief.`

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userMessage: periodicPrompt,
        speakerName: 'Periodic',
        triggerType: 'periodic_triggered',
        aiStyle: aiStyle,
        history: recentHistory,
        participants: getParticipantNames(),
        sessionId: generateSessionId(document.getElementById('session_topic')?.value || 'default'),
        condition: getConditionFromPathname()
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    const text = (data && data.success && data.response) ? String(data.response).trim() : ''

    const fallbackPool = window.periodicSpeechMessages || [
      'How is the meeting progressing?',
      'Would you like to discuss any specific topics?',
      'Are there any important points to cover?'
    ]
    const finalText = text || fallbackPool[Math.floor(Math.random() * fallbackPool.length)]

    logAgentAction('periodic_speech_triggered', {
      interval: PERIODIC_SPEECH_INTERVAL,
      prompt: finalText,
      timestamp: new Date().toISOString()
    })

    await speakAsActiveAgent(finalText, 'periodic_triggered', resolveTriggeredBot(window.periodicBotSelection))
  } catch (error) {
    console.error('[Periodic Speech] Failed to generate periodic AI response:', error)

    const fallbackPool = window.periodicSpeechMessages || [
      'How is the meeting progressing?',
      'Would you like to discuss any specific topics?',
      'Are there any important points to cover?'
    ]
    const fallbackText = fallbackPool[Math.floor(Math.random() * fallbackPool.length)]

    logAgentAction('periodic_speech_triggered', {
      interval: PERIODIC_SPEECH_INTERVAL,
      prompt: fallbackText,
      timestamp: new Date().toISOString(),
      error: error?.message
    })

    await speakAsActiveAgent(fallbackText, 'periodic_triggered', resolveTriggeredBot(window.periodicBotSelection))
  }
}

// Preset lines available for each bot in the WoZ panel.
// Loaded from `settings.wozPresets` (see applySettings / SETTINGS_UPDATE handler).
// This array is the fallback when settings don't define any presets.
window.wozPresetLines = [
  "Thank you for sharing that.",
  "That's a great point.",
  "Could you elaborate on that?",
  "I agree with what was said.",
  "Let's move on to the next topic.",
  "Does anyone have questions about this?",
  "I'd like to add something here.",
  "That's an interesting perspective.",
  "Let me summarize what we've discussed so far.",
  "Is there anything else you'd like to cover?"
]

// Replace the WoZ preset list and re-render the host panel WoZ controls if they're mounted.
window.applyWozPresets = function applyWozPresets(presets) {
  if (!Array.isArray(presets) || presets.length === 0) return
  window.wozPresetLines = presets.slice()
  // Force a re-render of the WoZ bot dropdowns so new lines show up immediately.
  if (typeof refreshWozBotControls === 'function') {
    const container = document.getElementById('woz-bot-controls')
    if (container) {
      const names = Array.from(container.querySelectorAll('[data-bot-name]')).map(el => el.dataset.botName)
      // Pass through a fake avatars shape that matches what refreshWozBotControls expects.
      const avatars = names.map(name => ({ config: { name } }))
      // Clear container first so the "agent list changed" check inside refreshWozBotControls fires.
      container.innerHTML = ''
      refreshWozBotControls(avatars)
    }
  }
}

async function triggerManualGenerateResponseForBot(agentName) {
  if (!isTimerMasterClient()) {
    showTemporaryMessage('Only master can manually generate responses', 'warning')
    return
  }
  if (!hasJoinedSession) {
    showTemporaryMessage('Join the session before manual generate', 'warning')
    return
  }
  agentStatus.state = 'Manual generating'
  agentStatus.lastResponse = new Date().toLocaleTimeString()
  updateAgentStatusUI()

  try {
    const aiStyleElement = document.getElementById('ai-style')
    const aiStyle = aiStyleElement ? aiStyleElement.value.trim() :
      (window.currentAIStyle || 'You are a helpful and neutral AI assistant.')

    const recentHistory = (typeof conversationHistory !== 'undefined' && Array.isArray(conversationHistory))
      ? conversationHistory.slice(-20).map(c => ({ speaker: c.speaker, message: c.message, type: c.type }))
      : []

    const manualPrompt = `The host manually requested a response from agent "${agentName}". ` +
      'Based on the recent conversation history, provide one short, helpful, natural response that can continue the discussion.'

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userMessage: manualPrompt,
        speakerName: agentName,
        aiStyle: aiStyle,
        history: recentHistory,
        participants: getParticipantNames(),
        sessionId: generateSessionId(document.getElementById('session_topic')?.value || 'default'),
        condition: getConditionFromPathname()
      })
    })

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)

    const data = await response.json()
    const text = (data && data.success && data.response) ? String(data.response).trim() : ''

    const fallbackPool = window.periodicSpeechMessages || [
      'How is the meeting progressing?',
      'Would you like to discuss any specific topics?',
      'Are there any important points to cover?'
    ]

    const finalText = text || fallbackPool[Math.floor(Math.random() * fallbackPool.length)]
    wozEnqueue(agentName, finalText)
  } catch (error) {
    console.error('[Manual Generate] Failed to generate response:', error)
    showTemporaryMessage('Manual generate failed. Please try again.', 'danger')
  }
}

// Speech queue for WoZ manual controls
window.wozSpeechQueue = []
window.wozQueueRunning = false

function wozEnqueue(agentName, text) {
  window.wozSpeechQueue.push({ agentName, text })
  updateWozQueueDisplay()
  if (!window.wozQueueRunning) wozDrainQueue()
}

async function wozDrainQueue() {
  if (window.wozSpeechQueue.length === 0) {
    window.wozQueueRunning = false
    updateWozQueueDisplay()
    return
  }
  window.wozQueueRunning = true
  updateWozQueueDisplay()

  // Wait until any currently-playing speech finishes
  while (isActiveAgentSpeaking) {
    await new Promise(r => setTimeout(r, 100))
  }

  const { agentName, text } = window.wozSpeechQueue.shift()
  updateWozQueueDisplay()
  logAgentAction('manual_triggered', { prompt: text, timestamp: new Date().toISOString() })

  // speakAsActiveAgent is not async — it fires and sets isActiveAgentSpeaking synchronously
  speakAsActiveAgent(text, 'manual_triggered', agentName)

  // Give it a tick to set isActiveAgentSpeaking = true, then poll until done
  await new Promise(r => setTimeout(r, 50))
  while (isActiveAgentSpeaking) {
    await new Promise(r => setTimeout(r, 100))
  }

  wozDrainQueue()
}

function updateWozQueueDisplay() {
  const badge = document.getElementById('woz-queue-badge')
  const list = document.getElementById('woz-queue-list')
  const n = window.wozSpeechQueue.length

  if (badge) {
    badge.textContent = n > 0 ? `${n} queued` : ''
    badge.style.display = n > 0 ? 'inline' : 'none'
  }

  const empty = document.getElementById('woz-queue-empty')
  if (empty) empty.style.display = n === 0 ? 'block' : 'none'

  if (list) {
    if (n === 0) {
      list.style.display = 'none'
      list.innerHTML = ''
    } else {
      list.style.display = 'block'
      list.innerHTML = window.wozSpeechQueue.map((item, i) =>
        `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-bottom:1px solid #222;">
          <span style="color:#555;font-size:10px;flex-shrink:0;">${i + 1}.</span>
          <span style="color:#888;font-size:10px;flex-shrink:0;">[${item.agentName}]</span>
          <span style="color:#ccc;font-size:10px;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${item.text}</span>
          <button onclick="window.wozSpeechQueue.splice(${i},1);updateWozQueueDisplay()"
            style="background:none;border:none;color:#555;cursor:pointer;font-size:11px;padding:0 2px;flex-shrink:0;" title="Remove">✕</button>
        </div>`
      ).join('')
    }
  }
}

async function sayTextAsBot(agentName, text) {
  if (!isTimerMasterClient()) {
    showTemporaryMessage('Only master can control agents', 'warning')
    return
  }
  if (!hasJoinedSession) {
    showTemporaryMessage('Join the session first', 'warning')
    return
  }
  if (!text || !text.trim()) {
    showTemporaryMessage('Please enter text for the bot to say', 'warning')
    return
  }
  wozEnqueue(agentName, text.trim())
}

async function triggerManualGenerateResponse() {
  if (!isTimerMasterClient()) {
    showTemporaryMessage('Only master can manually generate responses', 'warning')
    return
  }

  if (!hasJoinedSession) {
    showTemporaryMessage('Join the session before manual generate', 'warning')
    return
  }

  if (isActiveAgentSpeaking) {
    showTemporaryMessage('Agent is currently speaking. Please try again.', 'warning')
    return
  }

  agentStatus.state = 'Manual generating'
  agentStatus.lastResponse = new Date().toLocaleTimeString()
  updateAgentStatusUI()

  try {
    const aiStyleElement = document.getElementById('ai-style')
    const aiStyle = aiStyleElement ? aiStyleElement.value.trim() :
      (window.currentAIStyle || 'You are a helpful and neutral AI assistant.')

    const recentHistory = (typeof conversationHistory !== 'undefined' && Array.isArray(conversationHistory))
      ? conversationHistory.slice(-20).map(c => ({ speaker: c.speaker, message: c.message, type: c.type }))
      : []

    const manualPrompt = 'The host manually requested an AI response. ' +
      'Based on the recent conversation history, provide one short, helpful, natural response that can continue the discussion.'

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userMessage: manualPrompt,
        speakerName: 'Manual',
        aiStyle: aiStyle,
        history: recentHistory,
        participants: getParticipantNames(),
        sessionId: generateSessionId(document.getElementById('session_topic')?.value || 'default'),
        condition: getConditionFromPathname()
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const data = await response.json()
    const text = (data && data.success && data.response) ? String(data.response).trim() : ''

    const fallbackPool = window.periodicSpeechMessages || [
      'How is the meeting progressing?',
      'Would you like to discuss any specific topics?',
      'Are there any important points to cover?'
    ]

    const finalText = text || fallbackPool[Math.floor(Math.random() * fallbackPool.length)]

    logAgentAction('manual_triggered', {
      prompt: finalText,
      timestamp: new Date().toISOString()
    })

    await speakAsActiveAgent(finalText, 'manual_triggered')
  } catch (error) {
    console.error('[Manual Generate] Failed to generate response:', error)
    showTemporaryMessage('Manual generate failed. Please try again.', 'danger')
  }
}

function speakAsActiveAgent(text, trigger, agentName) {

  if (trigger === 'name_mention_triggered') {
    if (typeof resetPeriodicSpeech === 'function') {
      resetPeriodicSpeech()
    } else {
      lastPeriodicSpeech = Date.now()
    }
  }

  if (window.avatars && window.avatars[0]) {
    isActiveAgentSpeaking = true

    // Find avatar by agentName, fall back to first avatar
    const targetAvatar = (agentName && window.avatars.find(a => a.config?.name === agentName)) || window.avatars[0]
    const activeAgentName = targetAvatar.config?.name || agentName || 'Active Agent'
    
    // 発話種類をマッピング (AI発話は4種類)
    const speechTypeMapping = {
      'silence_triggered': 'silence',
      'periodic_triggered': 'periodic',
      'name_mention_triggered': 'name',
      'manual_triggered': 'manual'
    }

    const speechType = speechTypeMapping[trigger] || 'unknown'

    currentAgentSpeechType = (speechType === 'silence' || speechType === 'periodic' || speechType === 'name' || speechType === 'manual')
      ? speechType
      : null

    // Calculate silenceBeforeSpeaking based on speech type

    let silenceBeforeSpeaking = 0;
    if (window.agentBehaviorManager) {

      // All speech types now record actual elapsed time
      if (speechType === 'silence' || speechType === 'periodic' || speechType === 'name' || speechType === 'manual') {
        silenceBeforeSpeaking = window.agentBehaviorManager.getSilenceElapsed();
      } else {
        console.warn(`[speakAsActiveAgent] Unknown speechType: ${speechType}`);
      }
    } else {
      console.warn(`[speakAsActiveAgent] WARNING - agentBehaviorManager not found! Cannot calculate silence value.`);
    }


    // 会話履歴に追加（マスターのみ）
    if (isAgentMaster) {
      // 会話履歴に追加（同期しない）
      const conversation = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        }),
        speaker: activeAgentName,
        message: text,
        type: 'agent',
        speechType: speechType,
        silenceBeforeSpeaking: silenceBeforeSpeaking
      }


      conversationHistory.push(conversation)
      updateConversationDisplay()
      showSubtitle(conversation.speaker, conversation.message)

      // 他の参加者に同期（会話履歴のみ）
      syncConversationUpdate(conversation)
      syncAgentStatus()


      // AI発話時もタイマーをリセット（silence値記録後！）
      if (window.agentBehaviorManager) {
        // 直接 silenceTimerStartTime を更新（activeAgent チェックを回避）
        const now = Date.now();
        window.agentBehaviorManager.silenceTimerStartTime = now;

        // 通常のタイマーリセットも試みる
        window.agentBehaviorManager.resetTimers()
      }
    }

    // アバターに発話させる
    targetAvatar.speak(text)

    // 発話完了後にフラグをリセット（推定時間）
    const estimatedDuration = text.length * 100 // 100ms per character
    setTimeout(() => {
      isActiveAgentSpeaking = false
      currentAgentSpeechType = null
      if (isAgentMaster) {
        syncAgentStatus()
      }

      // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> FIX: エージェント発話終了後にsilence detectionタイマーを再開
      if (window.agentBehavior && window.agentBehavior.startSilenceTimer) {
        window.agentBehavior.startSilenceTimer()
      }
    }, estimatedDuration)
    
  } else {
    console.error('[speakAsActiveAgent] ERROR: window.avatars or window.avatars[0] not available!');
    console.error('[speakAsActiveAgent] window.avatars:', window.avatars);
    console.error('[speakAsActiveAgent] Attempted to speak:', text);
  }
}

function speakWithVoice(text, agentName, trigger = 'manual') {
  // この関数は同期されたエージェント発話を処理する（スレーブ側）
  if (window.avatars && window.avatars[0]) {
    isActiveAgentSpeaking = true

    const speechTypeMapping = {
      'silence_triggered': 'silence',
      'periodic_triggered': 'periodic',
      'name_mention_triggered': 'name',
      'manual_triggered': 'manual'
    }
    currentAgentSpeechType = speechTypeMapping[trigger] || null
    
    // 会話履歴に追加（同期しない）
    addToConversationHistoryLocal(agentName, text, trigger)
    
    // アバターに発話させる
    window.avatars[0].speak(text)

    // 発話完了後にフラグをリセット（推定時間）
    const estimatedDuration = text.length * 100 // 100ms per character
    setTimeout(() => {
      isActiveAgentSpeaking = false
      currentAgentSpeechType = null

      // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> FIX: エージェント発話終了後にsilence detectionタイマーを再開
      if (window.agentBehavior && window.agentBehavior.startSilenceTimer) {
        window.agentBehavior.startSilenceTimer()
      }
    }, estimatedDuration)
    
  }
}

function logAgentAction(actionType, data) {
  const activeAgentName = window.avatars?.[0]?.config?.name || 'Active Agent'
  const activeAgentType = window.avatars?.[0]?.config?.type || 'active'
  
  const logEntry = {
    timestamp: new Date().toISOString(),
    actionType: actionType,
    agentName: activeAgentName,
    agentType: activeAgentType,
    ...data
  }
  
  
  // 将来的にはサーバーに送信またはローカルストレージに保存
  if (!window.agentLogs) {
    window.agentLogs = []
  }
  window.agentLogs.push(logEntry)
}

/* =======================================================================
   10. Transcript Auto-Reading Functions
   =====================================================================*/

function handleTranscriptForAutoReading(speakerName, text) {
  const callId = `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`

  // IMPORTANT: Do NOT reset timer here - we need to capture silence before speaking first!
  // Timer reset will happen after we record the silence value

  // リモートユーザーが話している場合は発話インジケーターを表示
  if (speakerName && speakerName !== 'You' && speakerName !== 'AI Assistant') {
    showRemoteUserSpeaking(speakerName)

    // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> FIX: リモートユーザーの発話を検知したら中央（WebSocket経由）に通知してタイマーリセット
    sendWebSocketMessage({
      type: 'USER_SPEAKING',
      speakerName: speakerName,
      timestamp: Date.now()
    })

    // 3秒後にインジケーターを非表示（発話継続検知のため）
    clearTimeout(window.remoteSpeakingTimer)
    window.remoteSpeakingTimer = setTimeout(() => {
      hideRemoteUserSpeaking(speakerName)
    }, 3000)
  }

  // 現在時刻を記録
  lastTranscriptTime = Date.now()

  // 既存のタイマーをクリア
  if (transcriptCompletionTimer) {
    clearTimeout(transcriptCompletionTimer)
  }

  // transcriptバッファに追加
  // 同じ話者の場合は継続、異なる話者の場合は前の文章を完成させる
  if (transcriptBuffer && !transcriptBuffer.includes(`[${speakerName}]`)) {
    // 異なる話者 -> 前の文章を読み上げ
    procesCompletedSentence(transcriptBuffer)
    transcriptBuffer = `[${speakerName}] ${text}`
  } else {
    // 同じ話者の場合は置き換え（音声認識の更新と見なす）
    transcriptBuffer = `[${speakerName}] ${text}`
  }


  // 文章完成判定タイマーを設定
  transcriptCompletionTimer = setTimeout(() => {
    if (transcriptBuffer) {
      procesCompletedSentence(transcriptBuffer)
      transcriptBuffer = ''
    }
  }, TRANSCRIPT_COMPLETION_DELAY)

  // 句読点で即座に完成判定
  if (text.match(/[。．！？\.\!\?]$/)) {
    clearTimeout(transcriptCompletionTimer)
    procesCompletedSentence(transcriptBuffer)
    transcriptBuffer = ''
  }

}

function procesCompletedSentence(sentence) {
  const callId = `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`
  const callStack = new Error().stack

  // 話者名を抽出（より堅牢な処理）
  const speakerMatch = sentence.match(/^\[(.*?)\]/)
  let speakerName = speakerMatch ? speakerMatch[1] : null
  
  // speaker名がない場合は、Zoom SDK の displayName を使用（統一性のため）
  if (!speakerName || speakerName === 'undefined' || speakerName.trim() === '') {
    try {
      const currentUserInfo = client?.getCurrentUserInfo()
      speakerName = currentUserInfo?.displayName || 'User'
    } catch (error) {
      speakerName = 'User'
    }
  }
  
  // 話者名を除去してメッセージを抽出
  const userMessage = sentence.replace(/^\[.*?\]\s*/, '').trim()

  if (userMessage && window.avatars && window.avatars[0]) {

    // キーワード検出チェック（全クライアントで実行）
    const shouldTriggerAI = checkKeywordDetection(userMessage)

    // ユーザーの発話を会話履歴に追加（全クライアント実行 - 各クライアントが自分の発話を記録）
    // Get silence timer value before speaking

    let silenceBeforeSpeaking = 0;
    if (window.agentBehaviorManager) {

      silenceBeforeSpeaking = window.agentBehaviorManager.getSilenceElapsed();
    } else {
      console.warn(`[Speech] WARNING - agentBehaviorManager not found!`);
    }


    // Record start time for speaking duration calculation
    const startTime = Date.now();

    // Get user's display name from input field
    const displayName = document.getElementById('user_name')?.value || speakerName || 'Unknown';

    // 会話履歴に追加（全クライアントが自分の発話を記録し、他のクライアントに同期）
    const conversation = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }),
      speaker: speakerName,
      message: userMessage,
      type: 'user',
      shouldTriggerAI: shouldTriggerAI,  // キーワード検出フラグを追加
      userId: displayName,  // User's display name from input field
      startTime: startTime,  // Speech start time
      endTime: startTime,  // Will be updated when speech ends (for now same as start)
      silenceBeforeSpeaking: silenceBeforeSpeaking  // Silence timer value before speaking
    }

    // 重複チェック: 同じspeaker+messageが短時間内に来た場合はスキップ
    const duplicateKey = `${speakerName}:${userMessage}`
    const lastTimestamp = processedTranscripts.get(duplicateKey)
    const now = Date.now()


    if (lastTimestamp && (now - lastTimestamp) < DUPLICATE_DETECTION_WINDOW) {
      const timeDiff = (now - lastTimestamp)
      return // Skip adding to conversation history
    } else {
    }

    // 重複でない場合、タイムスタンプを記録
    processedTranscripts.set(duplicateKey, now)

    // 古いエントリを削除（メモリリーク防止）
    if (processedTranscripts.size > 100) {
      const oldestKey = processedTranscripts.keys().next().value
      processedTranscripts.delete(oldestKey)
    }

    // IDベースの重複チェック - WebSocketで同期された会話がすでに存在する場合はスキップ
    if (!conversationHistory.find(c => c.id === conversation.id)) {
      conversationHistory.push(conversation)
      updateConversationDisplay()
      showSubtitle(conversation.speaker, conversation.message)
    } else {
      return
    }

    // Simple Chat履歴にも追加（HTMLから利用可能な場合）
    if (window.simpleChatHistory && !window.simpleChatHistory.find(c => c.id === conversation.id)) {
      window.simpleChatHistory.push(conversation)
      if (window.updateSimpleChatDisplay && typeof window.updateSimpleChatDisplay === 'function') {
        window.updateSimpleChatDisplay()
      }
    }

    // 他の参加者に同期（全クライアントが自分の発話を同期）
    syncConversationUpdate(conversation)

    // ユーザー発話時にタイマーをリセット（silence値取得後！）
    if (window.agentBehaviorManager) {
      // 直接 silenceTimerStartTime を更新（activeAgent チェックを回避）
      const now = Date.now();
      window.agentBehaviorManager.silenceTimerStartTime = now;

      // 通常のタイマーリセットも試みる
      window.agentBehaviorManager.resetTimers()
    }

    // Update speech activity (UI, status sync) - AFTER recording silence value
    updateSpeechActivity()

    // AI応答を実行（マスターのみ、キーワードが検出された場合のみ）
    if (shouldTriggerAI && isAgentMaster) {
      // キーワード検知のクールダウンチェック（同じspeakerからの連続したキーワード検知を防ぐ）
      const lastTriggerTime = lastKeywordTriggerMap.get(speakerName)
      const now = Date.now()

      if (lastTriggerTime && (now - lastTriggerTime) < KEYWORD_TRIGGER_COOLDOWN) {
        const remainingTime = ((KEYWORD_TRIGGER_COOLDOWN - (now - lastTriggerTime)) / 1000).toFixed(1)
      } else {
        lastKeywordTriggerMap.set(speakerName, now)
        // 古いエントリを削除（メモリリーク防止）
        if (lastKeywordTriggerMap.size > 50) {
          const oldestKey = lastKeywordTriggerMap.keys().next().value
          lastKeywordTriggerMap.delete(oldestKey)
        }
        // 名前検知による応答を生成（trigger=name_mentioned でCSV記録）
        generateNameMentionResponse(userMessage, speakerName)
      }
    } else if (shouldTriggerAI && !isAgentMaster) {
      // 非マスターの場合、AI応答リクエストをマスターに送信
      sendWebSocketMessage({
        type: 'AI_RESPONSE_REQUEST',
        speaker: speakerName,
        message: userMessage,
        timestamp: new Date().toISOString()
      })
    } else {
    }

  } else {
  }
}

// OpenAI APIで返答を生成し、アバターに話させる（スタイル対応版）
async function generateAIResponseAndSpeakWithStyle(userMessage, speakerName) {
  try {
    
    // 名前検知チェック
    const lowerText = userMessage.toLowerCase()
    const nameDetected = agentBehaviorSettings.keywords.some(keyword => 
      lowerText.includes(keyword.toLowerCase())
    )
    
    const shouldDisplayAndSpeak = nameDetected
    
    
    // AIスタイルを取得（Masterから更新されたものを優先）
    const aiStyleElement = document.getElementById('ai-style')
    const aiStyle = aiStyleElement ? aiStyleElement.value.trim() : 
                   (window.currentAIStyle || 'You are a helpful and neutral AI assistant.')
    

    const recentHistory = (typeof conversationHistory !== 'undefined' && Array.isArray(conversationHistory))
      ? conversationHistory.slice(-20).map(c => ({ speaker: c.speaker, message: c.message, type: c.type }))
      : []
    
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userMessage: userMessage,
        speakerName: speakerName,
        aiStyle: aiStyle,
        history: recentHistory,
        participants: getParticipantNames(),
        sessionId: generateSessionId(document.getElementById('session_topic')?.value || 'default'),
        condition: getConditionFromPathname()
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    
    const data = await response.json()
    
    if (data.success && data.response) {

      // マスターの場合、speakAsActiveAgentを使って発話
      if (isAgentMaster && shouldDisplayAndSpeak) {
        // speakAsActiveAgentを使うことで、trigger type, agent type, silence valueが自動記録される
        await speakAsActiveAgent(data.response, 'name_mention_triggered')
      } else if (!shouldDisplayAndSpeak) {
      }
    } else {
      console.error('[AI Response] Failed to generate response:', data)
    }
    
  } catch (error) {
    console.error('[AI Response] Error:', error)

    // エラー時のフォールバック（英語）
    const fallbackMessage = 'Sorry, I couldn\'t process that properly.'

    // マスターの場合、フォールバック応答を処理
    if (isAgentMaster) {
      // 名前検知チェック（エラー時も同じロジック）
      const lowerText = userMessage.toLowerCase()
      const nameDetected = agentBehaviorSettings.keywords.some(keyword =>
        lowerText.includes(keyword.toLowerCase())
      )
      const shouldDisplayAndSpeak = nameDetected

      // speakAsActiveAgentを使って発話（名前検知またはデバッグモード時のみ）
      if (shouldDisplayAndSpeak) {
        await speakAsActiveAgent(fallbackMessage, 'name_mention_triggered')
      } else {
      }
    }
  }
}

// 元のgenerateAIResponseAndSpeak関数（後方互換性のため）
async function generateAIResponseAndSpeak(userMessage, speakerName) {
  return generateAIResponseAndSpeakWithStyle(userMessage, speakerName)
}

function convertJapaneseToEnglish(japaneseText) {
  
  // 簡単な日本語->英語変換
  const simpleTranslations = {
    'こんにちは': 'Hello',
    'ありがとう': 'Thank you',
    'ありがとうございます': 'Thank you very much',
    'さようなら': 'Goodbye',
    'はい': 'Yes',
    'いいえ': 'No',
    'すみません': 'Excuse me',
    'おはよう': 'Good morning',
    'おはようございます': 'Good morning',
    'こんばんは': 'Good evening',
    'お疲れ様': 'Good work',
    'お疲れ様でした': 'Thank you for your hard work',
    'よろしく': 'Nice to meet you',
    'よろしくお願いします': 'Please treat me favorably',
    'どうも': 'Thank you',
    'お世話になります': 'Thank you for your support',
    '失礼します': 'Excuse me'
  }
  
  // 簡単な置換
  let englishText = japaneseText
  for (const [japanese, english] of Object.entries(simpleTranslations)) {
    englishText = englishText.replace(new RegExp(japanese, 'g'), english)
  }
  
  // 日本語文字が残っている場合のデフォルトメッセージ
  if (/[ひらがなカタカナ漢字]/.test(englishText)) {
    const result = `A participant said: ${japaneseText}. This was spoken in Japanese.`
    return result
  }
  
  return englishText
}

/* =======================================================================
   9. 共有 (動作には HTTPS + COOP/COEP ヘッダが必須)
   =====================================================================*/
/* =======================================================================
   WebSocket Synchronization System
   =====================================================================*/

// セッションID生成関数
function generateSessionId(topic) {
  // トピック名をベースにしたセッションIDを生成
  // 同じトピック名なら同じセッションに参加できる
  return topic || 'default-session'
}


