// キャンセル可能なリクエストを管理するオブジェクト
let activeRequests = {
  twitch: null,
  youtube: null,
  twitcasting: null
};

// 設定とデバッグモードの状態
let settings = {
  debugModeEnabled: false,
  testModeEnabled: false
};

// テスト用のダミーデータ
const testData = {
  twitch: [
    { id: 'test1', user_name: 'TestStreamer1', title: '[テスト] Twitchの配信', viewer_count: 128, game_name: 'テストゲーム', thumbnail_url: 'https://via.placeholder.com/440x248/6441a5/ffffff?text=Twitch+Test', started_at: new Date().toISOString() },
    { id: 'test2', user_name: 'TestStreamer2', title: '[テスト] Twitchの配信2', viewer_count: 256, game_name: 'テストゲーム2', thumbnail_url: 'https://via.placeholder.com/440x248/6441a5/ffffff?text=Twitch+Test2', started_at: new Date().toISOString() }
  ],
  youtube: [
    { id: 'yt-test1', channelTitle: 'TestYouTuber1', title: '[テスト] YouTubeのライブ', concurrentViewers: 512, thumbnail: 'https://via.placeholder.com/480x360/ff0000/ffffff?text=YouTube+Test', publishedAt: new Date().toISOString() },
    { id: 'yt-test2', channelTitle: 'TestYouTuber2', title: '[テスト] YouTubeのライブ2', concurrentViewers: 1024, thumbnail: 'https://via.placeholder.com/480x360/ff0000/ffffff?text=YouTube+Test2', publishedAt: new Date().toISOString() }
  ],
  twitcasting: [
    { id: 'tc-test1', name: 'TestTwitCaster1', title: '[テスト] ツイキャスの配信', viewers: 64, thumbnail: 'https://via.placeholder.com/480x360/35a8c2/ffffff?text=TwitCast+Test', created: Math.floor(Date.now() / 1000) },
    { id: 'tc-test2', name: 'TestTwitCaster2', title: '[テスト] ツイキャスの配信2', viewers: 128, thumbnail: 'https://via.placeholder.com/480x360/35a8c2/ffffff?text=TwitCast+Test2', created: Math.floor(Date.now() / 1000) }
  ]
};

// 設定を読み込む
function loadSettings() {
  chrome.storage.local.get(['settings'], data => {
    if (data.settings) {
      settings = { ...settings, ...data.settings };
      
      if (settings.debugModeEnabled) {
        console.log('デバッグモードが有効になっています');
      }
      
      if (settings.testModeEnabled) {
        console.log('テストモードが有効になっています');
      }
    }
  });
}

// 初期設定の読み込み
loadSettings();

// メッセージリスナーに追加
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 設定更新通知
  if (request.action === 'settingsUpdated') {
    if (request.settings) {
      settings = { ...settings, ...request.settings };
      
      if (settings.debugModeEnabled) {
        console.log('設定更新: デバッグモードが有効になっています');
      }
      
      if (settings.testModeEnabled) {
        console.log('設定更新: テストモードが有効になっています');
      }
    }
    
    sendResponse({ success: true });
    return true;
  }

  // 更新キャンセルリクエスト
  if (request.action === 'cancelUpdates') {
    const platforms = request.platforms || [];
    
    if (settings.debugModeEnabled) {
      console.log('更新キャンセルリクエスト:', platforms);
    }
    
    platforms.forEach(platform => {
      if (activeRequests[platform]) {
        if (settings.debugModeEnabled) {
          console.log(`${platform}のリクエストをキャンセル`);
        }
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
    
    if (settings.debugModeEnabled) {
      console.log(`${platform}の配信チェックリクエスト`);
    }
    
    // テストモードの場合はダミーデータを返す
    if (settings.testModeEnabled) {
      if (settings.debugModeEnabled) {
        console.log(`${platform}のテストデータを返します:`, testData[platform]);
      }
      
      setTimeout(() => {
        sendResponse({ success: true, streams: testData[platform] || [] });
      }, 1000); // 1秒の遅延を追加してリクエスト中の状態を模倣
      
      return true;
    }
    
    // リクエストキャンセル用のAbortControllerを作成
    const controller = new AbortController();
    activeRequests[platform] = controller;
    
    // ユーザーIDを取得
    chrome.storage.local.get(['authInfo'], data => {
      const userIds = data.authInfo?.twitcasting?.userIds || [];
      
      if (userIds.length === 0) {
        sendResponse({ success: true, streams: [] });
        activeRequests[platform] = null;
        return;
      }
      
      // ここでユーザーIDにコロンが含まれていても問題なく処理できるようにする
      // URLエンコードしてAPIリクエストに使用
      const encodedUserIds = userIds.map(id => encodeURIComponent(id));
      
      // ... ツイキャスAPIリクエスト処理 ...
      
      // 処理完了
      activeRequests[platform] = null;
      sendResponse({ success: true, streams: [] });
    });
    
    return true;
  }

  // 他のリクエスト処理...
}); 