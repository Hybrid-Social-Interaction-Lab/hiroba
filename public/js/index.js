/* ========== DOMContentLoaded ========================================== */
// Global master mode flag
window.isMasterMode = false

document.addEventListener('DOMContentLoaded', async () => {
  // Load settings from server first
  await loadSettings()
  // Check for master mode in URL parameter (?master)
  const urlParams = new URLSearchParams(window.location.search)
  window.isMasterMode = urlParams.has('master')

  if (window.isMasterMode) {
    document.body.classList.add('master-mode')

    // Enable all agent-setting-control inputs immediately
    const enableAllControls = () => {
      const controls = document.querySelectorAll('.agent-setting-control')
      controls.forEach((control, index) => {
        control.disabled = false
        control.style.pointerEvents = 'auto'
        control.style.opacity = '1'
        control.style.backgroundColor = 'white'
        control.style.color = '#495057'
      })
    }

    // Enable immediately
    enableAllControls()

    // Enable again after a short delay to catch any dynamically added elements
    setTimeout(enableAllControls, 100)
    setTimeout(enableAllControls, 500)

    // Show master mode indicator
    const masterIndicator = document.createElement('div')
    masterIndicator.id = 'master-mode-indicator'
    masterIndicator.style.cssText = `
      position: fixed;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: bold;
      z-index: 10000;
      box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
      display: flex;
      align-items: center;
      gap: 8px;
    `
    masterIndicator.innerHTML = '<i data-lucide="key" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; margin-right: 6px;"></i><span>MASTER MODE</span>'
    document.body.appendChild(masterIndicator)
    if (window.lucide) lucide.createIcons()
  } else {
    // マスターモードでない場合、master-only-setting を非表示
    document.querySelectorAll('.master-only-setting').forEach(element => {
      element.style.display = 'none'
    })
  }

  // Auto-reconnect to session on F5 refresh
  const sessionInfo = sessionStorage.getItem('sessionInfo')
  if (sessionInfo) {
    try {
      const { sessionName, sessionPwd, displayName } = JSON.parse(sessionInfo)
      joinWithSession(sessionName, sessionPwd, displayName)
    } catch (error) {
      console.error('[SESSION RECOVERY] Error parsing session info:', error)
      sessionStorage.removeItem('sessionInfo')
    }
  }

  // セッション共通のユーザー名生成システム - 同じセッションでは同じIDを使用
  function generateConsistentUsername() {
    // 各ユーザーは一意の名前を持つ必要がある
    const randomNumber = Math.floor(Math.random() * 100)
    const generatedUserName = `User${randomNumber}`


    return generatedUserName
  }

  // 一意なユーザー名を設定
  document.getElementById('user_name').value = generateConsistentUsername()

  // 初期状態でセッション状態を更新
  updateSessionStatusDisplay()
  updateHostOnlyElements()

  // Bind toggle listeners in active runtime path.
  setupAgentBehaviorToggleListeners()
  setupMasterVideoVisibilityToggle()

  // Initialize layout
  updateMainLayoutGrid()

  /* UI イベント */
  // Lobby screen event listeners
  const lobbyCreateBtn = document.getElementById('lobby-create-btn')
  if (lobbyCreateBtn) {
    lobbyCreateBtn.addEventListener('click', handleLobbyCreate)
  }

  const lobbyJoinBtn = document.getElementById('lobby-join-btn')
  if (lobbyJoinBtn) {
    lobbyJoinBtn.addEventListener('click', handleLobbyJoin)
  }

  // Handle session selection to show/hide password field
  const sessionSelect = document.getElementById('lobby-join-session-name')
  if (sessionSelect) {
    sessionSelect.addEventListener('change', function() {
      updatePasswordFieldVisibility()
    })
  }

  // Load active sessions for dropdown on page load
  loadSessionsList()

  // Refresh session list every 3 seconds to show new sessions
  setInterval(loadSessionsList, 3000)

  // Initialize password field visibility (disabled by default)
  updatePasswordFieldVisibility()

  // Initialize Lucide icons and Bootstrap tooltips
  const initializeUIComponents = () => {
    // Render Lucide icons
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons()
    }

    // Initialize Bootstrap tooltips
    if (window.bootstrap && window.bootstrap.Tooltip) {
      const tooltipElements = document.querySelectorAll('[data-bs-toggle="tooltip"]')
      tooltipElements.forEach(element => {
        // Only initialize if not already initialized
        if (!window.bootstrap.Tooltip.getInstance(element)) {
          new window.bootstrap.Tooltip(element)
        }
      })
    }
  }

  // Initialize on load
  initializeUIComponents()

  // Re-initialize after session list updates to catch any new tooltip elements
  const originalLoadSessionsList = window.loadSessionsList
  if (originalLoadSessionsList) {
    window.loadSessionsList = async function() {
      await originalLoadSessionsList.call(this)
      initializeUIComponents()
    }
  }

  // 会話履歴クリアボタン
  document.getElementById('clear-conversation').addEventListener('click', async () => {
    if (await confirm('Clear conversation history?')) {
      clearConversationHistory()
    }
  })

  // アバター構成切り替えボタン
  const configFMM = document.getElementById('config-female-male-male')
  const configMMM = document.getElementById('config-male-male-male')

  if (configFMM) {
    configFMM.addEventListener('click', () => {
      switchConfigurationWithUI('female_male_male')
    })
  }

  if (configMMM) {
    configMMM.addEventListener('click', () => {
      switchConfigurationWithUI('male_male_male')
    })
  }

  function switchConfigurationWithUI(configKey) {

    // ボタンの状態を更新
    document.querySelectorAll('.btn-group .btn').forEach(btn => btn.classList.remove('active'))
    const targetBtn = document.getElementById(`config-${configKey.replace(/_/g, '-')}`)
    if (targetBtn) {
      targetBtn.classList.add('active')
    }

    // 構成切り替えが利用可能になるまで待機
    if (typeof window.switchAvatarConfiguration === 'function') {
      const success = window.switchAvatarConfiguration(configKey)
      if (success) {
      } else {
        console.error(`[Config Switch] Failed to switch to ${configKey}`)
      }
    } else {
      setTimeout(() => switchConfigurationWithUI(configKey), 1000)
    }
  }

  // Silence Detection Add Field ボタン
  const silenceAddBtn = document.getElementById('silence-add-field')
  if (silenceAddBtn) {
    silenceAddBtn.addEventListener('click', () => {
      const container = document.getElementById('silence-speech-fields')
      if (container) {
        const newInput = document.createElement('input')
        newInput.type = 'text'
        newInput.className = 'form-control form-control-sm mb-1 silence-speech-input agent-setting-control'
        newInput.placeholder = 'Enter your silence detection message...'
        newInput.style.fontSize = '10px'
        newInput.style.backgroundColor = '#f8f9fa'
        newInput.style.color = '#6c757d'
        newInput.disabled = silenceAddBtn.disabled
        container.appendChild(newInput)
      }
    })
  }

  // Silence Detection Remove Field ボタン
  const silenceRemoveBtn = document.getElementById('silence-remove-field')
  if (silenceRemoveBtn) {
    silenceRemoveBtn.addEventListener('click', () => {
      const container = document.getElementById('silence-speech-fields')
      if (container) {
        const inputs = container.querySelectorAll('.silence-speech-input')
        if (inputs.length > 1) {
          inputs[inputs.length - 1].remove()
        } else {
          alert('At least one silence message field is required')
        }
      }
    })
  }

  // Silence Detection Update ボタン
  const silenceUpdateBtn = document.getElementById('silence-update-btn')
  if (silenceUpdateBtn) {
    silenceUpdateBtn.addEventListener('click', () => {
      updateSilenceDetectionSettings()
    })
  } else {
    console.warn('[Event] Silence Update button not found')
  }

  // Periodic Speech Update ボタン
  const periodicUpdateBtn = document.getElementById('periodic-update-btn')
  if (periodicUpdateBtn) {
    periodicUpdateBtn.addEventListener('click', () => {
      updatePeriodicSpeechSettings()
    })
  } else {
    console.warn('[Event] Periodic Update button not found (expected if disabled)')
  }

  // Name Detection Keywords Update ボタン
  const keywordsUpdateBtn = document.getElementById('keywords-update-btn')
  if (keywordsUpdateBtn) {
    keywordsUpdateBtn.addEventListener('click', () => {
      updateNameDetectionSettings()
    })
  } else {
    console.warn('[Event] Keywords Update button not found')
  }

  // Manual Generate ボタン
  const manualGenerateBtn = document.getElementById('manual-generate-btn')
  if (manualGenerateBtn) {
    manualGenerateBtn.addEventListener('click', async () => {
      if (manualGenerateBtn.disabled) {
        return
      }

      const originalDisabled = manualGenerateBtn.disabled
      manualGenerateBtn.disabled = true
      try {
        await triggerManualGenerateResponse()
      } finally {
        if (!originalDisabled && (window.isMasterMode || isSessionHost)) {
          manualGenerateBtn.disabled = false
        }
      }
    })
  } else {
    console.warn('[Event] Manual Generate button not found')
  }

  // Silence Threshold Apply ボタン
  const applyThresholdBtn = document.getElementById('apply-silence-threshold')
  if (applyThresholdBtn) {
    applyThresholdBtn.addEventListener('click', async () => {
      const thresholdInput = document.getElementById('silence-threshold-input')
      if (thresholdInput) {
        const newThreshold = parseInt(thresholdInput.value)
        if (newThreshold >= 5 && newThreshold <= 1000) {
          updateSilenceThreshold(newThreshold)

          // Save to server
          try {
            await updateSetting('silenceDetection.threshold', newThreshold)
          } catch (err) {
            console.error('[Settings] Failed to persist silence threshold:', err)
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
            triggerEvent: 'silence_threshold_update',
            message: `Silence threshold updated to ${newThreshold} seconds`
          }
          conversationHistory.push(parameterChange)
          updateConversationDisplay()
          syncConversationUpdate(parameterChange)

          alert('Silence threshold updated to ' + newThreshold + ' seconds')
        } else {
          alert('Silence threshold must be between 5 and 1000 seconds')
          thresholdInput.value = agentBehaviorSettings.silenceThresholdSeconds
        }
      }
    })
  } else {
    console.warn('[Event] Silence Threshold Apply button not found')
  }

  // Periodic Interval Apply ボタン
  const applyPeriodicIntervalBtn = document.getElementById('apply-periodic-interval')
  if (applyPeriodicIntervalBtn) {
    applyPeriodicIntervalBtn.addEventListener('click', async () => {
      const intervalInput = document.getElementById('periodic-interval-input')
      if (!intervalInput) {
        alert('Periodic interval input not found')
        return
      }

      const newInterval = parseInt(intervalInput.value)
      if (!Number.isFinite(newInterval) || newInterval < 30 || newInterval > 600) {
        alert('Periodic interval must be between 30 and 600 seconds')
        intervalInput.value = agentBehaviorSettings.periodicIntervalSeconds
        return
      }

      try {
        updatePeriodicInterval(newInterval)

        await updateSetting('periodicSpeech.interval', newInterval)

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
          triggerEvent: 'periodic_interval_update',
          message: `Periodic interval updated to ${newInterval} seconds`
        }
        conversationHistory.push(parameterChange)
        updateConversationDisplay()
        syncConversationUpdate(parameterChange)

        alert('Periodic interval updated to ' + newInterval + ' seconds')
      } catch (err) {
        console.error('[Settings] Failed to apply periodic interval:', err)
        alert('Failed to update periodic interval')
      }
    })
  }

  const openAiStyleModalBtn = document.getElementById('open-ai-style-modal')
  if (openAiStyleModalBtn) {
    openAiStyleModalBtn.addEventListener('click', async () => {
      try {
        await openAiStylePromptEditor()
      } catch (err) {
        console.error('[Prompt Editor] Failed to update AI style:', err)
        showTemporaryMessage('Failed to update AI Agent Style', 'danger')
      }
    })
  }

  const openPeriodicPromptModalBtn = document.getElementById('open-periodic-prompt-modal')
  if (openPeriodicPromptModalBtn) {
    openPeriodicPromptModalBtn.addEventListener('click', async () => {
      try {
        await openPeriodicSpeechPromptEditor()
      } catch (err) {
        console.error('[Prompt Editor] Failed to update periodic speech prompt:', err)
        showTemporaryMessage('Failed to update periodic speech prompt', 'danger')
      }
    })
  }

  const openConditionPromptModalBtn = document.getElementById('open-condition-prompt-modal')
  if (openConditionPromptModalBtn) {
    openConditionPromptModalBtn.addEventListener('click', async () => {
      try {
        await openConditionPromptEditor()
      } catch (err) {
        console.error('[Prompt Editor] Failed to update condition prompts:', err)
        showTemporaryMessage('Failed to update condition prompts', 'danger')
      }
    })
  }

  // デバッグ用テキスト送信機能は setupDebugInputSynchronization() で設定される

  // 設定パネル切り替え機能
  const closeButton = document.getElementById('settings-close-btn')
  const toggleButtonFixed = document.getElementById('toggle-settings-fixed')
  const inputForms = document.getElementById('input-forms')
  const main = document.getElementById('main')

  if (closeButton && toggleButtonFixed && inputForms && main) {

    // 初期状態を設定（パネル表示）
    inputForms.classList.remove('hidden')
    inputForms.style.display = ''
    main.classList.remove('expanded')
    if (window.lucide) lucide.createIcons()


    // 既存のイベントリスナーを削除してから新しく追加
    const handleToggleClick = () => {

      const isCurrentlyHidden = inputForms.classList.contains('hidden')

      if (isCurrentlyHidden) {
        // パネルを表示
        inputForms.classList.remove('hidden')
        main.classList.remove('expanded')
        document.body.classList.remove('panel-hidden')
        // 念のためスタイルも直接設定
        inputForms.style.display = ''
        main.style.width = ''
        // 固定ボタンを隠す
        toggleButtonFixed.style.display = 'none'
      } else {
        // パネルを非表示
        inputForms.classList.add('hidden')
        main.classList.add('expanded')
        document.body.classList.add('panel-hidden')
        // 念のためスタイルも直接設定
        inputForms.style.display = 'none'
        main.style.width = '100%'
        // 固定ボタンを表示
        toggleButtonFixed.style.display = 'block'
      }
    }

    // クローズボタンにイベントリスナーを追加（常に閉じる）
    closeButton.addEventListener('click', () => {
      if (!inputForms.classList.contains('hidden')) {
        handleToggleClick()
      }
    })

    // 固定ボタンにもイベントリスナーを追加
    toggleButtonFixed.addEventListener('click', handleToggleClick)

  } else {
    console.error('[Toggle] Required elements not found:', {
      closeButton: !!closeButton,
      toggleButtonFixed: !!toggleButtonFixed,
      inputForms: !!inputForms,
      main: !!main
    })
  }

  // エージェント行動管理の初期化
  if (typeof initAgentBehaviorManagement === 'function') {
    initAgentBehaviorManagement()
  }

  // パラメータ変数の初期化
  if (!window.silenceDetectionMessages) {
    window.silenceDetectionMessages = [
      "Sorry, do you have any questions?",
      "Is there anything I can help clarify?",
      "Please feel free to share your thoughts."
    ]
  }

  if (!window.periodicSpeechMessages) {
    window.periodicSpeechMessages = [
      "How is the meeting progressing?",
      "Would you like to discuss any specific topics?",
      "Are there any important points to cover?"
    ]
  }
  
  // 基本的なデバッグログを追加
  
  try {
    setupDebugInputSynchronization()
  } catch (error) {
    console.error('[DEBUG] Error in setupDebugInputSynchronization:', error)
  }
  
  // WebSocketデバッグボタンの設定
  setupWebSocketDebugButtons()

})

/* ========== Update Silence Threshold ================================== */
