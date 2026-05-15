/* ----------------------------------------------------------
   Avatar Manager - Isolated Avatar Rendering System

   このモジュールは他のシステムから完全に独立しており、
   アバターレンダリングの失敗が他の機能に影響を与えません
   ---------------------------------------------------------- */

class AvatarManager {
  constructor() {
    this.isInitialized = false;
    this.avatars = [];
    this.renderers = [];
    this.errors = [];

    // エラー隔離のためのフラグ
    this.renderingEnabled = true;
    this.failureCount = 0;
    this.maxFailures = 3;

    console.log('[AvatarManager] Initialized with error isolation');
  }

  /**
   * 安全な初期化 - エラーが発生しても他のシステムに影響しない
   */
  async safeInitialize() {
    try {
      console.log('[AvatarManager] Starting safe initialization...');

      // アバターシステムの初期化を試みる
      await this.initializeAvatarSystem();

      this.isInitialized = true;
      console.log('[AvatarManager] Initialization successful');
      return true;

    } catch (error) {
      this.handleInitializationError(error);
      return false;
    }
  }

  /**
   * アバターシステムの初期化
   */
  async initializeAvatarSystem() {
    // Three.jsとVRMの利用可能性チェック
    if (!this.checkDependencies()) {
      throw new Error('Required dependencies not available');
    }

    // キャンバス要素の存在確認
    const canvases = this.findAvatarCanvases();
    if (canvases.length === 0) {
      console.warn('[AvatarManager] No avatar canvases found, skipping avatar initialization');
      return;
    }

    // 各キャンバスに対してアバターを作成
    for (const canvas of canvases) {
      try {
        await this.createAvatar(canvas);
      } catch (error) {
        console.error(`[AvatarManager] Failed to create avatar for ${canvas.id}:`, error);
        this.errors.push({ canvas: canvas.id, error: error.message });
      }
    }

    // アニメーションループを開始（エラーセーフ）
    this.startSafeAnimationLoop();
  }

  /**
   * 依存関係のチェック
   */
  checkDependencies() {
    const hasThree = typeof window.THREE !== 'undefined';
    const hasVRM = typeof window.VRM !== 'undefined' ||
                   (typeof window.THREE !== 'undefined' && window.THREE.VRMLoaderPlugin);

    console.log('[AvatarManager] Dependencies check:', {
      THREE: hasThree,
      VRM: hasVRM
    });

    return hasThree; // 最低限Three.jsがあればOK
  }

  /**
   * アバターキャンバスを見つける
   */
  findAvatarCanvases() {
    const canvases = [];
    for (let i = 1; i <= 3; i++) {
      const canvas = document.getElementById(`vrm-canvas-${i}`);
      if (canvas) {
        canvases.push(canvas);
      }
    }
    return canvases;
  }

  /**
   * アバターの作成（エラー処理付き）
   */
  async createAvatar(canvas) {
    try {
      // 優先度1: FBXアバターシステム
      if (await this.tryCreateFBXAvatar(canvas)) {
        console.log(`[AvatarManager] Created FBX avatar for ${canvas.id}`);
        return;
      }

      // 優先度2: レンダラーファクトリー
      if (window.AvatarRendererFactory) {
        const config = this.getAvatarConfig(canvas);
        config.rendererType = 'fbx'; // FBX優先
        const renderer = window.AvatarRendererFactory.createRenderer(canvas.id, config);
        await renderer.initialize();

        this.renderers.push(renderer);
        console.log(`[AvatarManager] Created avatar renderer for ${canvas.id}`);
        return;
      }

      // VRM は無効化 - FBX のみ使用
      console.log(`[AvatarManager] VRM avatar creation disabled - FBX only mode`);

      // フォールバック: シンプルな3Dシーンを作成
      this.createFallbackScene(canvas);

    } catch (error) {
      console.error(`[AvatarManager] Avatar creation failed for ${canvas.id}:`, error);
      // エラーが発生してもクラッシュしない
      this.createFallbackScene(canvas);
    }
  }

  /**
   * FBXアバターの作成を試行
   */
  async tryCreateFBXAvatar(canvas) {
    try {
      // FBX Simple Avatar Systemがある場合
      if (window.FBXAvatarSystem && window.FBXAvatarSystem.AVATAR_CONFIG) {
        const config = this.getFBXConfig(canvas);
        if (window.FBXAvatar) {
          const fbxAvatar = new window.FBXAvatar(canvas.id, config);
          this.avatars.push(fbxAvatar);
          return true;
        }
      }

      // グローバルFBXアバター配列がある場合
      if (window.avatars && window.FBXAvatarSystem) {
        console.log(`[AvatarManager] Using existing FBX avatar system`);
        return true;
      }

      return false;
    } catch (error) {
      console.warn(`[AvatarManager] FBX avatar creation failed:`, error);
      return false;
    }
  }

  /**
   * FBX用の設定を取得
   */
  getFBXConfig(canvas) {
    const index = parseInt(canvas.id.replace('vrm-canvas-', '')) - 1;
    const fbxModelPath = '/models/avatar_testing_idle.fbx';

    const configs = [
      {
        name: 'Active Female Agent (FBX)',
        type: 'active',
        gender: 'female',
        modelPath: fbxModelPath,
        position: {x: 0, y: 0.4, z: 2.4},
        speechStyle: 'feminine',
        orientation: { y: 0 },
        scale: 0.57,
        rendererType: 'fbx'
      },
      {
        name: 'Silent Male Agent (M1) (FBX)',
        type: 'silent',
        gender: 'male',
        modelPath: fbxModelPath,
        position: {x: 0, y: 0.4, z: 2.4},
        speechStyle: 'none',
        orientation: { y: 0},
        scale: 0.57,
        rendererType: 'fbx'
      },
      {
        name: 'Silent Male Agent (M2) (FBX)',
        type: 'silent',
        gender: 'male',
        modelPath: fbxModelPath,
        position: {x: 0, y: 0.4, z: 2.4},
        speechStyle: 'none',
        orientation: { y: 0 },
        scale: 0.57,
        rendererType: 'fbx'
      }
    ];
    return configs[index] || configs[0];
  }

  /**
   * モデルパスを取得
   */
  getModelPath(canvas) {
    const index = parseInt(canvas.id.replace('vrm-canvas-', '')) - 1;
    const defaultPaths = [
      'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
      './models/sample_man.vrm',
      './models/sample_man.vrm'
    ];
    return defaultPaths[index] || defaultPaths[0];
  }

  /**
   * アバター設定を取得
   */
  getAvatarConfig(canvas) {
    const index = parseInt(canvas.id.replace('vrm-canvas-', '')) - 1;
    const configs = [
      {
        name: 'Active Female Agent',
        type: 'active',
        gender: 'female',
        rendererType: 'vrm',
        modelPath: this.getModelPath(canvas),
        position: {x: 0, y: -0.3, z: 0.5}
      },
      {
        name: 'Silent Male Agent (M1)',
        type: 'silent',
        gender: 'male',
        rendererType: 'vrm',
        modelPath: this.getModelPath(canvas),
        position: {x: 0, y: -0.45, z: 0.5}
      },
      {
        name: 'Silent Male Agent (M2)',
        type: 'silent',
        gender: 'male',
        rendererType: 'vrm',
        modelPath: this.getModelPath(canvas),
        position: {x: 0, y: -0.45, z: 0.5}
      }
    ];
    return configs[index] || configs[0];
  }

  /**
   * フォールバックシーンの作成（最小限の3D表示）
   */
  createFallbackScene(canvas) {
    try {
      if (!window.THREE) return;

      const scene = new window.THREE.Scene();
      scene.background = new window.THREE.Color(0xf0f0f0);

      const camera = new window.THREE.PerspectiveCamera(
        45,
        canvas.width / canvas.height,
        0.1,
        1000
      );
      camera.position.set(0, 1, 3);

      const renderer = new window.THREE.WebGLRenderer({ canvas, antialias: true });
      renderer.setSize(canvas.width, canvas.height);

      // シンプルなプレースホルダーを追加
      const geometry = new window.THREE.BoxGeometry(0.5, 1, 0.3);
      const material = new window.THREE.MeshBasicMaterial({ color: 0xcccccc });
      const placeholder = new window.THREE.Mesh(geometry, material);
      scene.add(placeholder);

      // ライトを追加
      const light = new window.THREE.AmbientLight(0xffffff, 1);
      scene.add(light);

      // レンダリング
      renderer.render(scene, camera);

      console.log(`[AvatarManager] Created fallback scene for ${canvas.id}`);

    } catch (error) {
      console.error(`[AvatarManager] Even fallback scene failed for ${canvas.id}:`, error);
    }
  }

  /**
   * 安全なアニメーションループ
   */
  startSafeAnimationLoop() {
    const animate = () => {
      if (!this.renderingEnabled) return;

      requestAnimationFrame(animate);

      try {
        this.updateAvatars();
        this.failureCount = 0; // 成功したらカウンターをリセット

      } catch (error) {
        this.handleRenderError(error);
      }
    };

    animate();
    console.log('[AvatarManager] Safe animation loop started');
  }

  /**
   * アバターの更新（エラー処理付き）
   */
  updateAvatars() {
    // VRMAvatarの更新
    for (const avatar of this.avatars) {
      try {
        if (avatar && typeof avatar.update === 'function') {
          const dt = avatar.clock?.getDelta() || 1/60;
          avatar.update(dt);
        }
      } catch (error) {
        console.warn(`[AvatarManager] Avatar update failed:`, error);
      }
    }

    // レンダラーの更新
    for (const renderer of this.renderers) {
      try {
        if (renderer && renderer.isReady && typeof renderer.render === 'function') {
          renderer.render();
        }
      } catch (error) {
        console.warn(`[AvatarManager] Renderer update failed:`, error);
      }
    }
  }

  /**
   * 初期化エラーのハンドリング
   */
  handleInitializationError(error) {
    console.error('[AvatarManager] Initialization failed:', error);
    this.errors.push({ type: 'initialization', error: error.message });

    // UIにエラーを通知（オプション）
    this.notifyError('Avatar system initialization failed, but other features will continue to work');
  }

  /**
   * レンダリングエラーのハンドリング
   */
  handleRenderError(error) {
    this.failureCount++;
    console.warn(`[AvatarManager] Render error (${this.failureCount}/${this.maxFailures}):`, error);

    if (this.failureCount >= this.maxFailures) {
      console.error('[AvatarManager] Too many render failures, disabling avatar rendering');
      this.renderingEnabled = false;
      this.notifyError('Avatar rendering has been disabled due to errors');
    }
  }

  /**
   * エラー通知（UIへの通知、オプション）
   */
  notifyError(message) {
    // コンソールに警告を表示
    console.warn(`[AvatarManager] ${message}`);

    // 必要に応じてUIに通知を表示
    const errorElement = document.getElementById('avatar-error-notification');
    if (errorElement) {
      errorElement.textContent = message;
      errorElement.style.display = 'block';
      setTimeout(() => {
        errorElement.style.display = 'none';
      }, 5000);
    }
  }

  /**
   * アバターの取得（エージェント行動システム用）
   */
  getActiveAvatar() {
    try {
      // VRMAvatarから探す
      const vrmAvatar = this.avatars.find(a => a?.config?.type === 'active');
      if (vrmAvatar) return vrmAvatar;

      // レンダラーから探す
      const renderer = this.renderers.find(r => r?.config?.type === 'active');
      if (renderer) return renderer;

      // window.avatarsから探す（後方互換性）
      if (window.avatars && window.avatars[0]) {
        return window.avatars[0];
      }

    } catch (error) {
      console.warn('[AvatarManager] Failed to get active avatar:', error);
    }

    return null;
  }

  /**
   * 発話メソッド（エラー処理付き）
   */
  speakSafely(text, avatarIndex = 0) {
    try {
      // FBXアバターシステムから発話を試行
      if (window.avatars && window.avatars[avatarIndex]) {
        const fbxAvatar = window.avatars[avatarIndex];
        if (fbxAvatar && typeof fbxAvatar.speak === 'function') {
          fbxAvatar.speak(text);
          console.log(`[AvatarManager] FBX avatar ${avatarIndex} spoke: "${text}"`);
          return true;
        }
      }

      // 管理している通常のアバター配列から発話を試行
      const avatar = this.avatars[avatarIndex] || this.renderers[avatarIndex];
      if (avatar && typeof avatar.speak === 'function') {
        avatar.speak(text);
        console.log(`[AvatarManager] Avatar ${avatarIndex} spoke: "${text}"`);
        return true;
      }

      // ActiveAvatarからの発話試行（後方互換性）
      const activeAvatar = this.getActiveAvatar();
      if (activeAvatar && typeof activeAvatar.speak === 'function') {
        activeAvatar.speak(text);
        console.log(`[AvatarManager] Active avatar spoke: "${text}"`);
        return true;
      }

      console.log(`[AvatarManager] No avatar available for speech, using TTS fallback`);

      // フォールバック: 音声合成のみ
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1.1;
        speechSynthesis.speak(utterance);
        console.log(`[AvatarManager] TTS fallback spoke: "${text}"`);
        return true;
      }

    } catch (error) {
      console.warn('[AvatarManager] Speech failed:', error);

      // 最後のフォールバック: 確実に音声を出力
      try {
        if ('speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(text);
          speechSynthesis.speak(utterance);
          console.log(`[AvatarManager] Emergency TTS fallback: "${text}"`);
          return true;
        }
      } catch (ttsError) {
        console.error('[AvatarManager] Even TTS fallback failed:', ttsError);
      }
    }

    return false;
  }

  /**
   * システムのクリーンアップ
   */
  dispose() {
    try {
      // アバターのクリーンアップ
      for (const avatar of this.avatars) {
        if (avatar && typeof avatar.dispose === 'function') {
          avatar.dispose();
        }
      }

      // レンダラーのクリーンアップ
      for (const renderer of this.renderers) {
        if (renderer && typeof renderer.dispose === 'function') {
          renderer.dispose();
        }
      }

      this.avatars = [];
      this.renderers = [];
      this.renderingEnabled = false;

      console.log('[AvatarManager] System disposed');

    } catch (error) {
      console.error('[AvatarManager] Disposal failed:', error);
    }
  }
}

// グローバルインスタンスの作成
window.avatarManager = new AvatarManager();

// DOMロード後に安全に初期化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[AvatarManager] DOM loaded, starting safe initialization...');

  // 少し遅延させて他のシステムの初期化を待つ
  setTimeout(async () => {
    const success = await window.avatarManager.safeInitialize();

    if (success) {
      console.log('[AvatarManager] Avatar system ready');
    } else {
      console.log('[AvatarManager] Avatar system failed to initialize, but app continues');
    }

    // エージェント行動システムに通知（存在する場合）
    if (window.agentBehaviorManager && typeof window.agentBehaviorManager.setAvatarManager === 'function') {
      window.agentBehaviorManager.setAvatarManager(window.avatarManager);
    }
  }, 1000);
});

console.log('[AvatarManager] Module loaded');