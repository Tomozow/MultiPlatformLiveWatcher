// 修正後 - スロットリングを適用
let lastCheck = 0;
document.addEventListener('visibilitychange', () => {
  const now = Date.now();
  if (document.visibilityState === 'visible' && (now - lastCheck) > 60000) { // 1分以上経過
    chrome.runtime.sendMessage({ action: 'checkStreams', platform: 'youtube' });
    lastCheck = now;
  }
}); 