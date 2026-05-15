/* ----------------------------------------------------------
   Agent Behavior Management System
   ---------------------------------------------------------- */

/**
 * Agent Behavior Manager
 * エージェントの発話とタイマー管理を統合
 * アバターレンダリングから独立した行動制御システム
 */
class AgentBehaviorManager {
  constructor() {
    this.agents = [];
    this.activeAgent = null;
    this.isInitialized = false;
    this.eventListenersSetup = false; // イベントリスナー設定済みフラグ
    this.isMasterClient = false; // マスタークライアント判定フラグ

    // Timer systems
    this.silenceTimer = null;
    this.silenceTimerStartTime = null;  // Track when silence timer started
    this.silenceCountdownInterval = null;

    // Settings (from UI)
    this.settings = {
      silenceDetection: {
        enabled: true,
        threshold: 10000, // ms
        speeches: [
          "Sorry, do you have any questions?",
          "Is there anything I can help clarify?",
          "Please feel free to share your thoughts."
        ]
      },
      nameDetection: {
        enabled: true,
        keywords: ['agent', 'assistant', 'AI', 'bot']
      }
    };

    console.log('[AgentBehavior] Manager initialized');
  }

  /**
   * エージェントの登録
   */
  registerAgent(renderer, config) {
    const agent = {
      id: `agent_${this.agents.length}`,
      renderer: renderer,
      config: config,
      isActive: config.type === 'active',
      lastSpeechTime: 0,
      speechQueue: []
    };

    this.agents.push(agent);

    if (agent.isActive) {
      this.activeAgent = agent;
      console.log(`[AgentBehavior] Active agent registered: ${config.name}`);
    }

    console.log(`[AgentBehavior] Agent registered: ${config.name} (${config.type})`);
    return agent;
  }

  /**
   * 初期化とタイマー開始
   */
  initialize() {
    if (this.isInitialized) {
      console.log('[AgentBehavior] Already initialized, just starting timers');
      this.startTimers();
      return;
    }

    console.log('[AgentBehavior] Full initialization starting...');
    this.loadSettingsFromUI();
    this.determineMasterClient();
    this.setupEventListeners();
    this.startTimers();

    this.isInitialized = true;
    console.log(`[AgentBehavior] ✓ Behavior management fully initialized (Master: ${this.isMasterClient})`);
  }

  /**
   * マスタークライアントの判定
   */
  determineMasterClient() {
    // URL parameter ?master が存在する場合、強制的にマスターとする
    if (typeof window.isMasterMode !== 'undefined' && window.isMasterMode === true) {
      this.isMasterClient = true;
      console.log('[AgentBehavior] <i data-lucide="key" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> MASTER MODE detected via URL parameter - This client is MASTER');
      return;
    }

    // Zoom Video SDKのユーザーIDが存在する場合、最小IDのクライアントをマスターとする
    if (typeof window.client !== 'undefined' && window.client && window.client.getCurrentUserInfo) {
      try {
        const currentUser = window.client.getCurrentUserInfo();
        if (currentUser && currentUser.userId) {
          // 5秒待ってから他の参加者と比較してマスターを決定
          setTimeout(() => {
            this.compareUserIdsAndDetermineMaster(currentUser.userId);
          }, 5000);
          console.log(`[AgentBehavior] Checking master status... (UserID: ${currentUser.userId})`);
          return;
        }
      } catch (error) {
        console.warn('[AgentBehavior] Could not get user info from Zoom SDK:', error);
      }
    }

    // フォールバック：簡易的にタイムスタンプベースで判定
    this.checkMasterByTimestamp();
  }

  /**
   * ユーザーIDを比較してマスターを決定
   */
  compareUserIdsAndDetermineMaster(myUserId) {
    if (typeof window.client !== 'undefined' && window.client && window.client.getAllUser) {
      try {
        const allUsers = window.client.getAllUser();
        const allUserIds = allUsers.map(user => user.userId).sort();
        const minUserId = Math.min(...allUserIds);

        this.isMasterClient = (myUserId === minUserId);
        console.log(`[AgentBehavior] Master determination complete. This client is ${this.isMasterClient ? 'MASTER' : 'SLAVE'} (UserID: ${myUserId}, Min: ${minUserId})`);

        // マスター状態が変わった場合、タイマーを再調整
        if (this.isMasterClient && this.isInitialized) {
          this.startTimers();
        }
      } catch (error) {
        console.warn('[AgentBehavior] Could not compare user IDs:', error);
        this.checkMasterByTimestamp();
      }
    }
  }

  /**
   * タイムスタンプベースでマスター判定（フォールバック）
   */
  checkMasterByTimestamp() {
    // より確実なマスター判定のため、ランダム性を減らす
    const now = Date.now();
    const remainder = now % 1000;
    this.isMasterClient = remainder < 500; // 約50%の確率でマスター
    console.log(`[AgentBehavior] Fallback master determination: ${this.isMasterClient ? 'MASTER' : 'SLAVE'} (timestamp: ${now})`);
  }

  /**
   * UIから設定を読み込み
   */
  loadSettingsFromUI() {
    console.log('[AgentBehavior] Loading settings from UI...');

    // Silence Detection
    const silenceToggle = document.getElementById('silence-detection-toggle');
    const silenceThreshold = document.getElementById('silence-threshold-input');

    if (silenceToggle) {
      this.settings.silenceDetection.enabled = silenceToggle.checked;
      console.log(`[AgentBehavior] Silence enabled: ${silenceToggle.checked}`);
    }

    if (silenceThreshold) {
      const thresholdValue = parseInt(silenceThreshold.value) * 1000;
      this.settings.silenceDetection.threshold = thresholdValue;
      console.log(`[AgentBehavior] Silence threshold: ${silenceThreshold.value}s (${thresholdValue}ms)`);
    }

    // Name Detection
    const nameDetectionToggle = document.getElementById('name-detection-toggle');
    if (nameDetectionToggle) {
      this.settings.nameDetection.enabled = nameDetectionToggle.checked;
      console.log(`[AgentBehavior] Name detection enabled: ${nameDetectionToggle.checked}`);
    }

    const keywordsInput = document.getElementById('agent-keywords');
    if (keywordsInput) {
      this.settings.nameDetection.keywords = keywordsInput.value.split(',').map(k => k.trim());
      console.log(`[AgentBehavior] Keywords: ${this.settings.nameDetection.keywords.join(', ')}`);
    }

    // Speech content arrays
    this.loadSpeechContent();

    console.log('[AgentBehavior] ✓ Settings loaded from UI:', this.settings);
  }

  /**
   * スピーチ内容の読み込み
   */
  loadSpeechContent() {
    // Silence detection speeches
    const silenceInputs = document.querySelectorAll('.silence-speech-input');
    if (silenceInputs.length > 0) {
      this.settings.silenceDetection.speeches = Array.from(silenceInputs)
        .map(input => input.value.trim())
        .filter(text => text.length > 0);
    }
  }

  /**
   * タイマーシステムの開始
   */
  startTimers() {
    this.startSilenceTimer();
  }

  /**
   * 無音検知タイマー
   */
  startSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }

    if (this.silenceCountdownInterval) {
      clearInterval(this.silenceCountdownInterval);
      this.silenceCountdownInterval = null;
    }

    // Record start time for elapsed calculation
    // IMPORTANT: Always update this, even if timer won't start (for accurate silence tracking)
    this.silenceTimerStartTime = Date.now();

    if (!this.settings.silenceDetection.enabled || !this.activeAgent) {
      return;
    }

    this.silenceTimer = setTimeout(() => {
      this.triggerSilenceSpeech();
    }, this.settings.silenceDetection.threshold);

    this.updateSilenceCountdown();
  }

  /**
   * 無音検知タイマーを停止
   */
  stopSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
      this.silenceTimerStartTime = null;
      console.log('[AgentBehavior] Silence timer stopped');
    }

    if (this.silenceCountdownInterval) {
      clearInterval(this.silenceCountdownInterval);
      this.silenceCountdownInterval = null;
    }
  }

  /**
   * Get elapsed time since silence timer started (in seconds)
   */
  getSilenceElapsed() {
    if (!this.silenceTimerStartTime) {
      return 0;
    }
    const elapsed = (Date.now() - this.silenceTimerStartTime) / 1000;
    return elapsed;
  }

  /**
   * 無音検知による発話
   */
  triggerSilenceSpeech() {
    // Hard gate: if UI toggle is OFF, do not generate/broadcast silence speech.
    const silenceToggleEl = document.getElementById('silence-detection-toggle');
    if (silenceToggleEl && silenceToggleEl.checked === false) {
      this.settings.silenceDetection.enabled = false;
      this.stopSilenceTimer();
      console.log('[AgentBehavior] Silence toggle OFF in UI - skipping silence speech');
      return;
    }

    // 次のタイマーを先に設定（activeAgentの有無に関わらずタイマーを継続）
    this.startSilenceTimer();

    // activeAgentがない、または無効な場合は発話しない
    if (!this.activeAgent || !this.settings.silenceDetection.enabled) {
      console.log('[AgentBehavior] Silence timer triggered but skipping speech (no active agent or disabled)');
      return;
    }

    const speeches = this.settings.silenceDetection.speeches;
    if (speeches.length === 0) {
      console.log('[AgentBehavior] Silence timer triggered but no speeches configured');
      return;
    }

    // マスタークライアントのみが発話内容を決定
    if (this.isMasterClient) {
      const text = speeches[Math.floor(Math.random() * speeches.length)];
      console.log(`[AgentBehavior] Master client - Silence detection triggered: "${text}"`);

      // WebSocketで全クライアントに発話内容を送信
      this.broadcastAgentSpeech(text, 'silence');

      // 自分も発話
      this.makeAgentSpeak(text, 'silence');
    }
    // 非マスタークライアントは何もしない（WebSocketメッセージを待つ）
  }

  /**
   * 名前検知による発話
   */
  checkNameDetection(text) {
    // Hard gate: if the UI toggle is OFF, do not trigger name-detection AI even if settings desync.
    const nameDetectionToggle = document.getElementById('name-detection-toggle');
    if (nameDetectionToggle && nameDetectionToggle.checked === false) {
      this.settings.nameDetection.enabled = false;
      return false;
    }

    if (!this.settings.nameDetection.enabled || !this.activeAgent) return false;

    // 単語境界を考慮した正規表現で完全一致チェック
    const detected = this.settings.nameDetection.keywords.some(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'i');
      return regex.test(text);
    });

    if (detected) {
      console.log(`[AgentBehavior] Name detection triggered by: "${text}"`);

      // AI応答をトリガー
      this.triggerAIResponse(text);

      // Last triggered time update
      const lastElement = document.getElementById('name-detection-last');
      if (lastElement) {
        lastElement.textContent = new Date().toLocaleTimeString();
      }
    }

    return detected;
  }

  /**
   * AI応答の生成
   */
  triggerAIResponse(userText) {
    // Hard gate: if UI toggle is OFF, never generate/broadcast name-detection speech.
    const nameDetectionToggle = document.getElementById('name-detection-toggle');
    if (nameDetectionToggle && nameDetectionToggle.checked === false) {
      this.settings.nameDetection.enabled = false;
      return;
    }

    // マスタークライアントのみがAI応答を生成
    if (!this.isMasterClient) return;

    // ここでAI応答を生成（OpenAI API等を使用）
    // 現在は簡単なルールベース応答
    const responses = [
      "Thank you for your question. Let me think about that.",
      "That's an interesting point. Could you elaborate more?",
      "I understand what you're asking. Here's my perspective.",
      "Good question! Let me provide some insight on that."
    ];

    const response = responses[Math.floor(Math.random() * responses.length)];
    console.log(`[AgentBehavior] Master client - Name detection response: "${response}"`);

    // WebSocketで全クライアントに発話内容を送信
    this.broadcastAgentSpeech(response, 'name');

    // 自分も発話
    this.makeAgentSpeak(response, 'name');
  }

  /**
   * エージェントに発話させる（エラー分離版）
   */
  makeAgentSpeak(text, speechType = 'manual') {
    if (!this.activeAgent) {
      console.warn('[AgentBehavior] No active agent available for speech');
      return;
    }

    console.log(`[AgentBehavior] Making agent speak (${speechType}): "${text}"`);

    // 安全なアバター発話を試行（エラーが発生しても継続）
    const speechSuccess = this.attemptAvatarSpeech(text);

    if (!speechSuccess) {
      console.log(`[AgentBehavior] Avatar speech failed, using TTS fallback`);
      this.fallbackToTTS(text);
    }

    // 重要: 以下の処理は必ずアバターの成功/失敗に関わらず実行する
    try {
      // ログを会話履歴に追加
      this.logAgentSpeech(text, speechType);

      // 発話時刻を記録
      this.activeAgent.lastSpeechTime = Date.now();

      // タイマーリセット（発話があったため）
      this.resetTimers();

      console.log(`[AgentBehavior] Speech completed successfully (${speechType})`);
    } catch (error) {
      console.error('[AgentBehavior] Critical error in speech completion:', error);
      // エラーが発生してもタイマーだけはリセットする
      this.resetTimers();
    }
  }

  /**
   * アバター発話の安全な試行
   */
  attemptAvatarSpeech(text) {
    try {
      // 新しいアバターマネージャーがある場合はそれを使用
      if (window.avatarManager && typeof window.avatarManager.speakSafely === 'function') {
        return window.avatarManager.speakSafely(text, 0);
      }

      // 従来のレンダラーを試行
      if (this.activeAgent.renderer && typeof this.activeAgent.renderer.speak === 'function') {
        this.activeAgent.renderer.speak(text);
        return true;
      }

      return false;
    } catch (error) {
      console.warn('[AgentBehavior] Avatar speech attempt failed:', error);
      return false;
    }
  }

  /**
   * TTS フォールバック
   */
  fallbackToTTS(text) {
    try {
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        window.speechSynthesis.speak(utterance);
        return true;
      }
    } catch (error) {
      console.error('[AgentBehavior] TTS fallback failed:', error);
    }
    return false;
  }

  /**
   * 会話履歴へのログ
   */
  logAgentSpeech(text, speechType) {
    // 設定更新関連のメッセージは会話履歴に出力しない
    if (speechType === 'settings' || text.includes('Setting') || text.includes('Updated')) {
      console.log(`[AgentBehavior] Settings update (not logged to chat): ${text}`);
      return;
    }

    // Calculate silence before speaking value
    let silenceBeforeSpeaking = 0;

    // All speech types record actual elapsed time
    if (speechType === 'silence' || speechType === 'name') {
      silenceBeforeSpeaking = this.getSilenceElapsed();
      console.log(`[AgentBehavior] ${speechType} speech - elapsed: ${silenceBeforeSpeaking.toFixed(1)}s`);
    }

    console.log(`[AgentBehavior] Logging agent speech: type=${speechType}, silenceBeforeSpeaking=${silenceBeforeSpeaking.toFixed(1)}s`);

    if (typeof addToSimpleChatHistory === 'function') {
      addToSimpleChatHistory(this.activeAgent.config.name, text, 'agent', speechType, silenceBeforeSpeaking);
    }

    // WebSocketで他のクライアントに同期
    if (typeof sendSimpleChatMessage === 'function') {
      sendSimpleChatMessage({
        type: 'AGENT_SPEECH',
        text: text,
        speechType: speechType,
        agentName: this.activeAgent.config.name,
        timestamp: new Date().toISOString(),
        silenceBeforeSpeaking: silenceBeforeSpeaking
      });
      console.log(`[AgentBehavior] Sent AGENT_SPEECH via WebSocket with silenceBeforeSpeaking=${silenceBeforeSpeaking.toFixed(1)}s`);
    }
  }

  /**
   * エージェント発話の全クライアント同期
   */
  broadcastAgentSpeech(text, speechType) {
    if (typeof sendSimpleChatMessage === 'function') {
      sendSimpleChatMessage({
        type: 'AGENT_SPEECH_SYNC',
        text: text,
        speechType: speechType,
        agentName: this.activeAgent ? this.activeAgent.config.name : 'Active Agent',
        timestamp: new Date().toISOString(),
        fromMaster: true
      });
      console.log(`[AgentBehavior] Broadcasted speech to all clients: "${text}" (${speechType})`);
    }
  }

  /**
   * 他のクライアントからの発話同期メッセージを受信
   */
  onSyncedAgentSpeech(data) {
    if (!this.isMasterClient && data.fromMaster) {
      console.log(`[AgentBehavior] Received synced speech from master: "${data.text}" (${data.speechType})`);
      this.makeAgentSpeak(data.text, data.speechType);
    }
  }

  /**
   * マスターコントロールからの設定更新を受信
   */
  onMasterSettingsUpdate(data) {
    if (data.settings) {
      console.log(`[AgentBehavior] Received settings update from master:`, data.settings);

      // Silence Detection settings
      if (data.settings.silenceDetection) {
        if (data.settings.silenceDetection.threshold) {
          this.settings.silenceDetection.threshold = data.settings.silenceDetection.threshold * 1000; // Convert to ms
        }
        if (data.settings.silenceDetection.messages) {
          this.settings.silenceDetection.speeches = data.settings.silenceDetection.messages;
        }
      }

      // Name Detection settings
      if (data.settings.nameDetection) {
        if (data.settings.nameDetection.keywords) {
          this.settings.nameDetection.keywords = data.settings.nameDetection.keywords;
        }
      }

      console.log(`[AgentBehavior] Updated settings:`, this.settings);

      // Restart timers with new settings
      if (this.isInitialized) {
        this.startTimers();
      }
    }
  }

  /**
   * マスターコントロールからの個別設定更新を受信
   */
  onSilenceThresholdUpdate(data) {
    if (data.thresholdSeconds) {
      this.settings.silenceDetection.threshold = data.thresholdSeconds * 1000;
      console.log(`[AgentBehavior] Updated silence threshold: ${data.thresholdSeconds}s`);
      if (this.isInitialized) {
        this.startSilenceTimer();
      }
    }
  }

  onSilenceMessagesUpdate(data) {
    if (data.messages && Array.isArray(data.messages)) {
      this.settings.silenceDetection.speeches = data.messages;
      console.log(`[AgentBehavior] Updated silence messages:`, data.messages);
    }
  }

  onNameKeywordsUpdate(data) {
    if (data.keywords && Array.isArray(data.keywords)) {
      this.settings.nameDetection.keywords = data.keywords;
      console.log(`[AgentBehavior] Updated name detection keywords:`, data.keywords);
    }
  }

  /**
   * タイマーリセット（ユーザー発話時に呼び出し）
   */
  resetTimers() {
    console.log('[AgentBehavior] Resetting timers due to activity');
    this.startSilenceTimer();
  }

  /**
   * UI表示の更新
   */
  updateSilenceCountdown() {
    const countdownElement = document.getElementById('silence-countdown');
    const progressElement = document.getElementById('silence-progress');

    if (this.silenceCountdownInterval) {
      clearInterval(this.silenceCountdownInterval);
      this.silenceCountdownInterval = null;
    }

    if (!countdownElement || !this.settings.silenceDetection.enabled) return;

    let timeLeft = this.settings.silenceDetection.threshold / 1000;

    this.silenceCountdownInterval = setInterval(() => {
      if (!this.settings.silenceDetection.enabled) {
        clearInterval(this.silenceCountdownInterval);
        this.silenceCountdownInterval = null;
        return;
      }
      timeLeft--;
      countdownElement.textContent = Math.max(0, timeLeft);

      if (progressElement) {
        const progress = ((this.settings.silenceDetection.threshold / 1000 - timeLeft) / (this.settings.silenceDetection.threshold / 1000)) * 100;
        progressElement.style.width = `${progress}%`;
      }

      if (timeLeft <= 0) {
        clearInterval(this.silenceCountdownInterval);
        this.silenceCountdownInterval = null;
      }
    }, 1000);
  }

  /**
   * イベントリスナーの設定
   */
  setupEventListeners() {
    if (this.eventListenersSetup) {
      console.log('[AgentBehavior] Event listeners already set up, skipping');
      return;
    }

    console.log('[AgentBehavior] Setting up event listeners...');

    // Settings update buttons
    const silenceUpdateBtn = document.getElementById('silence-update-btn');
    if (silenceUpdateBtn) {
      silenceUpdateBtn.addEventListener('click', () => {
        console.log('[AgentBehavior] Silence Update button clicked');
        this.loadSettingsFromUI();
        this.startSilenceTimer();
        this.broadcastSettingsToAll();
      });
      console.log('[AgentBehavior] ✓ silence-update-btn listener attached');
    } else {
      console.warn('[AgentBehavior] ✗ silence-update-btn not found');
    }

    const keywordsUpdateBtn = document.getElementById('keywords-update-btn');
    if (keywordsUpdateBtn) {
      keywordsUpdateBtn.addEventListener('click', () => {
        console.log('[AgentBehavior] Keywords Update button clicked');
        this.loadSettingsFromUI();
        this.broadcastSettingsToAll();
      });
      console.log('[AgentBehavior] ✓ keywords-update-btn listener attached');
    } else {
      console.warn('[AgentBehavior] ✗ keywords-update-btn not found');
    }

    // Settings apply buttons
    const applySilenceBtn = document.getElementById('apply-silence-threshold');
    if (applySilenceBtn) {
      applySilenceBtn.addEventListener('click', () => {
        console.log('[AgentBehavior] Apply Silence Threshold button clicked');
        this.loadSettingsFromUI();
        this.startSilenceTimer();
        this.broadcastSettingsToAll();
      });
      console.log('[AgentBehavior] ✓ apply-silence-threshold listener attached');
    } else {
      console.warn('[AgentBehavior] ✗ apply-silence-threshold not found');
    }

    this.eventListenersSetup = true;
    console.log('[AgentBehavior] ✓ Event listener setup complete');
  }

  /**
   * すべてのクライアントに設定を同期（master-control.jsと同じ実装を使用）
   */
  broadcastSettingsToAll() {
    console.log('[AgentBehavior] <i data-lucide="radio" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> broadcastSettingsToAll() called');
    console.log('[AgentBehavior] syncWebSocket exists:', typeof window.syncWebSocket !== 'undefined');
    console.log('[AgentBehavior] syncWebSocket readyState:', window.syncWebSocket?.readyState);
    console.log('[AgentBehavior] WebSocket.OPEN:', WebSocket.OPEN);

    if (typeof window.syncWebSocket === 'undefined' || !window.syncWebSocket) {
      console.warn('[AgentBehavior] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Cannot broadcast settings - syncWebSocket not available');
      return;
    }

    if (window.syncWebSocket.readyState !== WebSocket.OPEN) {
      console.warn('[AgentBehavior] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Cannot broadcast settings - WebSocket not connected, readyState:', window.syncWebSocket.readyState);
      return;
    }

    console.log('[AgentBehavior] <i data-lucide="check-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> WebSocket ready, proceeding with broadcast...');

    // マスターモードフラグをチェック
    const isMasterMode = typeof window.isMasterMode !== 'undefined' && window.isMasterMode === true;
    console.log('[AgentBehavior] isMasterMode:', isMasterMode);

    // 現在のユーザーIDを取得（自分自身のメッセージを受信側で無視するため）
    const currentUserId = window.client?.getCurrentUserInfo()?.userId || 'unknown';
    console.log('[AgentBehavior] Current user ID:', currentUserId);

    // master-control.jsと同じようにメッセージを送信
    const sendMessage = (message) => {
      const messageStr = JSON.stringify(message);
      console.log('[AgentBehavior] <i data-lucide="upload" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Sending message:', message.type);
      console.log('[AgentBehavior] <i data-lucide="upload" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Full message:', message);
      console.log('[AgentBehavior] <i data-lucide="upload" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> JSON:', messageStr);
      window.syncWebSocket.send(messageStr);
      console.log('[AgentBehavior] <i data-lucide="check-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Message sent successfully');
    };

    // Silence Detection Threshold (master-control.jsと同じ形式)
    sendMessage({
      type: 'SILENCE_THRESHOLD_UPDATE',
      thresholdSeconds: this.settings.silenceDetection.threshold / 1000,
      timestamp: new Date().toISOString(),
      hostId: 'master-mode-user',
      senderId: currentUserId,  // 受信側で自分自身のメッセージを無視するため
      forceMaster: isMasterMode  // サーバー側の権限チェックに必要
    });
    console.log('[AgentBehavior] ✓ Sent SILENCE_THRESHOLD_UPDATE:', this.settings.silenceDetection.threshold / 1000, 's');

    // Silence Detection Messages/Speeches
    sendMessage({
      type: 'SILENCE_MESSAGES_UPDATE',
      messages: this.settings.silenceDetection.speeches,
      timestamp: new Date().toISOString(),
      hostId: 'master-mode-user',
      senderId: currentUserId,
      forceMaster: isMasterMode
    });
    console.log('[AgentBehavior] ✓ Sent SILENCE_MESSAGES_UPDATE:', this.settings.silenceDetection.speeches.length, 'speeches');

    // Name Detection Keywords
    sendMessage({
      type: 'NAME_KEYWORDS_UPDATE',
      keywords: this.settings.nameDetection.keywords,
      timestamp: new Date().toISOString(),
      hostId: 'master-mode-user',
      senderId: currentUserId,
      forceMaster: isMasterMode
    });
    console.log('[AgentBehavior] ✓ Sent NAME_KEYWORDS_UPDATE:', this.settings.nameDetection.keywords.join(', '));

    console.log('[AgentBehavior] <i data-lucide="check-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> All settings broadcasted successfully');
  }

  /**
   * ユーザー活動の通知（外部から呼び出し）
   */
  notifyUserActivity(text = '') {
    console.log('[AgentBehavior] User activity detected');

    // 名前検知チェック
    if (text) {
      this.checkNameDetection(text);
    }

    // タイマーリセット
    this.resetTimers();
  }

  /**
   * 停止
   */
  stop() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    console.log('[AgentBehavior] Stopped');
  }
}

// グローバルインスタンス
window.agentBehaviorManager = new AgentBehaviorManager();

// Export for compatibility
window.AgentBehaviorManager = AgentBehaviorManager;

console.log('[AgentBehavior] Behavior management system loaded');

// DOMContentLoaded時に早期初期化（ボタンのイベントリスナーを設定）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('[AgentBehavior] DOM ready - performing early initialization');
    if (window.agentBehaviorManager && !window.agentBehaviorManager.isInitialized) {
      // UIから設定を読み込み、イベントリスナーを設定
      window.agentBehaviorManager.loadSettingsFromUI();
      window.agentBehaviorManager.determineMasterClient();
      window.agentBehaviorManager.setupEventListeners();
      console.log('[AgentBehavior] Early initialization complete (timers will start after avatar system loads)');
    }
  });
} else {
  // DOMが既に読み込まれている場合は即座に初期化
  console.log('[AgentBehavior] DOM already ready - performing early initialization');
  if (window.agentBehaviorManager && !window.agentBehaviorManager.isInitialized) {
    window.agentBehaviorManager.loadSettingsFromUI();
    window.agentBehaviorManager.determineMasterClient();
    window.agentBehaviorManager.setupEventListeners();
    console.log('[AgentBehavior] Early initialization complete (timers will start after avatar system loads)');
  }
}