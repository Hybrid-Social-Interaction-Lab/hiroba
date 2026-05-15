/* ----------------------------------------------------------
   Simple FBX Avatar for Conference System
   ---------------------------------------------------------- */
   // Use global Three.js objects loaded from CDN
   const THREE = window.THREE;

   // FBX優先モード
   const USE_FBX_AVATARS = true;

   const DEFAULT_MODEL_DISPLAY_NAMES = {
     '/models/female.fbx': ['Mary'],
     '/models/man_new_idle2.fbx': ['Peter'],
     '/models/male.fbx': ['Mark'],
     '/models/neutral.fbx': ['Alex']
   };

   let modelDisplayNames = { ...DEFAULT_MODEL_DISPLAY_NAMES };

   // Pick a random preset at module load; overridden by saved settings if present
   const _BG_PRESETS_EARLY = Array.from({ length: 6 }, (_, i) =>
     `avatar_backgrounds/avatar_background_${i + 1}.jpg`
   );
   let _globalAvatarBackground = _BG_PRESETS_EARLY[Math.floor(Math.random() * _BG_PRESETS_EARLY.length)];


   async function loadDisplayNamesFromBackendSettings() {
     try {
       const response = await fetch('/api/settings', { method: 'GET' });
       if (!response.ok) return;
       const settings = await response.json();

       const map = settings && settings.avatarDisplayNames;
      if (map && typeof map === 'object') {
        const normalized = {};
        Object.entries(map).forEach(([modelPath, value]) => {
          if (typeof value === 'string' && value.trim()) {
            normalized[modelPath] = [value.trim()];
            return;
          }

          if (Array.isArray(value)) {
            const aliases = value
              .filter((item) => typeof item === 'string')
              .map((item) => item.trim())
              .filter((item, index, arr) => item && arr.findIndex((x) => x.toLowerCase() === item.toLowerCase()) === index);
            if (aliases.length > 0) {
              normalized[modelPath] = aliases;
            }
          }
        });

        modelDisplayNames = { ...DEFAULT_MODEL_DISPLAY_NAMES, ...normalized };
       }
     } catch (e) {
       // Ignore network/settings failures and keep defaults.
     }
   }

   function getDisplayNameForModelPath(modelPath) {
     if (typeof modelPath !== 'string') return '';
     const normalized = modelPath.trim();
     const aliases = modelDisplayNames[normalized];
     if (typeof aliases === 'string') {
       return aliases;
     }
     if (Array.isArray(aliases) && aliases.length > 0) {
      return aliases.join(', ');
     }
     return '';
   }

   const FBX_MODEL_PATHS = {
     'male': '/models/man_nodding_1.fbx',
     'male1': '/models/man_new_idle2.fbx',  // 男性アバター1（ノディングアニメーション）
     'male2': '/models/man_nodding_1.fbx',  // 男性アバター2（ノディングアニメーション）
     'male_original': '/models/male.fbx',   // オリジナル男性アバター
     'female': '/models/female.fbx',
     'neutral': '/models/neutral.fbx'
   };

   // モデルタイプ別の初期設定
   const MODEL_SETTINGS = {
     'female': {
       scale: 0.01,
       defaultY: -0.1,
       defaultZ: 2.3
     },
     'neutral': {
       scale: 0.01,
       defaultY: -0.1,
       defaultZ: 2.0
     },
     'male': {
       scale: 0.05,
       defaultY: -4.7,
       defaultZ: -0.7
     },
     'male_original': {
       scale: 0.76,
       defaultY: 0.15,
       defaultZ: 2.4
     }
   };

   // Wait for loaders to be available from global scope
   function waitForGlobalLoaders(timeoutMs = 5000) {
     return new Promise((resolve) => {
       const deadline = Date.now() + timeoutMs;
       function checkLoaders() {
         if (window.FBXLoader && window.GLTFLoader) {
           console.log('[FBX Conference] Global loaders detected');
           resolve(true);
         } else if (Date.now() >= deadline) {
           console.warn('[FBX Conference] Loaders not available after timeout, continuing without them');
           resolve(false);
         } else {
           setTimeout(checkLoaders, 100);
         }
       }
       checkLoaders();
     });
   }

   console.log('[FBX Conference] Simple FBX Avatar system loaded');

   // Populated at runtime by setConditionAppearance() from admin-defined conditions
   let AVATAR_CONFIG = [];

   // アバター配列
   let avatars = [];

   /* === FBXアバタークラス ========================================= */
   class FBXAvatar {
     constructor(canvasId, config, spawnPos) {
       console.log(`[FBX Avatar] Creating FBX avatar: ${config.name}`);

       this.canvasId = canvasId;
       this.config = config;
       this.spawnPos = spawnPos || new THREE.Vector3(0, 0, 0);

       // Canvas setup
       this.canvas = document.getElementById(canvasId);
       if (!this.canvas) {
         console.error(`[FBX Avatar] Canvas not found: ${canvasId}`);
         return;
       }

       this.displayNameEl = null;
       this.attachDisplayName();

       // Compression overlay: 2D canvas layered over the WebGL canvas to simulate
       // JPEG call-quality degradation. Blitting compressed frames here because you
       // can't mix WebGL and 2D contexts on the same canvas element.
       this._compressionCanvas = document.createElement('canvas');
       this._compressionCanvas.style.position = 'absolute';
       this._compressionCanvas.style.top = '0';
       this._compressionCanvas.style.left = '0';
       this._compressionCanvas.style.width = '100%';
       this._compressionCanvas.style.height = '100%';
       this._compressionCanvas.style.pointerEvents = 'none';
       this._compressionCtx = this._compressionCanvas.getContext('2d');
       this._compressionFrame = 0;
       // Recompress every N animation frames — lower = more artifacts/flicker
       this._compressionInterval = 2;
       // JPEG quality 0–1. 0.18 gives heavy blocking/banding like a low-bitrate video call.
       this._compressionQuality = 0.18;
       this._compressionImg = new Image();
       {
         const p = this.canvas.parentElement;
         if (p) {
           if (getComputedStyle(p).position === 'static') p.style.position = 'relative';
           p.appendChild(this._compressionCanvas);
         }
       }

       // Three.js setup
       this.scene = new THREE.Scene();

       // Fix aspect ratio based on actual canvas dimensions
       const aspect = this.canvas.clientWidth / this.canvas.clientHeight;
       this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
       this.renderer = new THREE.WebGLRenderer({
         canvas: this.canvas,
         antialias: false,
         preserveDrawingBuffer: true
       });

       this.renderer.setSize(this.canvas.clientWidth, this.canvas.clientHeight);
       this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
       this.renderer.setClearColor(0x1a1a2e);
       this.renderer.shadowMap.enabled = false;

       // レンダリング設定
       this.renderer.sortObjects = false; // Z-fightingを防ぐ
       console.log(`[Renderer] Setup for ${canvasId}`);

       // Background plane with painted office/room gradient texture
       this._buildBackgroundPlane();

       // Container for avatar
       this.container = new THREE.Object3D();
       this.scene.add(this.container);

       // State
       this.fbxModel = null;
       this.mixer = null;
       this.clock = new THREE.Clock();
       this.animationState = 'idle';
       this.isSpeaking = false;

       // Lip sync state
       this.isLipSyncActive = false;
       this.lipSyncTime = 0;
       this.jawBone = null;
       this.mouthMorphMesh = null;
       this.mouthMorphIndex = null;

       // Initialize
       this.setupCamera();
       this.setupLighting();
       this.loadModel();
     }

     attachDisplayName() {
       const displayName = this.config?.name || getDisplayNameForModelPath(this.config?.modelPath) || this.config?.displayName;
       if (!displayName) return;

       const parent = this.canvas && this.canvas.parentElement;
       if (!parent) return;

       parent.style.position = parent.style.position || 'relative';

       const el = document.createElement('div');
       el.className = 'avatar-display-name';
       el.id = `avatar-display-name-${this.canvasId}`;
       el.textContent = displayName;

       // Avoid duplicates if re-initialized.
       const existing = document.getElementById(el.id);
       if (existing) {
         existing.textContent = displayName;
         this.displayNameEl = existing;
         return;
       }

       parent.appendChild(el);
       this.displayNameEl = el;
     }

     setupCamera() {
       this.camera.position.set(0, 1, 3);
       this.camera.lookAt(0, 1, 0);
     }

     setupLighting() {
       // まずシーン内の既存ライトをチェック
       const existingLights = [];
       this.scene.traverse((obj) => {
         if (obj.isLight) {
           existingLights.push({ type: obj.type, intensity: obj.intensity });
         }
       });
       console.log(`[Lighting] Existing lights in scene before setup:`, existingLights);

       // ライト参照を保存してUI制御可能にする
       this.ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
       this.directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);

       // ディレクショナルライトの位置設定
       this.directionalLight.position.set(0, 1, 5);

       this.scene.add(this.ambientLight);
       this.scene.add(this.directionalLight);

       console.log(`[Lighting] Setup for ${this.config.name} - Ambient: ${this.ambientLight.intensity}, Directional: ${this.directionalLight.intensity}`);

       // セットアップ後のライト数を確認
       const allLights = [];
       this.scene.traverse((obj) => {
         if (obj.isLight) {
           allLights.push({ type: obj.type, intensity: obj.intensity, position: obj.position });
         }
       });
       console.log(`[Lighting] Total lights in scene after setup:`, allLights);
     }

     loadModel() {
       if (USE_FBX_AVATARS) {
         this.loadFBXModel();
       } else {
         this.loadVRMModel();
       }
     }

     async loadFBXModel() {
       // Wait for global loaders to be available
       await waitForGlobalLoaders();

       const FBXLoader = window.FBXLoader;
       if (!FBXLoader) {
         console.error('[FBX] FBXLoader not available, falling back to VRM');
         this.loadVRMModel();
         return;
       }

       const loader = new FBXLoader();
       console.log(`[FBX] Loading FBX for ${this.config.name}: ${this.config.modelPath}`);

       loader.load(
         this.config.modelPath,
         (fbx) => {
           console.log(`[FBX] Loaded successfully: ${this.config.name}`);
           this.fbxModel = fbx;

           // Apply scale
           const scale = this.config.scale || 0.57;
           fbx.scale.set(scale, scale, scale);
           console.log(`[FBX] Applied scale: ${scale}`);

           // Apply position
           if (this.config.position) {
             fbx.position.copy(this.config.position);
             console.log(`[FBX] Applied position:`, this.config.position);
           }

           // Add to container
           this.container.add(fbx);
           console.log(`[FBX] Added to scene. Container children:`, this.container.children.length);

           // Setup animation
           if (fbx.animations && fbx.animations.length > 0) {
             this.mixer = new THREE.AnimationMixer(fbx);
             const action = this.mixer.clipAction(fbx.animations[0]);
             action.setLoop(THREE.LoopRepeat, Infinity);
             action.play();
             console.log(`[FBX] Animation started: ${fbx.animations[0].name}`);

            // Check if animation has morph target tracks that may interfere with lip sync
            if (fbx.animations[0].tracks) {
              let morphTrackCount = 0;
              fbx.animations[0].tracks.forEach((track) => {
                if (track.name.includes('morphTarget') || track.name.includes('viseme')) {
                  morphTrackCount++;
                  console.log(`  [Animation Track] ${track.name}`);
                }
              });
              if (morphTrackCount > 0) {
                console.warn(`[Animation WARNING] Animation contains ${morphTrackCount} morph target tracks that may interfere with lip sync!`);
              } else {
                console.log(`[Animation] No morph target tracks found in animation - lip sync should work`);
              }
            }
           }

           // FBX traverseでメッシュ、ライト、マテリアルを確認
           const fbxLights = [];
          const lightsToRemove = [];  // 削除対象のライトをリストに貯める
           let meshCount = 0;
           let eyeMeshCount = 0;

           fbx.traverse((child) => {
             // FBXに埋め込まれたライトをチェック
             if (child.isLight) {
               fbxLights.push({ type: child.type, intensity: child.intensity, position: child.position });
               console.warn(`[FBX Light] Found embedded light in FBX: ${child.type}`, child);
               // 埋め込まれたライトを削除
               lightsToRemove.push(child);  // 削除対象としてリストに追加
             }

             if (child.isMesh) {
               meshCount++;
               console.log(`[FBX Mesh ${meshCount}] ${child.name}`);

               // 全てのメッシュに両面レンダリングを設定
               if (child.material) {
                 const materials = Array.isArray(child.material) ? child.material : [child.material];

                 materials.forEach((mat, matIndex) => {
                   // 両面レンダリング
                   mat.side = THREE.DoubleSide;

                   // 眼球メッシュの場合の特別な処理
                   if (child.name === 'EyeLeft' || child.name === 'EyeRight') {
                     eyeMeshCount++;
                     console.log(`[Eye Material ${eyeMeshCount}] Processing ${child.name}`);

                     // 眼球を明るく表示するための設定
                     if (mat.color) {
                       mat.color.setHex(0xffffff);
                     }

                     // メタルネスとラフネスを調整
                     if (mat.metalness !== undefined) mat.metalness = 0.0;
                     if (mat.roughness !== undefined) mat.roughness = 0.5;

                     // エミッシブを設定
                     if (mat.emissive) {
                       mat.emissive.setHex(0x222222);
                       mat.emissiveIntensity = 0.3;
                     }
                   }

                   mat.needsUpdate = true;
                 });
               }

               // メッシュを可視化
               child.visible = true;
               child.frustumCulled = false; // フラスタムカリングを無効化
             }
           });

           console.log(`[FBX] Total meshes: ${meshCount}, Eye meshes: ${eyeMeshCount}`);

           if (fbxLights.length > 0) {
             console.warn(`[FBX Light] Removed ${fbxLights.length} embedded lights from FBX:`, fbxLights);
           }

          // traverse完了後に、リストに貯めたライトを安全に削除
          lightsToRemove.forEach(light => {
            if (light.parent) {
              light.parent.remove(light);
              console.log(`[FBX Light] Safely removed light after traverse: ${light.type}`);
            }
          });

           // Lip sync setup - search for jaw bone or morph targets
           const jawBoneNames = ['jaw', 'Jaw', 'JAW', 'mandible', 'Mandible', 'chin', 'Chin', 'lower', 'Lower'];

           fbx.traverse((child) => {
             // Try to find jaw bone
             if (!this.jawBone && child.isBone) {
               for (const jawName of jawBoneNames) {
                 if (child.name.toLowerCase().includes(jawName.toLowerCase())) {
                   this.jawBone = child;
                   console.log(`[Lip Sync] Jaw bone found: ${child.name}`);
                   break;
                 }
               }
             }
           });

           // If no jaw bone found, check for morph targets as fallback
           if (!this.jawBone) {
             console.warn(`[Lip Sync] No jaw bone found - checking for morph targets...`);

             // ReadyPlayerMe uses viseme_ prefix for morph targets
             // Priority order: viseme_aa (best for mouth opening), then other mouth shapes
             const mouthMorphNames = [
               'viseme_aa',  // ReadyPlayerMe - "ah" sound (mouth wide open)
               'viseme_O',   // ReadyPlayerMe - "oh" sound
               'viseme_E',   // ReadyPlayerMe - "eh" sound
               'viseme_I',   // ReadyPlayerMe - "ee" sound
               'mouthOpen',  // Generic
               'jawOpen',    // Generic
               'mouth',      // Generic fallback
               'jaw'         // Generic fallback
             ];

             fbx.traverse((child) => {
               if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
                 console.log(`[Morph] Mesh "${child.name}" has morph targets:`, Object.keys(child.morphTargetDictionary));

                 // Try to find mouth-related morph targets in priority order

                // IMPORTANT: Skip eye meshes - they shouldn't be used for mouth animation!
                if (child.name.toLowerCase().includes('eye')) {
                  console.log(`[Morph] Skipping eye mesh: ${child.name}`);
                  return;
                }
                 for (const morphName of mouthMorphNames) {
                   for (const [key, index] of Object.entries(child.morphTargetDictionary)) {
                     if (key.toLowerCase() === morphName.toLowerCase()) {
                       this.mouthMorphMesh = child;
                       this.mouthMorphIndex = index;
                       console.log(`[Lip Sync] Found mouth morph target: "${key}" at index ${index} in mesh "${child.name}"`);
                       break;
                     }
                   }
                   if (this.mouthMorphMesh) break;
                 }
               }
             });

             if (this.mouthMorphMesh && this.mouthMorphIndex !== null) {
               console.log(`[Lip Sync] Morph target method will be used for lip sync`);
             } else {
               console.warn(`[Lip Sync] No jaw bone or mouth morph targets found - lip sync disabled`);
             }
           } else {
             console.log(`[Lip Sync] Jaw bone method will be used for lip sync`);
           }

           console.log(`[FBX] Setup complete: ${this.config.name}`);
         },
         (progress) => {
           const percent = (progress.loaded / progress.total) * 100;
           console.log(`[FBX] Loading ${this.config.name}: ${percent.toFixed(0)}%`);
         },
         (error) => {
           console.error(`[FBX] Error loading ${this.config.name}:`, error);
           console.error(`[FBX] Model path was: ${this.config.modelPath}`);
           console.error(`[FBX] Error details:`, {
             message: error.message,
             stack: error.stack
           });
           // Fallback to VRM
           this.loadVRMModel();
         }
       );
     }

     async loadVRMModel() {
       console.log(`[VRM] Fallback loading for ${this.config.name}`);

       const GLTFLoader = window.GLTFLoader;
       const VRMLoaderPlugin = window.VRM?.VRMLoaderPlugin;

       if (!GLTFLoader || !VRMLoaderPlugin) {
         console.error('[VRM] Required loaders not available');
         return;
       }

       // Basic VRM loading (simplified)
       const loader = new GLTFLoader();
       loader.register((parser) => {
         return new VRMLoaderPlugin(parser);
       });

       loader.load(
         this.config.modelPath,
         (gltf) => {
           const vrm = gltf.userData.vrm;
           if (vrm) {
             this.vrm = vrm;
             this.container.add(vrm.scene);

             // VRMUtils rotation - check if available
             const VRMUtils = window.VRM?.VRMUtils;
             if (VRMUtils && VRMUtils.rotateVRM0) {
               VRMUtils.rotateVRM0(vrm);
             }

             console.log(`[VRM] Loaded successfully: ${this.config.name}`);
           }
         },
         undefined,
         (error) => console.error(`[VRM] Error loading ${this.config.name}:`, error)
       );
     }

     update() {
       const delta = this.clock.getDelta();

       // Update animation mixer
       if (this.mixer) {
         this.mixer.update(delta);
       }

       // Update VRM if exists
       if (this.vrm) {
         this.vrm.update(delta);
       }

       // Lip sync animation
       if (this.isLipSyncActive) {
         this.lipSyncTime += delta;
        // DEBUG: Verify lip sync is active
        if (Math.floor(this.lipSyncTime) !== Math.floor(this.lipSyncTime - delta)) {
          console.log(`[Lip Sync Debug] ${this.config.name} - isLipSyncActive: true, lipSyncTime: ${this.lipSyncTime.toFixed(2)}s`);
        }

         // Method 1: Jaw bone animation (if available)
         if (this.jawBone) {
           // Simple mouth open/close animation using sine wave
           // Frequency: 8Hz (8 times per second - natural speaking speed)
           const jawAngle = Math.sin(this.lipSyncTime * Math.PI * 8) * 0.3; // 0.3 radians max opening
           this.jawBone.rotation.x = Math.max(0, jawAngle); // Only open, don't close beyond neutral
         }
         // Method 2: Morph target animation (fallback if no jaw bone)
         else if (this.mouthMorphMesh && this.mouthMorphIndex !== null) {
           // Convert sin wave from -1~1 range to 0~1 range for morph target influence
           const morphValue = (Math.sin(this.lipSyncTime * Math.PI * 8) + 1) * 0.5;
          // DEBUG: Log morph value calculation
          if (Math.floor(this.lipSyncTime * 2) % 10 === 0 && this.lipSyncTime % 5 < delta) {
            console.log(`[Lip Sync Debug] ${this.config.name} - Morph[${this.mouthMorphIndex}] = ${morphValue.toFixed(3)}, Current: ${this.mouthMorphMesh.morphTargetInfluences[this.mouthMorphIndex].toFixed(3)}`);
          }
           this.mouthMorphMesh.morphTargetInfluences[this.mouthMorphIndex] = morphValue;
         }
       } else {
         // Reset to neutral position when not speaking
         if (this.jawBone) {
           this.jawBone.rotation.x = 0;
         }
         if (this.mouthMorphMesh && this.mouthMorphIndex !== null) {
           this.mouthMorphMesh.morphTargetInfluences[this.mouthMorphIndex] = 0;
         }
       }

       // Render
       this.renderer.render(this.scene, this.camera);
       this._applyCompressionOverlay();
     }

     _buildBackgroundPlane() {
       // Camera sits at z=3 looking at z=0. Place bg at z=-5 (8 units from camera).
       const bgZ = -5;
       const camZ = 3;
       const distFromCam = camZ - bgZ;
       const fovRad = 45 * Math.PI / 180;
       const h = 2 * Math.tan(fovRad / 2) * distFromCam * 1.05;
       const aspect = this.canvas.clientWidth / this.canvas.clientHeight || 1;

       const mat = new THREE.MeshBasicMaterial({ depthWrite: false });
       const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), mat);
       bgMesh.position.set(0, 1, bgZ);
       bgMesh.renderOrder = -1;
       this.scene.add(bgMesh);
       this._bgMesh = bgMesh;

       const url = _globalAvatarBackground;
       this._loadBackgroundTexture(url);
     }

     _loadBackgroundTexture(url) {
       if (!this._bgMesh) return;
       new THREE.TextureLoader().load(
         url,
         (tex) => {
           if (this._bgMesh.material.map) this._bgMesh.material.map.dispose();
           this._bgMesh.material.map = tex;
           this._bgMesh.material.needsUpdate = true;
         },
         undefined,
         () => console.warn(`[Avatar BG] Failed to load background: ${url}`)
       );
     }

     setBackground(url) {
       _globalAvatarBackground = url;
       this._loadBackgroundTexture(url);
     }

     _applyCompressionOverlay() {
       this._compressionFrame++;
       if (this._compressionFrame % this._compressionInterval !== 0) return;

       const src = this.canvas;
       const oc = this._compressionCanvas;
       if (!oc || !this._compressionCtx) return;

       // Resize overlay canvas to match WebGL output if needed
       if (oc.width !== src.width || oc.height !== src.height) {
         oc.width = src.width;
         oc.height = src.height;
       }

       // Round-trip through JPEG to get compression artifacts
       const dataUrl = src.toDataURL('image/jpeg', this._compressionQuality);
       const img = this._compressionImg;
       img.onload = () => {
         this._compressionCtx.drawImage(img, 0, 0, oc.width, oc.height);
       };
       img.src = dataUrl;
     }

     // Speech synthesis methods with Polly support
     async speak(text) {
       console.log(`[Speech] ${this.config.name}: ${text}`);
       this.isSpeaking = true;

       // Show speaking indicator (yellow border)
       this.showSpeakingIndicator();

       // Try Amazon Polly first (better quality)
       const pollySuccess = await this.tryPollySpeak(text);

       // Fall back to browser speech synthesis if Polly fails
       if (!pollySuccess && 'speechSynthesis' in window) {
         console.log(`[Speech] Falling back to browser speech synthesis`);
         const utterance = new SpeechSynthesisUtterance(text);
         // Pick a gender-appropriate English voice
         const gender = this.config?.gender || 'female';
         const voicePrefs = {
           female:  ['Samantha', 'Karen', 'Moira', 'Tessa', 'Fiona', 'Victoria', 'Allison', 'Ava'],
           male:    ['Daniel', 'Alex', 'Fred', 'Tom', 'Oliver', 'Rishi', 'Aaron', 'Gordon'],
           neutral: ['Samantha', 'Karen', 'Daniel', 'Alex']
         };
         const enVoices = speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
         const prefs = voicePrefs[gender] || voicePrefs.female;
         const picked = prefs.reduce((found, pref) =>
           found || enVoices.find(v => v.name.toLowerCase().includes(pref.toLowerCase())), null)
           || enVoices[0];
         if (picked) utterance.voice = picked;
         if (gender === 'male') { utterance.pitch = 0.75; utterance.rate = 0.95; }
         else if (gender === 'neutral') { utterance.pitch = 1.1; }
         else { utterance.pitch = 1.2; }

         utterance.onstart = () => {
           // Start lip sync animation
           this.isLipSyncActive = true;
           this.lipSyncTime = 0;
           console.log('[Lip Sync] Animation started (Browser speech)');
         };

         utterance.onend = () => {
           this.isSpeaking = false;
           this.hideSpeakingIndicator();

           // Stop lip sync animation
           this.isLipSyncActive = false;
           console.log('[Lip Sync] Animation stopped (Browser speech)');
         };

         utterance.onerror = () => {
           // Stop lip sync on error
           this.isLipSyncActive = false;
         };

         speechSynthesis.speak(utterance);
       }
     }

     /* Speaking indicator methods ----------------------------------- */
     showSpeakingIndicator() {
       if (this.canvas) {
         this.canvas.classList.add('speaking');
         console.log(`[Speaking Indicator] Added to ${this.canvasId}`);
       }
     }

     hideSpeakingIndicator() {
       if (this.canvas) {
         this.canvas.classList.remove('speaking');
         console.log(`[Speaking Indicator] Removed from ${this.canvasId}`);
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

         // Check if server-side synthesis (Polly or SpeechGen) is available
         if (!data.success || (!data.usePolly && !data.useSpeechGen)) {
           console.log(`[Speech] Server synthesis not available, will use browser synthesis`);
           return false;
         }

         if (!data.audioData) {
           console.warn(`[Speech] No audio data received`);
           return false;
         }

         // Convert base64 to audio and play
         const audioBlob = this.base64ToBlob(data.audioData, 'audio/mpeg');
         const audioUrl = URL.createObjectURL(audioBlob);
         const audio = new Audio(audioUrl);

         audio.onplay = () => {
           // Start lip sync animation
           this.isLipSyncActive = true;
           this.lipSyncTime = 0;
           console.log('[Lip Sync] Animation started');
         };

         audio.onended = () => {
           this.isSpeaking = false;
           this.hideSpeakingIndicator();
           URL.revokeObjectURL(audioUrl);

           // Stop lip sync animation
           this.isLipSyncActive = false;
           console.log('[Lip Sync] Animation stopped');
         };

         audio.onerror = (error) => {
           console.error(`[Polly] Audio playback error:`, error);
           this.isSpeaking = false;
           this.hideSpeakingIndicator();
           URL.revokeObjectURL(audioUrl);

           // Stop lip sync on error
           this.isLipSyncActive = false;
         };

         await audio.play();
         console.log(`[Polly] Speaking with voice for gender: ${this.config?.gender || 'female'}`);
         return true;

       } catch (error) {
         console.error(`[Polly] Error:`, error);
         return false;
       }
     }

     /* Base64をBlobに変換 ------------------------------------------- */
     base64ToBlob(base64, mimeType) {
       const byteCharacters = atob(base64);
       const byteNumbers = new Array(byteCharacters.length);
       for (let i = 0; i < byteCharacters.length; i++) {
         byteNumbers[i] = byteCharacters.charCodeAt(i);
       }
       const byteArray = new Uint8Array(byteNumbers);
       return new Blob([byteArray], { type: mimeType });
     }

     setAnimation(enabled) {
       this.animationState = enabled ? 'idle' : 'stop';
       if (this.mixer) {
         this.mixer.timeScale = enabled ? 1.0 : 0;
       }
     }

     // Lighting control methods - 直接ライト参照を使用
     updateAmbientLight(intensity, color) {
       if (this.ambientLight) {
         if (intensity !== undefined) {
           this.ambientLight.intensity = intensity;
           console.log(`[${this.config.name}] Ambient intensity: ${intensity}`);
         }
         if (color !== undefined) {
           this.ambientLight.color.setHex(color);
           console.log(`[${this.config.name}] Ambient color: ${color.toString(16)}`);
         }
       }
     }

     updateDirectionalLight(intensity, color, position) {
       if (this.directionalLight) {
         if (intensity !== undefined) {
           this.directionalLight.intensity = intensity;
           console.log(`[${this.config.name}] Directional intensity: ${intensity}`);
         }
         if (color !== undefined) {
           this.directionalLight.color.setHex(color);
           console.log(`[${this.config.name}] Directional color: ${color.toString(16)}`);
         }
         if (position !== undefined) {
           this.directionalLight.position.copy(position);
           console.log(`[${this.config.name}] Directional position:`, position);
         }
       }
     }

     updateBackgroundColor(color) {
       if (this.renderer) {
         this.renderer.setClearColor(color);
       }
     }

     dispose() {
       console.log(`[Dispose] Cleaning up ${this.config.name}`);
       if (this.displayNameEl && this.displayNameEl.parentElement) {
         this.displayNameEl.parentElement.removeChild(this.displayNameEl);
       }
       if (this._compressionCanvas && this._compressionCanvas.parentElement) {
         this._compressionCanvas.parentElement.removeChild(this._compressionCanvas);
       }
       if (this._bgMesh) {
         this._bgMesh.material.map.dispose();
         this._bgMesh.material.dispose();
         this._bgMesh.geometry.dispose();
         this.scene.remove(this._bgMesh);
       }
       if (this.fbxModel) {
         this.container.remove(this.fbxModel);
       }
       if (this.vrm) {
         const VRMUtils = window.VRM?.VRMUtils;
         if (VRMUtils && VRMUtils.deepDispose) {
           VRMUtils.deepDispose(this.vrm.scene);
         } else {
           this.container.remove(this.vrm.scene);
         }
       }
       this.scene.clear();
     }
   }

   /* === Avatar Management ======================================== */
   let avatarsInitialized = false;

   async function initializeAvatars() {
     // Skip if already initialized
     if (avatarsInitialized) {
       console.log('[FBX Conference] Avatars already initialized, skipping');
       return;
     }

     console.log('[FBX Conference] Initializing avatars...');

     // Wait for global loaders
     await waitForGlobalLoaders();

     // Wait until canvas1 has non-zero dimensions (layout needs a tick after DOM insertion)
     await new Promise(resolve => {
       const deadline = Date.now() + 5000;
       function check() {
         const c = document.getElementById('vrm-canvas-1');
         if ((c && c.clientWidth > 0 && c.clientHeight > 0) || Date.now() >= deadline) { resolve(); return; }
         requestAnimationFrame(check);
       }
       check();
     });

     // Clear existing avatars
     avatars.forEach(avatar => avatar.dispose());
     avatars.length = 0;

     // Create new avatars
     AVATAR_CONFIG.forEach((config, index) => {
       const canvasId = `vrm-canvas-${index + 1}`;
       const canvas = document.getElementById(canvasId);

       if (canvas && canvas.clientWidth > 0) {
         const avatar = new FBXAvatar(canvasId, config);
         avatars.push(avatar);
         console.log(`[FBX Conference] Created avatar ${index + 1}: ${config.name}`);
       } else {
         console.warn(`[FBX Conference] Canvas not ready: ${canvasId}`, {
           found: !!canvas,
           width: canvas?.clientWidth,
           height: canvas?.clientHeight
         });
       }
     });

     avatarsInitialized = true;
     console.log(`[FBX Conference] ${avatars.length} avatars initialized`);
   }

   function updateAvatars() {
     avatars.forEach(avatar => avatar.update());
   }

   function startAvatarLoop() {
     const TARGET_FPS = 20; // make it look like a real zoom call
     const FRAME_INTERVAL = 1000 / TARGET_FPS;
     let lastFrameTime = 0;

     function animate(now) {
       requestAnimationFrame(animate);
       if (document.hidden) return;
       if (now - lastFrameTime < FRAME_INTERVAL) return;
       lastFrameTime = now;
       updateAvatars();
     }
     animate(0);
   }

   /* === Initialization =========================================== */
   // Run immediately — this script is loaded dynamically after DOMContentLoaded has already fired
   (async () => {
     console.log('[FBX Conference] Initializing...');
     await loadDisplayNamesFromBackendSettings();
     startAvatarLoop();
     console.log('[FBX Conference] Animation loop started');
   })();

   // Export for global access
   const AVATAR_BACKGROUND_PRESETS = Array.from({ length: 6 }, (_, i) =>
     `avatar_backgrounds/avatar_background_${i + 1}.jpg`
   );

   function setAvatarBackground(url) {
     _globalAvatarBackground = url;
     avatars.forEach(a => a.setBackground(url));
   }

   function modelSettingsForPath(modelPath) {
     if (!modelPath) return MODEL_SETTINGS.female;
     const p = modelPath.toLowerCase();
     if (p.includes('female')) return MODEL_SETTINGS.female;
     if (p.includes('neutral')) return MODEL_SETTINGS.neutral;
     if (p.includes('man_new') || p.includes('man_nodding')) return MODEL_SETTINGS.male;
     if (p.includes('male')) return MODEL_SETTINGS.male_original;
     return MODEL_SETTINGS.female;
   }

   function preloadModels(modelPaths) {
     if (!window.FBXLoader) return;
     modelPaths.forEach(path => {
       if (!path) return;
       const loader = new window.FBXLoader();
       loader.load(path, () => {}, () => {}, () => {});
     });
   }

   function setConditionAppearance(condition) {
     if (!condition) return;
     if (condition.background) setAvatarBackground(condition.background);

     // Override AVATAR_CONFIG from condition agents so the right models + names are used
     if (Array.isArray(condition.agents) && condition.agents.length > 0) {
       const newConfig = condition.agents.map((agent, i) => {
         const modelPath = agent.avatarModel || FBX_MODEL_PATHS.female;
         const ms = modelSettingsForPath(modelPath);
         // Resolve gender: explicit config wins, 'auto'/missing falls back to model path inference
         let gender = agent.gender && agent.gender !== 'auto' ? agent.gender : null;
         if (!gender) {
           const mp = modelPath.toLowerCase();
           if (mp.includes('female')) gender = 'female';
           else if (mp.includes('male') || mp.includes('man')) gender = 'male';
           else if (mp.includes('neutral')) gender = 'neutral';
           else gender = 'female';
         }
         return {
           name: agent.name || `Agent ${i + 1}`,
           type: i === 0 ? 'active' : 'silent',
           modelPath,
           gender,
           position: new THREE.Vector3(0, ms.defaultY, ms.defaultZ),
           speechStyle: i === 0 ? 'feminine' : 'none',
           orientation: { y: 0 },
           scale: ms.scale
         };
       });
       // Mutate in place so all existing references to AVATAR_CONFIG stay valid
       AVATAR_CONFIG.length = 0;
       newConfig.forEach(c => AVATAR_CONFIG.push(c));
       console.log(`[FBX Conference] AVATAR_CONFIG overridden from condition "${condition.id}" (${newConfig.length} agents)`);
     }
   }

   async function reinitializeAvatars() {
     avatarsInitialized = false;
     avatars.forEach(avatar => avatar.dispose());
     avatars.length = 0;
     await initializeAvatars();
   }

   window.FBXAvatarSystem = {
     initializeAvatars,
     reinitializeAvatars,
     updateAvatars,
     avatars,
     AVATAR_CONFIG,
     setAvatarBackground,
     setConditionAppearance,
     preloadModels,
     AVATAR_BACKGROUND_PRESETS
   };

   // Also export avatars directly for compatibility with index.js
   window.avatars = avatars;

