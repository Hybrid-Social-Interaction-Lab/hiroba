/* =======================================================================
   7. Remote Participants Management (Multiple Canvas System)
   =====================================================================*/

// <i data-lucide="trash-2" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CLEANUP FUNCTION - Remove invalid participants with undefined userIds
function cleanupInvalidParticipants() {
  addDebugMessage('INFO', 'CLEANUP', 'Cleaning up invalid and duplicate participants');
  
  const invalidDisplayNames = [];
  const userIdMap = new Map(); // userId -> [displayNames] to detect duplicates
  
  // First pass: collect all participants and detect invalid/duplicate entries
  for (const [displayName, participant] of remoteParticipants.entries()) {
    // Check for invalid participants
    if (participant.userId === undefined || participant.userId === null || 
        displayName.includes('undefined') || displayName === 'User-undefined') {
      invalidDisplayNames.push(displayName);
      addDebugMessage('WARN', 'CLEANUP', `Found invalid participant: ${displayName}`, participant);
      continue;
    }
    
    // Track for duplicate detection
    if (!userIdMap.has(participant.userId)) {
      userIdMap.set(participant.userId, []);
    }
    userIdMap.get(participant.userId).push(displayName);
  }
  
  // Second pass: handle duplicates - keep only the shortest/cleanest displayName
  for (const [userId, displayNames] of userIdMap.entries()) {
    if (displayNames.length > 1) {
      
      // Sort by preference: real names first, then shorter fallback names
      displayNames.sort((a, b) => {
        // Prefer non-fallback names (those without "User" prefix)
        const aIsFallback = a.startsWith('User');
        const bIsFallback = b.startsWith('User');
        if (aIsFallback !== bIsFallback) {
          return aIsFallback ? 1 : -1;
        }
        // Among fallbacks, prefer shorter names
        return a.length - b.length;
      });
      
      const keepName = displayNames[0];
      const removNames = displayNames.slice(1);
      
      invalidDisplayNames.push(...removNames);
    }
  }
  
  // Remove invalid and duplicate participants
  for (const displayName of invalidDisplayNames) {
    const participantToRemove = remoteParticipants.get(displayName);
    if (participantToRemove?.userId) {
      removeRemoteParticipant(participantToRemove.userId);
    } else {
      // Fallback: remove canvas directly if no userId mapping
      removeRemoteUserCanvas(displayName);
      remoteParticipants.delete(displayName);
    }
  }
  
  // Clean up remoteParticipantsByUserId
  const invalidUserIds = [];
  for (const [userId, displayName] of remoteParticipantsByUserId.entries()) {
    if (userId === undefined || userId === null || userId === 'undefined') {
      invalidUserIds.push(userId);
    }
  }
  
  for (const userId of invalidUserIds) {
    remoteParticipantsByUserId.delete(userId);
  }
  
}
   
function createRemoteUserCanvas(displayName, userId) {
  addDebugMessage('INFO', 'CANVAS-CREATE', `Creating canvas for: ${displayName} (${userId})`);
  
  // 自分自身のcanvasを作成しようとしている場合はブロック（userIdのみで判定）
  const currentUserId = client?.getCurrentUserInfo()?.userId
  const currentDisplayName = client?.getCurrentUserInfo()?.displayName

  if (userId === currentUserId) {
    addDebugMessage('ERROR', 'CANVAS-CREATE', 'CRITICAL: Attempt to create canvas for self!', {
      userId, currentUserId, displayName, currentDisplayName
    });
    console.error(`[Canvas] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Attempt to create canvas for self!`)
    console.error(`[Canvas] userId: ${userId} === currentUserId: ${currentUserId}`)
    console.error(`[Canvas] displayName: "${displayName}" (currentDisplayName: "${currentDisplayName}")`)
    return null;
  }
  
  const mainLayout = document.getElementById('avatar-video-layout')
  const noUsersPlaceholder = document.getElementById('no-remote-users')
  const remoteUsersContainer = document.getElementById('remote-users-container')

  // Hide placeholder and its container when creating a legitimate remote user canvas
  if (noUsersPlaceholder) {
    addDebugMessage('DEBUG', 'CANVAS-CREATE', 'Hiding "No Remote Users" placeholder');
    noUsersPlaceholder.style.display = 'none'
  }

  // Hide the remote-users-container to prevent it from taking up a grid cell
  if (remoteUsersContainer) {
    remoteUsersContainer.style.display = 'none'
  }
  
  // Create canvas container (same structure as other video elements)
  const canvasContainer = document.createElement('div')
  canvasContainer.style.position = 'relative'
  canvasContainer.id = `remote-container-${displayName.replace(/[^a-zA-Z0-9]/g, '_')}`
  canvasContainer.className = 'remote-user-container'
  
  // Create canvas element (same class as other video canvases)
  const canvas = document.createElement('canvas')
  canvas.id = `remote-canvas-${displayName.replace(/[^a-zA-Z0-9]/g, '_')}`
  canvas.className = 'video-canvas remote-video'
  
  // Set canvas size to match avatar and self-video in grid (same as vrm-canvas size)
  // Limit pixelRatio for mobile devices to prevent rendering failures
  const isMobile = /Mobi|Android/i.test(navigator.userAgent) || window.innerWidth < 768;
  const maxPixelRatio = isMobile ? 2 : 3; // Limit mobile to max 2x
  const pixelRatio = Math.min(window.devicePixelRatio || 1, maxPixelRatio);
  
  // Use same size as other video elements in the grid
  canvas.width = 640 * pixelRatio;
  canvas.height = 480 * pixelRatio;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  
  // Create label (same class as other labels)
  const label = document.createElement('div')
  label.className = 'user-display-label'
  label.textContent = displayName
  label.id = `remote-label-${displayName.replace(/[^a-zA-Z0-9]/g, '_')}`
  
  // Create status indicator
  const statusIndicator = document.createElement('div')
  statusIndicator.style.cssText = `
    position: absolute;
    top: 5px;
    right: 5px;
    background: rgba(0,0,0,0.7);
    color: white;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 10px;
    z-index: 10;
  `
  statusIndicator.textContent = 'Connecting...'
  statusIndicator.id = `remote-status-${displayName.replace(/[^a-zA-Z0-9]/g, '_')}`
  
  // Create visibility toggle button
  const toggleButton = document.createElement('button')
  toggleButton.style.cssText = `
    position: absolute;
    top: 5px;
    left: 5px;
    background: rgba(0,0,0,0.7);
    color: white;
    border: none;
    border-radius: 3px;
    font-size: 10px;
    cursor: pointer;
    z-index: 10;
    padding: 2px 6px;
  `
  toggleButton.textContent = 'Toggle'
  toggleButton.title = `Toggle visibility for ${displayName}`
  toggleButton.onclick = () => toggleRemoteUserVisibility(displayName)
  
  // Add elements to container
  canvasContainer.appendChild(canvas)
  canvasContainer.appendChild(label)
  canvasContainer.appendChild(statusIndicator)
  canvasContainer.appendChild(toggleButton)
  
  // Add to main layout (restore original behavior)
  mainLayout.appendChild(canvasContainer)
  
  // Update grid layout to accommodate new remote user
  updateMainLayoutGrid()
  
  // Canvas already has fixed internal resolution of 480x360
  
  // Store canvas reference
  const canvasInfo = {
    canvas: canvas,
    container: canvasContainer,
    label: label,
    status: statusIndicator,
    toggleButton: toggleButton,
    userId: userId,
    isRendering: false,
    isVisible: true,
    hiddenByMaster: false
  }
  
  remoteCanvases.set(displayName, canvasInfo)
  applyMasterVideoVisibilityToHostCanvas()
  
  return canvasInfo
}

function removeRemoteUserCanvas(displayName) {

  const canvasInfo = remoteCanvases.get(displayName)
  if (canvasInfo) {

    // Stop rendering if active
    if (canvasInfo.isRendering) {
      try {
        toggleFarVideo(stream, canvasInfo.userId, false)
      } catch (e) {
      }
    }

    // Remove from DOM
    if (canvasInfo.container && canvasInfo.container.parentNode) {
      canvasInfo.container.parentNode.removeChild(canvasInfo.container)
    } else {
      console.warn(`[Canvas] Container not found in DOM for ${displayName}`)
    }

    // Remove from tracking
    remoteCanvases.delete(displayName)

  } else {
    console.warn(`[Canvas] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Canvas info not found for ${displayName}`)

    // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> FIX: Fallback - try to find and remove by element ID
    const sanitizedName = displayName.replace(/[^a-zA-Z0-9]/g, '_')
    const containerId = `remote-container-${sanitizedName}`
    const container = document.getElementById(containerId)

    if (container) {
      container.remove()
    } else {
      console.warn(`[Canvas] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> No container found with ID: ${containerId}`)
    }
  }

  // Update grid layout after removal
  updateMainLayoutGrid()

  // Show placeholder if no remote users
  if (remoteCanvases.size === 0) {
    const noUsersPlaceholder = document.getElementById('no-remote-users')
    if (noUsersPlaceholder) {
      noUsersPlaceholder.style.display = 'block'
    }
  }
}

function updateRemoteCanvasStatus(displayName, status, hasVideo = false) {
  const canvasInfo = remoteCanvases.get(displayName)
  if (canvasInfo) {
    canvasInfo.status.textContent = status
    canvasInfo.status.style.background = hasVideo ? 'rgba(0,128,0,0.8)' : 'rgba(128,128,128,0.8)'
  }
}

function updateMainLayoutGrid() {
  const mainLayout = document.getElementById('avatar-video-layout')
  if (!mainLayout) return

  // Count total video elements (avatars + self + visible remote users)
  const avatarCount = document.getElementById('avatar-canvases-container')
    ? document.getElementById('avatar-canvases-container').querySelectorAll('canvas').length
    : 3
  const selfCount = 1   // Fixed: self-video-videotag
  const visibleRemoteCount = Array.from(remoteCanvases.values()).filter(info => info.isVisible).length
  const totalCount = avatarCount + selfCount + visibleRemoteCount


  // Use 3 columns for better layout
  // Row 1: Avatar1, Avatar2, Avatar3
  // Row 2: Self, Remote1, Remote2, ...
  const columns = 3
  const rows = Math.ceil(totalCount / columns)

  // Calculate dynamic minimum height based on available space
  const minHeight = Math.max(250, Math.floor((window.innerHeight - 100) / rows))

  // Apply grid layout - 3 columns, rows expand automatically
  mainLayout.style.gridTemplateColumns = `repeat(${columns}, 1fr)`
  mainLayout.style.gridTemplateRows = `repeat(${rows}, minmax(${minHeight}px, 1fr))`

}

function resolveSessionHostUserId() {
  if (!client || typeof client.getAllUser !== 'function') {
    return null
  }

  try {
    const users = client.getAllUser()
    const hostUser = users.find((user) => user && user.isHost)
    return hostUser ? hostUser.userId : null
  } catch (error) {
    console.warn('[Master Visibility] Failed to resolve host user:', error)
    return null
  }
}

function refreshHostParticipantFlags() {
  const hostUserId = resolveSessionHostUserId()

  remoteParticipants.forEach((participant) => {
    participant.isHost = hostUserId !== null && participant.userId === hostUserId
  })

  return hostUserId
}

function applyMasterVideoVisibilityToHostCanvas() {
  const hostUserId = refreshHostParticipantFlags()
  if (hostUserId === null) {
    return
  }

  const hostDisplayName = remoteParticipantsByUserId.get(hostUserId)
  if (!hostDisplayName) {
    return
  }

  const hostCanvasInfo = remoteCanvases.get(hostDisplayName)
  if (!hostCanvasInfo) {
    return
  }

  const shouldShow = !!masterVideoVisibleForClients
  hostCanvasInfo.hiddenByMaster = !shouldShow
  hostCanvasInfo.isVisible = shouldShow
  hostCanvasInfo.container.style.display = shouldShow ? 'block' : 'none'
  hostCanvasInfo.toggleButton.textContent = shouldShow ? 'Toggle' : '<i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
  hostCanvasInfo.toggleButton.title = shouldShow ? `Hide ${hostDisplayName}` : `Hidden by master: ${hostDisplayName}`

  updateHiddenUsersUI()
  updateMainLayoutGrid()
}

function handleMasterVideoVisibilityUpdate(message) {
  masterVideoVisibleForClients = !(message && message.visible === false)
  updateMasterVideoVisibilityToggleUI()
  applyMasterVideoVisibilityToHostCanvas()
  syncHostMicrophoneWithMasterVisibility(masterVideoVisibleForClients)
}

async function syncHostMicrophoneWithMasterVisibility(visible) {
  // Hide/show the host's own self-video tile regardless of role
  const selfVideoWrapper = document.querySelector('#self-video-videotag')?.parentElement
  if (selfVideoWrapper) {
    selfVideoWrapper.style.display = visible ? '' : 'none'
  }

  if (!isSessionHost || !stream) {
    return
  }

  try {
    if (!visible) {
      await stream.stopAudio()
      masterVisibilityMutedHostMic = true
      return
    }

    await stream.startAudio()

    masterVisibilityMutedHostMic = false
  } catch (error) {
    console.warn('[Master Visibility] Failed to sync master microphone with visibility state:', error)
  }
}

function updateMasterVideoVisibilityToggleUI() {
  const toggles = document.querySelectorAll('#master-video-visibility-toggle, #master-video-visibility-toggle-public')
  if (!toggles || toggles.length === 0) {
    return
  }

  toggles.forEach((toggle) => {
    toggle.checked = !!masterVideoVisibleForClients
    toggle.disabled = !(isSessionHost || window.isMasterMode)
  })
}

function setupMasterVideoVisibilityToggle() {
  const toggles = document.querySelectorAll('#master-video-visibility-toggle, #master-video-visibility-toggle-public')
  if (!toggles || toggles.length === 0) {
    return
  }

  updateMasterVideoVisibilityToggleUI()

  toggles.forEach((toggle) => {
    if (toggle.dataset.listenerBound === 'true') {
      return
    }

    toggle.dataset.listenerBound = 'true'
    toggle.addEventListener('change', () => {
      const canControl = isSessionHost || window.isMasterMode
      if (!canControl) {
        updateMasterVideoVisibilityToggleUI()
        return
      }

      const visible = Boolean(toggle.checked)
      masterVideoVisibleForClients = visible
      applyMasterVideoVisibilityToHostCanvas()
      updateMasterVideoVisibilityToggleUI()
      syncHostMicrophoneWithMasterVisibility(masterVideoVisibleForClients)

      sendWebSocketMessage({
        type: 'MASTER_VIDEO_VISIBILITY_UPDATE',
        visible,
        masterId: client?.getCurrentUserInfo?.()?.userId || 'host',
        masterName: client?.getCurrentUserInfo?.()?.displayName || 'host',
        timestamp: new Date().toISOString()
      })
    })
  })
}

function toggleRemoteUserVisibility(displayName) {
  const canvasInfo = remoteCanvases.get(displayName)
  if (!canvasInfo) {
    console.error(`[Visibility] Canvas not found for ${displayName}`)
    return
  }

  if (canvasInfo.hiddenByMaster) {
    return
  }

  canvasInfo.isVisible = !canvasInfo.isVisible

  if (canvasInfo.isVisible) {
    // Show the video - restore full container and remove from hidden list
    canvasInfo.container.style.display = 'block'
    canvasInfo.toggleButton.textContent = 'Toggle'
    canvasInfo.toggleButton.title = `Hide ${displayName}`
  } else {
    // Hide the video - completely remove from grid to compact layout
    canvasInfo.container.style.display = 'none'
  }

  // Update hidden users UI
  updateHiddenUsersUI()

  // Update grid layout to reflect visibility changes
  updateMainLayoutGrid()
}

// Update the hidden users UI to show restore buttons
function updateHiddenUsersUI() {
  let hiddenUsersPanel = document.getElementById('hidden-users-panel')

  // Create panel if it doesn't exist
  if (!hiddenUsersPanel) {
    hiddenUsersPanel = document.createElement('div')
    hiddenUsersPanel.id = 'hidden-users-panel'
    hiddenUsersPanel.style.cssText = `
      position: fixed;
      bottom: 10px;
      right: 10px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 8px;
      border-radius: 5px;
      font-size: 12px;
      z-index: 1000;
      max-width: 200px;
    `
    document.body.appendChild(hiddenUsersPanel)
  }

  // Get list of hidden users
  const hiddenUsers = Array.from(remoteCanvases.entries())
    .filter(([name, info]) => !info.isVisible)
    .map(([name, info]) => name)

  // Update panel content
  if (hiddenUsers.length === 0) {
    hiddenUsersPanel.style.display = 'none'
  } else {
    hiddenUsersPanel.style.display = 'block'
    hiddenUsersPanel.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 5px;">Hidden Users:</div>
      ${hiddenUsers.map(name => `
        <div style="display: flex; align-items: center; gap: 5px; margin: 3px 0;">
          <button
            onclick="toggleRemoteUserVisibility('${name}')"
            style="
              background: #28a745;
              color: white;
              border: none;
              border-radius: 3px;
              padding: 2px 6px;
              cursor: pointer;
              font-size: 11px;
            "
            title="Show ${name}"
          ><i data-lucide="eye" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i></button>
          <span style="font-size: 11px;">${name}</span>
        </div>
      `).join('')}
    `
  }
}

/* =======================================================================
   7. Remote Participants Management
   =====================================================================*/
function addRemoteParticipant(userId, displayName) {
  addDebugMessage('INFO', 'PARTICIPANT-ADD', `Adding remote participant: ${displayName} (${userId})`);
  
  // Self-user check by display name
  const currentUserInfo = client ? client.getCurrentUserInfo() : null
  const currentDisplayName = currentUserInfo ? currentUserInfo.displayName : null
  const currentUserId = currentUserInfo ? currentUserInfo.userId : null
  
  addDebugMessage('DEBUG', 'PARTICIPANT-ADD', 'Current user info check', {
    currentDisplayName, currentUserId, targetDisplayName: displayName, targetUserId: userId
  });
  
  // ROOT CAUSE FIX: Prevent duplicate participants with same userId
  const existingDisplayName = remoteParticipantsByUserId.get(userId);
  if (existingDisplayName && existingDisplayName !== displayName) {
    addDebugMessage('WARN', 'PARTICIPANT-DUPLICATE', 
      `Duplicate userId detected! Updating existing participant instead of creating new one`, 
      { 
        existingDisplayName, 
        newDisplayName: displayName, 
        userId
      }
    );
    
    // Update the existing participant instead of creating a new one
    const existingParticipant = remoteParticipants.get(existingDisplayName);
    if (existingParticipant) {
      existingParticipant.hasVideo = true; // Update video status
      
      // Restart video if not currently rendering
      const canvasInfo = remoteCanvases.get(existingDisplayName);
      if (canvasInfo && !canvasInfo.isRendering) {
        addDebugMessage('INFO', 'PARTICIPANT-UPDATE', 'Restarting video for updated participant');
        safeVideoStart(userId, existingDisplayName);
      }
    }
    
    return; // Exit early, don't create duplicate
  }
  
  // Primary check: prevent adding self by userId only
  if (userId === currentUserId) {
    addDebugMessage('ERROR', 'PARTICIPANT-ADD', 'CRITICAL: Attempt to add self as remote participant by userId!', {
      userId, currentUserId, displayName, currentDisplayName
    });
    console.error(`[Participants] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Attempt to add self as remote participant by userId!`)
    console.error(`[Participants] userId: ${userId} === currentUserId: ${currentUserId}`)
    console.error(`[Participants] displayName: "${displayName}" (currentDisplayName: "${currentDisplayName}")`)
    console.trace('[Participants] Call stack for self-user addition:')
    return // 自分自身を追加しない
  }
  
  if (!displayName || displayName.trim() === '') {
    console.error(`[Participants] Rejecting participant with empty displayName: ${userId}`)
    return
  }
  const finalDisplayName = displayName
  const participant = {
    userId: userId,
    displayName: finalDisplayName,
    hasVideo: false,
    isDisplayed: false,
    isHost: resolveSessionHostUserId() === userId,
    addedAt: Date.now()
  }
  
  // Store by display name (primary)
  remoteParticipants.set(finalDisplayName, participant)
  // Store userId -> displayName mapping for backwards compatibility
  remoteParticipantsByUserId.set(userId, finalDisplayName)
  
  // Create dedicated canvas for this user
  const canvas = createRemoteUserCanvas(finalDisplayName, userId)
  updateRemoteCanvasStatus(finalDisplayName, 'Connected', false)
  
  // Check if this user already has video active and start rendering
  setTimeout(() => {
    try {
      // Try to get user info and check video state
      const allUsers = client.getAllUser()
      const userInfo = allUsers.find(u => u.userId === userId)
      
      // Force check for existing video stream
      checkAndStartVideoForParticipant(finalDisplayName, userId)
    } catch (e) {
    }
  }, 1000)
  
  updateParticipantsUI()
  
  // Debug: show all participants and their canvas status
  debugParticipantsList()
}

function debugParticipantsList() {
  remoteParticipants.forEach((data, displayName) => {
    const canvas = document.getElementById(`remote-canvas-${displayName}`)
  })
  remoteParticipantsByUserId.forEach((displayName, userId) => {
  })
}

function removeRemoteParticipant(userId) {
  // Get display name from userId mapping
  let displayName = remoteParticipantsByUserId.get(userId)
  const participant = displayName ? remoteParticipants.get(displayName) : null

  // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> FIX: If no displayName from mapping, search in remoteCanvases for matching userId
  if (!displayName) {
    for (const [name, canvasInfo] of remoteCanvases.entries()) {
      if (canvasInfo.userId === userId) {
        displayName = name
        break
      }
    }
  }

  if (displayName) {

    // 現在表示中のユーザーが離脱した場合
    if (currentDisplayedUser === displayName) {
      currentDisplayedUser = null
      const labelElement = document.getElementById('remote-user-label')
      if (labelElement) {
        labelElement.textContent = 'Remote User'
      }

      // 他に表示可能な参加者がいれば自動的に表示
      const nextParticipant = Array.from(remoteParticipants.values())
        .find(p => p.hasVideo && p.displayName !== displayName)
      if (nextParticipant) {
        displayParticipantVideo(nextParticipant.displayName)
      }
    }

    // <i data-lucide="wrench" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> FIX: Always remove canvas if displayName is found
    removeRemoteUserCanvas(displayName)

    // Clean up participant data if it exists
    if (participant) {
      remoteParticipants.delete(displayName)
    }
    remoteParticipantsByUserId.delete(userId)
    activeVideoUsers.delete(displayName)
    updateParticipantsUI()
    applyMasterVideoVisibilityToHostCanvas()

  } else {
    console.warn(`[Participants] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Could not find displayName for userId ${userId} - no canvas to remove`)
  }
}

function setParticipantVideoState(userId, hasVideo) {
  // Get display name from userId mapping
  const displayName = remoteParticipantsByUserId.get(userId)
  const participant = displayName ? remoteParticipants.get(displayName) : null
  
  if (participant && displayName) {
    participant.hasVideo = hasVideo
    
    if (hasVideo) {
      activeVideoUsers.add(displayName)
      // Update canvas status
      updateRemoteCanvasStatus(displayName, 'Video Active', true)
      
      // Start rendering video on this participant's dedicated canvas
      startParticipantVideoRendering(displayName, userId)
      
    } else {
      activeVideoUsers.delete(displayName)
      // Update canvas status
      updateRemoteCanvasStatus(displayName, 'No Video', false)
      
      // Stop rendering on this participant's canvas
      stopParticipantVideoRendering(displayName, userId)
    }
    
    updateParticipantsUI()  
  } else {
  }
}

function checkAndStartVideoForParticipant(displayName, userId) {
  
  if (!stream || !client) {
    return
  }
  
  try {
    // Force video state update - assume they have video if they're in the call
    const participant = remoteParticipants.get(displayName)
    if (participant) {
      participant.hasVideo = true
      activeVideoUsers.add(displayName)
      
      updateRemoteCanvasStatus(displayName, 'Attempting Video...', true)
      
      // Try to start rendering
      startParticipantVideoRendering(displayName, userId)
    }
  } catch (error) {
    console.error(`[Video Check] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Error checking video for ${displayName}:`, error)
    updateRemoteCanvasStatus(displayName, 'Video Check Failed', false)
  }
}

function startParticipantVideoRendering(displayName, userId) {
  
  const canvasInfo = remoteCanvases.get(displayName)
  if (!canvasInfo) {
    console.error(`[DEBUG RENDER] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Canvas not found for ${displayName}`)
    console.error(`[DEBUG RENDER] Available canvases:`, Array.from(remoteCanvases.keys()))
    return
  }
  
  if (canvasInfo.isRendering) {
    return
  }
  
  // Check video decoder availability
  if (!videoDecode) {
    setTimeout(() => startParticipantVideoRendering(displayName, userId), 500)
    return
  }
  
  if (!stream) {
    console.error(`[DEBUG RENDER] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Stream not available`)
    return
  }
  
  try {
    
    // Use the dedicated canvas for this participant
    toggleFarVideo(stream, userId, true, canvasInfo.canvas)
    canvasInfo.isRendering = true
    
    
    // Update status
    updateRemoteCanvasStatus(displayName, 'Video Active', true)
    
  } catch (error) {
    console.error(`[DEBUG RENDER] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL ERROR in startParticipantVideoRendering:`, error)
    console.error(`[DEBUG RENDER] Error stack:`, error.stack)
    updateRemoteCanvasStatus(displayName, 'Render Error', false)
  }
  
}

// 複数の方法でビデオ表示を試行するリトライ機能
function attemptVideoDisplayWithRetry(userId, displayName, maxRetries) {
  
  let attempts = 0
  
  function tryVideoDisplay() {
    attempts++
    
    // Method 1: Check if video is already available via peer-video-state-change
    const participant = remoteParticipants.get(displayName)
    if (participant && participant.hasVideo) {
      startParticipantVideoRendering(displayName, userId)
      return
    }
    
    // Method 2: Force video state check with renderVideo test
    testVideoAvailabilityAndStart(userId, displayName)
    
    // Method 3: Assume video is available and force start
    if (attempts <= 2) {
      setTimeout(() => {
        forceStartVideoForParticipant(userId, displayName)
      }, 2000)
    }
    
    // Schedule next retry if not at max attempts
    if (attempts < maxRetries) {
      const delay = Math.min(2000 * attempts, 10000) // Increasing delay, max 10s
      setTimeout(tryVideoDisplay, delay)
    } else {
      // Final attempt with force method
      setTimeout(() => {
        forceStartVideoForParticipant(userId, displayName)
      }, 5000)
    }
  }
  
  // Start first attempt immediately
  tryVideoDisplay()
}

// テスト用ビデオ可用性チェック
function testVideoAvailabilityAndStart(userId, displayName) {
  
  if (!stream || !videoDecode) {
    return
  }
  
  try {
    // Create temporary test canvas
    const testCanvas = document.createElement('canvas')
    testCanvas.width = 160
    testCanvas.height = 120
    testCanvas.style.position = 'absolute'
    testCanvas.style.left = '-9999px'
    testCanvas.style.top = '-9999px'
    document.body.appendChild(testCanvas)
    
    // Try rendering to test canvas with timeout
    const renderPromise = safeRenderVideo(stream, testCanvas, userId, 160, 120, 0, 0, 1)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Render timeout')), 5000)
    })
    
    Promise.race([renderPromise, timeoutPromise])
      .then(() => {
        setParticipantVideoState(userId, true)
        
        // Clean up test canvas
        setTimeout(() => {
          stream.stopRenderVideo(testCanvas, userId).catch(() => {})
          if (document.body.contains(testCanvas)) {
            document.body.removeChild(testCanvas)
          }
        }, 500)
        
        // Start actual rendering
        setTimeout(() => {
          startParticipantVideoRendering(displayName, userId)
        }, 1000)
      })
      .catch((error) => {
        
        // Clean up test canvas
        if (document.body.contains(testCanvas)) {
          document.body.removeChild(testCanvas)
        }
        
        // If timeout or error, try force start anyway
        if (error.message === 'Render timeout') {
          setTimeout(() => {
            forceStartVideoForParticipant(userId, displayName)
          }, 2000)
        }
      })
  } catch (error) {
    console.error(`[VIDEO TEST] Error testing video for ${displayName}:`, error)
  }
}

// 強制的にビデオを開始する関数
function forceStartVideoForParticipant(userId, displayName) {
  
  const participant = remoteParticipants.get(displayName)
  if (!participant) {
    console.error(`[FORCE VIDEO] Participant not found: ${displayName}`)
    return
  }
  
  // Force set video state
  participant.hasVideo = true
  activeVideoUsers.add(displayName)
  
  // Update UI
  updateRemoteCanvasStatus(displayName, 'Force Starting...', true)
  
  // Start rendering
  if (stream && videoDecode) {
    try {
      startParticipantVideoRendering(displayName, userId)
    } catch (error) {
      console.error(`[FORCE VIDEO] Error in force start:`, error)
      updateRemoteCanvasStatus(displayName, 'Force Start Failed', false)
    }
  } else {
    setTimeout(() => forceStartVideoForParticipant(userId, displayName), 2000)
  }
}

// 定期的にビデオ状態をチェックして修復する機能
function startVideoHealthMonitoring() {
  
  setInterval(() => {
    
    try {
      const allUsers = client.getAllUser()
      const currentUserId = client.getCurrentUserInfo().userId
      
      
      // Check for missing participants
      allUsers.forEach(user => {
        if (user.userId !== currentUserId) {
          const displayName = user.displayName || `User${user.userId}`
          
          if (!remoteParticipants.has(displayName)) {
            addRemoteParticipant(user.userId, displayName)
            attemptVideoDisplayWithRetry(user.userId, displayName, 3)
          } else {
            const participant = remoteParticipants.get(displayName)
            if (!participant.hasVideo && videoDecode && stream) {
              attemptVideoDisplayWithRetry(user.userId, displayName, 2)
            }
          }
        }
      })
      
      // Check for orphaned canvases
      remoteCanvases.forEach((canvasInfo, displayName) => {
        if (!remoteParticipants.has(displayName)) {
          cleanupRemoteCanvas(displayName)
        }
      })
      
    } catch (error) {
      console.error('[VIDEO HEALTH] Error during health check:', error)
    }
  }, 15000) // Check every 15 seconds
}

// Canvas cleanup function
function cleanupRemoteCanvas(displayName) {
  const canvasInfo = remoteCanvases.get(displayName)
  if (canvasInfo && canvasInfo.container && canvasInfo.container.parentNode) {
    canvasInfo.container.parentNode.removeChild(canvasInfo.container)
    remoteCanvases.delete(displayName)
  }
}

function stopParticipantVideoRendering(displayName, userId) {
  
  const canvasInfo = remoteCanvases.get(displayName)
  if (canvasInfo && canvasInfo.isRendering) {
    try {
      toggleFarVideo(stream, userId, false, canvasInfo.canvas)
      canvasInfo.isRendering = false
      
      // Clear canvas
      const ctx = canvasInfo.canvas.getContext('2d')
      ctx.clearRect(0, 0, canvasInfo.canvas.width, canvasInfo.canvas.height)
      ctx.fillStyle = '#333'
      ctx.fillRect(0, 0, canvasInfo.canvas.width, canvasInfo.canvas.height)
      ctx.fillStyle = '#999'
      ctx.font = '16px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('Video Stopped', canvasInfo.canvas.width / 2, canvasInfo.canvas.height / 2)
      
      
    } catch (error) {
      console.error(`[Video Render] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Error stopping video for ${displayName}:`, error)
    }
  }
}

function displayParticipantVideo(displayNameOrUserId) {
  
  // Check if input is displayName or userId and handle accordingly
  let displayName, userId, participant
  
  // First try as displayName
  participant = remoteParticipants.get(displayNameOrUserId)
  if (participant) {
    displayName = displayNameOrUserId
    userId = participant.userId
  } else {
    // Try as userId (backward compatibility)
    displayName = remoteParticipantsByUserId.get(displayNameOrUserId)
    if (displayName) {
      participant = remoteParticipants.get(displayName)
      userId = displayNameOrUserId
    }
  }
  
  if (!participant || !displayName || !userId) {
    console.error(`[Participants] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Could not find participant: ${displayNameOrUserId}`)
    return
  }
  
  // Self-video表示の絶対阻止 (by displayName)
  const currentUserInfo = client ? client.getCurrentUserInfo() : null
  const currentDisplayName = currentUserInfo ? currentUserInfo.displayName : null
  const currentUserId = currentUserInfo ? currentUserInfo.userId : null
  
  if (displayName === currentDisplayName || userId === currentUserId) {
    console.error(`[Participants] <i data-lucide="alert-triangle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> CRITICAL: Attempt to display self video!`)
    console.error(`[Participants] displayName: "${displayName}" === currentDisplayName: "${currentDisplayName}"`)
    console.error(`[Participants] userId: ${userId} === currentUserId: ${currentUserId}`)
    console.trace('[Participants] Call stack for self-video display attempt:')
    return
  }
  
  
  if (!participant.hasVideo) {
    return
  }
  
  
  // 現在表示中のユーザーを停止
  if (currentDisplayedUser && currentDisplayedUser !== displayName) {
    // Get userId for the currently displayed user for toggleFarVideo
    const currentParticipant = remoteParticipants.get(currentDisplayedUser)
    if (currentParticipant) {
      toggleFarVideo(stream, currentParticipant.userId, false)
    }
  }
  
  // 新しいユーザーを表示
  currentDisplayedUser = displayName
  participant.isDisplayed = true
  
  // 他の参加者のisDisplayedをfalseに
  remoteParticipants.forEach((p, name) => {
    if (name !== displayName) p.isDisplayed = false
  })
  
  // ビデオレンダリング
  
  if (!stream) {
    console.error(`[Participants] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Stream not available for video rendering`)
    return
  }
  
  if (videoDecode) {
    try {
      toggleFarVideo(stream, userId, true)
    } catch (error) {
      console.error(`[Participants] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Error in toggleFarVideo:`, error)
      console.error(`[Participants] Error details:`, {
        displayName: displayName,
        userId: userId,
        stream: !!stream,
        videoDecode: !!videoDecode
      })
      throw error // Re-throw to show user the error
    }
  } else {
    waitForVideoDecoder(500, userId)
  }
  
  // ラベル更新
  const labelElement = document.getElementById('remote-user-label')
  if (labelElement) {
    labelElement.textContent = displayName
  } else {
  }
  
  updateParticipantsUI()
  
}

function updateParticipantsUI() {

  // Update canvas statuses in multi-canvas system
  remoteParticipants.forEach((participant, displayName) => {
    const canvasInfo = remoteCanvases.get(displayName)
    if (canvasInfo) {
      canvasInfo.label.textContent = displayName
      updateRemoteCanvasStatus(displayName, participant.hasVideo ? 'Video Available' : 'No Video', participant.hasVideo)
    }
  })

  // Update host control panel participant list
  const hostPanelContainer = document.getElementById('participant-buttons')
  if (hostPanelContainer) {
    const canControl = typeof isSessionHost !== 'undefined' && isSessionHost ||
                       typeof isMasterMode !== 'undefined' && isMasterMode
    hostPanelContainer.innerHTML = ''
    const allParticipants = Array.from(remoteParticipants.values())
    if (allParticipants.length === 0) {
      hostPanelContainer.innerHTML = '<p class="text-muted" style="font-size: 12px; margin: 0;">No remote participants yet</p>'
    } else {
      allParticipants.forEach(participant => {
        const row = document.createElement('div')
        row.style.cssText = 'display:flex; align-items:center; gap:4px; padding:4px 0; border-bottom:1px solid #222;'
        const nameSpan = document.createElement('span')
        nameSpan.style.cssText = 'flex:1; font-size:11px; color:#ddd; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;'
        nameSpan.textContent = participant.displayName
        row.appendChild(nameSpan)
        if (canControl) {
          const renameBtn = document.createElement('button')
          renameBtn.type = 'button'
          renameBtn.className = 'btn btn-sm'
          renameBtn.style.cssText = 'font-size:9px; padding:1px 5px; background:#333; border:1px solid #555; color:#ccc;'
          renameBtn.title = 'Rename'
          renameBtn.innerHTML = '<i data-lucide="pencil" style="width:10px;height:10px;display:inline-block;vertical-align:middle;"></i>'
          renameBtn.onclick = () => {
            if (typeof window.renameParticipant === 'function') window.renameParticipant(participant.userId, participant.displayName)
          }
          const kickBtn = document.createElement('button')
          kickBtn.type = 'button'
          kickBtn.className = 'btn btn-sm'
          kickBtn.style.cssText = 'font-size:9px; padding:1px 5px; background:#3a1a1a; border:1px solid #663333; color:#ff7777;'
          kickBtn.title = 'Kick'
          kickBtn.innerHTML = '<i data-lucide="user-x" style="width:10px;height:10px;display:inline-block;vertical-align:middle;"></i>'
          kickBtn.onclick = () => {
            if (typeof window.kickParticipant === 'function') window.kickParticipant(participant.userId, participant.displayName)
          }
          row.appendChild(renameBtn)
          row.appendChild(kickBtn)
        }
        hostPanelContainer.appendChild(row)
      })
      if (window.lucide) lucide.createIcons()
    }
    // Enable/disable clear-participants-btn
    const clearBtn = document.getElementById('clear-participants-btn')
    if (clearBtn) clearBtn.disabled = allParticipants.length === 0
  }

  // Legacy fallback
  const container = document.getElementById('participants-buttons')
  const noParticipants = document.getElementById('no-participants')

  if (!container) {
    return
  }
  
  // Legacy button system (fallback)
  const existingButtons = container.querySelectorAll('.participant-button')
  existingButtons.forEach(btn => btn.remove())
  
  const participants = Array.from(remoteParticipants.values())
  
  if (participants.length === 0) {
    noParticipants.style.display = 'block'
    return
  }
  
  noParticipants.style.display = 'none'
  
  participants.forEach(participant => {
    const button = document.createElement('button')
    button.className = 'participant-button'
    button.style.cssText = `
      background: ${participant.isDisplayed ? '#4CAF50' : participant.hasVideo ? '#2196F3' : '#757575'};
      color: white;
      border: none;
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 9px;
      cursor: ${participant.hasVideo ? 'pointer' : 'default'};
      opacity: ${participant.hasVideo ? '1' : '0.6'};
      width: 100%;
      text-align: left;
    `
    
    const statusIcon = participant.isDisplayed ? '<i data-lucide="eye" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>' : participant.hasVideo ? '<i data-lucide="video" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>' : '<i data-lucide="video" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i><i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i>'
    button.textContent = `${statusIcon} ${participant.displayName}`
    button.title = participant.hasVideo ? 
      `Click to view ${participant.displayName}'s video` : 
      `${participant.displayName} has no video`
    
    if (participant.hasVideo) {
      button.addEventListener('click', () => {
        try {
          displayParticipantVideo(participant.displayName)
        } catch (error) {
          console.error(`[Participants] <i data-lucide="x-circle" style="width: 14px; height: 14px; display: inline-block; vertical-align: middle; margin-right: 4px;"></i> Error switching to participant:`, error)
          alert(`Error switching to participant ${participant.displayName}: ${error.message}`)
        }
      })
    }
    
    container.appendChild(button)
  })
}

function discoverExistingParticipants() {
  if (!client || !stream) return
  
  try {
    const allUsers = client.getAllUser()
    const currentUserId = client.getCurrentUserInfo().userId
    
    
    // ロバストな参加者追加 - 全員を確実に表示
    allUsers.forEach(user => {
      if (user.userId !== currentUserId) {
        const displayName = user.displayName
        if (!displayName || displayName.trim() === '') {
          return
        }

        // 既存チェック
        if (!remoteParticipantsByUserId.has(user.userId)) {
          addRemoteParticipant(user.userId, displayName)
          if (typeof user.muted === 'boolean') {
            updateParticipantMuteIcon(user.userId, user.muted)
          }
          if (user.bVideoOn) {
            setTimeout(() => safeVideoStart(user.userId, displayName), 3000)
          }
        } else {
          const canvasInfo = remoteCanvases.get(displayName)
          if (user.bVideoOn && canvasInfo && !canvasInfo.isRendering) {
            safeVideoStart(user.userId, displayName)
          }
        }
      }
    })
    
    
    // ロバスト機能: 2秒後に全参加者のビデオを強制的に開始
    setTimeout(() => {
      forceStartAllParticipantVideos()
    }, 2000)
    
    // REDUCED: Less aggressive periodic video starting - retry every 15 seconds
    setInterval(() => {
      forceStartAllParticipantVideos()
    }, 15000)
    
  } catch (error) {
  }
}

// ロバスト機能: すべての参加者のビデオを強制的に開始（シンプル版）
function forceStartAllParticipantVideos() {

  remoteParticipants.forEach((participant, displayName) => {
    if (!participant.userId) return
    const canvasInfo = remoteCanvases.get(displayName)
    // Only start if not already rendering
    if (canvasInfo && !canvasInfo.isRendering) {
      // Only start if Zoom reports video is on
      try {
        const allUsers = client.getAllUser()
        const userInfo = allUsers.find(u => u.userId === participant.userId)
        if (userInfo?.bVideoOn) {
          safeVideoStart(participant.userId, displayName)
        }
      } catch (e) { /* ignore */ }
    }
  })
}

// 参加者の実際のビデオ状態をチェックする関数
function checkParticipantVideoState(userId, displayName) {
  
  if (!stream || !videoDecode) {
    setTimeout(() => checkParticipantVideoState(userId, displayName), 1000)
    return
  }
  
  // より簡単な方法：直接 peer-video-state-change イベント後に少し待ってから
  // 実際にビデオが利用可能か確認
  
  // 1秒待ってから実際のレンダリングを試行
  setTimeout(() => {
    try {
      
      // 一時的なcanvasを作成
      const testCanvas = document.createElement('canvas')
      testCanvas.width = 160
      testCanvas.height = 120
      testCanvas.style.position = 'absolute'
      testCanvas.style.left = '-1000px'
      testCanvas.style.top = '-1000px'
      document.body.appendChild(testCanvas)
      
      // renderVideoを同期的に呼び出し、エラーが発生するかをチェック
      safeRenderVideo(stream, testCanvas, userId, 160, 120, 0, 0, 1)
      
      // 成功した場合（エラーが投げられなかった場合）
      setParticipantVideoState(userId, true)
      
      // 短時間後に停止してクリーンアップ
      setTimeout(() => {
        stream.stopRenderVideo(testCanvas, userId).catch(() => {})
        if (document.body.contains(testCanvas)) {
          document.body.removeChild(testCanvas)
        }
      }, 100)
      
      // UIを更新
      updateParticipantsUI()
      
    } catch (error) {
      setParticipantVideoState(userId, false)
      
      // UIを更新
      updateParticipantsUI()
    }
  }, 1000)
}

/* =======================================================================
   8. シグネチャ取得 (fetch 版)
   =====================================================================*/
