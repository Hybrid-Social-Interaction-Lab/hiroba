/* ========== DEBUG LOGGING SYSTEM ==================================== */
let debugMessages = [];
let maxDebugMessages = 1000;

function addDebugMessage(level, category, message, data = null) {
  // Use the new DetailedLogger
  detailedLogger.log(level, category, message, data);
  
  // Maintain legacy compatibility with debugMessages array for existing code
  const timestamp = new Date().toISOString();
  const entry = {
    timestamp,
    level,
    category,
    message,
    data: data ? JSON.stringify(data, null, 2) : null
  };
  
  debugMessages.push(entry);
  
  // Keep only recent messages
  if (debugMessages.length > maxDebugMessages) {
    debugMessages = debugMessages.slice(-maxDebugMessages);
  }
  
  // Send to master if WebSocket available (DetailedLogger handles this too, but keep for compatibility)
  if (syncWebSocket && syncWebSocket.readyState === 1) {
    try {
      syncWebSocket.send(JSON.stringify({
        type: 'DEBUG_LOG',
        level,
        category,
        message,
        data,
        userId: client?.getCurrentUserInfo()?.userId || 'unknown',
        userName: client?.getCurrentUserInfo()?.displayName || 'unknown',
        timestamp
      }));
    } catch (error) {
      console.error('Failed to send debug log to master:', error);
    }
  }
}

function dumpCurrentZoomState() {
  addDebugMessage('INFO', 'ZOOM-STATE', 'Dumping current Zoom SDK state');
  
  const state = {
    // Client state
    clientConnected: !!client,
    streamAvailable: !!stream,
    localVideoTrack: !!window.localVideoTrack,
    
    // Media states
    videoDecode,
    videoEncode,
    audioDecode,
    audioEncode,
    shareDecode,
    shareEncode,
    
    // Participant data
    remoteParticipants: Object.fromEntries(remoteParticipants),
    remoteParticipantsByUserId: Object.fromEntries(remoteParticipantsByUserId),
    activeVideoUsers: Array.from(activeVideoUsers),
    remoteCanvases: Array.from(remoteCanvases.keys()),
    currentDisplayedUser,
    
    // Session data
    sessionId,
    participantCount,
    isAgentMaster,
    isSessionHost,
    currentSessionUsers: Array.from(currentSessionUsers)
  };
  
  // Get user list from Zoom
  if (client) {
    try {
      const allUsers = client.getAllUser();
      const currentUser = client.getCurrentUserInfo();
      state.zoomUsers = allUsers;
      state.currentUser = currentUser;
      addDebugMessage('INFO', 'ZOOM-USERS', `Found ${allUsers.length} users in Zoom session`, {
        users: allUsers.map(u => ({ userId: u.userId, displayName: u.displayName })),
        currentUser: { userId: currentUser.userId, displayName: currentUser.displayName }
      });
    } catch (error) {
      addDebugMessage('ERROR', 'ZOOM-USERS', 'Failed to get user list from Zoom', { error: error.message });
    }
  }
  
  addDebugMessage('DEBUG', 'ZOOM-STATE', 'Complete Zoom state dump', state);
  return state;
}

function dumpCurrentVideoState() {
  addDebugMessage('INFO', 'VIDEO-STATE', 'Dumping current video rendering state');
  
  const videoState = {
    remoteCanvases: {},
    activeVideoUsers: Array.from(activeVideoUsers),
    remoteParticipants: {},
    canvasElements: {}
  };
  
  // Detailed canvas state
  remoteCanvases.forEach((canvasInfo, displayName) => {
    videoState.remoteCanvases[displayName] = {
      isVisible: canvasInfo.isVisible,
      isRendering: canvasInfo.isRendering,
      status: canvasInfo.status,
      canvasId: canvasInfo.canvas?.id,
      canvasExists: !!canvasInfo.canvas,
      containerExists: !!canvasInfo.container
    };
  });
  
  // Detailed participant state
  remoteParticipants.forEach((participant, displayName) => {
    videoState.remoteParticipants[displayName] = {
      userId: participant.userId,
      hasVideo: participant.hasVideo,
      isActive: participant.isActive
    };
  });
  
  // Check actual canvas elements in DOM
  const canvasElements = document.querySelectorAll('.video-canvas.remote-video');
  canvasElements.forEach(canvas => {
    videoState.canvasElements[canvas.id] = {
      id: canvas.id,
      className: canvas.className,
      width: canvas.width,
      height: canvas.height,
      style: canvas.style.cssText,
      parentId: canvas.parentElement?.id
    };
  });
  
  addDebugMessage('DEBUG', 'VIDEO-STATE', 'Complete video state dump', videoState);
  return videoState;
}

function handleDebugCommand(command, data) {
  addDebugMessage('INFO', 'DEBUG-CMD', `Processing debug command: ${command}`);
  
  switch (command) {
    case 'REQUEST_ZOOM_STATE':
      dumpCurrentZoomState();
      break;
      
    case 'REQUEST_VIDEO_STATE':
      dumpCurrentVideoState();
      break;
      
    case 'FORCE_PARTICIPANT_DISCOVERY':
      addDebugMessage('INFO', 'DEBUG-CMD', 'Force participant discovery requested');
      try {
        discoverExistingParticipants();
        addDebugMessage('INFO', 'DEBUG-CMD', 'Participant discovery completed');
      } catch (error) {
        addDebugMessage('ERROR', 'DEBUG-CMD', 'Participant discovery failed', { error: error.message });
      }
      break;
      
    case 'DUMP_ZOOM_STATE':
      dumpCurrentZoomState();
      break;
      
    case 'FORCE_VIDEO_RESTART':
      addDebugMessage('INFO', 'DEBUG-CMD', 'Force video restart requested');
      try {
        forceStartAllParticipantVideos();
        addDebugMessage('INFO', 'DEBUG-CMD', 'Video restart completed');
      } catch (error) {
        addDebugMessage('ERROR', 'DEBUG-CMD', 'Video restart failed', { error: error.message });
      }
      break;
      
    case 'TEST_VIDEO_RENDERING':
      addDebugMessage('INFO', 'DEBUG-CMD', 'Video rendering test requested');
      testAllVideoRendering();
      break;
      
    case 'EXPORT_DETAILED_LOGS':
      addDebugMessage('INFO', 'DEBUG-CMD', 'Detailed log export requested from master');
      window.exportDetailedLogs();
      break;
      
    case 'EXPORT_ANALYSIS_REPORT':
      addDebugMessage('INFO', 'DEBUG-CMD', 'Video analysis report requested from master');
      window.exportAnalysisReport();
      break;
      
    default:
      addDebugMessage('WARN', 'DEBUG-CMD', `Unknown debug command: ${command}`);
  }
}

// <i data-lucide="shield" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Environment Detection and VideoFrame Error Prevention
function detectRenderingEnvironment() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');

  const environment = {
    isCloud: false,
    isAWS: false,
    renderer: 'unknown',
    pixelRatio: window.devicePixelRatio || 1,
    webCodecsSupport: 'VideoFrame' in window,
    webGLSupport: !!gl
  };

  // Enhanced AWS/Cloud detection methods
  const isHTTPS = window.location.protocol === 'https:';
  const isLocalhostOrIP = window.location.hostname === 'localhost' ||
                         window.location.hostname === '127.0.0.1' ||
                         /^\d+\.\d+\.\d+\.\d+$/.test(window.location.hostname);

  // AWS-specific detection
  const awsPatterns = [
    /\.amazonaws\.com/,
    /\.elb\.amazonaws\.com/,
    /elasticbeanstalk/,
    /cloudfront/,
    /\.compute\.amazonaws\.com/
  ];
  const isAWSHostname = awsPatterns.some(pattern => pattern.test(window.location.hostname));

  // Cloud environment indicators
  const isCloudEnvironment = isHTTPS && !isLocalhostOrIP;

  if (gl) {
    try {
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);

        environment.renderer = renderer;
        environment.vendor = vendor;
        environment.isAWS = isAWSHostname || renderer.includes('Tesla') || renderer.includes('Grid') || vendor.includes('Amazon');
        environment.isCloud = isCloudEnvironment || !renderer.includes('GeForce') && !renderer.includes('Radeon') && !renderer.includes('Intel');
      } else {
        // Fallback if WebGL debug info is not available
        environment.isAWS = isAWSHostname;
        environment.isCloud = isCloudEnvironment;
      }
    } catch (error) {
      console.warn('[Environment] Failed to detect GPU details:', error);
      // Fallback detection based on URL patterns
      environment.isAWS = isAWSHostname;
      environment.isCloud = isCloudEnvironment;
    }
  } else {
    // No WebGL support - use URL-based detection
    environment.isAWS = isAWSHostname;
    environment.isCloud = isCloudEnvironment;
  }
  
  return environment;
}

// <i data-lucide="shield" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Safe Video Rendering with Error Recovery
function safeVideoStart(userId, displayName) {
  // Don't render self as remote
  const currentUserId = client?.getCurrentUserInfo()?.userId
  if (userId === currentUserId) {
    return
  }

  // 重複防止チェック
  if (videoProcessingUsers.has(displayName)) {
    return;
  }

  // 処理中フラグを設定
  videoProcessingUsers.add(displayName);

  const environment = detectRenderingEnvironment();
  
  // Implement retry logic with exponential backoff for cloud environments
  const maxRetries = environment.isCloud ? 5 : 3;
  const baseDelay = environment.isAWS ? 2000 : 1000;
  
  let attempts = 0;
  
  function attemptVideoStart() {
    attempts++;
    
    try {
      // Wrap simpleVideoStart in error boundary
      simpleVideoStartWithRecovery(userId, displayName, environment, attempts)
        .then(() => {
          // 処理完了フラグをクリア
          videoProcessingUsers.delete(displayName);
        })
        .catch((error) => {
          console.error(`[SAFE VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Attempt ${attempts} failed for ${displayName}:`, error);
          
          if (attempts < maxRetries) {
            const delay = baseDelay * Math.pow(2, attempts - 1);
            setTimeout(attemptVideoStart, delay);
          } else {
            console.error(`[SAFE VIDEO] <i data-lucide="zap" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> All attempts failed for ${displayName}`);
            // 最終失敗時にフラグをクリア
            videoProcessingUsers.delete(displayName);
            addDebugMessage('ERROR', 'SAFE-VIDEO', `All ${maxRetries} attempts failed`, {
              userId, displayName, environment: environment.renderer
            });
          }
        });
    } catch (error) {
      console.error(`[SAFE VIDEO] <i data-lucide="zap" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Critical error in attempt ${attempts}:`, error);

      if (attempts < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempts - 1);
        setTimeout(attemptVideoStart, delay);
      } else {
        // 最終失敗時にフラグをクリア
        videoProcessingUsers.delete(displayName);
      }
    }
  }
  
  attemptVideoStart();
}

// Get existing canvas or create new one for a user
function getOrCreateCanvas(displayName, userId) {
  // First try to get existing canvas
  let canvasInfo = remoteCanvases.get(displayName);

  if (!canvasInfo || !canvasInfo.canvas) {
    // Create new canvas using existing function
    canvasInfo = createRemoteUserCanvas(displayName, userId);
  } else {
  }

  return canvasInfo;
}

// <i data-lucide="shield" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Enhanced simpleVideoStart with Recovery Mechanisms
async function simpleVideoStartWithRecovery(userId, displayName, environment, attempt = 1) {
  // Input validation
  if (userId === undefined || userId === null || displayName === undefined || displayName === null) {
    throw new Error(`Invalid parameters - userId: ${userId}, displayName: ${displayName}`);
  }

  addDebugMessage('INFO', 'RECOVERY-VIDEO', `Starting enhanced video (attempt ${attempt})`, {
    userId, displayName, environment: environment.renderer
  });
  
  if (!stream || !videoDecode) {
    throw new Error(`Prerequisites not ready - stream: ${!!stream}, videoDecode: ${videoDecode}`);
  }

  // Get canvas with environment-specific optimizations
  const canvasInfo = getOrCreateCanvas(displayName, userId);
  if (!canvasInfo || !canvasInfo.canvas) {
    throw new Error(`Failed to create canvas for ${displayName}`);
  }

  const canvas = canvasInfo.canvas;
  
  // If already rendering, don't interrupt — just return
  if (canvasInfo.isRendering) {
    return Promise.resolve();
  }

  // Environment-specific canvas configuration
  let canvasWidth = canvas.clientWidth || 640;
  let canvasHeight = canvas.clientHeight || 480;

  // Check if canvas has been transferred to OffscreenCanvas
  let isOffscreenTransferred = false;
  try {
    // Test if canvas properties can be modified
    const testWidth = canvas.width;
    canvas.width = testWidth; // This will throw if transferred to offscreen
  } catch (offscreenError) {
    isOffscreenTransferred = true;
  }

  if (!isOffscreenTransferred) {
    if (environment.isCloud) {
      // Reduce pixel ratio for cloud environments to prevent VideoFrame issues
      const cloudPixelRatio = Math.min(environment.pixelRatio, 1.5);
      canvasWidth = Math.floor(canvasWidth);
      canvasHeight = Math.floor(canvasHeight);

      canvas.width = canvasWidth * cloudPixelRatio;
      canvas.height = canvasHeight * cloudPixelRatio;
    } else {
      // Use full resolution for local environments
      const pixelRatio = environment.pixelRatio;
      canvas.width = canvasWidth * pixelRatio;
      canvas.height = canvasHeight * pixelRatio;
    }

    canvas.style.width = `${canvasWidth}px`;
    canvas.style.height = `${canvasHeight}px`;
  }
  

  // Set rendering flag before starting
  canvasInfo.isRendering = true;

  // Enhanced error handling for renderVideo call
  return new Promise((resolve, reject) => {
    // Set up error event listener for VideoFrame rotation errors
    const originalErrorHandler = window.onerror;
    let videoFrameErrorDetected = false;
    
    const errorHandler = (message, source, lineno, colno, error) => {
      if (message && (message.includes('Cannot set property rotation') || message.includes('VideoFrame'))) {
        videoFrameErrorDetected = true;
        console.warn(`[RECOVERY VIDEO] <i data-lucide="alert-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> VideoFrame rotation error detected for ${displayName}, implementing workaround`);
        
        // Don't reject immediately, try to continue
        return true; // Suppress the error
      }
      
      // Call original handler for other errors
      if (originalErrorHandler) {
        return originalErrorHandler(message, source, lineno, colno, error);
      }
      return false;
    };
    
    window.onerror = errorHandler;
    
    // Timeout for rendering operation
    const timeout = setTimeout(() => {
      window.onerror = originalErrorHandler;
      canvasInfo.isRendering = false;
      reject(new Error(`Rendering timeout for ${displayName}`));
    }, environment.isCloud ? 15000 : 10000);
    
    try {
      // Add detailed remote video debugging before renderVideo call
      detailedLogger.log('INFO', 'REMOTE-VIDEO-DEBUG', `Starting renderVideo for remote participant`, {
        userId,
        displayName,
        canvasWidth,
        canvasHeight,
        streamState: {
          hasVideoTrack: stream.hasVideoTrack ? stream.hasVideoTrack() : 'unknown',
          isActive: stream.active !== undefined ? stream.active : 'unknown'
        },
        deviceInfo: {
          userAgent: navigator.userAgent,
          pixelRatio: window.devicePixelRatio,
          connectionType: navigator.connection?.effectiveType || 'unknown',
          platform: navigator.platform
        }
      });

      // Call renderVideo with enhanced error handling
      const renderStartTime = performance.now();
      safeRenderVideo(stream, canvas, userId, canvas.width, canvas.height, 0, 0, 3)
        .then(() => {
          const renderEndTime = performance.now();
          clearTimeout(timeout);
          window.onerror = originalErrorHandler;

          if (videoFrameErrorDetected) {
            console.warn(`[RECOVERY VIDEO] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> VideoFrame errors occurred but rendering completed for ${displayName}`);
            detailedLogger.log('WARN', 'REMOTE-VIDEO-RECOVERY', 'VideoFrame errors but render completed', {
              userId,
              displayName,
              renderDuration: renderEndTime - renderStartTime
            });
          }

          // Log successful remote video render
          detailedLogger.log('INFO', 'REMOTE-VIDEO-SUCCESS', `Remote video render successful`, {
            userId,
            displayName,
            renderDuration: renderEndTime - renderStartTime,
            canvasSize: `${canvasWidth}x${canvasHeight}`,
            finalCanvasState: {
              width: canvas.width,
              height: canvas.height,
              clientWidth: canvas.clientWidth,
              clientHeight: canvas.clientHeight
            }
          });

          // Update states
          const participant = remoteParticipants.get(displayName);
          if (participant) {
            participant.hasVideo = true;
          }
          activeVideoUsers.add(displayName);
          updateRemoteCanvasStatus(displayName, 'Video Active', true);
          
          resolve();
        })
        .catch((error) => {
          clearTimeout(timeout);
          window.onerror = originalErrorHandler;
          canvasInfo.isRendering = false;

          console.error(`[RECOVERY VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Enhanced video rendering failed for: ${displayName}:`, error);

          // Enhanced remote video error logging
          detailedLogger.log('ERROR', 'REMOTE-VIDEO-FAIL', `Remote video render failed in catch block`, {
            userId,
            displayName,
            error: {
              message: error.message,
              name: error.name,
              stack: error.stack
            },
            canvasState: {
              width: canvas ? canvas.width : 'no-canvas',
              height: canvas ? canvas.height : 'no-canvas',
              isConnected: canvas ? document.body.contains(canvas) : false
            },
            streamState: {
              hasVideoTrack: stream && stream.hasVideoTrack ? stream.hasVideoTrack() : 'unknown',
              isActive: stream && stream.active !== undefined ? stream.active : 'unknown'
            },
            troubleshootingSteps: [
              'Check if stream.hasVideoTrack() returns true',
              'Verify canvas element is properly attached to DOM',
              'Test with different canvas dimensions',
              'Check browser console for WebGL/Canvas errors',
              'Verify network connectivity and bandwidth'
            ]
          });

          updateRemoteCanvasStatus(displayName, 'Render Failed', false);

          reject(error);
        });
    } catch (error) {
      clearTimeout(timeout);
      window.onerror = originalErrorHandler;
      canvasInfo.isRendering = false;
      reject(error);
    }
  });
}

function testAllVideoRendering() {
  addDebugMessage('INFO', 'VIDEO-TEST', 'Starting comprehensive video rendering test');
  
  remoteParticipants.forEach((participant, displayName) => {
    addDebugMessage('INFO', 'VIDEO-TEST', `Testing video for: ${displayName}`);
    testVideoAvailabilityAndStart(participant.userId, displayName);
  });
}

// <i data-lucide="lightbulb" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> SIMPLIFIED VIDEO RENDERING - 複雑な処理を避けて確実に動作
function simpleVideoStart(userId, displayName) {
  // Input validation
  if (userId === undefined || userId === null || displayName === undefined || displayName === null) {
    addDebugMessage('ERROR', 'SIMPLE-VIDEO', 'CRITICAL: Invalid parameters - userId or displayName is undefined', { userId, displayName });
    console.error(`[SIMPLE VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Invalid parameters - userId: ${userId}, displayName: ${displayName}`);
    return;
  }

  addDebugMessage('INFO', 'SIMPLE-VIDEO', `Starting simple video for: ${displayName} (${userId})`);
  
  if (!stream || !videoDecode) {
    addDebugMessage('WARN', 'SIMPLE-VIDEO', 'Prerequisites not ready, retrying in 1s', { stream: !!stream, videoDecode });
    setTimeout(() => simpleVideoStart(userId, displayName), 1000);
    return;
  }
  
  try {
    // 1. Canvasを取得または作成
    let canvasInfo = remoteCanvases.get(displayName);
    if (!canvasInfo || !canvasInfo.canvas) {
      canvasInfo = createRemoteUserCanvas(displayName, userId);
    }
    
    const canvas = canvasInfo.canvas;
    if (!canvas) {
      addDebugMessage('ERROR', 'SIMPLE-VIDEO', 'Failed to get canvas for video rendering', { displayName });
      console.error(`[SIMPLE VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> No canvas available for: ${displayName}`);
      return;
    }
    
    // Check if already rendering to prevent duplicates
    if (canvasInfo.isRendering) {
      addDebugMessage('INFO', 'SIMPLE-VIDEO', 'Already rendering for this participant, skipping', { displayName });
      
      // Force reset if stuck (safety mechanism)
      setTimeout(() => {
        if (canvasInfo.isRendering) {
          canvasInfo.isRendering = false;
        }
      }, 5000);
      return;
    }
    
    // 2. Canvas準備 - SKIP IF ALREADY TRANSFERRED TO OFFSCREEN
    
    // Safe canvas size setting with OffscreenCanvas detection
    // Use canvas size matching grid elements (same as avatar/self-video)
    let canvasWidth = 640;
    let canvasHeight = 480;
    
    try {
      // Proper detection of OffscreenCanvas state
      let isOffscreen = false;
      try {
        // Test if canvas properties can be modified
        const testWidth = canvas.width;
        canvas.width = testWidth; // This will throw if transferred to offscreen
      } catch (offscreenError) {
        isOffscreen = true;
        addDebugMessage('WARN', 'SIMPLE-VIDEO', 'Canvas size setting failed - using fallback', {
          error: offscreenError.message
        });
        console.warn(`[SIMPLE VIDEO] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Canvas already transferred to OffscreenCanvas: ${offscreenError.message}`);
      }

      if (!isOffscreen) {
        // Limit pixelRatio for mobile devices to prevent rendering failures
        const isMobile = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
        const maxPixelRatio = isMobile ? 2 : 3; // Limit mobile to max 2x
        const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);

        canvas.width = canvasWidth * pixelRatio;
        canvas.height = canvasHeight * pixelRatio;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
      } else {
        addDebugMessage('WARN', 'SIMPLE-VIDEO', '<i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Canvas transferred to OffscreenCanvas - creating new canvas', {
          canvasId: canvas.id,
          displayName,
          userId
        });

        // Create new canvas element to replace the OffscreenCanvas
        const newCanvas = document.createElement('canvas');
        newCanvas.id = `remote-canvas-${displayName.replace(/\s+/g, '')}`;
        newCanvas.width = canvasWidth;
        newCanvas.height = canvasHeight;
        newCanvas.style.width = '100%';
        newCanvas.style.height = '100%';
        newCanvas.style.objectFit = 'contain';
        newCanvas.style.borderRadius = '8px';

        // Replace the old canvas with the new one
        canvas.parentNode.replaceChild(newCanvas, canvas);
        canvas = newCanvas;

        // Update canvas info
        canvasInfo.canvas = newCanvas;

      }
    } catch (error) {
      addDebugMessage('WARN', 'SIMPLE-VIDEO', 'Canvas size setting failed - using fallback', { error: error.message });
      console.warn(`[SIMPLE VIDEO] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Canvas size setting failed: ${error.message}`);
      // Use fallback values for rendering
      canvasWidth = canvas.width || 640;
      canvasHeight = canvas.height || 480;
    }
    
    // 3. renderVideoを直接呼び出し
    addDebugMessage('DEBUG', 'SIMPLE-VIDEO', `Calling renderVideo`, { 
      userId, canvasId: canvas.id, canvasSize: `${canvasWidth}x${canvasHeight}` 
    });
    
    // Request permission from server before rendering
    const renderRequest = {
      type: 'VIDEO_RENDER_REQUEST',
      targetUserId: userId,
      timestamp: new Date().toISOString()
    };
    
    // Check if WebSocket is available and connected
    if (!syncWebSocket || syncWebSocket.readyState !== WebSocket.OPEN) {
      console.warn(`[SIMPLE VIDEO] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> WebSocket not connected, proceeding with direct rendering for: ${displayName}`);
      
      // Proceed with direct rendering when WebSocket is not available
      canvasInfo.isRendering = true;
      return safeRenderVideo(stream, canvas, userId, canvas.width, canvas.height, 0, 0, 3)
        .then(() => {
          addDebugMessage('INFO', 'SIMPLE-VIDEO', `<i data-lucide="check-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Video rendering started (fallback) for: ${displayName}`);

          // Set success timestamp to prevent unnecessary restarts
          canvasInfo.lastSuccessTime = Date.now();
          
          // Update states
          const participant = remoteParticipants.get(displayName);
          if (participant) {
            participant.hasVideo = true;
          }
          activeVideoUsers.add(displayName);
          updateRemoteCanvasStatus(displayName, 'Video Active', true);
        })
        .catch((error) => {
          console.error(`[SIMPLE VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Fallback rendering failed for: ${displayName}:`, error);
          canvasInfo.isRendering = false;
          throw error;
        });
    }

    // Send render request to server and wait for approval
    return new Promise((resolve, reject) => {
      const handleServerResponse = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'VIDEO_RENDER_APPROVED' && data.targetUserId === userId) {
            syncWebSocket.removeEventListener('message', handleServerResponse);
            
            // Set rendering flag before starting
            canvasInfo.isRendering = true;
            
            // Send canvas state update to server
            const canvasStateUpdate = {
              type: 'CANVAS_STATE_UPDATE',
              isOffscreenTransferred: canvas.transferControlToOffscreen !== undefined && 
                                     (canvas.width === 0 || canvas.height === 0),
              timestamp: new Date().toISOString()
            };
            syncWebSocket.send(JSON.stringify(canvasStateUpdate));
            
            // renderVideo(canvas, userId, width, height, x, y, videoQuality)
            // Use canvas internal dimensions for proper scaling
            // videoQuality: 0=auto, 90p, 180p, 360p, 720p, 1080p (use 3 for high quality)
            safeRenderVideo(stream, canvas, userId, canvas.width, canvas.height, 0, 0, 3)
              .then(() => {
                addDebugMessage('INFO', 'SIMPLE-VIDEO', `<i data-lucide="check-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Video rendering started successfully for: ${displayName}`);

                // Set success timestamp to prevent unnecessary restarts
                const canvasInfo = remoteCanvases.get(displayName);
                if (canvasInfo) {
                  canvasInfo.lastSuccessTime = Date.now();
                }
                
                // Notify server that rendering is complete
                const renderComplete = {
                  type: 'VIDEO_RENDER_COMPLETE',
                  targetUserId: userId,
                  timestamp: new Date().toISOString()
                };
                syncWebSocket.send(JSON.stringify(renderComplete));
                
                // Debug canvas rendering status (skip for OffscreenCanvas)
                setTimeout(() => {
                  try {
                    // More accurate OffscreenCanvas detection
                    let isOffscreen = false;
                    try {
                      // Test context access - this throws if transferred to OffscreenCanvas
                      const testCtx = canvas.getContext('2d');
                      if (!testCtx) {
                        isOffscreen = true;
                      }
                    } catch (e) {
                      isOffscreen = true;
                    }

                    if (isOffscreen) {
                      addDebugMessage('DEBUG', 'SIMPLE-VIDEO', 'OffscreenCanvas detected, assuming video success', {
                        displayName
                      });
                      // Ensure isRendering flag is maintained for OffscreenCanvas
                      const canvasInfo = remoteCanvases.get(displayName);
                      if (canvasInfo) {
                        canvasInfo.isRendering = true;
                        canvasInfo.lastSuccessTime = Date.now();
                      }
                      return;
                    }
                    
                    // Safe context retrieval for OffscreenCanvas compatibility
                    let ctx, hasContent = false;
                    try {
                      ctx = canvas.getContext('2d');
                      if (!ctx) {
                        addDebugMessage('WARN', 'SIMPLE-VIDEO', 'Cannot check canvas content - OffscreenCanvas detected', { displayName });
                        // For OffscreenCanvas, assume content exists if renderVideo succeeded
                        hasContent = true;
                        return;
                      }

                      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                      const data = imageData.data;

                      // Check if canvas has non-black pixels (indicating video is rendering)
                      for (let i = 0; i < data.length; i += 4) {
                        if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) { // R, G, B
                          hasContent = true;
                          break;
                        }
                      }
                    } catch (contextError) {
                      addDebugMessage('WARN', 'SIMPLE-VIDEO', 'Canvas context access failed', {
                        error: contextError.message,
                        displayName
                      });
                      // Assume success if we can't check (OffscreenCanvas case)
                      hasContent = true;
                      return;
                    }
                    
                    addDebugMessage('DEBUG', 'SIMPLE-VIDEO', `Canvas content status: ${hasContent ? 'visible' : 'black'}`, {
                      canvasSize: `${canvas.width}x${canvas.height}`,
                      displayName
                    });
                    
                    if (!hasContent) {
                    } else {

                      // Set success timestamp for content detection
                      const canvasInfo = remoteCanvases.get(displayName);
                      if (canvasInfo) {
                        canvasInfo.lastSuccessTime = Date.now();
                      }
                    }
                  } catch (error) {
                    console.warn(`[SIMPLE VIDEO] Could not check canvas content: ${error.message}`);
                    addDebugMessage('WARN', 'SIMPLE-VIDEO', 'Canvas content check failed', { error: error.message, displayName });
                  }
                }, 2000);
                
                // Update states
                const participant = remoteParticipants.get(displayName);
                if (participant) {
                  participant.hasVideo = true;
                }
                activeVideoUsers.add(displayName);
                updateRemoteCanvasStatus(displayName, 'Video Active', true);
                
                // Keep rendering flag true during active rendering
                // isRendering stays true to prevent duplicate rendering attempts
                
                // Visual feedback
                resolve();
              })
              .catch((error) => {
                addDebugMessage('ERROR', 'SIMPLE-VIDEO', `<i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Video rendering failed for: ${displayName}`, { error: error.message });
                console.error(`[SIMPLE VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Video rendering failed for: ${displayName}:`, error);
                updateRemoteCanvasStatus(displayName, 'Render Failed', false);
                
                // Reset rendering flag on failure
                canvasInfo.isRendering = false;
                
                // Notify server that rendering failed
                const renderComplete = {
                  type: 'VIDEO_RENDER_COMPLETE',
                  targetUserId: userId,
                  success: false,
                  error: error.message,
                  timestamp: new Date().toISOString()
                };
                syncWebSocket.send(JSON.stringify(renderComplete));
                
                reject(error);
              });
          } else if (data.type === 'VIDEO_RENDER_DENIED' && data.targetUserId === userId) {
            syncWebSocket.removeEventListener('message', handleServerResponse);
            console.warn(`[SIMPLE VIDEO] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Video rendering denied for: ${displayName} - ${data.reason}`);
            addDebugMessage('WARN', 'SIMPLE-VIDEO', `Video rendering denied: ${data.reason}`, { displayName });
            resolve(); // Don't reject, just skip rendering
          }
        } catch (error) {
          console.error('[SIMPLE VIDEO] Error parsing server response:', error);
        }
      };
      
      syncWebSocket.addEventListener('message', handleServerResponse);
      syncWebSocket.send(JSON.stringify(renderRequest));
      
      // Timeout after 5 seconds if no response from server
      setTimeout(() => {
        syncWebSocket.removeEventListener('message', handleServerResponse);
        console.warn(`[SIMPLE VIDEO] <i data-lucide="clock" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Server response timeout for: ${displayName}`);
        addDebugMessage('WARN', 'SIMPLE-VIDEO', 'Server response timeout, proceeding with rendering', { displayName });
        
        // Proceed with rendering if server doesn't respond
        canvasInfo.isRendering = true;
        safeRenderVideo(stream, canvas, userId, canvas.width, canvas.height, 0, 0, 3)
          .then(() => {

            // Set success timestamp to prevent unnecessary restarts
            canvasInfo.lastSuccessTime = Date.now();
            resolve();
          })
          .catch((error) => {
            console.error(`[SIMPLE VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Fallback rendering failed for: ${displayName}:`, error);
            canvasInfo.isRendering = false;
            reject(error);
          });
      }, 5000);
    });
      
  } catch (error) {
    addDebugMessage('ERROR', 'SIMPLE-VIDEO', `<i data-lucide="zap" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Exception in simpleVideoStart`, { displayName, error: error.message });
    console.error(`[SIMPLE VIDEO] <i data-lucide="zap" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Exception in simpleVideoStart:`, error);
  }
}

function simpleVideoStop(userId, displayName) {
  // Input validation
  if (userId === undefined || userId === null || displayName === undefined || displayName === null) {
    addDebugMessage('ERROR', 'SIMPLE-VIDEO', 'CRITICAL: Invalid parameters for stop - userId or displayName is undefined', { userId, displayName });
    console.error(`[SIMPLE VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Invalid stop parameters - userId: ${userId}, displayName: ${displayName}`);
    return;
  }

  addDebugMessage('INFO', 'SIMPLE-VIDEO', `Stopping simple video for: ${displayName} (${userId})`);
  
  const canvasInfo = remoteCanvases.get(displayName);
  if (canvasInfo && canvasInfo.canvas) {
    try {
      stream.stopRenderVideo(canvasInfo.canvas, userId)
        .then(() => {

          // Update states
          const participant = remoteParticipants.get(displayName);
          if (participant) {
            participant.hasVideo = false;
          }
          activeVideoUsers.delete(displayName);
          canvasInfo.isRendering = false;

          // Replace the canvas so the SDK's OffscreenCanvas transfer is discarded
          // and we get a clean blank element (can't draw on a transferred canvas)
          try {
            const oldCanvas = canvasInfo.canvas;
            const parent = oldCanvas.parentNode;
            if (parent) {
              const newCanvas = document.createElement('canvas');
              newCanvas.id = oldCanvas.id;
              newCanvas.className = oldCanvas.className;
              newCanvas.width = oldCanvas.width;
              newCanvas.height = oldCanvas.height;
              newCanvas.style.cssText = oldCanvas.style.cssText;
              parent.replaceChild(newCanvas, oldCanvas);
              canvasInfo.canvas = newCanvas;

              const ctx = newCanvas.getContext('2d');
              if (ctx) {
                ctx.fillStyle = '#333';
                ctx.fillRect(0, 0, newCanvas.width, newCanvas.height);
              }
            }
          } catch (e) { /* ignore */ }

          updateRemoteCanvasStatus(displayName, 'No Video', false);
        })
        .catch(error => {
          console.error(`[SIMPLE VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Error stopping video:`, error);
        });
        
    } catch (error) {
      console.error(`[SIMPLE VIDEO] <i data-lucide="zap" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Exception stopping video:`, error);
    }
  }
}

