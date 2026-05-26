/* ========== Agent Synchronization Variables ============================ */
let isAgentMaster = false                            // このクライアントがエージェントマスターかどうか
let isSessionHost = false                            // このクライアントがセッションホストかどうか
let participantCount = 0                             // 参加者数
let messageChannel = null                            // メッセージングチャンネル
let syncWebSocket = null                             // WebSocket接続
let sessionId = null                                 // セッションID
let currentSessionUsers = new Set()                  // 現在のセッション参加者

// True only after a successful Zoom join.
// Used to keep timer UI stable/independent before joining.
let hasJoinedSession = false

/* ========== Transcript Auto-Reading Variables ========================= */
let transcriptBuffer = ''                           // 蓄積中の文章
let lastTranscriptTime = 0                          // 最後にtranscriptを受信した時刻
let transcriptCompletionTimer = null                // 文章完成判定用タイマー
const TRANSCRIPT_COMPLETION_DELAY = 3000            // 3秒間更新がなければ文章完成とみなす
let processedTranscripts = new Map()                // 時間ベース重複処理防止用: key=speaker:message, value=timestamp
const DUPLICATE_DETECTION_WINDOW = 10000           // 10秒以内の同じ発話を重複とみなす（Zoom caption-messageの遅延対応）
let lastTranscriptText = ''                         // 前回のtranscript（重複防止用）
let lastTranscriptSpeaker = ''                      // 前回の話者（重複防止用）
let lastKeywordTriggerMap = new Map()              // キーワード検知による重複AI応答防止用: key=speaker, value=timestamp
const KEYWORD_TRIGGER_COOLDOWN = 10000             // 同じspeakerからのキーワード検知を10秒間無視

// Track when users last "called" the agent (keyword/name detected)
// Used to suppress periodic proactive speech for a short window.
let lastNameMentionDetectedAt = 0
const PERIODIC_SUPPRESS_AFTER_NAME_MENTION_MS = 10000

/* ========== Active Agent Variables ================================= */
let lastSpeechActivity = Date.now()                 // 最後の音声活動時刻
let silenceDetectionTimer = null                    // 沈黙検知タイマー
let periodicSpeechTimer = null                      // 定期発話タイマー
let uiUpdateTimer = null                            // UI更新タイマー
// 可変設定値
let SILENCE_THRESHOLD = 10000                       // 沈黙検知閾値（デフォルト10秒）
let PERIODIC_SPEECH_INTERVAL = 180000               // 3分間隔
let lastPeriodicSpeech = Date.now()                 // 最後の定期発話時刻
// Pre-join UI anchors (independent per panel)
let preJoinSilenceUiAnchor = Date.now()
let preJoinPeriodicUiAnchor = Date.now()
let isActiveAgentSpeaking = false                   // アクティブエージェントが発話中かのフラグ
let isUserSpeaking = false                          // ユーザー発話中フラグ（Agent Masterが管理）
let userSpeakingTimeout = null                      // ユーザー発話終了タイムアウト
let currentAgentSpeechType = null                   // 'silence' | 'periodic' | 'name' | 'manual' | null

/* ========== Agent Behavior Management =============================== */
let agentBehaviorSettings = {
  silenceDetection: true,
  periodicSpeech: true,
  nameDetection: true,
  keywords: ['agent', 'assistant', 'AI', 'bot'],
  silenceThresholdSeconds: 10,                      // 沈黙検知閾値（秒）
  periodicIntervalSeconds: 180                      // 定期発話間隔（秒）
}


let agentStatus = {
  state: 'Listening',
  lastResponse: 'Never',
  lastNameDetection: 'Never',
  silenceCountdown: 10,
  periodicCountdown: PERIODIC_SPEECH_INTERVAL / 1000,
  silenceProgress: 0,
  periodicProgress: 0
}

function isTimerMasterClient() {
  return Boolean(isAgentMaster || (typeof window.isMasterMode !== 'undefined' && window.isMasterMode === true))
}

/* ========== Conversation History Variables ============================ */
let conversationHistory = []                        // 会話履歴の配列
let conversationCounter = 0                         // 会話番号のカウンター

/* ========== GLOBAL LOG EXPORT FUNCTIONS ============================== */
window.exportDetailedLogs = function() {
  detailedLogger.exportLogs();
};

window.getVideoIssues = function() {
  return detailedLogger.getVideoIssues();
};

window.getFilteredLogs = function(category, level) {
  return detailedLogger.getFilteredLogs(category, level);
};

window.analyzeVideoIssues = function() {
  return detailedLogger.analyzeVideoIssues();
};

window.exportAnalysisReport = function() {
  return detailedLogger.exportAnalysisReport();
};

/* ========== Settings Persistence ====================================== */

/**
 * Load settings from server
 */
async function loadSettings() {
  try {
    const response = await fetch('/api/settings')

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const settings = await response.json()

    // Apply settings to the application
    applySettings(settings)

    const condition = getConditionFromPathname()
    if (condition) {
      const syncResult = await synchronizeActiveNameForCurrentCondition()
      if (syncResult && syncResult.settings) {
        applyNameSettingsToUI(syncResult.settings)
      }
    }

    return settings
  } catch (err) {
    console.error('[Settings] Failed to load settings:', err)
    // Continue with defaults if loading fails
    return null
  }
}

/**
 * Save settings to server
 */
async function saveSettings(settings) {
  try {
    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(settings)
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const savedSettings = await response.json()

    return savedSettings
  } catch (err) {
    console.error('[Settings] Failed to save settings:', err)
    throw err
  }
}

/**
 * Update a specific setting
 */
async function updateSetting(key, value) {
  try {
    const response = await fetch(`/api/settings/${key}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ value })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()

    return result
  } catch (err) {
    console.error(`[Settings] Failed to update setting ${key}:`, err)
    throw err
  }
}


function normalizeNameAliasesForUI(value) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed ? [trimmed] : []
  }

  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((name) => typeof name === 'string')
    .map((name) => name.trim())
    .filter((name, index, list) => name && list.findIndex((n) => n.toLowerCase() === name.toLowerCase()) === index)
}

function applyNameSettingsToUI(settings) {
  if (!settings || !settings.nameDetection || !Array.isArray(settings.nameDetection.keywords)) {
    return
  }

  const keywords = settings.nameDetection.keywords
    .filter((k) => typeof k === 'string')
    .map((k) => k.trim())
    .filter((k) => k)

  if (keywords.length === 0) {
    return
  }

  window.nameDetectionKeywords = keywords
  agentBehaviorSettings.keywords = keywords

  if (window.agentBehaviorManager && window.agentBehaviorManager.settings?.nameDetection) {
    window.agentBehaviorManager.settings.nameDetection.keywords = keywords
  }

  const joined = keywords.join(', ')
  const firstKeyword = keywords[0]

  const keywordsInput = document.getElementById('agent-keywords')
  if (keywordsInput) {
    keywordsInput.value = joined
    if (firstKeyword) {
      keywordsInput.placeholder = firstKeyword
    }
  }
}


async function synchronizeActiveNameForCurrentCondition(activeName = '', keywords = null) {
  const condition = getConditionFromPathname()
  if (!condition) {
    return null
  }

  const normalizedKeywords = Array.isArray(keywords)
    ? keywords
      .filter((k) => typeof k === 'string')
      .map((k) => k.trim())
      .filter((k, idx, list) => k && list.findIndex((v) => v.toLowerCase() === k.toLowerCase()) === idx)
    : []

  try {
    const response = await fetch(`/api/settings/name-sync?condition=${encodeURIComponent(condition)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        condition,
        activeName: typeof activeName === 'string' ? activeName.trim() : '',
        keywords: normalizedKeywords
      })
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const result = await response.json()
    if (result && result.settings) {
      applyNameSettingsToUI(result.settings)
    }
    return result
  } catch (error) {
    console.error('[Name Sync] Failed to synchronize active name:', error)
    return null
  }
}

function hardReloadPage() {
  window.location.reload()
}

function ensurePromptEditorModalShell() {
  let modalEl = document.getElementById('prompt-editor-modal')
  if (modalEl) return modalEl

  const wrapper = document.createElement('div')
  wrapper.innerHTML = `
    <div class="modal fade" id="prompt-editor-modal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="prompt-editor-title">Prompt Editor</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body" id="prompt-editor-body"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-primary" id="prompt-editor-save">Save</button>
          </div>
        </div>
      </div>
    </div>
  `
  document.body.appendChild(wrapper.firstElementChild)
  modalEl = document.getElementById('prompt-editor-modal')
  return modalEl
}

function openPromptEditorModal({ title, bodyHtml, getPayload }) {
  return new Promise((resolve) => {
    const modalEl = ensurePromptEditorModalShell()
    const titleEl = document.getElementById('prompt-editor-title')
    const bodyEl = document.getElementById('prompt-editor-body')
    const saveBtn = document.getElementById('prompt-editor-save')

    titleEl.textContent = title
    bodyEl.innerHTML = bodyHtml

    const modal = new bootstrap.Modal(modalEl)

    const onSave = () => {
      try {
        const payload = getPayload()
        cleanup()
        modal.hide()
        resolve(payload)
      } catch (err) {
        alert(err.message || 'Invalid input')
      }
    }

    const onHidden = () => {
      cleanup()
      resolve(null)
    }

    const cleanup = () => {
      saveBtn.removeEventListener('click', onSave)
      modalEl.removeEventListener('hidden.bs.modal', onHidden)
    }

    saveBtn.addEventListener('click', onSave)
    modalEl.addEventListener('hidden.bs.modal', onHidden)
    modal.show()
  })
}

async function openAiStylePromptEditor() {
  const settings = await loadSettings()
  const current = (settings && typeof settings.aiStyle === 'string' && settings.aiStyle.trim())
    ? settings.aiStyle
    : (window.currentAIStyle || document.getElementById('ai-style')?.value || '')

  const result = await openPromptEditorModal({
    title: 'Modify AI Agent Style',
    bodyHtml: `
      <label for="prompt-ai-style" class="form-label">AI Agent Style Prompt</label>
      <textarea id="prompt-ai-style" class="form-control" rows="10">${String(current).replace(/</g, '&lt;')}</textarea>
    `,
    getPayload: () => {
      const value = document.getElementById('prompt-ai-style')?.value?.trim() || ''
      if (!value) throw new Error('AI Agent Style cannot be empty')
      return { aiStyle: value }
    }
  })

  if (!result) return

  await updateSetting('aiStyle', result.aiStyle)
  window.currentAIStyle = result.aiStyle
  const aiStyleTextarea = document.getElementById('ai-style')
  if (aiStyleTextarea) {
    aiStyleTextarea.value = result.aiStyle
  }

  if (syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN) {
    syncWebSocket.send(JSON.stringify({
      type: 'AI_STYLE_UPDATE',
      aiStyle: result.aiStyle,
      timestamp: new Date().toISOString(),
      hostId: window.myUserId || 'unknown'
    }))
  }

  showTemporaryMessage('<i data-lucide="brain" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> AI Agent Style updated', 'success')
}

async function openPeriodicSpeechPromptEditor() {
  const settings = await loadSettings()
  const defaultPrompt = 'use softeners (to be polite) or floor-grabbing signals (to get attention fast) first, depending on the current conversation flow, before interruption.'
  const current = (settings && typeof settings.periodicSpeechPrompt === 'string' && settings.periodicSpeechPrompt.trim())
    ? settings.periodicSpeechPrompt
    : defaultPrompt

  const result = await openPromptEditorModal({
    title: 'Modify Periodic Speech Prompt',
    bodyHtml: `
      <label for="prompt-periodic-speech" class="form-label">Periodic Speech Prompt</label>
      <textarea id="prompt-periodic-speech" class="form-control" rows="10">${String(current).replace(/</g, '&lt;')}</textarea>
      <small class="text-muted">Applied only when periodic speech is triggered. Order: periodic prompt + style prompt + condition prompt.</small>
    `,
    getPayload: () => {
      const value = document.getElementById('prompt-periodic-speech')?.value?.trim() || ''
      if (!value) throw new Error('Periodic speech prompt cannot be empty')
      return { periodicSpeechPrompt: value }
    }
  })

  if (!result) return

  await updateSetting('periodicSpeechPrompt', result.periodicSpeechPrompt)
  showTemporaryMessage('<i data-lucide="timer" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Periodic speech prompt updated', 'success')
}

async function openConditionPromptEditor() {
  const settings = await loadSettings()
  const existing = (settings && settings.conditionPrompts && typeof settings.conditionPrompts === 'object')
    ? settings.conditionPrompts
    : {}

  const femaleCurrent = typeof existing['female-dominated'] === 'string' ? existing['female-dominated'] : ''
  const maleCurrent = typeof existing['male-dominated'] === 'string' ? existing['male-dominated'] : ''

  const result = await openPromptEditorModal({
    title: 'Modify Condition Prompt',
    bodyHtml: `
<label for="prompt-female-dominated" class="form-label">Female-Dominated</label>
      <textarea id="prompt-female-dominated" class="form-control mb-3" rows="8">${String(femaleCurrent).replace(/</g, '&lt;')}</textarea>
      <label for="prompt-male-dominated" class="form-label">Male-Dominated</label>
      <textarea id="prompt-male-dominated" class="form-control" rows="8">${String(maleCurrent).replace(/</g, '&lt;')}</textarea>
    `,
    getPayload: () => {
      const female = document.getElementById('prompt-female-dominated')?.value?.trim() || ''
      const male = document.getElementById('prompt-male-dominated')?.value?.trim() || ''
      if (!female || !male) throw new Error('Both condition prompts are required')
      return {
        conditionPrompts: {
          ...existing,
          'female-dominated': female,
          'male-dominated': male
        }
      }
    }
  })

  if (!result) return

  await updateSetting('conditionPrompts', result.conditionPrompts)
  showTemporaryMessage('<i data-lucide="puzzle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Condition prompts updated', 'success')
}

/**
 * Apply settings to the application
 */
function applySettings(settings) {

  const applySilenceThresholdFromSettings = (thresholdSeconds) => {
    const parsed = Number(thresholdSeconds)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return
    }

    agentBehaviorSettings.silenceThresholdSeconds = parsed
    SILENCE_THRESHOLD = parsed * 1000

    // Keep the UI consistent even before timers/UI-updates start.
    agentStatus.silenceCountdown = Math.ceil(parsed)
    agentStatus.silenceProgress = 0

    const silenceCountdownEl = document.getElementById('silence-countdown')
    if (silenceCountdownEl) {
      silenceCountdownEl.textContent = String(Math.ceil(parsed))
    }
    const silenceProgressEl = document.getElementById('silence-progress')
    if (silenceProgressEl) {
      silenceProgressEl.style.width = '0%'
    }
  }

  const applyPeriodicIntervalFromSettings = (intervalSeconds) => {
    const parsed = Number(intervalSeconds)
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return
    }

    agentBehaviorSettings.periodicIntervalSeconds = parsed
    PERIODIC_SPEECH_INTERVAL = parsed * 1000

    // Keep the UI consistent even before timers/UI-updates start.
    agentStatus.periodicCountdown = Math.ceil(parsed)
    agentStatus.periodicProgress = 0

    const periodicCountdownEl = document.getElementById('periodic-countdown')
    if (periodicCountdownEl) {
      periodicCountdownEl.textContent = String(Math.ceil(parsed))
    }
    const periodicProgressEl = document.getElementById('periodic-progress')
    if (periodicProgressEl) {
      periodicProgressEl.style.width = '0%'
    }
  }

  // Apply silence detection settings
  if (settings.silenceDetection) {
    if (window.agentBehaviorManager) {
      window.agentBehaviorManager.settings.silenceDetection.enabled = settings.silenceDetection.enabled
      window.agentBehaviorManager.settings.silenceDetection.threshold = settings.silenceDetection.threshold * 1000 // Convert to ms
    }

    // Update UI
    const thresholdInput = document.getElementById('silence-threshold-input')
    if (thresholdInput) {
      thresholdInput.value = settings.silenceDetection.threshold
    }

    // Update global settings
    if (typeof agentBehaviorSettings !== 'undefined') {
      agentBehaviorSettings.silenceDetection = settings.silenceDetection.enabled
      agentBehaviorSettings.silenceThresholdSeconds = settings.silenceDetection.threshold
    }

    // Critical: initialize the countdown display from the same threshold.
    if (settings.silenceDetection.threshold !== undefined && settings.silenceDetection.threshold !== null) {
      applySilenceThresholdFromSettings(settings.silenceDetection.threshold)
    }

    // Apply silence bot selection
    window.silenceBotSelection = (settings.silenceDetection.botSelection) || { mode: 'random', botName: null }

    // Apply silence detection messages
    if (settings.silenceDetection.messages && Array.isArray(settings.silenceDetection.messages)) {
      window.silenceDetectionMessages = settings.silenceDetection.messages

      // Update UI input fields to match saved messages
      const container = document.getElementById('silence-speech-fields')
      if (container) {
        const silenceInputs = container.querySelectorAll('.silence-speech-input')

        // Update existing fields
        silenceInputs.forEach((input, index) => {
          if (settings.silenceDetection.messages[index]) {
            input.value = settings.silenceDetection.messages[index]
          } else {
            // Remove extra fields if saved messages are fewer
            input.remove()
          }
        })

        // Add new fields if saved messages are more than existing fields
        if (settings.silenceDetection.messages.length > silenceInputs.length) {
          for (let i = silenceInputs.length; i < settings.silenceDetection.messages.length; i++) {
            const newInput = document.createElement('input')
            newInput.type = 'text'
            newInput.className = 'form-control form-control-sm mb-1 silence-speech-input agent-setting-control'
            newInput.value = settings.silenceDetection.messages[i]
            newInput.style.fontSize = '10px'
            newInput.style.backgroundColor = '#f8f9fa'
            newInput.style.color = '#6c757d'
            newInput.disabled = true
            container.appendChild(newInput)
          }
        }
      }
    }
  }

  // Apply AI style
  if (settings.aiStyle) {
    const aiStyleTextarea = document.getElementById('ai-style')
    if (aiStyleTextarea) {
      aiStyleTextarea.value = settings.aiStyle
    }

    // Update global variable
    if (typeof window !== 'undefined') {
      window.currentAIStyle = settings.aiStyle
    }

  }

  // Apply name detection settings
  if (settings.nameDetection) {
    if (typeof agentBehaviorSettings !== 'undefined') {
      agentBehaviorSettings.nameDetection = settings.nameDetection.enabled
    }
    applyNameSettingsToUI(settings)
  }

  // Apply periodic speech settings
  if (settings.periodicSpeech) {
    const periodicToggle = document.getElementById('periodic-speech-toggle')
    if (periodicToggle && typeof settings.periodicSpeech.enabled === 'boolean') {
      periodicToggle.checked = settings.periodicSpeech.enabled
    }

    if (typeof settings.periodicSpeech.enabled === 'boolean') {
      agentBehaviorSettings.periodicSpeech = settings.periodicSpeech.enabled
      if (!agentBehaviorSettings.periodicSpeech) {
        resetPeriodicSpeech()
      }
    }

    const intervalInput = document.getElementById('periodic-interval-input')
    if (intervalInput && settings.periodicSpeech.interval !== undefined && settings.periodicSpeech.interval !== null) {
      intervalInput.value = settings.periodicSpeech.interval
    }

    if (settings.periodicSpeech.interval !== undefined && settings.periodicSpeech.interval !== null) {
      applyPeriodicIntervalFromSettings(settings.periodicSpeech.interval)
    }

    if (settings.periodicSpeech.messages && Array.isArray(settings.periodicSpeech.messages)) {
      window.periodicSpeechMessages = settings.periodicSpeech.messages
    }

    // Apply periodic bot selection
    window.periodicBotSelection = (settings.periodicSpeech.botSelection) || { mode: 'random', botName: null }

  }

  if (Array.isArray(settings.wozPresets) && settings.wozPresets.length > 0 && typeof window.applyWozPresets === 'function') {
    window.applyWozPresets(settings.wozPresets)
  }

}

