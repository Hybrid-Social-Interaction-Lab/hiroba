/* =========================================================================
   Zoom Video SDK  ― 完全版サンプル (index.js)
   ・ローカル／リモート映像の ON/OFF
   ・音声開始
   ・ライブトランスクリプト Start／Stop
   ・メディア SDK 状態検知
   * バージョン: @zoom/videosdk 1.x
   ------------------------------------------------------------------------- */

// FILE VERSION CHECK - This should appear in console immediately

/* ========== 詳細ログシステム ========================================== */
/* ========== 詳細ログシステム ========================================== */
class DetailedLogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000;
    this.sessionId = Date.now().toString();
  }
  
  log(level, category, message, data = null) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      category,
      message,
      data,
      sessionId: this.sessionId,
      userId: (typeof client !== 'undefined' && client) ? client.getCurrentUserInfo()?.userId || 'unknown' : 'no-client',
      userName: (typeof client !== 'undefined' && client) ? client.getCurrentUserInfo()?.displayName || 'unknown' : 'no-client'
    };
    
    this.logs.push(logEntry);
    
    // Limit log size
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
    
    // Console output with enhanced formatting
    const dataStr = data ? ` | Data: ${JSON.stringify(data)}` : '';
    const userInfo = `[${logEntry.userName}(${logEntry.userId})]`;
    
    // Also send to server for persistent storage if available
    this.sendToServer(logEntry);
  }
  
  sendToServer(logEntry) {
    try {
      if (typeof syncWebSocket !== 'undefined' && syncWebSocket && syncWebSocket.readyState === WebSocket.OPEN) {
        syncWebSocket.send(JSON.stringify({
          type: 'DETAILED_LOG',
          logEntry: logEntry
        }));
      }
    } catch (e) {
      // Ignore WebSocket errors to prevent log loops
    }
  }
  
  exportLogs() {
    const logText = this.logs.map(log => 
      `[${log.timestamp}] [${log.level}] [${log.category}] [${log.userName}(${log.userId})] ${log.message} ${log.data ? JSON.stringify(log.data) : ''}`
    ).join('\n');
    
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video-debug-${this.sessionId}.log`;
    a.click();
    URL.revokeObjectURL(url);
  }
  
  getFilteredLogs(category = null, level = null) {
    return this.logs.filter(log => {
      if (category && log.category !== category) return false;
      if (level && log.level !== level) return false;
      return true;
    });
  }
  
  // Get critical video issues
  getVideoIssues() {
    return this.logs.filter(log => 
      log.category.includes('VIDEO') || 
      log.category.includes('CANVAS') || 
      log.category.includes('RENDER') ||
      log.message.includes('No Video') ||
      log.message.includes('renderVideo') ||
      log.level === 'ERROR'
    );
  }
  
  // Analyze logs for troubleshooting
  analyzeVideoIssues() {
    const videoIssues = this.getVideoIssues();
    const analysis = {
      totalIssues: videoIssues.length,
      errorsByCategory: {},
      commonPatterns: [],
      timeRange: null,
      recommendations: []
    };
    
    // Count errors by category
    videoIssues.forEach(log => {
      const category = log.category;
      analysis.errorsByCategory[category] = (analysis.errorsByCategory[category] || 0) + 1;
    });
    
    // Find common patterns
    const patterns = {
      'Userundefined': videoIssues.filter(log => log.message.includes('undefined')).length,
      'OffscreenCanvas': videoIssues.filter(log => log.message.includes('OffscreenCanvas')).length,
      'No Video': videoIssues.filter(log => log.message.includes('No Video')).length,
      'renderVideo failures': videoIssues.filter(log => log.message.includes('renderVideo') && log.level === 'ERROR').length,
      'Host visibility issues': videoIssues.filter(log => log.message.includes('host') || log.message.includes('Host')).length
    };
    
    analysis.commonPatterns = Object.entries(patterns)
      .filter(([_, count]) => count > 0)
      .map(([pattern, count]) => ({ pattern, count }));
    
    // Add recommendations based on patterns
    if (patterns['Userundefined'] > 0) {
      analysis.recommendations.push('Fix undefined userId validation in participant management');
    }
    if (patterns['OffscreenCanvas'] > 0) {
      analysis.recommendations.push('Improve OffscreenCanvas handling in video rendering');
    }
    if (patterns['No Video'] > 0) {
      analysis.recommendations.push('Investigate video decode/encode state synchronization');
    }
    if (patterns['Host visibility issues'] > 0) {
      analysis.recommendations.push('Check asymmetric video display between host and remote participants');
    }
    
    // Time range
    if (videoIssues.length > 0) {
      const timestamps = videoIssues.map(log => new Date(log.timestamp));
      analysis.timeRange = {
        start: new Date(Math.min(...timestamps)),
        end: new Date(Math.max(...timestamps))
      };
    }
    
    return analysis;
  }
  
  // Export analysis report
  exportAnalysisReport() {
    const analysis = this.analyzeVideoIssues();
    const report = `Video Issue Analysis Report
============================
Generated: ${new Date().toISOString()}
Session ID: ${this.sessionId}

SUMMARY:
- Total Issues: ${analysis.totalIssues}
- Time Range: ${analysis.timeRange ? `${analysis.timeRange.start.toISOString()} to ${analysis.timeRange.end.toISOString()}` : 'N/A'}

ERRORS BY CATEGORY:
${Object.entries(analysis.errorsByCategory).map(([cat, count]) => `- ${cat}: ${count}`).join('\n')}

COMMON PATTERNS:
${analysis.commonPatterns.map(p => `- ${p.pattern}: ${p.count} occurrences`).join('\n')}

RECOMMENDATIONS:
${analysis.recommendations.map(r => `- ${r}`).join('\n')}

DETAILED VIDEO ISSUES:
${this.getVideoIssues().map(log => 
  `[${log.timestamp}] [${log.level}] [${log.category}] [${log.userName}(${log.userId})] ${log.message} ${log.data ? JSON.stringify(log.data) : ''}`
).join('\n')}`;
    
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `video-analysis-${this.sessionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    return analysis;
  }
}

const detailedLogger = new DetailedLogger();

// Show video debug summary function for UI
function showVideoDebugSummary() {
  const analysis = detailedLogger.analyzeVideoIssues();
  const videoIssues = detailedLogger.getVideoIssues();

  let summary = `Video Debug Summary (${new Date().toISOString()})\n`;
  summary += `=====================================\n\n`;
  summary += `TOTAL ISSUES: ${analysis.totalIssues}\n`;
  summary += `SESSION ID: ${detailedLogger.sessionId}\n\n`;

  if (analysis.timeRange) {
    summary += `TIME RANGE: ${analysis.timeRange.start.toISOString()} to ${analysis.timeRange.end.toISOString()}\n\n`;
  }

  summary += `ERRORS BY CATEGORY:\n`;
  Object.entries(analysis.errorsByCategory).forEach(([category, count]) => {
    summary += `- ${category}: ${count}\n`;
  });

  summary += `\nCOMMON PATTERNS:\n`;
  analysis.commonPatterns.forEach(pattern => {
    summary += `- ${pattern.pattern}: ${pattern.count} occurrences\n`;
  });

  summary += `\nRECOMMENDATIONS:\n`;
  analysis.recommendations.forEach(rec => {
    summary += `- ${rec}\n`;
  });

  summary += `\nRECENT ISSUES (Last 5):\n`;
  videoIssues.slice(-5).forEach(issue => {
    summary += `[${issue.timestamp}] [${issue.level}] [${issue.category}] ${issue.message}\n`;
  });

  alert(summary);

  return analysis;
}

/* ========== Global VideoFrame Error Handling ======================= */
// Track VideoFrame rotation errors and implement recovery
let videoFrameErrorCount = 0;
let lastVideoFrameError = null;
const MAX_VIDEOFRAME_ERRORS = 10;

// Safe wrapper for renderVideo that prevents VideoFrame rotation errors
