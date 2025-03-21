// キャンセル可能なリクエストを管理するオブジェクトを統一
let activeRequests = {
  twitch: {
    controller: null,
    lastRequestTime: 0,
    isProcessing: false
  },
  youtube: {
    controller: null,
    lastRequestTime: 0,
    isProcessing: false
  },
  twitcasting: {
    controller: null,
    lastRequestTime: 0,
    isProcessing: false
  }
};

// リクエスト間隔の最小値（ミリ秒）
let MIN_REQUEST_INTERVAL = 10000; // 初期値: 10秒

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

// YouTubeデータを取得する関数
async function fetchYouTubeData(signal) {
  try {
    // チャンネル登録情報を一度だけ取得
    if (settings.debugModeEnabled) {
      console.log('YouTube API リクエスト: /subscriptions', { useAuth: true, hasToken: true });
    }
    
    const subscriptions = await fetchYouTubeSubscriptions(signal);
    
    if (settings.debugModeEnabled) {
      console.log(`YouTube: ${subscriptions.length}件のチャンネル登録情報を取得しました`);
    }
    
    // チャンネルIDリストから一度だけライブ配信を検索
    if (settings.debugModeEnabled) {
      console.log('YouTube API リクエスト: /search', { useAuth: false, hasToken: true });
    }
    
    const channelIds = subscriptions.map(sub => sub.channelId);
    const liveStreams = await fetchYouTubeLiveStreams(channelIds, signal);
    
    // 重要: platformプロパティを追加
    return liveStreams.map(stream => ({
      ...stream,
      platform: 'youtube' // プラットフォーム情報を追加
    }));
  } catch (error) {
    console.error('YouTube データ取得中にエラーが発生しました:', error);
    throw error;
  }
}

// チャンネル登録情報を取得する関数
async function fetchYouTubeSubscriptions(signal) {
  // テスト用に一時的にダミーデータを返す
  const subscriptions = [
    { channelId: 'channel1', title: 'テストチャンネル1' },
    { channelId: 'channel2', title: 'テストチャンネル2' }
  ];
  
  return subscriptions;
}

// ライブ配信を検索する関数
async function fetchYouTubeLiveStreams(channelIds, signal) {
  // テスト用に一時的にダミーデータを返す
  const streams = [
    { 
      id: 'yt-live1', 
      channelTitle: 'YouTubeChannel1', 
      title: '[実装中] YouTubeのライブ配信', 
      concurrentViewers: 512, 
      thumbnail: 'https://via.placeholder.com/480x360/ff0000/ffffff?text=YouTube+Test',
      publishedAt: new Date().toISOString()
    }
  ];
  
  return streams;
}

// 定期的にキャッシュやリクエスト状態をクリーンアップ
function cleanupResources() {
  Object.keys(activeRequests).forEach(platform => {
    // 長時間放置されたリクエストをキャンセル
    const now = Date.now();
    if (activeRequests[platform].isProcessing && 
        (now - activeRequests[platform].lastRequestTime) > 300000) { // 5分以上経過
      console.log(`放置された${platform}リクエストをキャンセルします`);
      if (activeRequests[platform].controller && activeRequests[platform].controller.abort) {
        activeRequests[platform].controller.abort();
      }
      activeRequests[platform].controller = null;
      activeRequests[platform].isProcessing = false;
    }
  });
}

// 10分ごとにクリーンアップを実行
setInterval(cleanupResources, 600000);

// Twitchデータを取得する関数を追加
async function fetchTwitchData(signal) {
  try {
    if (settings.debugModeEnabled) {
      console.log('Twitch API リクエスト: /streams');
    }
    
    // テスト用に一時的にダミーデータを返す
    const streams = [
      { 
        id: 'test1', 
        user_name: 'TwitchStreamer1', 
        title: '[実装中] Twitchの配信', 
        viewer_count: 128, 
        game_name: 'テストゲーム', 
        thumbnail_url: 'https://via.placeholder.com/440x248/6441a5/ffffff?text=Twitch+Test', 
        started_at: new Date().toISOString(),
        platform: 'twitch' // プラットフォーム情報を追加
      }
    ];
    
    return streams;
  } catch (error) {
    console.error('Twitch データ取得中にエラーが発生しました:', error);
    throw error;
  }
}

// 間隔を動的に調整
function adjustRequestInterval(platform, isUserInitiated) {
  // ユーザーによる明示的な更新の場合は、間隔を短くする
  if (isUserInitiated) {
    MIN_REQUEST_INTERVAL = 5000; // 5秒
    
    // 一定時間後に元に戻す
    setTimeout(() => {
      MIN_REQUEST_INTERVAL = 10000; // 10秒に戻す
    }, 60000); // 1分後
  }
}

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

  // 更新キャンセルリクエストも修正
  if (request.action === 'cancelUpdates') {
    const platforms = request.platforms || [];
    
    if (settings.debugModeEnabled) {
      console.log('更新キャンセルリクエスト:', platforms);
    }
    
    platforms.forEach(platform => {
      if (activeRequests[platform] && activeRequests[platform].controller) {
        if (settings.debugModeEnabled) {
          console.log(`${platform}のリクエストをキャンセル`);
        }
        if (activeRequests[platform].controller.abort) {
          activeRequests[platform].controller.abort();
        }
        activeRequests[platform].controller = null;
        activeRequests[platform].isProcessing = false;
      }
    });
    
    sendResponse({ success: true, message: '更新をキャンセルしました' });
    return true;
  }
  
  // 配信チェックのリクエスト処理を修正
  if (request.action === 'checkStreams') {
    const platform = request.platform;
    const isUserInitiated = request.isUserInitiated || false;
    
    // 間隔を調整
    adjustRequestInterval(platform, isUserInitiated);
    
    if (settings.debugModeEnabled) {
      console.log(`${platform}の配信チェックリクエスト`);
      console.log('呼び出し元のスタック:', new Error().stack);
    }
    
    // すべてのプラットフォームで同じ処理構造を使用
    if (['youtube', 'twitch', 'twitcasting'].includes(platform)) {
      // すでに処理中の場合は新しいリクエストを拒否
      if (activeRequests[platform].isProcessing) {
        if (settings.debugModeEnabled) {
          console.log(`${platform}のリクエストはすでに処理中です`);
        }
        sendResponse({ 
          success: true,  // ユーザー体験のためtrueを返す
          streams: [],    // 空の配列を返す
          info: '更新中',   // 情報メッセージ
          noRefresh: true  // 表示を更新しないフラグ
        });
        return true;
      }
      
      // 前回のリクエストからの経過時間をチェック
      const now = Date.now();
      const timeSinceLastUpdate = now - activeRequests[platform].lastRequestTime;
      if (timeSinceLastUpdate < MIN_REQUEST_INTERVAL) {
        if (settings.debugModeEnabled) {
          console.log(`${platform}のリクエスト間隔が短すぎます。スキップします`);
        }
        
        // 前回のデータがあれば再利用
        chrome.storage.local.get([`${platform}Data`], (data) => {
          const cachedData = data[`${platform}Data`] || [];
          
          sendResponse({ 
            success: true,  // 成功として処理
            streams: cachedData,  // キャッシュデータを返す
            info: `最近更新済み (${Math.floor(timeSinceLastUpdate/1000)}秒前)`,
            noRefresh: true  // 表示を更新しないフラグ
          });
        });
        
        return true;
      }
      
      // すでに進行中のリクエストがある場合はキャンセル
      if (activeRequests[platform].controller) {
        if (settings.debugModeEnabled) {
          console.log(`既存の${platform}リクエストをキャンセルします`);
        }
        if (activeRequests[platform].controller.abort) {
          activeRequests[platform].controller.abort();
        }
        activeRequests[platform].controller = null;
      }
      
      // テストモードの場合はダミーデータを返す
      if (settings.testModeEnabled) {
        if (settings.debugModeEnabled) {
          console.log(`${platform}のテストデータを返します:`, testData[platform]);
        }
        
        // テストデータにplatformプロパティを追加
        const streamsWithPlatform = testData[platform].map(stream => ({
          ...stream,
          platform: platform
        }));
        
        // データをキャッシュに保存
        chrome.storage.local.set({ [`${platform}Data`]: streamsWithPlatform });
        
        setTimeout(() => {
          sendResponse({ success: true, streams: streamsWithPlatform });
        }, 1000);
        
        return true;
      }
      
      // リクエスト状態を更新
      const controller = new AbortController();
      activeRequests[platform].controller = controller;
      activeRequests[platform].isProcessing = true;
      activeRequests[platform].lastRequestTime = now;
      
      // プラットフォーム別の処理を呼び出し
      let dataPromise;
      
      if (platform === 'youtube') {
        dataPromise = fetchYouTubeData(controller.signal);
      } else if (platform === 'twitch') {
        dataPromise = fetchTwitchData(controller.signal);
      } else if (platform === 'twitcasting') {
        // TwitCastingの処理は必要に応じて実装
        dataPromise = Promise.resolve([]);
      }
      
      // 非同期処理の開始
      dataPromise
        .then(streams => {
          if (settings.debugModeEnabled) {
            console.log(`${platform}のデータ取得が完了しました: ${streams.length}件`);
          }
          activeRequests[platform].controller = null;
          activeRequests[platform].isProcessing = false;
          
          // データをキャッシュに保存
          chrome.storage.local.set({ [`${platform}Data`]: streams });
          
          sendResponse({ success: true, streams: streams });
        })
        .catch(error => {
          if (error.name !== 'AbortError') {
            console.error(`${platform} API呼び出しエラー:`, error);
          }
          activeRequests[platform].controller = null;
          activeRequests[platform].isProcessing = false;
          
          // エラー時には前回のキャッシュデータがあれば使用
          chrome.storage.local.get([`${platform}Data`], (data) => {
            const cachedData = data[`${platform}Data`] || [];
            
            // エラーが発生したが、キャッシュデータがある場合
            if (cachedData.length > 0) {
              sendResponse({ 
                success: true, 
                streams: cachedData,
                info: 'エラーが発生しました。前回のデータを表示しています',
                error: error.message  // エラー情報も付加
              });
            } else {
              // キャッシュもない場合は失敗として処理
              sendResponse({ success: false, error: error.message });
            }
          });
        });
      
      return true; // 非同期レスポンスを使用することを示す
    }
    
    // プラットフォームが不明な場合
    sendResponse({ success: false, error: '不明なプラットフォーム' });
    return true;
  }

  // 他のリクエスト処理...
});

// DOMContentLoaded イベントリスナーを修正
document.addEventListener('DOMContentLoaded', async () => {
  // デバッグモードとテストモードを一時的に有効化
  chrome.storage.local.set({
    settings: {
      debugModeEnabled: true,
      testModeEnabled: true  // テストモードも有効化
    }
  }, () => {
    console.log('デバッグモードとテストモードを有効化しました');
  });
  
  // 以下は同じ...
}); 