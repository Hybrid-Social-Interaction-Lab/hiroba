function safeRenderVideo(stream, canvas, userId, width, height, x, y, quality) {
  // AWS環境でVideoFrame rotationエラーを回避
  return new Promise((resolve, reject) => {
    try {
      // Canvasのサイズが有効であることを確認
      if (!canvas || canvas.width <= 0 || canvas.height <= 0) {
        canvas.width = width || 640;
        canvas.height = height || 480;
      }

      // Temporary workaround: avoid setting properties on VideoFrame objects
      const originalDefineProperty = Object.defineProperty;
      Object.defineProperty = function(obj, prop, descriptor) {
        // Skip rotation property on VideoFrame objects
        if (obj && obj.constructor && obj.constructor.name === 'VideoFrame' && prop === 'rotation') {
          console.warn('[SAFE RENDER] Blocked rotation property set on VideoFrame');
          return obj;
        }
        return originalDefineProperty.call(this, obj, prop, descriptor);
      };

      // オリジナルのrenderVideoを呼び出し
      const renderPromise = stream.renderVideo(canvas, userId, width, height, x, y, quality);

      // Restore original defineProperty after a short delay
      setTimeout(() => {
        Object.defineProperty = originalDefineProperty;
      }, 100);

      // エラーハンドリングを追加
      renderPromise.then(() => {
        resolve();
      }).catch((error) => {
        // Restore original defineProperty
        Object.defineProperty = originalDefineProperty;

        // VideoFrame rotation エラーの場合は無視して続行
        if (error.message && (error.message.includes('rotation') || error.message.includes('VideoFrame'))) {
          console.warn(`[SAFE RENDER] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> VideoFrame error detected but continuing for userId: ${userId}`);
          // エラーを無視して成功とする
          resolve();
        } else {
          // その他のエラーはそのまま伝播
          reject(error);
        }
      });
    } catch (error) {
      console.error(`[SAFE RENDER] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Exception in safeRenderVideo:`, error);
      // VideoFrame関連のエラーは無視
      if (error.message && (error.message.includes('rotation') || error.message.includes('VideoFrame'))) {
        resolve();
      } else {
        reject(error);
      }
    }
  });
}

// Enhanced global error handler for VideoFrame rotation issues
const originalErrorHandler = window.onerror;
window.onerror = function(message, source, lineno, colno, error) {
  // Check for VideoFrame rotation errors
  if (message && message.includes('Cannot set property rotation')) {
    videoFrameErrorCount++;
    lastVideoFrameError = {
      message,
      source,
      lineno,
      colno,
      timestamp: new Date().toISOString(),
      count: videoFrameErrorCount
    };
    
    console.warn(`[GLOBAL ERROR HANDLER] <i data-lucide="alert-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> VideoFrame rotation error #${videoFrameErrorCount}:`, {
      message,
      source: source?.substring(source.lastIndexOf('/') + 1),
      line: lineno,
      column: colno
    });
    
    // Log to our detailed logger
    detailedLogger.log('WARN', 'VIDEOFRAME-ERROR', `VideoFrame rotation error #${videoFrameErrorCount}`, {
      message,
      source: source?.substring(source.lastIndexOf('/') + 1),
      lineno,
      colno,
      userAgent: navigator.userAgent
    });
    
    // If too many errors, attempt recovery
    if (videoFrameErrorCount >= MAX_VIDEOFRAME_ERRORS) {
      console.error(`[GLOBAL ERROR HANDLER] <i data-lucide="zap" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Too many VideoFrame errors (${videoFrameErrorCount}), attempting recovery...`);
      
      // Implement recovery strategy
      setTimeout(() => {
        
        // Reset error count
        videoFrameErrorCount = 0;
        
        // Try to restart video rendering for all participants
        if (typeof remoteParticipants !== 'undefined') {
          remoteParticipants.forEach((participant, displayName) => {
            if (participant.hasVideo) {
              
              // Stop current rendering
              const canvasInfo = remoteCanvases?.get(displayName);
              if (canvasInfo) {
                canvasInfo.isRendering = false;
              }
              
              // Restart with safe method
              setTimeout(() => {
                if (typeof safeVideoStart === 'function') {
                  safeVideoStart(participant.userId, displayName);
                }
              }, 1000);
            }
          });
        }
      }, 2000);
    }
    
    // Suppress the error to prevent it from breaking the application
    return true;
  }
  
  // For other errors, call the original handler
  if (originalErrorHandler) {
    return originalErrorHandler.call(this, message, source, lineno, colno, error);
  }
  
  return false;
};

// Enhanced unhandled promise rejection handler
const originalUnhandledRejection = window.onunhandledrejection;
window.onunhandledrejection = function(event) {
  if (event.reason && event.reason.message && event.reason.message.includes('VideoFrame')) {
    console.warn('[GLOBAL ERROR HANDLER] <i data-lucide="alert-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> VideoFrame promise rejection:', event.reason);
    
    detailedLogger.log('WARN', 'VIDEOFRAME-PROMISE', 'VideoFrame promise rejection', {
      reason: event.reason.message,
      stack: event.reason.stack
    });
    
    event.preventDefault(); // Prevent the error from being logged to console
    return;
  }
  
  // For other rejections, call the original handler
  if (originalUnhandledRejection) {
    return originalUnhandledRejection.call(this, event);
  }
};

/* ========== グローバル変数 ============================================= */
let ZoomVideo, client, stream
let videoDecode = false, videoEncode = false
let audioDecode = false, audioEncode = false
let shareDecode = false, shareEncode = false        // ← 宣言を追加
window.localVideoTrack = null                       // ← 1 度だけ生成して再利用

/* Expose media stream for HTML toolbar buttons */
window.getMediaStream = function() {
  return stream
}

/* Mute state tracking */
let localAudioMuted = false
let participantMuteStates = new Map() // userId -> boolean (true = muted)

window.toggleToolbarMic = async function() {
  if (!stream) {
    console.warn('[Toolbar] Stream not available yet')
    return false
  }
  try {
    if (localAudioMuted) {
      await stream.startAudio()
      localAudioMuted = false
    } else {
      await stream.stopAudio()
      localAudioMuted = true
    }
    updateSelfMuteIcon(localAudioMuted)
    return true
  } catch (e) {
    console.error('[Toolbar] Audio toggle failed:', e)
    return false
  }
}

window.toggleToolbarCamera = async function() {
  console.log('[Toolbar] toggleToolbarCamera called — stream:', !!stream, 'ZoomVideo:', !!ZoomVideo, 'hasJoinedSession:', typeof hasJoinedSession !== 'undefined' ? hasJoinedSession : 'undefined')
  if (!stream || !ZoomVideo) {
    console.warn('[Toolbar] Stream/ZoomVideo not available yet — stream:', stream, 'ZoomVideo:', ZoomVideo)
    if (typeof showTemporaryMessage === 'function') showTemporaryMessage('Join a session first', 'warning')
    return false
  }
  try {
    await cameraStartStop()
    return true
  } catch (e) {
    console.error('[Toolbar] Camera toggle failed:', e)
    return false
  }
}

function makeMuteIconSvg() {
  // Lucide mic-off SVG (24x24, stroke-based)
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  svg.setAttribute('width', '14')
  svg.setAttribute('height', '14')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '2')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.style.cssText = 'display:inline-block;vertical-align:middle;margin-left:5px;flex-shrink:0;'
  svg.innerHTML = `
    <line x1="2" y1="2" x2="22" y2="22"></line>
    <path d="M18.89 13.23A7.12 7.12 0 0 0 19 12v-2"></path>
    <path d="M5 10v2a7 7 0 0 0 12 5"></path>
    <path d="M15 9.34V5a3 3 0 0 0-5.68-1.33"></path>
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12"></path>
    <line x1="12" y1="19" x2="12" y2="22"></line>
  `
  return svg
}

function updateSelfMuteIcon(muted) {
  const label = document.getElementById('self-user-label')
  if (!label) return
  const existing = label.querySelector('.mute-icon')
  if (existing) existing.remove()
  if (muted) {
    const wrap = document.createElement('span')
    wrap.className = 'mute-icon'
    wrap.style.cssText = 'color:#ff4757;'
    wrap.appendChild(makeMuteIconSvg())
    label.appendChild(wrap)
  }
}

function updateParticipantMuteIcon(userId, muted) {
  participantMuteStates.set(userId, muted)
  for (const [displayName, info] of remoteCanvases.entries()) {
    if (info.userId === userId) {
      const label = info.label
      if (!label) break
      const existing = label.querySelector('.mute-icon')
      if (existing) existing.remove()
      if (muted) {
        const wrap = document.createElement('span')
        wrap.className = 'mute-icon'
        wrap.style.cssText = 'color:#ff4757;'
        wrap.appendChild(makeMuteIconSvg())
        label.appendChild(wrap)
      }
      break
    }
  }
}

/* ========== Remote Participants Management ========================== */
let remoteParticipants = new Map()                 // displayName -> participant info (changed from userId)
let remoteParticipantsByUserId = new Map()         // userId -> displayName mapping
let currentDisplayedUser = null                    // 現在表示中のユーザー（displayName）
let activeVideoUsers = new Set()                   // ビデオを開始しているユーザー（displayName）
let remoteCanvases = new Map()                     // displayName -> canvas element mapping
let videoProcessingUsers = new Set()               // 現在ビデオ処理中のユーザー（重複防止）
let masterVideoVisibleForClients = true
let masterVisibilityMutedHostMic = false
let selfVideoEnabled = false                       // Track self video state locally

function getConditionFromPathname() {
  return new URLSearchParams(window.location.search).get('condition') || null
}

