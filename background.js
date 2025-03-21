// キャンセル可能なリクエストを管理するオブジェクト
let activeRequests = {
  twitch: null,
  youtube: null,
  twitcasting: null
};

// メッセージリスナーに追加
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 既存のコード...

  // 更新キャンセルリクエスト
  if (request.action === 'cancelUpdates') {
    const platforms = request.platforms || [];
    console.log('更新キャンセルリクエスト:', platforms);
    
    platforms.forEach(platform => {
      if (activeRequests[platform]) {
        console.log(`${platform}のリクエストをキャンセル`);
        // fetch APIのabortControllerを使用している場合はabort()
        if (activeRequests[platform].abort) {
          activeRequests[platform].abort();
        }
        activeRequests[platform] = null;
      }
    });
    
    sendResponse({ success: true, message: '更新をキャンセルしました' });
    return true;
  }
  
  // 配信チェックのリクエスト処理を修正
  if (request.action === 'checkStreams') {
    const platform = request.platform;
    
    // リクエストキャンセル用のAbortControllerを作成
    const controller = new AbortController();
    activeRequests[platform] = controller;
    
    // ここでリクエスト処理...
    // 例: fetchAPIを使う場合は { signal: controller.signal } を追加
    
    // 処理完了後
    activeRequests[platform] = null;
    sendResponse({ success: true, streams: [] });
    
    return true;
  }

  // 他のリクエスト処理...
}); 