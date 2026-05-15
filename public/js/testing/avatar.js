/* ----------------------------------------------------------
   Three.js + VRM アバター対応版
   ---------------------------------------------------------- */
   import * as THREE        from 'three';
   import { GLTFLoader }    from 'three/examples/jsm/loaders/GLTFLoader.js';
   import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
   
   /* === アバター構成パターン定義 ============================ */
   const AVATAR_CONFIGURATIONS = {
     // 実験条件: FAM (Female Active, Male silent, Male silent)
     'fam': [
       {
         name: 'Active Female Agent',
         type: 'active',
         gender: 'female',
         modelPath: 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
         position: new THREE.Vector3(0, -0.3, 0.5),
         speechStyle: 'feminine',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: 0.8 },
           leftUpperArm: { x: 0.1, y: 0, z: -0.8 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.1, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M1)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.45, 0.5),
         speechStyle: 'none',
         orientation: { y: 0},
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 },
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M2)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.45, 0.5),
         speechStyle: 'none',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 },
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       }
     ],

     // 実験条件: MAM (Male Active, Male silent, Male silent)
     'mam': [
       {
         name: 'Active Male Agent',
         type: 'active',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.5, 0.5),
         speechStyle: 'masculine',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 },
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M1)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.5, 0.5),
         speechStyle: 'none',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 },
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M2)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.5, 0.5),
         speechStyle: 'none',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 },
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       }
     ],

     // 実験条件: FAF (Female Active, Female silent, Male silent)
     'faf': [
       {
         name: 'Active Female Agent',
         type: 'active',
         gender: 'female',
         modelPath: 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
         position: new THREE.Vector3(0, -0.3, 0.5),
         speechStyle: 'feminine',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: 0.8 },
           leftUpperArm: { x: 0.1, y: 0, z: -0.8 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.1, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Female Agent',
         type: 'silent',
         gender: 'female',
         modelPath: 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
         position: new THREE.Vector3(0, -0.3, 0.5),
         speechStyle: 'none',
         orientation: { y: 0},
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: 0.8 },
           leftUpperArm: { x: 0.1, y: 0, z: -0.8 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.1, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M2)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.45, 0.5),
         speechStyle: 'none',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 },
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       }
     ],

     // 実験条件: MAF (Male Active, Female silent, Male silent)
     'maf': [
       {
         name: 'Active Male Agent',
         type: 'active',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.5, 0.5),
         speechStyle: 'masculine',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 },
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Female Agent',
         type: 'silent',
         gender: 'female',
         modelPath: 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
         position: new THREE.Vector3(0, -0.3, 0.5),
         speechStyle: 'none',
         orientation: { y: 0},
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: 0.8 },
           leftUpperArm: { x: 0.1, y: 0, z: -0.8 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.1, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M2)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.45, 0.5),
         speechStyle: 'none',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 },
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       }
     ],

     // 実験条件: NAN (Neutral Active, Neutral silent, Male silent) - 女性アバターで代替
     'nan': [
       {
         name: 'Active Neutral Agent (Female Avatar)',
         type: 'active',
         gender: 'neutral',
         modelPath: 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
         position: new THREE.Vector3(0, -0.3, 0.5),
         speechStyle: 'neutral',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: 0.8 },
           leftUpperArm: { x: 0.1, y: 0, z: -0.8 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.1, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Neutral Agent (Female Avatar)',
         type: 'silent',
         gender: 'neutral',
         modelPath: 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
         position: new THREE.Vector3(0, -0.3, 0.5),
         speechStyle: 'none',
         orientation: { y: 0},
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: 0.8 },
           leftUpperArm: { x: 0.1, y: 0, z: -0.8 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.1, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M2)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.45, 0.5),
         speechStyle: 'none',
         orientation: { y: 0 },
         pose: {
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 },
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       }
     ],

     // 既存の構成（後方互換性のため）
     'female_male_male': [
       {
         name: 'Active Female Agent',
         type: 'active',
         gender: 'female',
         modelPath: 'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@master/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm',
         position: new THREE.Vector3(0, -0.3, 0.5),
         speechStyle: 'masculine', // 女性型は男性的表現
         orientation: { y: 0 }, // 向き設定
         pose: { // 姿勢設定
           rightUpperArm: { x: 0.1, y: 0, z: 0.8 }, // バンザイ修正
           leftUpperArm: { x: 0.1, y: 0, z: -0.8 },   // バンザイ修正
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.1, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M1)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.45, 0.5),
         speechStyle: 'none', // サイレント
         orientation: { y: 0}, // 180度回転
         pose: { // 姿勢設定
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 }, // 元の設定
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },   // 元の設定
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M2)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.45, 0.5),
         speechStyle: 'none', // サイレント
         orientation: { y: 0 }, // 180度回転
         pose: { // 姿勢設定
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 }, // 元の設定
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },   // 元の設定
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       }
     ],
     'male_male_male': [
       {
         name: 'Active Male Agent',
         type: 'active',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.5, 0.5),
         speechStyle: 'feminine', // 男性型は女性的表現
         orientation: { y: 0 }, // 180度回転
         pose: { // 姿勢設定
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 }, // 元の設定
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },   // 元の設定
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M1)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.5, 0.5),
         speechStyle: 'none', // サイレント
         orientation: { y: 0 }, // 180度回転
         pose: { // 姿勢設定
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 }, // 元の設定
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },   // 元の設定
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       },
       {
         name: 'Silent Male Agent (M2)',
         type: 'silent',
         gender: 'male',
         modelPath: './models/sample_man.vrm',
         position: new THREE.Vector3(0, -0.5, 0.5),
         speechStyle: 'none', // サイレント
         orientation: { y: 0 }, // 180度回転
         pose: { // 姿勢設定
           rightUpperArm: { x: 0.1, y: 0, z: -1.2 }, // 元の設定
           leftUpperArm: { x: 0.1, y: 0, z: 1.2 },   // 元の設定
           rightLowerArm: { x: 0.1, y: 0, z: 0 },
           leftLowerArm: { x: 0.5, y: 0, z: 0 }
         }
       }
     ]
   };

   /* === URL解析機能 ============================================ */
   function parseExperimentConditionFromURL() {
     const path = window.location.pathname.toLowerCase();
     console.log(`[Experiment Condition] Parsing URL path: ${path}`);

     // URL末尾の3文字を抽出（例: /fam, /mam, /faf, /maf, /nan）
     const match = path.match(/\/([a-z]{3})$/);
     if (match) {
       const condition = match[1];
       console.log(`[Experiment Condition] Found condition: ${condition}`);

       // 有効な条件かチェック
       const validConditions = ['fam', 'mam', 'faf', 'maf', 'nan'];
       if (validConditions.includes(condition)) {
         console.log(`[Experiment Condition] <i data-lucide="check-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Valid condition: ${condition}`);
         return condition;
       } else {
         console.warn(`[Experiment Condition] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Invalid condition: ${condition}. Using default.`);
       }
     } else {
       console.log(`[Experiment Condition] No condition found in URL path. Using default.`);
     }

     // デフォルト条件
     return 'fam';
   }

   // 現在の構成（URL解析に基づく）
   let currentConfigKey = parseExperimentConditionFromURL();
   let AVATAR_CONFIG = AVATAR_CONFIGURATIONS[currentConfigKey];

   console.log(`[Avatar Config] <i data-lucide="target" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Experiment Condition: ${currentConfigKey.toUpperCase()}`);
   console.log(`[Avatar Config] Active Agent: ${AVATAR_CONFIG[0].gender} (${AVATAR_CONFIG[0].name})`);
   console.log(`[Avatar Config] Silent Agent 1: ${AVATAR_CONFIG[1].gender} (${AVATAR_CONFIG[1].name})`);
   console.log(`[Avatar Config] Silent Agent 2: ${AVATAR_CONFIG[2].gender} (${AVATAR_CONFIG[2].name})`);
   
   // 後方互換性のため
   const AVATAR_MODEL_PATHS = AVATAR_CONFIG.map(config => config.modelPath);
   const AVATAR_POSITIONS = AVATAR_CONFIG.map(config => config.position);
   
   /* === 構成切り替え関数 ======================================== */
   function switchAvatarConfiguration(configKey) {
     if (!AVATAR_CONFIGURATIONS[configKey]) {
       console.error(`[Avatar Config] Unknown configuration: ${configKey}`);
       return false;
     }

     console.log(`[Avatar Config] Switching from ${currentConfigKey} to ${configKey}`);
     currentConfigKey = configKey;
     AVATAR_CONFIG = AVATAR_CONFIGURATIONS[configKey];

     // 既存のアバターを削除
     avatars.forEach(avatar => {
       if (avatar.scene) {
         avatar.scene.clear();
       }
     });
     avatars.length = 0;

     // 新しい構成でアバターを再作成
     AVATAR_CONFIG.forEach((config, index) => {
       const canvasId = `vrm-canvas-${index + 1}`;
       console.log(`[Avatar ${index}] Creating ${config.name} (${config.gender}, ${config.type}) with model: ${config.modelPath}`);
       
       const avatar = new VRMAvatar(canvasId, config.modelPath, config.position);
       avatar.config = config;
       avatars.push(avatar);
     });

     // グローバル変数を更新
     window.avatars = avatars;
     window.AVATAR_CONFIG = AVATAR_CONFIG;

     // ラベルを更新
     updateAvatarLabels();

     console.log(`[Avatar Config] Successfully switched to ${configKey}`);
     return true;
   }

   function updateAvatarLabels() {
     AVATAR_CONFIG.forEach((config, index) => {
       const labelElement = document.querySelector(`#vrm-canvas-${index + 1}`).nextElementSibling;
       if (labelElement && labelElement.classList.contains('avatar-label')) {
         labelElement.textContent = config.name;
       }
     });
   }

   /* === アイドリングモーション設定 ================================ */
   let globalTime = 0;

   /* === 音声合成とリップシンク設定 ================================ */
   let speechSynthesis = null;
   let audioContext = null;
   let analyser = null;
   let globalFemaleVoice = null;  // グローバル女性音声
   let globalMaleVoice = null;    // グローバル男性音声
   let availableVoices = [];
   let selectedVoice = null;
   
   /* === util: トラック名正規化 (接頭辞を剥ぐ) ================= */
   function sanitizeTrackName(track) {
     const seg  = track.name.split(/\.(.+)/);   // Bone . Prop
     const prop = seg[1];
     let bone   = seg[0]
                   .replace(/^mixamorig[_:]?/i, '')
                   .replace(/^Armature\|/i, '')
                   .replace(/^CC_Base_/i, '');
     track.name = `${bone}.${prop}`;
     return track;
   }
   
   /* === util: 全ボーン scale を 1 に強制 ====================== */
   function forceBoneScaleOne(root) {
     root.traverse(o => {
       if (o.isBone && (o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1)) {
         o.scale.set(1, 1, 1);
         o.updateMatrix();
         o.updateMatrixWorld(true);
       }
     });
   }
   
   /* === VRMアバタ―クラス ========================================= */
   class VRMAvatar {
     constructor(canvasId, modelPath, spawnPos) {
       /* Canvas / Scene / Renderer -------------------------------- */
       this.canvas = document.getElementById(canvasId);
       this.scene  = new THREE.Scene();
       this.scene.background = new THREE.Color(0xffffff);
   
       this.camera = new THREE.PerspectiveCamera(
         30, this.canvas.clientWidth / this.canvas.clientHeight, 0.1, 20
       );
       this.camera.position.set(0, 1.4, 1.4);
       this.camera.lookAt(0, 1, 0);
   
       this.renderer = new THREE.WebGLRenderer({ canvas:this.canvas, antialias:false });
       this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
       this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
   
       /* Light ---------------------------------------------------- */
       this.scene.add(new THREE.AmbientLight(0xffffff, 1));
       const dl = new THREE.DirectionalLight(0xffffff, 1);
       dl.position.set(0,1,1).normalize();
       this.scene.add(dl);
   
       /* 外側コンテナ（ワールド配置専用） ------------------------ */
       this.container = new THREE.Group();
       this.container.position.copy(spawnPos);
       this.scene.add(this.container);
   
       /* Vars ----------------------------------------------------- */
       this.clock  = new THREE.Clock();
       this.mixer  = null;
       this.vrm    = null;
       this.modelPath = modelPath;
       this.isSpeaking = false;  // インスタンス固有の話し中フラグ
       this.lipSyncInterval = null;
       this.testingExpression = false;  // テスト中フラグ
       this.animationState = 'idle';  // 'idle' or 'speaking'
       this.manualSpeakingAnimation = false;  // 手動発話アニメーションフラグ
       this.speakingAnimationInterval = null;  // 発話アニメーション用インターバル
       this.idleAnimationActive = false;  // アイドリングアニメーション実行中フラグ
       this.basePosition = null;  // 基準位置
       this.baseRotation = null;  // 基準回転
       this.localTime = 0;        // このアバター専用の時間
   
       this.loadModel();
       
       // 全てのアバターで音声合成を確実に初期化
       this.initSpeechSynthesisForAll();
       
       // 全てのアバターで音声が利用可能になるよう確認
       this.ensureVoicesLoaded();
     }
   
     /* VRMモデル読込 ------------------------------------------------- */
     loadModel() {
       const loader = new GLTFLoader();
       loader.register((parser) => {
         return new VRMLoaderPlugin(parser);
       });
       
       loader.load(
         this.modelPath,
         gltf => {
           const vrm = gltf.userData.vrm;
           if (vrm) {
             this.vrm = vrm;
             this.vrm.scene.position.set(0,0,0);
             this.container.add(this.vrm.scene);
             VRMUtils.rotateVRM0(this.vrm);
             
             // AnimationMixerを初期化（VRMの内部アニメーション制御用）
             this.mixer = new THREE.AnimationMixer(this.vrm.scene);
             console.log(`[Animation] AnimationMixer initialized for ${this.config?.name || 'unknown'}`);
             
             // 初期状態ではアニメーションは有効
             this.mixer.timeScale = 1.0;
             
             // VRM読み込み完了後に修正を適用
             setTimeout(() => {
               this.fixModelOrientation();
               this.setupIdlePose();
               console.log(`[Model Fix] Model corrections applied for ${this.config?.name || 'unknown'} (${this.config?.gender || 'unknown'})`);
             }, 200);
             
             // VRMの表情リストを詳しく確認
             if (this.vrm.expressionManager) {
               console.log('=== VRM Expression Manager Info ===');
               console.log('expressionManager:', this.vrm.expressionManager);
               console.log('expressions object:', this.vrm.expressionManager.expressions);
               
               if (this.vrm.expressionManager.expressions) {
                 const expressionKeys = Object.keys(this.vrm.expressionManager.expressions);
                 console.log('Available expression keys:', expressionKeys);
                 
                 // 各表情の詳細情報を確認
                 expressionKeys.forEach(key => {
                   const expression = this.vrm.expressionManager.expressions[key];
                   console.log(`Expression "${key}":`, expression);
                 });
               }
               
               // プリセット表情もチェック
               console.log('Expression presets (if any):', this.vrm.expressionManager.presets);
               
               // 実際にテスト用の表情名をいくつか試してみる
               const testExpressions = ['aa', 'ih', 'ou', 'ee', 'oh', 'a', 'i', 'u', 'e', 'o', 'A', 'I', 'U', 'E', 'O'];
               testExpressions.forEach(expr => {
                 try {
                   const value = this.vrm.expressionManager.getValue(expr);
                   if (value !== undefined) {
                     console.log(`Found working expression: "${expr}" (current value: ${value})`);
                   }
                 } catch (e) {
                   // Silently ignore non-existent expressions
                 }
               });
             }
           } else {
             console.error('[VRM Load Error] No VRM data found');
           }
         },
         undefined,
         err => console.error('[Avatar Load Error]', err)
       );
     }
   
     /* アイドルポーズ設定 --------------------------------------------- */
     setupIdlePose() {
       if (!this.vrm?.humanoid) {
         console.log('No humanoid found');
         return;
       }

       console.log('Setting up idle pose with humanoid...'); 

       // 記事と同じ方法で取得
       const rightUpperArm = this.vrm.humanoid.getRawBoneNode('rightUpperArm');
       const rightLowerArm = this.vrm.humanoid.getRawBoneNode('rightLowerArm');
       console.log('Right arm bones via humanoid:', rightUpperArm, rightLowerArm);
       
       if (rightUpperArm && rightLowerArm) {
         // 記事と同じ値を使用
         rightUpperArm.rotation.z = -1.2;
         rightUpperArm.rotation.x = 0.1;
         rightLowerArm.rotation.x = 0.1;
         console.log('Right arm rotation set');
       }

       // 左腕の設定
       const leftUpperArm = this.vrm.humanoid.getRawBoneNode('leftUpperArm');
       const leftLowerArm = this.vrm.humanoid.getRawBoneNode('leftLowerArm');
       console.log('Left arm bones via humanoid:', leftUpperArm, leftLowerArm);
       
       if (leftUpperArm && leftLowerArm) {
         // 記事と同じ値を使用
         leftUpperArm.rotation.z = 1.2;
         leftUpperArm.rotation.x = 0.1;
         leftLowerArm.rotation.x = 0.5;
         console.log('Left arm rotation set');
       }

       // 右足の設定
       const rightUpperLeg = this.vrm.humanoid.getRawBoneNode('rightUpperLeg');
       if (rightUpperLeg) {
         rightUpperLeg.rotation.z = 0;
         rightUpperLeg.rotation.y = 0.1;
       }

       // 左足の設定
       const leftUpperLeg = this.vrm.humanoid.getRawBoneNode('leftUpperLeg');
       if (leftUpperLeg) {
         leftUpperLeg.rotation.z = 0;
         leftUpperLeg.rotation.y = -0.1;
       }
     }

     /* アニメーション状態更新 --------------------------------------- */
     updateAnimationState() {
       if (!this.vrm || !this.config) return;

       // 基準位置・回転を保存（初回のみ）
       if (!this.basePosition) {
         this.basePosition = this.config.position.clone();
       }
       if (!this.baseRotation) {
         this.baseRotation = {
           x: this.config.orientation?.x || 0,
           y: this.config.orientation?.y || 0,
           z: this.config.orientation?.z || 0
         };
       }

       switch (this.animationState) {
         case 'idle':
           this.updateIdleAnimation();
           break;
         case 'speaking':
           this.updateSpeakingState();
           break;
         case 'stop':
           this.updateStaticState();
           break;
         default:
           this.updateStaticState();
       }
     }

     /* アイドリングアニメーション更新 ------------------------------- */
     updateIdleAnimation() {
       // STOPモードの場合は何もしない
       if (this.animationState === 'stop') {
         return;
       }
       
       if (this.isSpeaking || this.testingExpression || this.manualSpeakingAnimation) {
         return; // 他のアニメーションが優先
       }

       // 呼吸のような上下の動き
       const baseY = this.basePosition.y;
       this.container.position.y = baseY + Math.sin(this.localTime * 0.4) * 0.008;
       
       // 体の軽い左右の揺れ
       const baseRotationY = this.baseRotation.y;
       this.container.rotation.y = baseRotationY + Math.sin(this.localTime * 0.2) * 0.003;

       // 基本位置を維持
       this.container.position.x = this.basePosition.x;
       this.container.position.z = this.basePosition.z;
       this.container.rotation.x = this.baseRotation.x;
       this.container.rotation.z = this.baseRotation.z;

       // 瞬き処理
       if (Math.random() < 0.001) {
         this.performBlink();
       }
     }

     /* 発話状態更新 ------------------------------------------------- */
     updateSpeakingState() {
       // 基本位置・回転を維持（アニメーションなし）
       this.container.position.copy(this.basePosition);
       this.container.rotation.x = this.baseRotation.x;
       this.container.rotation.y = this.baseRotation.y;
       this.container.rotation.z = this.baseRotation.z;

       // 手動発話アニメーションは別途実行中（口のアニメーションのみ）
     }

     /* 静的状態更新 ------------------------------------------------- */
     updateStaticState() {
       // 基本位置・回転を維持
       if (this.basePosition && this.baseRotation) {
         this.container.position.copy(this.basePosition);
         this.container.rotation.x = this.baseRotation.x;
         this.container.rotation.y = this.baseRotation.y;
         this.container.rotation.z = this.baseRotation.z;
       }
     }

     /* ========== 向きとポーズ修正 =================================== */
     fixModelOrientation() {
       if (!this.vrm || !this.config) return;
       
       // 設定に基づいてモデルの向きを修正（X、Y、Z全軸対応）
       if (this.config.orientation) {
         this.container.rotation.x = this.config.orientation.x || 0;
         this.container.rotation.y = this.config.orientation.y || 0;
         this.container.rotation.z = this.config.orientation.z || 0;
         
         // 強制的にマトリックスを更新
         this.container.updateMatrix();
         this.container.updateMatrixWorld(true);
         
         console.log(`[Model Fix] Applied rotation (x:${this.config.orientation.x}, y:${this.config.orientation.y}, z:${this.config.orientation.z}) for ${this.config.name}`);
       } else {
         this.container.rotation.set(0, 0, 0);
         console.log(`[Model Fix] No orientation config found for ${this.config.name}`);
       }
       
       // 念のため頭と首もリセット
       if (this.vrm.humanoid) {
         const neck = this.vrm.humanoid.getRawBoneNode('neck');
         const head = this.vrm.humanoid.getRawBoneNode('head');
         
         if (neck) {
           neck.rotation.y = 0;
           neck.updateMatrix();
         }
         
         if (head) {
           head.rotation.y = 0;
           head.updateMatrix();
         }
       }
     }


     /* 瞬き処理 --------------------------------------------------- */
     async performBlink() {
       // STOPモードの場合は瞬きもしない
       if (this.animationState === 'stop') return;
       
       if (!this.vrm?.expressionManager || this.isSpeaking) return;

       // まぶたを閉じる
       this.vrm.expressionManager.setValue('blinkLeft', 1.0);
       this.vrm.expressionManager.setValue('blinkRight', 1.0);
       this.vrm.expressionManager.update();

       await new Promise(resolve => setTimeout(resolve, 50));

       // まぶたを開く
       for (let i = 1.0; i >= 0; i -= 0.1) {
         if (this.isSpeaking || this.animationState === 'stop') break; // 話している時やSTOP時は瞬きを中断
         this.vrm.expressionManager.setValue('blinkLeft', i);
         this.vrm.expressionManager.setValue('blinkRight', i);
         this.vrm.expressionManager.update();
         await new Promise(resolve => setTimeout(resolve, 5));
       }
     }
   
     /* 更新 ------------------------------------------------------- */
     update(dt) {
       // STOPモードでは絶対に何もしない（レンダリングのみ）
       if (this.animationState === 'stop') {
         this.renderer.render(this.scene, this.camera);
         return;
       }

       // STOPモード以外のみ処理
       if (this.vrm) {
         // AnimationMixerの更新
         if (this.mixer) {
           this.mixer.timeScale = 1;
           this.mixer.update(dt);
         }

         // ローカル時間の進行（このアバターのみ）
         this.localTime += 0.005;

         // VRMの基本更新
         if ((!this.isSpeaking && !this.testingExpression) || this.manualSpeakingAnimation) {
           this.vrm.update(dt);
           this.forceApplyTransform();
         } else {
           this.forceApplyTransform();
         }

         // ポーズとアニメーション状態の更新
         this.applyIdlePose();
         this.updateAnimationState();
       }

       this.renderer.render(this.scene, this.camera);
     }

     /* 毎フレームポーズ適用 ----------------------------------------- */
     applyIdlePose() {
       if (!this.vrm?.humanoid || !this.config) return;

       // 話している時は表情以外のポーズを維持
       // 話していない時は通常のポーズ適用

       // 設定に基づいてポーズを適用
       if (this.config.pose) {
         // 右上腕
         const rightUpperArm = this.vrm.humanoid.getRawBoneNode('rightUpperArm');
         if (rightUpperArm && this.config.pose.rightUpperArm) {
           rightUpperArm.rotation.x = this.config.pose.rightUpperArm.x || 0;
           rightUpperArm.rotation.y = this.config.pose.rightUpperArm.y || 0;
           rightUpperArm.rotation.z = this.config.pose.rightUpperArm.z || 0;
         }
         
         // 右下腕
         const rightLowerArm = this.vrm.humanoid.getRawBoneNode('rightLowerArm');
         if (rightLowerArm && this.config.pose.rightLowerArm) {
           rightLowerArm.rotation.x = this.config.pose.rightLowerArm.x || 0;
           rightLowerArm.rotation.y = this.config.pose.rightLowerArm.y || 0;
           rightLowerArm.rotation.z = this.config.pose.rightLowerArm.z || 0;
         }
         
         // 左上腕
         const leftUpperArm = this.vrm.humanoid.getRawBoneNode('leftUpperArm');
         if (leftUpperArm && this.config.pose.leftUpperArm) {
           leftUpperArm.rotation.x = this.config.pose.leftUpperArm.x || 0;
           leftUpperArm.rotation.y = this.config.pose.leftUpperArm.y || 0;
           leftUpperArm.rotation.z = this.config.pose.leftUpperArm.z || 0;
         }
         
         // 左下腕
         const leftLowerArm = this.vrm.humanoid.getRawBoneNode('leftLowerArm');
         if (leftLowerArm && this.config.pose.leftLowerArm) {
           leftLowerArm.rotation.x = this.config.pose.leftLowerArm.x || 0;
           leftLowerArm.rotation.y = this.config.pose.leftLowerArm.y || 0;
           leftLowerArm.rotation.z = this.config.pose.leftLowerArm.z || 0;
         }
         
         // console.log(`[Pose Applied] Individual pose configuration applied for ${this.config.name}`);
       } else {
         console.log(`[Pose Warning] No pose configuration found for ${this.config.name}`);
       }

       const hips = this.vrm.humanoid.getRawBoneNode('hips');
       if (hips) {
         hips.rotation.x = -0.05; 
         hips.rotation.y = 0;
         hips.rotation.z = 0;
       }

       const spine = this.vrm.humanoid.getRawBoneNode('spine');
       if (spine) {
         spine.rotation.x = -0.03; 
         spine.rotation.y = 0;
         spine.rotation.z = 0;
       }

       const rightUpperLeg = this.vrm.humanoid.getRawBoneNode('rightUpperLeg');
       if (rightUpperLeg) {
         rightUpperLeg.rotation.z = 0;
         rightUpperLeg.rotation.y = 0.05;
       }

       const leftUpperLeg = this.vrm.humanoid.getRawBoneNode('leftUpperLeg');
       if (leftUpperLeg) {
         leftUpperLeg.rotation.z = 0;
         leftUpperLeg.rotation.y = -0.05;
       }

       // 話している時、テスト中、手動発話アニメーション中は表情をリセットしない
       if (!this.isSpeaking && !this.testingExpression && !this.manualSpeakingAnimation) {
         // 話していない時かつテスト中でない時かつ手動アニメーション中でない時のみ表情をリセット
         if (this.vrm?.expressionManager) {
           const shapes = ['aa', 'ih', 'ou', 'ee', 'oh'];
           shapes.forEach(shape => {
             this.vrm.expressionManager.setValue(shape, 0);
           });
           this.vrm.expressionManager.update();
         }
       } else {
         // デバッグ：なぜ表情リセットをスキップしたか
         if (this.isSpeaking) {
           console.log('Skipping expression reset: currently speaking');
         }
         if (this.testingExpression) {
           console.log('Skipping expression reset: testing expression');
         }
       }
     }
   
     resize() {
       this.camera.aspect = this.canvas.clientWidth / this.canvas.clientHeight;
       this.camera.updateProjectionMatrix();
       this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight, false);
     }

     /* 音声合成初期化 ------------------------------------------------- */
     // グローバル音声合成初期化（一度だけ実行）
     static initGlobalSpeechSynthesis() {
       if (window.speechSynthesisInitialized) {
         return; // 既に初期化済み
       }
       
       if ('speechSynthesis' in window) {
         speechSynthesis = window.speechSynthesis;
         
         // AudioContextの初期化
         try {
           audioContext = new (window.AudioContext || window.webkitAudioContext)();
         } catch (error) {
           console.warn('AudioContext initialization failed:', error);
         }
         
         window.speechSynthesisInitialized = true;
         console.log('Global speech synthesis initialized');
       } else {
         console.error('Speech synthesis not supported');
       }
     }

     // 全アバターで音声合成を確実に初期化
     initSpeechSynthesisForAll() {
       // グローバル初期化を先に実行
       VRMAvatar.initGlobalSpeechSynthesis();
       
       // 音声リストを強制的に読み込み（遅延実行）
       setTimeout(() => {
         this.loadVoicesWithRetry();
       }, 100);
       
       // 音声リストが更新された際の処理も設定
       if (speechSynthesis && !window.voicesChangeListenerSet) {
         speechSynthesis.onvoiceschanged = () => {
           this.loadVoicesWithRetry();
         };
         window.voicesChangeListenerSet = true;
       }
     }

     initSpeechSynthesis() {
       if ('speechSynthesis' in window) {
         speechSynthesis = window.speechSynthesis;
         
         // AudioContextの初期化
         audioContext = new (window.AudioContext || window.webkitAudioContext)();
         
         // 音声リストを取得してセレクトボックスに追加
         this.loadVoices();
         
         // 音声リストが更新された際の処理
         speechSynthesis.onvoiceschanged = () => {
           this.loadVoices();
         };
         
         console.log('Speech synthesis initialized for first avatar');
       } else {
         console.error('Speech synthesis not supported');
       }
     }

     /* 音声リスト読込 ------------------------------------------------- */
     // リトライ機能付き音声リスト読込
     loadVoicesWithRetry(retryCount = 0) {
       const maxRetries = 5;
       
       if (!speechSynthesis) {
         if (retryCount < maxRetries) {
           console.log(`[Voice] Speech synthesis not ready, retrying... (${retryCount + 1}/${maxRetries})`);
           setTimeout(() => this.loadVoicesWithRetry(retryCount + 1), 200);
         } else {
           console.error('[Voice] Failed to initialize speech synthesis after multiple retries');
         }
         return;
       }
       
       const voices = speechSynthesis.getVoices();
       if (voices.length === 0 && retryCount < maxRetries) {
         console.log(`[Voice] No voices available yet, retrying... (${retryCount + 1}/${maxRetries})`);
         setTimeout(() => this.loadVoicesWithRetry(retryCount + 1), 200);
         return;
       }
       
       console.log(`[Voice] Found ${voices.length} voices, proceeding with voice setup`);
       this.loadVoices();
     }

     loadVoices() {
       availableVoices = speechSynthesis.getVoices();
       
       if (availableVoices.length > 0) {
         // 英語の音声のみフィルタリング
         const englishVoices = availableVoices.filter(voice => 
           voice.lang.startsWith('en-')
         );
         
         // 利用可能な音声を詳細にログ出力
         console.log('Available English voices:', englishVoices.map(voice => ({
           name: voice.name,
           lang: voice.lang,
           gender: voice.name.toLowerCase()
         })));

         // 女性と男性の音声を見つける（より詳細な検索）
         globalFemaleVoice = englishVoices.find(voice => {
           const name = voice.name.toLowerCase();
           return name.includes('female') || 
                  name.includes('woman') ||
                  name.includes('samantha') ||
                  name.includes('zira') ||
                  name.includes('susan') ||
                  name.includes('karen') ||
                  name.includes('hazel') ||
                  name.includes('tessa') ||
                  name.includes('moira') ||
                  name.includes('allison') ||
                  name.includes('ava') ||
                  name.includes('serena') ||
                  name.includes('joanna');
         });

         globalMaleVoice = englishVoices.find(voice => {
           const name = voice.name.toLowerCase();
           return name.includes('male') || 
                  name.includes('man') ||
                  name.includes('david') ||
                  name.includes('mark') ||
                  name.includes('alex') ||
                  name.includes('tom') ||
                  name.includes('daniel') ||
                  name.includes('fred') ||
                  name.includes('ralph') ||
                  name.includes('jorge') ||
                  name.includes('aaron') ||
                  name.includes('albert') ||
                  name.includes('bad news') ||
                  name.includes('bahh') ||
                  name.includes('bells') ||
                  name.includes('boing') ||
                  name.includes('bubbles') ||
                  name.includes('cellos') ||
                  name.includes('deranged') ||
                  name.includes('good news') ||
                  name.includes('hysterical') ||
                  name.includes('pipe organ') ||
                  name.includes('trinoids') ||
                  name.includes('whisper') ||
                  name.includes('matthew');
         });

         // フォールバック: 最初の音声を性別で分ける
         if (!globalFemaleVoice && !globalMaleVoice && englishVoices.length >= 2) {
           globalFemaleVoice = englishVoices[0];
           globalMaleVoice = englishVoices[1];
         } else if (!globalMaleVoice && englishVoices.length > 0) {
           // 男性音声が見つからない場合、異なる音声を探す
           globalMaleVoice = englishVoices.find(voice => voice !== globalFemaleVoice) || englishVoices[0];
         }

         // デフォルトで女性の声を選択
         selectedVoice = globalFemaleVoice || englishVoices[0];
         
         console.log('=== Voice Selection Results ===');
         console.log('Female voice:', globalFemaleVoice?.name || 'NOT FOUND');
         console.log('Male voice:', globalMaleVoice?.name || 'NOT FOUND');
         console.log('Default selected voice:', selectedVoice?.name);
         console.log('================================');
       }
     }

     /* 音声選択変更 ------------------------------------------------- */
     changeVoiceGender(gender) {
       if (gender === 'female' && globalFemaleVoice) {
         selectedVoice = globalFemaleVoice;
       } else if (gender === 'male' && globalMaleVoice) {
         selectedVoice = globalMaleVoice;
       }
       console.log('Selected voice:', selectedVoice?.name);
     }

     /* 音声利用可能性確認 ------------------------------------------- */
     ensureVoicesLoaded() {
       if (!speechSynthesis) {
         console.log('[Voice] Speech synthesis not initialized yet, waiting...');
         setTimeout(() => this.ensureVoicesLoaded(), 500);
         return;
       }
       
       if (!globalMaleVoice || !globalFemaleVoice) {
         console.log('[Voice] Voices not loaded yet, attempting to load...');
         this.loadVoices();
         
         // 音声リストが更新された際の処理も再設定
         speechSynthesis.onvoiceschanged = () => {
           this.loadVoices();
         };
       }
     }

     /* 音声読み上げ開始 ----------------------------------------------- */
     async speak(text) {
       if (!this.vrm?.expressionManager) return;

       // 既存の音声を停止
       this.stopSpeech();
       
       // Amazon Pollyを試行、失敗時はブラウザ音声合成にフォールバック
       const pollySuccess = await this.tryPollySpeak(text);
       if (!pollySuccess) {
         this.useBrowserSpeak(text);
       }
     }

     /* Amazon Polly音声合成試行 ------------------------------------ */
     async tryPollySpeak(text) {
       try {
         const response = await fetch('/api/synthesize', {
           method: 'POST',
           headers: {
             'Content-Type': 'application/json'
           },
           body: JSON.stringify({
             text: text,
             gender: this.config?.gender || 'female'
           })
         });
         
         const data = await response.json();
         
         if (data.success && data.usePolly && data.audioData) {
           console.log(`[Polly] Using Amazon Polly with voice: ${data.voiceId}`);
           
           // Base64音声データをAudioオブジェクトで再生
           const audioBlob = this.base64ToBlob(data.audioData, data.contentType);
           const audioUrl = URL.createObjectURL(audioBlob);
           const audio = new Audio(audioUrl);
           
           // 音声開始時
           audio.onplay = () => {
             console.log('Polly speech started - setting isSpeaking to true');
             this.isSpeaking = true;
             this.startLipSync();
             
             // アクティブエージェントの場合は発話インジケーターを表示
             if (this.config && this.config.type === 'active' && typeof window.showActiveAgentSpeaking === 'function') {
               window.showActiveAgentSpeaking();
             }
           };
           
           // 音声終了時
           audio.onended = () => {
             console.log('Polly speech ended - setting isSpeaking to false');
             this.isSpeaking = false;
             this.stopLipSync();
             
             // アクティブエージェントの場合は発話インジケーターを非表示
             if (this.config && this.config.type === 'active' && typeof window.hideActiveAgentSpeaking === 'function') {
               window.hideActiveAgentSpeaking();
             }
             
             // 音声活動を更新して沈黙検知タイマーをリセット
             if (typeof window.updateSpeechActivity === 'function') {
               window.updateSpeechActivity();
               console.log('Speech activity updated after Polly speech ended');
             }
             
             // URLオブジェクトをクリーンアップ
             URL.revokeObjectURL(audioUrl);
           };
           
           // エラー処理
           audio.onerror = () => {
             console.error('Polly audio playback error');
             this.isSpeaking = false;
             this.stopLipSync();
             
             // アクティブエージェントの場合は発話インジケーターを非表示
             if (this.config && this.config.type === 'active' && typeof window.hideActiveAgentSpeaking === 'function') {
               window.hideActiveAgentSpeaking();
             }
             
             URL.revokeObjectURL(audioUrl);
           };
           
           // 現在の音声オブジェクトを保存（停止用）
           this.currentAudio = audio;
           
           // 音声再生開始
           audio.play();
           
           return true; // Polly成功
         }
       } catch (error) {
         console.log('[Polly] Failed, falling back to browser synthesis:', error.message);
       }
       
       return false; // Polly失敗、フォールバック必要
     }

     /* ブラウザ音声合成 ----------------------------------------------- */
     useBrowserSpeak(text) {
       if (!speechSynthesis) return;
       
       setTimeout(() => {
         const utterance = new SpeechSynthesisUtterance(text);
         
         // アバターの性別に応じて音声を自動選択
         let voiceToUse = selectedVoice;
         console.log(`[Voice Selection] Avatar: ${this.config?.name}, Gender: ${this.config?.gender}`);
         console.log(`[Voice Selection] Available - Male: ${globalMaleVoice?.name || 'NONE'}, Female: ${globalFemaleVoice?.name || 'NONE'}`);
         
         if (this.config && this.config.gender) {
           if (this.config.gender === 'male') {
             if (globalMaleVoice) {
               voiceToUse = globalMaleVoice;
               console.log(`✓ Using male voice for ${this.config.name}: ${globalMaleVoice.name}`);
             } else {
               console.warn(`✗ Male voice requested for ${this.config.name} but no male voice available!`);
             }
           } else if (this.config.gender === 'female') {
             if (globalFemaleVoice) {
               voiceToUse = globalFemaleVoice;
               console.log(`✓ Using female voice for ${this.config.name}: ${globalFemaleVoice.name}`);
             } else {
               console.warn(`✗ Female voice requested for ${this.config.name} but no female voice available!`);
             }
           }
         } else {
           console.log(`[Voice Selection] No gender config found for avatar, using default`);
         }
         
         // 選択された音声を設定
         if (voiceToUse) {
           utterance.voice = voiceToUse;
         }
         
         // 英語の音声に設定
         utterance.lang = 'en-US';
         utterance.rate = 0.9;
         utterance.pitch = 1.0;
         utterance.volume = 1.0;

         // 音声開始時
         utterance.onstart = () => {
           console.log('Speech started - setting isSpeaking to true');
           this.isSpeaking = true;
           console.log('Current isSpeaking state:', this.isSpeaking);
           this.startLipSync();
           
           // アクティブエージェントの場合は発話インジケーターを表示
           if (this.config && this.config.type === 'active' && typeof window.showActiveAgentSpeaking === 'function') {
             window.showActiveAgentSpeaking();
           }
         };

         // 音声終了時
         utterance.onend = () => {
           console.log('Speech ended - setting isSpeaking to false');
           this.isSpeaking = false;
           console.log('Current isSpeaking state:', this.isSpeaking);
           this.stopLipSync();
           
           // アクティブエージェントの場合は発話インジケーターを非表示
           if (this.config && this.config.type === 'active' && typeof window.hideActiveAgentSpeaking === 'function') {
             window.hideActiveAgentSpeaking();
           }
           
           // 音声活動を更新して沈黙検知タイマーをリセット
           if (typeof window.updateSpeechActivity === 'function') {
             window.updateSpeechActivity();
             console.log('Speech activity updated after agent speech ended');
           }
         };

         // エラー時
         utterance.onerror = (event) => {
           console.error('Speech synthesis error:', event);
           this.isSpeaking = false;
           console.log('Error - setting isSpeaking to false:', this.isSpeaking);
           this.stopLipSync();
           
           // アクティブエージェントの場合は発話インジケーターを非表示
           if (this.config && this.config.type === 'active' && typeof window.hideActiveAgentSpeaking === 'function') {
             window.hideActiveAgentSpeaking();
           }
           
           // エラー時も音声活動を更新して沈黙検知タイマーをリセット
           if (typeof window.updateSpeechActivity === 'function') {
             window.updateSpeechActivity();
             console.log('Speech activity updated after agent speech error');
           }
         };

         speechSynthesis.speak(utterance);
       }, 100);
     }

     /* Base64をBlobに変換するヘルパー関数 ---------------------------- */
     base64ToBlob(base64Data, contentType) {
       const byteCharacters = atob(base64Data);
       const byteNumbers = new Array(byteCharacters.length);
       for (let i = 0; i < byteCharacters.length; i++) {
         byteNumbers[i] = byteCharacters.charCodeAt(i);
       }
       const byteArray = new Uint8Array(byteNumbers);
       return new Blob([byteArray], { type: contentType });
     }

     /* リップシンク開始 ----------------------------------------------- */
     startLipSync() {
       if (!this.vrm?.expressionManager) return;

       console.log('Starting lip sync animation');
       
       // 既存のインターバルをクリア
       if (this.lipSyncInterval) {
         clearInterval(this.lipSyncInterval);
       }

       // 簡単なリップシンクアニメーション
       this.lipSyncInterval = setInterval(() => {
         if (!this.isSpeaking || !this.vrm?.expressionManager) {
           clearInterval(this.lipSyncInterval);
           this.lipSyncInterval = null;
           this.stopLipSync();
           return;
         }

         try {
           if (this.vrm.expressionManager) {
             // より強い口の動き
             const openness = Math.random() * 0.8 + 0.2; // 0.2-1.0の範囲で常に少し開いている状態
             
             // 使用可能な口の形をすべて試す
             const allShapes = ['aa', 'ih', 'ou', 'ee', 'oh', 'a', 'i', 'u', 'e', 'o', 'A', 'I', 'U', 'E', 'O'];
             const availableShapes = [];
             
             // 利用可能な表情を確認
             allShapes.forEach(shape => {
               try {
                 const currentValue = this.vrm.expressionManager.getValue(shape);
                 if (currentValue !== undefined) {
                   availableShapes.push(shape);
                 }
               } catch (e) {
                 // 利用できない表情は無視
               }
             });
             
             if (availableShapes.length > 0) {
               const randomShape = availableShapes[Math.floor(Math.random() * availableShapes.length)];
               
               // 即座にリセット（トランジション無効化のため）
               availableShapes.forEach(shape => {
                 this.vrm.expressionManager.setValue(shape, 0);
               });
               
               // 即座に更新してリセットを反映
               this.vrm.expressionManager.update();
               
               // 新しい表情を設定
               this.vrm.expressionManager.setValue(randomShape, openness);
               
               // 複数回更新してトランジションを強制
               for (let i = 0; i < 5; i++) {
                 this.vrm.expressionManager.update();
               }
               
               // VRM全体も更新
               this.vrm.update(1/60);
               
               console.log(`Lip sync: ${randomShape} set to ${openness.toFixed(2)} (available shapes: ${availableShapes.length})`);
             } else {
               console.warn('No available lip sync shapes found for this VRM model');
             }
           }
           
         } catch (error) {
           console.error('Lip sync error:', error);
         }
         
       }, 100); // 100msごとに更新
     }

     /* リップシンク停止 ----------------------------------------------- */
     stopLipSync() {
       if (!this.vrm?.expressionManager) return;

       console.log('Stopping lip sync animation');
       
       // インターバルをクリア
       if (this.lipSyncInterval) {
         clearInterval(this.lipSyncInterval);
         this.lipSyncInterval = null;
       }

       // すべての口の形をリセット
       const allShapes = ['aa', 'ih', 'ou', 'ee', 'oh', 'a', 'i', 'u', 'e', 'o', 'A', 'I', 'U', 'E', 'O'];
       allShapes.forEach(shape => {
         try {
           this.vrm.expressionManager.setValue(shape, 0);
         } catch (e) {
           // 利用できない表情は無視
         }
       });
       this.vrm.expressionManager.update();
     }

     /* 音声停止 --------------------------------------------------- */
     stopSpeech() {
       // ブラウザ音声合成を停止
       if (speechSynthesis) {
         speechSynthesis.cancel();
       }
       
       // Polly音声を停止
       if (this.currentAudio) {
         this.currentAudio.pause();
         this.currentAudio.currentTime = 0;
         this.currentAudio = null;
       }
       
       console.log('Manually stopping speech - setting isSpeaking to false');
       this.isSpeaking = false;
       console.log('Current isSpeaking state after manual stop:', this.isSpeaking);
       this.stopLipSync();
       
       // アクティブエージェントの場合は発話インジケーターを非表示
       if (this.config && this.config.type === 'active' && typeof window.hideActiveAgentSpeaking === 'function') {
         window.hideActiveAgentSpeaking();
       }
       
       // 手動停止時も音声活動を更新して沈黙検知タイマーをリセット
       if (typeof window.updateSpeechActivity === 'function') {
         window.updateSpeechActivity();
         console.log('Speech activity updated after manual speech stop');
       }
       
       console.log('Speech stopped');
     }

     /* テスト用表情設定 --------------------------------------------- */
     testExpression(expressionName, value = 1.0) {
       if (!this.vrm?.expressionManager) {
         console.log('ExpressionManager not available');
         return;
       }

       console.log(`Testing expression: ${expressionName} with value ${value}`);
       
       // テスト中フラグを設定
       this.testingExpression = true;
       
       // 5秒後にテストフラグをリセット
       setTimeout(() => {
         this.testingExpression = false;
         console.log('Test expression flag reset');
       }, 5000);

       try {
         // 全ての表情をリセット（数字インデックスと名前の両方）
         if (this.vrm.expressionManager.expressions) {
           const allExpressionKeys = Object.keys(this.vrm.expressionManager.expressions);
           console.log('Resetting all expressions:', allExpressionKeys);
           
           allExpressionKeys.forEach(key => {
             try {
               this.vrm.expressionManager.setValue(key, 0);
             } catch (e) {
               console.log(`Could not reset expression: ${key}`);
             }
           });
           
           // 名前でもリセット
           const namedShapes = ['aa', 'ih', 'ou', 'ee', 'oh', 'a', 'i', 'u', 'e', 'o'];
           namedShapes.forEach(shape => {
             try {
               this.vrm.expressionManager.setValue(shape, 0);
             } catch (e) {
               // Ignore
             }
           });
         }

         // 表情を設定
         if (expressionName && expressionName !== 'reset') {
           console.log(`Setting expression "${expressionName}" to ${value}`);
           
           // 複数の方法で表情を設定してみる
           const methods = [];
           
           // 方法1: 直接名前で設定
           try {
             this.vrm.expressionManager.setValue(expressionName, value);
             methods.push('direct name');
           } catch (e) {
             console.log(`Direct name method failed: ${e.message}`);
           }
           
           // 方法2: プリセットで設定
           try {
             if (this.vrm.expressionManager.expressions[expressionName]) {
               this.vrm.expressionManager.setValue(expressionName, value);
               methods.push('preset');
             }
           } catch (e) {
             console.log(`Preset method failed: ${e.message}`);
           }
           
           // 方法3: 数字インデックスで設定（"aa"なら0など）
           const expressionMap = {
             'aa': '0', 'ih': '1', 'ou': '2', 'ee': '3', 'oh': '4'
           };
           
           if (expressionMap[expressionName]) {
             try {
               this.vrm.expressionManager.setValue(expressionMap[expressionName], value);
               methods.push('numeric index');
             } catch (e) {
               console.log(`Numeric index method failed: ${e.message}`);
             }
           }
           
           console.log(`Used methods: ${methods.join(', ')}`);
         }

         // 強制的に複数回更新
         for (let i = 0; i < 5; i++) {
           this.vrm.expressionManager.update();
         }
         
         // VRM全体も更新
         this.vrm.update(1/60);
         
         // 追加で強制レンダリング
         this.renderer.render(this.scene, this.camera);
         
         // さらに数フレーム強制的に更新
         for (let i = 0; i < 10; i++) {
           this.vrm.update(1/60);
           this.vrm.expressionManager.update();
           this.renderer.render(this.scene, this.camera);
         }

         // 設定後の値を確認（複数の方法で）
         if (expressionName && expressionName !== 'reset') {
           // 名前での確認
           try {
             const currentValue = this.vrm.expressionManager.getValue(expressionName);
             console.log(`Expression ${expressionName} final value (by name): ${currentValue}`);
           } catch (e) {
             console.log(`Could not get value for expression by name: ${expressionName}`);
           }
           
           // 数字インデックスでの確認
           const expressionMap = {
             'aa': '0', 'ih': '1', 'ou': '2', 'ee': '3', 'oh': '4'
           };
           
           if (expressionMap[expressionName]) {
             try {
               const currentValue = this.vrm.expressionManager.getValue(expressionMap[expressionName]);
               console.log(`Expression ${expressionName} final value (by index ${expressionMap[expressionName]}): ${currentValue}`);
             } catch (e) {
               console.log(`Could not get value for expression by index: ${expressionMap[expressionName]}`);
             }
           }
         }

         // 現在アクティブな全ての表情を表示（数字インデックスと名前の両方）
         if (this.vrm.expressionManager.expressions) {
           const allKeys = Object.keys(this.vrm.expressionManager.expressions);
           const activeExpressions = [];
           
           allKeys.forEach(key => {
             try {
               const val = this.vrm.expressionManager.getValue(key);
               if (val > 0.001) {
                 activeExpressions.push(`${key}: ${val.toFixed(3)}`);
               }
             } catch (e) {
               // Ignore
             }
           });
           
           // 名前付き表情もチェック
           const namedShapes = ['aa', 'ih', 'ou', 'ee', 'oh', 'a', 'i', 'u', 'e', 'o'];
           namedShapes.forEach(shape => {
             try {
               const val = this.vrm.expressionManager.getValue(shape);
               if (val > 0.001) {
                 activeExpressions.push(`${shape}: ${val.toFixed(3)}`);
               }
             } catch (e) {
               // Ignore
             }
           });
           
           if (activeExpressions.length > 0) {
             console.log('Currently active expressions:', activeExpressions);
           } else {
             console.log('No active expressions found');
           }
         }

       } catch (error) {
         console.error('Test expression error:', error);
       }
     }

     /* トランスフォームを強制適用（VRM updateの後に実行） ----------- */
     forceApplyTransform() {
       if (!this.config || !this.container) return;

       // 設定された位置・回転を強制的に適用
       if (this.config.position) {
         this.container.position.copy(this.config.position);
       }

       if (this.config.orientation) {
         this.container.rotation.x = this.config.orientation.x || 0;
         this.container.rotation.y = this.config.orientation.y || 0;
         this.container.rotation.z = this.config.orientation.z || 0;
       }

       // マトリックスを強制更新
       this.container.updateMatrix();
       this.container.updateMatrixWorld(true);
     }

     /* 包括的トランスフォーム更新 ----------------------------------- */
     updateTransform(transform) {
       if (!this.vrm || !this.config) {
         console.log('VRM or config not available for transform update');
         return;
       }

       // Position更新
       if (transform.position) {
         this.config.position = this.config.position || new THREE.Vector3();
         if (transform.position.x !== undefined) this.config.position.x = transform.position.x;
         if (transform.position.y !== undefined) this.config.position.y = transform.position.y;
         if (transform.position.z !== undefined) this.config.position.z = transform.position.z;
         
         // 基準位置も更新
         if (this.basePosition) {
           this.basePosition.copy(this.config.position);
         }
         
         // コンテナの位置を更新
         this.container.position.copy(this.config.position);
       }

       // Rotation更新
       if (transform.rotation) {
         this.config.orientation = this.config.orientation || {};
         if (transform.rotation.x !== undefined) {
           this.config.orientation.x = (transform.rotation.x * Math.PI) / 180;
           this.container.rotation.x = this.config.orientation.x;
           if (this.baseRotation) this.baseRotation.x = this.config.orientation.x;
         }
         if (transform.rotation.y !== undefined) {
           this.config.orientation.y = (transform.rotation.y * Math.PI) / 180;
           this.container.rotation.y = this.config.orientation.y;
           if (this.baseRotation) this.baseRotation.y = this.config.orientation.y;
         }
         if (transform.rotation.z !== undefined) {
           this.config.orientation.z = (transform.rotation.z * Math.PI) / 180;
           this.container.rotation.z = this.config.orientation.z;
           if (this.baseRotation) this.baseRotation.z = this.config.orientation.z;
         }
         
         this.container.updateMatrix();
         this.container.updateMatrixWorld(true);
       }

       console.log(`[Live Transform] Updated ${this.config.name}:`, transform);
     }

     /* 現在のトランスフォーム値を取得 ------------------------------- */
     getCurrentTransform() {
       if (!this.container || !this.config) return null;
       
       return {
         position: {
           x: parseFloat((this.container.position?.x || 0).toFixed(1)),
           y: parseFloat((this.container.position?.y || 0).toFixed(1)),
           z: parseFloat((this.container.position?.z || 0).toFixed(1))
         },
         rotation: {
           x: Math.round(((this.container.rotation?.x || 0) * 180) / Math.PI),
           y: Math.round(((this.container.rotation?.y || 0) * 180) / Math.PI),
           z: Math.round(((this.container.rotation?.z || 0) * 180) / Math.PI)
         }
       };
     }

     /* アニメーション制御 ------------------------------------------- */
     setAnimationState(state) {
       console.log(`[Animation] Setting ${this.config?.name} to ${state} state`);
       console.log(`[Animation Debug] Previous state: ${this.animationState}, isSpeaking: ${this.isSpeaking}, manualSpeakingAnimation: ${this.manualSpeakingAnimation}`);
       
       this.animationState = state;
       
       if (state === 'speaking') {
         this.resumeVRMComponents(); // アニメーション再開
         this.startSpeakingAnimation();
       } else if (state === 'idle') {
         this.resumeVRMComponents(); // アニメーション再開
         this.stopSpeakingAnimation();
       } else if (state === 'stop') {
         this.stopAllAnimations();
       }
       
       console.log(`[Animation Debug] New state: ${this.animationState}, manualSpeakingAnimation: ${this.manualSpeakingAnimation}`);
     }

     /* VRMコンポーネント再開 ---------------------------------------- */
     resumeVRMComponents() {
       if (this.vrm) {
         // AnimationMixerを再開
         if (this.mixer) {
           this.mixer.timeScale = 1.0;
           console.log(`[RESUME] AnimationMixer timeScale set to 1 for ${this.config?.name}`);
         }
       }
     }

     /* 全アニメーション停止 ----------------------------------------- */
     stopAllAnimations() {
       console.log(`[STOP] ${this.config?.name} - すべてのアニメーションを停止`);
       
       // 全ての状態フラグをリセット
       this.animationState = 'stop';
       this.manualSpeakingAnimation = false;
       this.isSpeaking = false;
       this.testingExpression = false;
       this.idleAnimationActive = false;
       
       // AnimationMixerを完全停止
       if (this.mixer) {
         this.mixer.timeScale = 0;
         // 全てのアクションを停止
         this.mixer.stopAllAction();
         console.log(`[STOP] AnimationMixer timeScale set to 0 for ${this.config?.name}`);
       }
       
       // 全てのインターバルをクリア
       if (this.speakingAnimationInterval) {
         clearInterval(this.speakingAnimationInterval);
         this.speakingAnimationInterval = null;
       }
       
       if (this.lipSyncInterval) {
         clearInterval(this.lipSyncInterval);
         this.lipSyncInterval = null;
       }
       
       // 音声合成も停止
       if (speechSynthesis) {
         speechSynthesis.cancel();
       }
       
       // 表情を完全にリセット（瞬きも含む）
       if (this.vrm?.expressionManager) {
         const allShapes = ['aa', 'ih', 'ou', 'ee', 'oh', 'blinkLeft', 'blinkRight'];
         allShapes.forEach(shape => {
           this.vrm.expressionManager.setValue(shape, 0);
         });
         this.vrm.expressionManager.update();
       }
       
       // 基本位置・回転に戻す
       if (this.config) {
         this.container.position.copy(this.config.position);
         if (this.config.orientation) {
           this.container.rotation.x = this.config.orientation.x || 0;
           this.container.rotation.y = this.config.orientation.y || 0;
           this.container.rotation.z = this.config.orientation.z || 0;
         }
         this.container.updateMatrix();
         this.container.updateMatrixWorld(true);
       }
       
       console.log(`[STOP] ${this.config?.name} - 停止完了`);
     }

     startSpeakingAnimation() {
       if (!this.vrm?.expressionManager) return;
       
       this.manualSpeakingAnimation = true;
       
       // 既存のインターバルをクリア
       if (this.speakingAnimationInterval) {
         clearInterval(this.speakingAnimationInterval);
       }
       
       // 発話アニメーションを開始
       this.speakingAnimationInterval = setInterval(() => {
         if (!this.manualSpeakingAnimation) return;
         
         try {
           // ランダムな口の形
           const shapes = ['aa', 'ih', 'ou', 'ee', 'oh'];
           const randomShape = shapes[Math.floor(Math.random() * shapes.length)];
           const openness = 0.3 + Math.random() * 0.7; // 0.3-1.0の範囲
           
           // 全ての口の形をリセット
           shapes.forEach(shape => {
             this.vrm.expressionManager.setValue(shape, 0);
           });
           
           // 選択された形を設定
           this.vrm.expressionManager.setValue(randomShape, openness);
           this.vrm.expressionManager.update();
           
           console.log(`[Speaking Animation] ${this.config?.name}: ${randomShape} = ${openness.toFixed(2)}`);
           
         } catch (error) {
           console.error('Speaking animation error:', error);
         }
       }, 150); // 150msごとに口の形を変更
       
       console.log(`[Speaking Animation] Started for ${this.config?.name}`);
     }

     stopSpeakingAnimation() {
       this.manualSpeakingAnimation = false;
       
       if (this.speakingAnimationInterval) {
         clearInterval(this.speakingAnimationInterval);
         this.speakingAnimationInterval = null;
       }
       
       // 口の形をリセット
       if (this.vrm?.expressionManager) {
         const shapes = ['aa', 'ih', 'ou', 'ee', 'oh'];
         shapes.forEach(shape => {
           this.vrm.expressionManager.setValue(shape, 0);
         });
         this.vrm.expressionManager.update();
       }
       
       console.log(`[Speaking Animation] Stopped for ${this.config?.name}`);
     }

     /* 強制アニメーション制御（デバッグ用） ------------------------- */
     forceStop() {
       console.log(`[FORCE STOP] ${this.config?.name} - 強制停止`);
       
       // 全フラグをリセット
       this.animationState = 'stop';
       this.manualSpeakingAnimation = false;
       this.isSpeaking = false;
       this.testingExpression = false;
       this.idleAnimationActive = false;
       
       // 全インターバルクリア
       if (this.speakingAnimationInterval) {
         clearInterval(this.speakingAnimationInterval);
         this.speakingAnimationInterval = null;
       }
       if (this.lipSyncInterval) {
         clearInterval(this.lipSyncInterval);
         this.lipSyncInterval = null;
       }
       
       // 音声停止
       if (speechSynthesis) {
         speechSynthesis.cancel();
       }
       
       // 基本位置に固定
       if (this.config) {
         this.container.position.copy(this.config.position);
         if (this.config.orientation) {
           this.container.rotation.x = this.config.orientation.x || 0;
           this.container.rotation.y = this.config.orientation.y || 0;
           this.container.rotation.z = this.config.orientation.z || 0;
         }
         this.container.updateMatrix();
         this.container.updateMatrixWorld(true);
       }
       
       // 表情リセット
       if (this.vrm?.expressionManager) {
         const shapes = ['aa', 'ih', 'ou', 'ee', 'oh', 'blinkLeft', 'blinkRight'];
         shapes.forEach(shape => {
           this.vrm.expressionManager.setValue(shape, 0);
         });
         this.vrm.expressionManager.update();
       }
       
       console.log(`[FORCE STOP] ${this.config?.name} - 完了`);
     }

     forceIdle() {
       console.log(`[FORCE IDLE] ${this.config?.name} - アイドリング開始`);
       this.animationState = 'idle';
       this.manualSpeakingAnimation = false;
       this.isSpeaking = false;
       this.testingExpression = false;
       console.log(`[FORCE IDLE] ${this.config?.name} - 完了`);
     }

     /* 旧互換性関数 ------------------------------------------------- */
     updateRotation(yRotationDegrees) {
       this.updateTransform({ rotation: { y: yRotationDegrees } });
     }

     getCurrentRotationDegrees() {
       const transform = this.getCurrentTransform();
       return transform ? transform.rotation.y : 0;
     }
   }
   
   /* === 起動コード ============================================== */
   const avatars = [];
   const TARGET_FPS = 30;
   const FRAME_INTERVAL = 1000 / TARGET_FPS;
   let lastFrameTime = 0;

   function animate(now) {
     requestAnimationFrame(animate);
     if (document.hidden) return;
     if (now - lastFrameTime < FRAME_INTERVAL) return;
     lastFrameTime = now;
     const dt = avatars[0]?.clock.getDelta() || 1/TARGET_FPS;
     avatars.forEach(a => a.update(dt));
   }
   
   document.addEventListener('DOMContentLoaded', () => {
     console.log('[Avatar Config] Initializing avatars with configurations:', AVATAR_CONFIG);
    
    // 各アバターを設定に基づいて初期化
    AVATAR_CONFIG.forEach((config, index) => {
      const canvasId = `vrm-canvas-${index + 1}`;
      console.log(`[Avatar ${index}] Creating ${config.name} (${config.gender}, ${config.type}) with model: ${config.modelPath}`);
      
      const avatar = new VRMAvatar(canvasId, config.modelPath, config.position);
      avatar.config = config; // 設定情報を保存
      avatars.push(avatar);
    });
     
     // グローバルアクセス用にwindowオブジェクトに追加
     window.avatars = avatars;
     window.AVATAR_CONFIG = AVATAR_CONFIG;
     window.switchAvatarConfiguration = switchAvatarConfiguration;
     window.AVATAR_CONFIGURATIONS = AVATAR_CONFIGURATIONS;
     console.log('Avatars made globally available with configurations:', window.avatars);
     
     animate();

     // 音声合成のボタンイベント設定
     const speakButton = document.getElementById('speak-button');
     const stopSpeechButton = document.getElementById('stop-speech-button');
     const speechText = document.getElementById('speech-text');
     const voiceSelect = document.getElementById('voice-select');

     // 音声選択イベント
     if (voiceSelect) {
      voiceSelect.addEventListener('change', (e) => {
       if (avatars[0]) {
         avatars[0].changeVoiceGender(e.target.value);
       }
     });
    }

     if (speakButton) {
       speakButton.addEventListener('click', () => {
       const text = speechText.value.trim();
       if (text && avatars[0]) {
         speakButton.disabled = true;
         stopSpeechButton.disabled = false;
         avatars[0].speak(text);
         
         // 手動スピーチも会話履歴に追加
         if (typeof addToConversationHistory === 'function') {
           addToConversationHistory('Manual Speech', text, 'manual');
         }
         
         // 音声終了後にボタンを再有効化
         setTimeout(() => {
           speakButton.disabled = false;
           stopSpeechButton.disabled = true;
         }, text.length * 100); // 概算の読み上げ時間
       }
     });
     }

     if (stopSpeechButton) {
       stopSpeechButton.addEventListener('click', () => {
       if (avatars[0]) {
         avatars[0].stopSpeech();
         speakButton.disabled = false;
         stopSpeechButton.disabled = true;
       }
     });
     }

     // テスト用表情ボタンは削除されました
   });
   window.addEventListener('resize', () => avatars.forEach(a => a.resize()));

   // トランスフォームコントロールのイベントハンドラー
   const avatarSelect = document.getElementById('avatar-select');
   
   // Position sliders
   const posXSlider = document.getElementById('pos-x-slider');
   const posYSlider = document.getElementById('pos-y-slider');
   const posZSlider = document.getElementById('pos-z-slider');
   const posXValue = document.getElementById('pos-x-value');
   const posYValue = document.getElementById('pos-y-value');
   const posZValue = document.getElementById('pos-z-value');
   
   // Rotation sliders
   const rotXSlider = document.getElementById('rot-x-slider');
   const rotYSlider = document.getElementById('rot-y-slider');
   const rotZSlider = document.getElementById('rot-z-slider');
   const rotXValue = document.getElementById('rot-x-value');
   const rotYValue = document.getElementById('rot-y-value');
   const rotZValue = document.getElementById('rot-z-value');

   if (avatarSelect && posXSlider && rotXSlider) {
     // 選択されたアバターのトランスフォームを更新
     function updateSelectedAvatar() {
       const selectedIndex = parseInt(avatarSelect.value);
       if (!avatars[selectedIndex]) return;

       const transform = {
         position: {
           x: parseFloat(posXSlider.value),
           y: parseFloat(posYSlider.value),
           z: parseFloat(posZSlider.value)
         },
         rotation: {
           x: parseInt(rotXSlider.value),
           y: parseInt(rotYSlider.value),
           z: parseInt(rotZSlider.value)
         }
       };

       avatars[selectedIndex].updateTransform(transform);
       
       // UIの値表示を更新
       posXValue.textContent = transform.position.x.toFixed(1);
       posYValue.textContent = transform.position.y.toFixed(1);
       posZValue.textContent = transform.position.z.toFixed(1);
       rotXValue.textContent = `${transform.rotation.x}°`;
       rotYValue.textContent = `${transform.rotation.y}°`;
       rotZValue.textContent = `${transform.rotation.z}°`;
     }

     // UIをアバターの現在値に同期
     function syncUIToAvatar() {
       const selectedIndex = parseInt(avatarSelect.value);
       if (!avatars[selectedIndex]) return;

       const transform = avatars[selectedIndex].getCurrentTransform();
       if (!transform) return;

       // Position
       posXSlider.value = transform.position.x;
       posYSlider.value = transform.position.y;
       posZSlider.value = transform.position.z;
       posXValue.textContent = transform.position.x.toFixed(1);
       posYValue.textContent = transform.position.y.toFixed(1);
       posZValue.textContent = transform.position.z.toFixed(1);

       // Rotation
       rotXSlider.value = transform.rotation.x;
       rotYSlider.value = transform.rotation.y;
       rotZSlider.value = transform.rotation.z;
       rotXValue.textContent = `${transform.rotation.x}°`;
       rotYValue.textContent = `${transform.rotation.y}°`;
       rotZValue.textContent = `${transform.rotation.z}°`;
     }

     // スライダーイベント
     [posXSlider, posYSlider, posZSlider, rotXSlider, rotYSlider, rotZSlider].forEach(slider => {
       slider.addEventListener('input', updateSelectedAvatar);
     });

     // アバター選択変更時
     if (avatarSelect) {
      avatarSelect.addEventListener('change', syncUIToAvatar);
    }

     // プリセットボタン
     document.getElementById('reset-transform')?.addEventListener('click', () => {
       posXSlider.value = 0; posYSlider.value = -0.5; posZSlider.value = 0.5;
       rotXSlider.value = 0; rotYSlider.value = 0; rotZSlider.value = 0;
       updateSelectedAvatar();
     });

     document.getElementById('preset-front')?.addEventListener('click', () => {
       rotXSlider.value = 0; rotYSlider.value = 0; rotZSlider.value = 0;
       updateSelectedAvatar();
     });

     document.getElementById('preset-back')?.addEventListener('click', () => {
       rotXSlider.value = 0; rotYSlider.value = 180; rotZSlider.value = 0;
       updateSelectedAvatar();
     });

     document.getElementById('preset-left')?.addEventListener('click', () => {
       rotXSlider.value = 0; rotYSlider.value = 90; rotZSlider.value = 0;
       updateSelectedAvatar();
     });

     document.getElementById('preset-right')?.addEventListener('click', () => {
       rotXSlider.value = 0; rotYSlider.value = 270; rotZSlider.value = 0;
       updateSelectedAvatar();
     });

     // 初期化
     setTimeout(syncUIToAvatar, 1000);
   }

   // アニメーション制御ボタンのイベントハンドラー
   function setupAnimationControls() {
     // アバター1のボタン
     document.getElementById('avatar1-stop')?.addEventListener('click', () => {
       setAvatarAnimation(0, 'stop');
       updateAnimationButtons(1, 'stop');
     });

     document.getElementById('avatar1-idle')?.addEventListener('click', () => {
       setAvatarAnimation(0, 'idle');
       updateAnimationButtons(1, 'idle');
     });

     document.getElementById('avatar1-speak')?.addEventListener('click', () => {
       setAvatarAnimation(0, 'speaking');
       updateAnimationButtons(1, 'speaking');
     });

     // アバター2のボタン
     document.getElementById('avatar2-stop')?.addEventListener('click', () => {
       setAvatarAnimation(1, 'stop');
       updateAnimationButtons(2, 'stop');
     });

     document.getElementById('avatar2-idle')?.addEventListener('click', () => {
       setAvatarAnimation(1, 'idle');
       updateAnimationButtons(2, 'idle');
     });

     document.getElementById('avatar2-speak')?.addEventListener('click', () => {
       setAvatarAnimation(1, 'speaking');
       updateAnimationButtons(2, 'speaking');
     });

     // アバター3のボタン
     document.getElementById('avatar3-stop')?.addEventListener('click', () => {
       setAvatarAnimation(2, 'stop');
       updateAnimationButtons(3, 'stop');
     });

     document.getElementById('avatar3-idle')?.addEventListener('click', () => {
       setAvatarAnimation(2, 'idle');
       updateAnimationButtons(3, 'idle');
     });

     document.getElementById('avatar3-speak')?.addEventListener('click', () => {
       setAvatarAnimation(2, 'speaking');
       updateAnimationButtons(3, 'speaking');
     });
   }

   function setAvatarAnimation(avatarIndex, state) {
     if (avatars[avatarIndex]) {
       avatars[avatarIndex].setAnimationState(state);
       console.log(`[UI] Set Avatar ${avatarIndex + 1} to ${state} state`);
     }
   }

   function updateAnimationButtons(avatarNumber, state) {
     const stopBtn = document.getElementById(`avatar${avatarNumber}-stop`);
     const idleBtn = document.getElementById(`avatar${avatarNumber}-idle`);
     const speakBtn = document.getElementById(`avatar${avatarNumber}-speak`);

     if (stopBtn && idleBtn && speakBtn) {
       stopBtn.classList.toggle('active', state === 'stop');
       idleBtn.classList.toggle('active', state === 'idle');
       speakBtn.classList.toggle('active', state === 'speaking');
     }
   }

   // アニメーション制御を初期化
   setTimeout(setupAnimationControls, 1000);
   
/* === グローバル変数の設定 ====================================== */
// 実験条件をグローバルで参照できるように設定
window.experimentCondition = currentConfigKey;
window.avatarConfig = AVATAR_CONFIG;
window.parseExperimentConditionFromURL = parseExperimentConditionFromURL;

/* === 実験条件表示機能 ======================================== */
function displayExperimentCondition() {
  console.log(`<i data-lucide="target" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> [Experiment] Condition: ${currentConfigKey.toUpperCase()}`);

  // 条件の説明
  const conditionDescriptions = {
    'fam': 'Female Active + Male Silent + Male Silent',
    'mam': 'Male Active + Male Silent + Male Silent',
    'faf': 'Female Active + Female Silent + Male Silent',
    'maf': 'Male Active + Female Silent + Male Silent',
    'nan': 'Neutral Active + Neutral Silent + Male Silent (using female avatars)'
  };

  const description = conditionDescriptions[currentConfigKey] || 'Unknown condition';
  console.log(`<i data-lucide="clipboard" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> [Experiment] Description: ${description}`);

  // HTMLに条件を表示（要素が存在する場合）
  const conditionElement = document.getElementById('experiment-condition');
  if (conditionElement) {
    conditionElement.textContent = `${currentConfigKey.toUpperCase()}: ${description}`;
    conditionElement.style.backgroundColor = '#e8f4fd';
    conditionElement.style.padding = '10px';
    conditionElement.style.margin = '10px 0';
    conditionElement.style.borderRadius = '5px';
    conditionElement.style.border = '1px solid #0066cc';
    console.log(`<i data-lucide="check-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> [Experiment] Condition displayed in HTML element`);
  } else {
    console.log(`ℹ [Experiment] No HTML element found for condition display`);
  }

  return {
    condition: currentConfigKey,
    description: description,
    agents: AVATAR_CONFIG.map(config => ({
      name: config.name,
      gender: config.gender,
      type: config.type
    }))
  };
}

// 実験条件の表示を実行
window.displayExperimentCondition = displayExperimentCondition;
window.experimentInfo = displayExperimentCondition();

// Export VRMAvatar class for compatibility with avatar-renderer.js
window.VRMAvatar = VRMAvatar;

console.log(`<i data-lucide="rocket" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> [Avatar System] Initialized with condition: ${currentConfigKey.toUpperCase()}`);

