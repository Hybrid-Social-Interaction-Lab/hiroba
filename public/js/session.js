async function joinSession() {
  // Ensure clean state before joining
  ensureCleanState()
  /* 1‑A. Video SDK クライアント生成 */
  // HTTPS環境チェック
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    console.warn('[WARNING] Zoom Video SDK requires HTTPS. Some features may not work properly.')
    // MediaDevicesが利用できない場合の回避策
    if (!navigator.mediaDevices) {
      navigator.mediaDevices = {
        getUserMedia: () => Promise.reject(new Error('HTTPS required')),
        getDisplayMedia: () => Promise.reject(new Error('HTTPS required'))
      }
    }
  }
  
  ZoomVideo = window.WebVideoSDK.default
  client     = ZoomVideo.createClient()
  client.init('en-US', 'CDN')         // 公式 CDN から lib を取得

  /* 1‑B. メディア SDK 状態リスナ --------------------------------------- */
  client.on('media-sdk-change', ({ type, action, result }) => {
    if (result !== 'success') return
    if (type === 'video') action === 'encode' ? videoEncode = true : videoDecode = true
    if (type === 'audio') action === 'encode' ? audioEncode = true : audioDecode = true
    if (type === 'share') action === 'encode' ? shareEncode = true : shareDecode = true
  })

  /* 1‑C. ライブ トランスクリプト ------------------------------------- */
  client.on('caption-message', (payload) => {
    const { speakerName, speakerId, text, done, msgId, userId, displayName, timestamp } = payload

    if (!text?.trim()) {
      return
    }

    // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> 逐次処理対応: 部分的な書き起こし(done=false)も処理して応答時間を短縮

    // 自分のユーザーIDを取得
    let currentUserId
    let currentUserName
    try {
      const currentUser = client.getCurrentUserInfo()
      currentUserId = currentUser?.userId
      currentUserName = currentUser?.displayName
    } catch (error) {
      console.error('[DEBUG] Could not get current user info:', error)
    }

    // ========== フィルタリング: 自分が話した場合のみ処理 ==========
    // 各クライアントは自分の発話のみを処理し、他のクライアントに同期
    // 他のクライアントの発話はWebSocket経由で受信

    // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> FIX: speakerIdが優先、次にuserId、最後にspeakerNameで判定
    const effectiveSpeakerId = speakerId || userId
    const effectiveSpeakerName = speakerName || displayName

    if (effectiveSpeakerId) {
      // IDベースの判定
      if (!currentUserId) {
        console.error('[DEBUG] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: speakerId/userId exists but currentUserId is missing!')
        return
      }
      if (effectiveSpeakerId !== currentUserId) {
        return
      }
    } else if (effectiveSpeakerName) {
      // 名前ベースの判定
      if (effectiveSpeakerName !== currentUserName) {
        return
      }
    } else {
      // すべての識別子が欠けている
      console.error('[DEBUG] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Cannot identify speaker - all identifiers missing!')
      return
    }


    // ========== 話者名を確定 ==========
    // 入力フィールドのuser_nameを優先的に使用
    const userNameInput = document.getElementById('user_name')
    const inputDisplayName = userNameInput ? userNameInput.value.trim() : null

    let finalSpeakerName = inputDisplayName || effectiveSpeakerName
    if (!finalSpeakerName && effectiveSpeakerId) {
      try {
        const allUsers = client.getAllUser()
        const user = allUsers.find(u => u.userId === effectiveSpeakerId)
        finalSpeakerName = user?.displayName || 'Unknown'
      } catch {
        finalSpeakerName = 'Unknown'
      }
    }

    // まだundefinedの場合、現在のユーザー名を使用（自分が話している場合のみここに到達）
    if (!finalSpeakerName) {
      finalSpeakerName = currentUserName || 'Unknown'
    }



    // transcript-log element no longer exists in HTML, so we skip this display

    // 自動読み上げ用の処理（自分の発話のみ）
    handleTranscriptForAutoReading(finalSpeakerName, text.trim())
  })

  /* 1‑D. Active Speaker 検出（Agent Masterのみ） ----------------------- */
  client.on('active-speaker', (activeSpeakers) => {
    if (!activeSpeakers || activeSpeakers.length === 0) {
      clearAllSpeakingIndicators()
      return
    }

    const currentUserId = client.getCurrentUserInfo().userId

    clearAllSpeakingIndicators()
    activeSpeakers.forEach(speaker => setSpeakingIndicator(speaker.userId, false))

    // activeSpeakers にエージェント（自分）以外のユーザーがいるかチェック
    const realUserSpeaking = activeSpeakers.some(speaker => speaker.userId !== currentUserId)

    if (realUserSpeaking) {
      const wasUserSpeaking = isUserSpeaking
      isUserSpeaking = true

      // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> FIX: ユーザーが話し始めたタイミングで中央（WebSocket経由）に通知
      if (!wasUserSpeaking) {
        const speakingUsers = activeSpeakers
          .filter(s => s.userId !== currentUserId)
          .map(s => s.displayName || s.userId)
          .join(', ')

        sendWebSocketMessage({
          type: 'USER_SPEAKING',
          speakerName: speakingUsers,
          timestamp: Date.now()
        })
      }

      // タイムアウトをリセット（連続発話対応）
      clearTimeout(userSpeakingTimeout)
      userSpeakingTimeout = setTimeout(() => {
        isUserSpeaking = false
        clearAllSpeakingIndicators()

        // 同期: 状態変更を他のエージェントに通知
        syncAgentStatus()
      }, 1500) // 1.5秒沈黙で発話終了と判定


      // 同期: 状態変更を他のエージェントに通知
      syncAgentStatus()
    }
  })

  /* 1‑E. リモート映像の開始/停止 ------------------------------------- */
  // <i data-lucide="search" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> すべてのイベントをモニタリング
  
  client.on('peer-video-state-change', ({ userId, action }) => {
    const currentUserId = client.getCurrentUserInfo().userId
    const currentUserName = client.getCurrentUserInfo().displayName

    // Enhanced peer video state change logging
    detailedLogger.log('INFO', 'REMOTE-VIDEO-STATE', `Peer video state changed: ${action}`, {
      userId,
      action,
      currentUserId,
      timestamp: new Date().toISOString(),
      streamState: {
        streamAvailable: !!stream,
        videoDecodeReady: videoDecode,
        hasVideoTrack: stream && stream.hasVideoTrack ? stream.hasVideoTrack() : 'unknown'
      },
      participantInfo: {
        existingParticipants: Array.from(remoteParticipantsByUserId.keys()),
        activeVideoUsers: Array.from(activeVideoUsers),
        remoteParticipantsCount: remoteParticipants.size
      }
    });

    // 自分のビデオイベントは無視
    if (userId === currentUserId) {
      detailedLogger.log('DEBUG', 'REMOTE-VIDEO-SKIP', 'Skipping self user video event', { userId, action });
      return
    }

    // CRITICAL FIX: Validate userId before processing
    if (userId === undefined || userId === null) {
      addDebugMessage('ERROR', 'PEER-VIDEO', 'CRITICAL: Received undefined userId in peer-video-state-change event!', {
        userId, action, currentUserId, currentUserName
      });
      console.error(`[DEBUG VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Received undefined userId in peer-video-state-change event!`);
      console.error(`[DEBUG VIDEO] Event details:`, { userId, action, currentUserId, currentUserName });

      detailedLogger.log('ERROR', 'REMOTE-VIDEO-ERROR', 'Invalid userId in peer-video-state-change', {
        userId, action, currentUserId, currentUserName,
        possibleCauses: [
          'Network packet corruption',
          'SDK internal error',
          'Race condition during participant management',
          'Invalid event emission from Zoom SDK'
        ]
      });
      return; // Skip invalid events
    }
    
    // 参加者が存在しない場合は追加 (ロバスト処理) - BUT VALIDATE FIRST
    if (!remoteParticipantsByUserId.has(userId)) {
      try {
        const allUsers = client.getAllUser()
        const user = allUsers.find(u => u.userId === userId)
        const displayName = user?.displayName
        
        // CRITICAL: Don't proceed if displayName is invalid
        if (!displayName || displayName.includes('undefined')) {
          addDebugMessage('ERROR', 'PEER-VIDEO', 'CRITICAL: getAllUser returned invalid displayName', {
            userId, displayName, user
          });
          console.error(`[DEBUG VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: getAllUser returned invalid displayName:`, displayName);
          return; // Skip invalid users
        }
        
        addRemoteParticipant(userId, displayName)
      } catch (e) {
        addDebugMessage('ERROR', 'PEER-VIDEO', 'CRITICAL: getAllUser failed completely', {
          userId, error: e.message
        });
        console.error(`[DEBUG VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: getAllUser failed completely for userId: ${userId}`, e);
        return; // Don't create invalid participants
      }
    }
    
    const displayName = remoteParticipantsByUserId.get(userId)
    if (!displayName || displayName.includes('undefined')) {
      addDebugMessage('ERROR', 'PEER-VIDEO', 'CRITICAL: Invalid displayName for userId', {
        userId, displayName, availableMappings: Object.fromEntries(remoteParticipantsByUserId)
      });
      console.error(`[DEBUG VIDEO] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Invalid displayName for userId: ${userId}`, displayName)
      console.error(`[DEBUG VIDEO] Available mappings:`, Object.fromEntries(remoteParticipantsByUserId))
      return
    }
    
    
    // シンプルなビデオ状態管理
    if (action === 'Start') {
      addDebugMessage('INFO', 'PEER-VIDEO', `Starting video for: ${displayName}`, { userId });
      setParticipantVideoState(userId, true)
      
      // SIMPLIFIED VIDEO START - 複雑な処理を避ける
      setTimeout(() => {
        safeVideoStart(userId, displayName)
      }, 500)
      
    } else if (action === 'Stop') {
      addDebugMessage('INFO', 'PEER-VIDEO', `Stopping video for: ${displayName}`, { userId });
      setParticipantVideoState(userId, false)
      simpleVideoStop(userId, displayName)
    }
    
    // 処理後の状態をログ
    
  })
  
  // <i data-lucide="search" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> 他の重要なイベントもモニタリング
  client.on('user-added', (payload) => {
    addDebugMessage('INFO', 'USER-ADDED', 'New user added to session', payload);

    // CRITICAL FIX: Handle array payload from Zoom SDK
    // Sometimes the payload is an array of users, sometimes it's a single user object
    let userPayload = payload
    if (Array.isArray(payload)) {
      if (payload.length === 0) {
        console.error(`[USER ADDED] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Empty array payload, skipping`)
        return
      }
      userPayload = payload[0]
    }

    // Enhanced remote participant logging
    detailedLogger.log('INFO', 'REMOTE-PARTICIPANT-JOIN', 'Remote participant joined the session', {
      userId: userPayload.userId,
      displayName: userPayload.displayName,
      timestamp: new Date().toISOString(),
      currentParticipants: Array.from(remoteParticipants.keys()),
      sessionInfo: {
        totalParticipants: remoteParticipants.size + 1,
        hasHost: client.isHost ? client.isHost() : 'unknown'
      }
    });

    // CRITICAL FIX: Validate userId first
    if (!userPayload.userId || userPayload.userId === undefined || userPayload.userId === null) {
      addDebugMessage('ERROR', 'USER-ADDED', 'CRITICAL: Invalid userId in user-added event', userPayload);
      console.error(`[USER ADDED] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Invalid userId in user-added event:`, userPayload);

      detailedLogger.log('ERROR', 'REMOTE-PARTICIPANT-ERROR', 'Invalid userId in user-added event', {
        payload,
        possibleCauses: [
          'Network connection issues during join',
          'SDK version mismatch',
          'Invalid session configuration',
          'Browser compatibility issues'
        ]
      });
      return;
    }
    
    // 新しい参加者のビデオを即座にチェックして表示を試行
    setTimeout(() => {
      const currentUserId = client.getCurrentUserInfo().userId
      if (userPayload.userId !== currentUserId) {
        addDebugMessage('INFO', 'USER-ADDED', 'Processing remote user addition', { userId: userPayload.userId, currentUserId });

        try {
          const allUsers = client.getAllUser()
          const userInfo = allUsers.find(u => u.userId === userPayload.userId)
          const displayName = userInfo?.displayName

          // CRITICAL: Validate displayName
          if (!displayName || displayName.includes('undefined')) {
            addDebugMessage('ERROR', 'USER-ADDED', 'CRITICAL: Invalid displayName from getUserInfo', {
              userId: userPayload.userId, displayName, userInfo
            });
            console.error(`[USER ADDED] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Invalid displayName:`, displayName);
            return; // Don't create invalid participants
          }


          // 参加者を追加
          addRemoteParticipant(userPayload.userId, displayName)

          // 会話履歴に入室イベントを追加
          const joinConversation = {
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date().toLocaleTimeString('en-US', {
              hour12: false,
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            }),
            speaker: displayName,
            userId: userPayload.userId,
            displayName: displayName,
            type: 'user_join',
            triggerEvent: 'join',
            message: `${displayName} joined the session`
          }

          conversationHistory.push(joinConversation)
          updateConversationDisplay()
          syncConversationUpdate(joinConversation)

          // ENHANCED: Force video rendering with multiple attempts
          setTimeout(() => {
            addDebugMessage('INFO', 'USER-ADDED', 'Starting video for newly added user', { userId: userPayload.userId, displayName });
            safeVideoStart(userPayload.userId, displayName)

            // Additional retry after 3 seconds if first attempt fails
            setTimeout(() => {
              const participant = remoteParticipants.get(displayName);
              const canvasInfo = remoteCanvases.get(displayName);
              if (!canvasInfo || !canvasInfo.isRendering) {
                addDebugMessage('WARN', 'USER-ADDED', 'Retrying video start for new user', { displayName });
                safeVideoStart(userPayload.userId, displayName);
              }
            }, 3000);

          }, 1500) // Reduced delay for faster video start

        } catch (error) {
          addDebugMessage('ERROR', 'USER-ADDED', 'CRITICAL: getUserInfo failed completely', {
            userId: userPayload.userId, error: error.message
          });
          console.error(`[USER ADDED] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: getUserInfo failed:`, error);
          // Don't create fallback participants with potentially invalid data
        }
      } else {
        addDebugMessage('DEBUG', 'USER-ADDED', 'Ignoring self user-added event', { userId: userPayload.userId });
      }
    }, 500) // Reduced delay for faster response
  })
  
  client.on('user-removed', (payload) => {
    addDebugMessage('INFO', 'USER-REMOVED', 'User removed from session', payload);

    // CRITICAL FIX: Handle array payload from Zoom SDK
    let userPayload = payload
    if (Array.isArray(payload)) {
      if (payload.length === 0) {
        console.error(`[USER REMOVED] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Empty array payload, cannot process removal`)
        return
      }
      userPayload = payload[0]
    }

    // Enhanced remote participant leaving logging
    const removedParticipant = Array.from(remoteParticipants.entries())
      .find(([name, info]) => info.userId === userPayload.userId);

    detailedLogger.log('INFO', 'REMOTE-PARTICIPANT-LEAVE', 'Remote participant left the session', {
      userId: userPayload.userId,
      displayName: removedParticipant ? removedParticipant[0] : 'unknown',
      timestamp: new Date().toISOString(),
      wasVideoActive: removedParticipant ? activeVideoUsers.has(removedParticipant[0]) : false,
      remainingParticipants: Array.from(remoteParticipants.keys()).filter(name =>
        remoteParticipants.get(name)?.userId !== userPayload.userId
      ),
      sessionInfo: {
        remainingParticipantCount: remoteParticipants.size - 1
      }
    });

    // Clean up removed user
    if (userPayload.userId) {
      const displayName = remoteParticipantsByUserId.get(userPayload.userId);
      if (displayName) {
        addDebugMessage('INFO', 'USER-REMOVED', 'Cleaning up removed user', { userId: userPayload.userId, displayName });

        // 会話履歴に退室イベントを追加
        const leaveConversation = {
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date().toLocaleTimeString('en-US', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
          }),
          speaker: displayName,
          userId: userPayload.userId,
          displayName: displayName,
          type: 'user_leave',
          triggerEvent: 'leave',
          message: `${displayName} left the session`
        }

        conversationHistory.push(leaveConversation)
        updateConversationDisplay()
        syncConversationUpdate(leaveConversation)

        removeRemoteParticipant(userPayload.userId);  // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> FIX: Pass userId instead of displayName
      }
    }
  })
  
  // CRITICAL: Add periodic video check for new participants
  setInterval(() => {
    if (!client || !stream || !videoDecode) return;
    
    try {
      const allUsers = client.getAllUser();
      const currentUserId = client.getCurrentUserInfo().userId;
      
      allUsers.forEach(user => {
        if (user.userId !== currentUserId && user.bVideoOn) {
          const existingDisplayName = remoteParticipantsByUserId.get(user.userId);
          
          if (!existingDisplayName) {
            // Found a user with video that we don't have in our participants
            addDebugMessage('WARN', 'PERIODIC-CHECK', 'Found untracked user with video enabled', {
              userId: user.userId, displayName: user.displayName, bVideoOn: user.bVideoOn
            });
            
            // Add them and start video
            addRemoteParticipant(user.userId, user.displayName);
            setTimeout(() => {
              safeVideoStart(user.userId, user.displayName);
            }, 1000);
          } else {
            // Check if existing participant should have video rendering
            const canvasInfo = remoteCanvases.get(existingDisplayName);
            const hasRecentSuccess = canvasInfo && canvasInfo.lastSuccessTime &&
                                   (Date.now() - canvasInfo.lastSuccessTime < 30000); // 30秒以内の成功

            // Check if canvas shows content or rendering is active
            const isActivelyRendering = canvasInfo && (canvasInfo.isRendering || canvasInfo.lastSuccessTime);

            if (canvasInfo && !canvasInfo.isRendering && user.bVideoOn && !hasRecentSuccess && !isActivelyRendering) {
              addDebugMessage('INFO', 'PERIODIC-CHECK', 'Restarting video for existing participant', {
                userId: user.userId, displayName: existingDisplayName, isActivelyRendering
              });
              safeVideoStart(user.userId, existingDisplayName);
            } else {
              // Skip restart if recently successful or actively rendering
              addDebugMessage('DEBUG', 'PERIODIC-CHECK', 'Skipping restart', {
                userId: user.userId, displayName: existingDisplayName,
                hasRecentSuccess, isActivelyRendering, isRendering: canvasInfo?.isRendering
              });
            }
          }
        }
      });
    } catch (error) {
      // Ignore errors in periodic check
    }
  }, 30000); // Check every 30 seconds (reduced frequency)
  
  // ビデオ関連の他のイベントもチェック
  client.on('video-active-change', (payload) => {
  })
  
  client.on('video-quality-change', (payload) => {
  })

  client.on('user-updated', (payload) => {
    const users = Array.isArray(payload) ? payload : [payload]
    users.forEach(user => {
      if (user && typeof user.muted === 'boolean') {
        updateParticipantMuteIcon(user.userId, user.muted)
      }
    })
  })

  /* 1‑E. JOIN ---------------------------------------------------------- */
  const topic    = document.getElementById('session_topic').value
  const userName = document.getElementById('user_name').value
  const password = document.getElementById('session_pwd').value
  const token    = await getSignature(topic, password)

  try {
    await client.join(topic, token, userName, password)
    hasJoinedSession = true
    stream = client.getMediaStream()

    // Zoom SDK から実際の displayName を取得して使用（他のユーザーと統一）
    const currentUserInfo = client.getCurrentUserInfo()
    const actualDisplayName = currentUserInfo?.displayName || userName
    document.getElementById('self-user-label').textContent = actualDisplayName
    
    cameraStartStop()   // 自動でカメラ ON
    audioStart()        // 自動でマイク ON
    
    // 自動でライブトランスクリプトを開始
    setTimeout(() => {
      startTranscript()
    }, 2000) // 2秒待ってから開始（音声が確立されてから）
    
    // WebSocket接続を初期化
    initializeWebSocketConnection()
    
    // エージェント同期システムを初期化
    initializeAgentSynchronization()
    
    // 確実な参加者検出とビデオ初期化のための多段階アプローチ
    setTimeout(() => {
      
      // Stage 1: 即座に参加者検出を試行
      try {
        discoverExistingParticipants()
      } catch (error) {
        console.error('[INIT] Error in initial discovery:', error)
      }
      
      // Stage 2: 5秒後に再度確認
      setTimeout(() => {
        try {
          const allUsers = client.getAllUser()
          
          allUsers.forEach(user => {
            const currentUserId = client.getCurrentUserInfo().userId
            if (user.userId !== currentUserId) {
              const displayName = user.displayName
              if (!displayName || displayName.trim() === '') return

              if (!remoteParticipants.has(displayName)) {
                addRemoteParticipant(user.userId, displayName)
              }

              if (user.bVideoOn) {
                const canvasInfo = remoteCanvases.get(displayName)
                if (canvasInfo && !canvasInfo.isRendering) {
                  setTimeout(() => safeVideoStart(user.userId, displayName), 2000)
                }
              }
            }
          })
        } catch (error) {
          console.error('[INIT] Error in stage 2:', error)
        }
      }, 5000)
      
      // Stage 3: 10秒後に最終確認と強制開始
      setTimeout(() => {
        forceStartAllParticipantVideos()
        
        // Stage 4: ヘルスモニタリング開始
        setTimeout(() => {
          startVideoHealthMonitoring()
        }, 5000)
      }, 10000)
      
    }, 3000) // 接続が安定してから実行

    // アクティブエージェント機能を開始（改善版）
    setTimeout(() => {
      initializeActiveAgentAfterJoin()
    }, 3000) // 3秒待ってから開始（短縮）
  } catch (e) {
    console.error('[ERROR] join failed:', e)
  }
}

/* ========== Update Agent Status UI ================================== */
function updateAgentStatusUI() {
  const now = Date.now()

  // Watchdog: if this client is the agent master and periodic speech is enabled,
  // ensure the periodic speech interval timer is running. This prevents cases
  // where interval updates or other flows clear the timer without restarting it.
  if (hasJoinedSession && isAgentMaster && agentBehaviorSettings.periodicSpeech && !periodicSpeechTimer) {
    console.warn('[Periodic Speech] Watchdog detected missing timer - restarting')
    startPeriodicSpeech()
  }

  // Before joining a session, keep countdown/progress fixed at initial values.
  if (!hasJoinedSession) {
    agentStatus.silenceCountdown = Math.ceil(SILENCE_THRESHOLD / 1000)
    agentStatus.silenceProgress = 0
    agentStatus.periodicCountdown = Math.ceil(PERIODIC_SPEECH_INTERVAL / 1000)
    agentStatus.periodicProgress = 0

    agentStatus.state = 'Listening'
    updateUIElements()
    return
  }
  
  // 沈黙検知のカウントダウン計算
  // Requirement: while periodic/name speech is playing, silence countdown keeps running.
  // Only the *matching* panel (silence) is reset while silence-trigger speech is playing.
  if (!agentBehaviorSettings.silenceDetection) {
    agentStatus.silenceCountdown = Math.ceil(SILENCE_THRESHOLD / 1000)
    agentStatus.silenceProgress = 0
  } else if (isUserSpeaking) {
    agentStatus.silenceCountdown = Math.ceil(SILENCE_THRESHOLD / 1000)
    agentStatus.silenceProgress = 0
  } else if (isActiveAgentSpeaking && currentAgentSpeechType === 'silence') {
    agentStatus.silenceCountdown = Math.ceil(SILENCE_THRESHOLD / 1000)
    agentStatus.silenceProgress = 0
  } else {
    const timeSinceLastSpeech = now - lastSpeechActivity
    const remainingTime = Math.max(0, SILENCE_THRESHOLD - timeSinceLastSpeech)
    agentStatus.silenceCountdown = Math.ceil(remainingTime / 1000)
    agentStatus.silenceProgress = ((SILENCE_THRESHOLD - remainingTime) / SILENCE_THRESHOLD) * 100
  }

  // 定期発話のカウントダウン計算
  if (!agentBehaviorSettings.periodicSpeech) {
    agentStatus.periodicCountdown = Math.ceil(PERIODIC_SPEECH_INTERVAL / 1000)
    agentStatus.periodicProgress = 0
  } else {
    const timeSinceLastPeriodic = now - lastPeriodicSpeech
    const remainingTime = Math.max(0, PERIODIC_SPEECH_INTERVAL - timeSinceLastPeriodic)
    agentStatus.periodicCountdown = Math.ceil(remainingTime / 1000)
    agentStatus.periodicProgress = ((PERIODIC_SPEECH_INTERVAL - remainingTime) / PERIODIC_SPEECH_INTERVAL) * 100
  }
  
  // エージェントの状態
  if (isActiveAgentSpeaking) {
    agentStatus.state = 'Speaking'
  } else {
    agentStatus.state = 'Listening'
  }
  
  // UIを更新
  updateUIElements()
}

/* ========== Update UI Elements =================================== */
function updateUIElements() {
  // 沈黙検知
  const silenceCountdownEl = document.getElementById('silence-countdown')
  const silenceProgressEl = document.getElementById('silence-progress')
  
  if (silenceCountdownEl) {
    silenceCountdownEl.textContent = agentStatus.silenceCountdown
  }

  if (silenceProgressEl) {
    silenceProgressEl.style.width = `${agentStatus.silenceProgress}%`
  }

  // 定期発話
  const periodicCountdownEl = document.getElementById('periodic-countdown')
  const periodicProgressEl = document.getElementById('periodic-progress')

  if (periodicCountdownEl) {
    periodicCountdownEl.textContent = agentStatus.periodicCountdown
  }

  if (periodicProgressEl) {
    // Smooth animation between 1-second updates
    if (periodicProgressEl.dataset.smoothTransition !== 'true') {
      periodicProgressEl.style.transition = 'width 1s linear'
      periodicProgressEl.dataset.smoothTransition = 'true'
    }
    periodicProgressEl.style.width = `${agentStatus.periodicProgress}%`
  }

  // エージェント状態
  const stateEl = document.getElementById('agent-current-state')
  const lastResponseEl = document.getElementById('agent-last-response')
  const nameDetectionEl = document.getElementById('name-detection-last')

  if (stateEl) {
    stateEl.textContent = agentStatus.state
    stateEl.style.color = agentStatus.state === 'Speaking' ? '#dc3545' : '#28a745'
  }

  if (lastResponseEl) {
    lastResponseEl.textContent = agentStatus.lastResponse
  }

  if (nameDetectionEl) {
    nameDetectionEl.textContent = agentStatus.lastNameDetection
  }
}

/* ========== Start UI Updates ===================================== */
function startUIUpdates() {
  if (uiUpdateTimer) {
    clearInterval(uiUpdateTimer)
  }
  
  // Use a wrapper so if updateAgentStatusUI is redefined later,
  // the interval always calls the latest definition.
  uiUpdateTimer = setInterval(() => updateAgentStatusUI(), 1000) // 1秒間隔で更新
}

/* ========== Initialize Active Agent After Join ====================== */
function initializeActiveAgentAfterJoin() {
  
  // タイマー状態をリセット
  resetAllAgentTimers()
  
  // 全クライアントで同じタイミングでタイマーを開始
  const now = Date.now()
  lastSpeechActivity = now
  lastPeriodicSpeech = now
  
  // エージェント状態をリセット
  agentStatus.state = 'Listening'
  agentStatus.lastResponse = 'Never'
  agentStatus.silenceCountdown = agentBehaviorSettings.silenceThresholdSeconds
  agentStatus.periodicCountdown = Math.ceil(PERIODIC_SPEECH_INTERVAL / 1000)
  agentStatus.silenceProgress = 0
  agentStatus.periodicProgress = 0
  
  
  // タイマーの開始はタイマー・マスター（セッションマスター or ?master）のみ
  if (isTimerMasterClient()) {
    
    // 沈黙検知タイマーを開始
    startSilenceDetection()

    // 定期発話タイマーを開始
    startPeriodicSpeech()

    // タイマー同期メッセージを送信
    broadcastTimerSyncMessage()
    
  } else {
  }
  
  // UI更新を開始
  startUIUpdates()
}

/* ========== Reset All Agent Timers =================================== */
function resetAllAgentTimers() {
  // 沈黙検知タイマーをクリア
  if (silenceDetectionTimer) {
    clearTimeout(silenceDetectionTimer)
    silenceDetectionTimer = null
  }
  
  // 定期発話タイマーをクリア
  if (periodicSpeechTimer) {
    clearInterval(periodicSpeechTimer)
    periodicSpeechTimer = null
  }
  
  // UI更新タイマーをクリア
  if (uiUpdateTimer) {
    clearInterval(uiUpdateTimer)
    uiUpdateTimer = null
  }
  
}

/* ========== Start Silence Detection ================================== */
function startSilenceDetection() {
  // マスターのみがsilence detectionを実行
  if (!isTimerMasterClient()) {
    return
  }

  // Before joining a Zoom session, never schedule speech triggers.
  if (!hasJoinedSession) {
    return
  }
  
  // 既存のタイマーをクリア
  if (silenceDetectionTimer) {
    clearTimeout(silenceDetectionTimer)
  }
  
  // 新しいタイマーを設定
  if (agentBehaviorSettings.silenceDetection) {
    const now = Date.now()
    const timeSinceLastSpeech = now - lastSpeechActivity
    const remainingTime = Math.max(0, SILENCE_THRESHOLD - timeSinceLastSpeech)

    silenceDetectionTimer = setTimeout(() => {
      if (!isActiveAgentSpeaking && !isUserSpeaking && agentBehaviorSettings.silenceDetection) {
        triggerSilenceResponse()
      }
    }, remainingTime)

  } else {
  }
}

/* ========== Broadcast Timer Sync Message ============================= */
function broadcastTimerSyncMessage() {
  if (syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN) {
    const syncMessage = {
      type: 'TIMER_SYNC',
      timestamp: new Date().toISOString(),
      masterId: client?.getCurrentUserInfo()?.userId || 'unknown',
      timers: {
        silenceThreshold: SILENCE_THRESHOLD,
        silenceThresholdSeconds: agentBehaviorSettings.silenceThresholdSeconds,
        periodicInterval: PERIODIC_SPEECH_INTERVAL,
        lastSpeechActivity: lastSpeechActivity,
        lastPeriodicSpeech: lastPeriodicSpeech
      },
      agentStatus: agentStatus
    }
    
    syncWebSocket.send(JSON.stringify(syncMessage))
  }
}

/* =======================================================================
   2. セッション離脱 - Helper Functions
   =====================================================================*/

/**
 * すべてのタイマーをクリアする
 */
function cleanupTimers() {

  // Clear all active timers
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

  addDebugMessage('INFO', 'LEAVE-CLEANUP', 'All timers cleared')
}

/**
 * すべてのビデオストリームを停止する
 */
function stopAllVideoStreams() {

  try {
    // Stop local video track
    if (window.localVideoTrack) {
      stream.stopVideo()
      window.localVideoTrack = null
      videoEncode = false
    }

    // Stop all remote video rendering
    remoteParticipants.forEach((participant, displayName) => {
      if (participant.hasVideo) {
        try {
          stream.stopRenderVideo(
            document.getElementById(`remote-video-canvas-${displayName}`),
            participant.userId
          )
        } catch (error) {
          console.error(`[Leave] Failed to stop video for ${displayName}:`, error)
        }
      }
    })

    addDebugMessage('INFO', 'LEAVE-CLEANUP', 'All video streams stopped')
  } catch (error) {
    console.error('[Leave] Error stopping video streams:', error)
    addDebugMessage('ERROR', 'LEAVE-CLEANUP', 'Failed to stop video streams', { error: error.message })
  }
}

/**
 * すべてのグローバル状態をリセットする
 */
function resetGlobalState() {

  // Reset participant tracking
  remoteParticipants.clear()
  remoteParticipantsByUserId.clear()
  activeVideoUsers.clear()
  videoProcessingUsers.clear()
  currentDisplayedUser = null

  // Reset session state
  participantCount = 0
  currentSessionUsers.clear()
  sessionId = null

  // Reset agent behavior state
  isAgentMaster = false
  isSessionHost = false
  isActiveAgentSpeaking = false
  isUserSpeaking = false
  lastSpeechActivity = Date.now()
  lastPeriodicSpeech = Date.now()

  // Reset transcript state
  transcriptBuffer = ''
  lastTranscriptTime = 0
  lastTranscriptText = ''
  lastTranscriptSpeaker = ''
  processedTranscripts.clear()
  lastKeywordTriggerMap.clear()

  // Reset conversation history
  conversationHistory = []
  conversationCounter = 0

  // Reset agent status
  agentStatus = {
    isListening: false,
    isSpeaking: false,
    lastActivity: null
  }

  addDebugMessage('INFO', 'LEAVE-CLEANUP', 'All global state reset')
}

/**
 * WebSocketでLeave通知を送信する
 */
function sendLeaveNotification() {

  if (syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN) {
    try {
      const leaveMessage = {
        type: 'USER_LEAVE',
        userId: client?.getCurrentUserInfo()?.userId || 'unknown',
        displayName: client?.getCurrentUserInfo()?.displayName || 'unknown',
        timestamp: new Date().toISOString(),
        wasAgentMaster: isAgentMaster
      }

      syncWebSocket.send(JSON.stringify(leaveMessage))
      addDebugMessage('INFO', 'LEAVE-CLEANUP', 'Leave notification sent via WebSocket', leaveMessage)
    } catch (error) {
      console.error('[Leave] Failed to send leave notification:', error)
      addDebugMessage('ERROR', 'LEAVE-CLEANUP', 'Failed to send leave notification', { error: error.message })
    }
  } else {
  }
}

/**
 * UIをリセットする
 */
function resetUI() {

  try {
    // Clear remote user label
    const labelElement = document.getElementById('remote-user-label')
    if (labelElement) {
      labelElement.textContent = 'Remote User'
    }

    // Remove all remote canvases
    remoteCanvases.forEach((canvasInfo, displayName) => {
      removeRemoteUserCanvas(displayName)
    })
    remoteCanvases.clear()

    // Update participants UI
    updateParticipantsUI()

    // Clear debug messages if needed
    debugMessages = []

    addDebugMessage('INFO', 'LEAVE-CLEANUP', 'UI reset complete')
  } catch (error) {
    console.error('[Leave] Error resetting UI:', error)
    addDebugMessage('ERROR', 'LEAVE-CLEANUP', 'Failed to reset UI', { error: error.message })
  }
}

/**
 * WebSocket接続を閉じる
 */
function closeWebSocketConnection() {

  if (syncWebSocket) {
    try {
      if (syncWebSocket.readyState === WebSocket.OPEN || syncWebSocket.readyState === WebSocket.CONNECTING) {
        syncWebSocket.close()
      }
      syncWebSocket = null
      addDebugMessage('INFO', 'LEAVE-CLEANUP', 'WebSocket connection closed')
    } catch (error) {
      console.error('[Leave] Error closing WebSocket:', error)
      addDebugMessage('ERROR', 'LEAVE-CLEANUP', 'Failed to close WebSocket', { error: error.message })
    }
  }
}

/* =======================================================================
   2. セッション離脱 - Confirmation and Main Function
   =====================================================================*/
/**
 * 離脱前の確認ダイアログを表示
 */
async function confirmLeaveSession() {
  const shouldLeave = await confirm('Are you sure you want to leave the session?')
  if (shouldLeave) {
    leaveSession()
  } else {
  }
}

/**
 * セッション離脱処理
 */
function leaveSession() {
  addDebugMessage('INFO', 'LEAVE-START', 'Initiating session leave process')

  try {
    // Get current user info before cleanup
    const { isHost } = client.getCurrentUserInfo()

    // Phase 1: Send leave notification while WebSocket is still available
    sendLeaveNotification()

    // Phase 2: Leave Zoom session
    client.leave(isHost)

    addDebugMessage('INFO', 'LEAVE-COMPLETE', 'Session leave completed, returning to lobby')

    // Phase 3: Return to lobby
    setTimeout(() => {
      resetToLobby()
    }, 500)  // Brief delay to ensure Zoom leave completes

  } catch (error) {
    console.error('[Leave] Error during leave process:', error)
    addDebugMessage('ERROR', 'LEAVE-ERROR', 'Failed to complete leave process', { error: error.message })

    // Even on error, try to leave and reload
    try {
      const { isHost } = client.getCurrentUserInfo()
      client.leave(isHost)
    } catch (e) {
      console.error('[Leave] Failed to call client.leave():', e)
    }

    // Return to lobby on error
    setTimeout(() => {
      resetToLobby()
    }, 500)
  }
}

/**
 * Return to lobby screen after leaving session
 */
function resetToLobby() {

  try {
    // Hide call UI
    const mainDiv = document.getElementById('main')
    if (mainDiv) {
      mainDiv.style.display = 'none'
    }
    const inputFormsDiv = document.getElementById('input-forms')
    if (inputFormsDiv) {
      inputFormsDiv.classList.add('hidden')
      inputFormsDiv.style.display = 'none'
    }

    // Clear lobby inputs for next join
    const sessionNameInput = document.getElementById('lobby-session-name')
    if (sessionNameInput) sessionNameInput.value = ''
    const sessionPwdInput = document.getElementById('lobby-session-pwd')
    if (sessionPwdInput) sessionPwdInput.value = ''
    const displayNameInput = document.getElementById('lobby-display-name')
    if (displayNameInput) displayNameInput.value = ''

    // Show lobby screen
    const lobbyScreen = document.getElementById('lobby-screen')
    if (lobbyScreen) {
      lobbyScreen.style.display = 'flex'
    }

    // Clear session info from storage (F5 recovery no longer needed)
    sessionStorage.removeItem('sessionInfo')

    // Load active sessions for dropdown
    loadSessionsList()

    // Reset global variables
    ZoomVideo = null
    client = null
    stream = null
    hasJoinedSession = false

    addDebugMessage('INFO', 'LOBBY-RETURN', 'Returned to lobby screen, ready for new session')
  } catch (error) {
    console.error('[Leave] Error returning to lobby:', error)
    addDebugMessage('ERROR', 'LOBBY-RETURN', 'Failed to return to lobby', { error: error.message })
    // Force reload as fallback
    window.location.reload()
  }
}

/* =======================================================================
   3. ライブ トランスクリプト start / stop
   =====================================================================*/
function startTranscript() {
  
  if (!client) {
    console.error('[ERROR] Client not available')
    return
  }
  
  const tx = client.getLiveTranscriptionClient()
  
  tx.startLiveTranscription()
    .then(() => {
      return tx.setSpeakingLanguage('en')
    })
    .then(() => {
    })
    .catch(e => {
      console.error('[ERROR] startLiveTranscription:', e)
      console.error('[ERROR] Full error object:', JSON.stringify(e, null, 2))
    })
}

function stopTranscript() {
  
  if (!client) {
    console.error('[ERROR] Client not available')
    return
  }
  
  const tx = client.getLiveTranscriptionClient()
  
  // SDK 1.10 以降
  if (typeof tx.stopLiveTranscription === 'function') {
    tx.stopLiveTranscription()
      .then(() => {})
      .catch(e => console.error('[ERROR] stopLiveTranscription:', e))
  } else {
    // 旧 API 互換
    tx.disableCaptions()
  }
}

/* =======================================================================
   4. オーディオ
   =====================================================================*/
async function audioStart() {
  try {
    await stream.startAudio()
  } catch (e) { console.error('[ERROR] audioStart:', e) }
}

/* =======================================================================
   5. カメラ（ローカル映像）
   =====================================================================*/
async function cameraStartStop() {
  const isOn = await stream.isCapturingVideo()
  const { userId } = client.getCurrentUserInfo()

  if (!window.localVideoTrack) {
    window.localVideoTrack = ZoomVideo.createLocalVideoTrack()
  }
  toggleSelfVideo(stream, window.localVideoTrack, userId, !isOn)
}

/* --- Self Video (video tag) ------------------------------------------ */
async function toggleSelfVideo(mediaStream, track, userId, enable) {
  const tag = document.getElementById('self-video-videotag')
  const placeholder = document.getElementById('self-video-placeholder')
  if (enable) {
    tag.style.visibility = 'visible'
    await track.start(tag)
    await mediaStream.startVideo({ videoElement: tag, hd: true })
    selfVideoEnabled = true
    if (placeholder) placeholder.style.display = 'none'
    console.log('[INFO] self video ON')
  } else {
    await track.stop()
    await mediaStream.stopVideo()
    selfVideoEnabled = false
    tag.srcObject = null
    tag.style.visibility = 'hidden'
    if (placeholder) placeholder.style.display = 'block'
    console.log('[INFO] self video OFF')
  }
}

/* --- Far‑end Video (canvas) ------------------------------------------ */
async function toggleFarVideo(mediaStream, userId, enable, targetCanvas = null) {
  const canvas = targetCanvas || document.getElementById('far-video-canvas')
  
  
  // 詳細なデバッグ情報
  const currentUserId = client ? client.getCurrentUserInfo().userId : 'unknown'
  
  // 自分のビデオを far-video-canvas に表示しようとしている場合は警告と阻止
  if (userId === currentUserId) {
    console.warn(`[DEBUG TOGGLE] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> BLOCKING self video render attempt!`)
    return // 処理を停止
  }
  
  if (enable) {
    
    if (!canvas) {
      console.error(`[DEBUG TOGGLE] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Canvas is null!`)
      return
    }
    
    // Canvas要素の実際のサイズを取得
    const rect = canvas.getBoundingClientRect()
    
    // 適切なアスペクト比（16:9）でサイズを設定
    let width = Math.floor(rect.width)
    let height = Math.floor(rect.height)
    
    // Canvas要素の内部サイズを明示的に設定（高解像度化）
    // Limit pixelRatio for mobile devices to prevent rendering failures
    const isMobile = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
    const maxPixelRatio = isMobile ? 2 : 3; // Limit mobile to max 2x
    const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
    
    canvas.width = width * pixelRatio
    canvas.height = height * pixelRatio
    
    // CSSサイズは維持
    canvas.style.width = width + 'px'
    canvas.style.height = height + 'px'
    
    // リモートビデオをCanvas全体にレンダリング（Canvas内部サイズを使用）
    try {
      await safeRenderVideo(mediaStream, canvas, userId, canvas.width, canvas.height, 0, 0, 3)
      
      canvas.style.borderRadius = '8px'
      
    } catch (error) {
      console.error(`[DEBUG TOGGLE] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: renderVideo FAILED:`, error)
      console.error(`[DEBUG TOGGLE] Error details:`, error.message)
      throw error
    }
    
  } else {
    
    try {
      await mediaStream.stopRenderVideo(canvas, userId)
      await mediaStream.clearVideoCanvas(canvas, userId)
      
      canvas.style.border = ''
      
    } catch (error) {
      console.error(`[DEBUG TOGGLE] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Error stopping video:`, error)
    }
  }
  
}

/* =======================================================================
   6. デコーダ準備待ちユーティリティ
   =====================================================================*/
async function waitForVideoDecoder(ms, userId) {
  for (let i = 0; i < 10; i++) {
    await sleep(ms)
    if (videoDecode) {
      toggleFarVideo(stream, userId, true)
      break
    }
  }
}

const sleep = (ms) => new Promise(res => setTimeout(res, ms))

