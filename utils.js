// デバッグ関連の共通関数
function logMessage(message, data) {
  if (chrome.runtime && chrome.runtime.id) {
    chrome.storage.local.get(['settings'], result => {
      if (result.settings && result.settings.debugModeEnabled) {
        const context = document.title || 'background';
        console.log(`[${new Date().toISOString()}][${context}] ${message}`, data || '');
      }
    });
  }
}

// メッセージ送信前にログを記録
function sendMessageWithLog(message) {
  logMessage(`Sending message: ${message.action}`, message);
  chrome.runtime.sendMessage(message, response => {
    logMessage(`Response for ${message.action}:`, response);
  });
}

// エクスポート
if (typeof module !== 'undefined') {
  module.exports = {
    logMessage,
    sendMessageWithLog
  };
}

// 日付のフォーマット
const Utils = {
  formatDate: function(date, format) {
    if (format === 'time') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleString();
  }
};

// グローバルに公開
if (typeof window !== 'undefined') {
  window.Utils = Utils;
} 