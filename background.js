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
const MIN_REQUEST_INTERVAL = 60000; // 1分

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
    
    return liveStreams;
  } catch (error) {
    console.error('YouTube データ取得中にエラーが発生しました:', error);
    throw error;
  }
}

// チャンネル登録情報を取得する関数
async function fetchYouTubeSubscriptions(signal) {
  // ローカルストレージからキャッシュされた登録情報を取得
  const cachedData = await new Promise(resolve => {
    chrome.storage.local.get(['youtubeSubscriptionsCache'], data => {
      resolve(data.youtubeSubscriptionsCache || null);
    });
  });
  
  // キャッシュされたデータがあり、有効期限内なら使用（1時間キャッシュ）
  const now = Date.now();
  if (cachedData && cachedData.timestamp && (now - cachedData.timestamp) < 3600000) {
    if (settings.debugModeEnabled) {
      console.log('キャッシュされたYouTubeチャンネル登録情報を使用します');
    }
    return cachedData.subscriptions || [];
  }
  
  // 実際のAPI呼び出し
  try {
    // ここでAPI呼び出しを実装
    // ...
    const subscriptions = []; // APIからの結果
    
    // キャッシュを更新
    await new Promise(resolve => {
      chrome.storage.local.set({
        youtubeSubscriptionsCache: {
          timestamp: now,
          subscriptions: subscriptions
        }
      }, resolve);
    });
    
    return subscriptions;
  } catch (error) {
    console.error('YouTube登録情報の取得に失敗しました:', error);
    // キャッシュがあれば古いデータを返す
    if (cachedData && cachedData.subscriptions) {
      return cachedData.subscriptions;
    }
    throw error;
  }
}

// ライブ配信を検索する関数
async function fetchYouTubeLiveStreams(channelIds, signal) {
  // 実装...
  return [];
}

// 定期的にキャッシュやリクエスト状態をクリーンアップ
function cleanupResources() {
  Object.keys(activeRequests).forEach(platform => {
    // 長時間放置されたリクエストをキャンセル
    if (platform === 'youtube') {
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
    
    // Twitchの実際のAPI呼び出し処理をここに実装
    // ...
    const streams = []; // APIからの結果
    
    return streams;
  } catch (error) {
    console.error('Twitch データ取得中にエラーが発生しました:', error);
    throw error;
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
    
    if (settings.debugModeEnabled) {
      console.log(`${platform}の配信チェックリクエスト`);
      // デバッグ用のコールスタック表示
      console.log('呼び出し元のスタック:', new Error().stack);
    }
    
    // すべてのプラットフォームで同じ処理構造を使用
    if (['youtube', 'twitch', 'twitcasting'].includes(platform)) {
      // すでに処理中の場合は新しいリクエストを拒否
      if (activeRequests[platform].isProcessing) {
        if (settings.debugModeEnabled) {
          console.log(`${platform}のリクエストはすでに処理中です`);
        }
        sendResponse({ success: false, error: '既に処理中です' });
        return true;
      }
      
      // 前回のリクエストからの経過時間をチェック
      const now = Date.now();
      if ((now - activeRequests[platform].lastRequestTime) < MIN_REQUEST_INTERVAL) {
        if (settings.debugModeEnabled) {
          console.log(`${platform}のリクエスト間隔が短すぎます。スキップします`);
        }
        sendResponse({ success: false, error: 'リクエスト間隔が短すぎます' });
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
        
        setTimeout(() => {
          sendResponse({ success: true, streams: testData[platform] || [] });
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
          sendResponse({ success: true, streams: streams });
        })
        .catch(error => {
          if (error.name !== 'AbortError') {
            console.error(`${platform} API呼び出しエラー:`, error);
          }
          activeRequests[platform].controller = null;
          activeRequests[platform].isProcessing = false;
          sendResponse({ success: false, error: error.message });
        });
      
      return true; // 非同期レスポンスを使用することを示す
    }
    
    // プラットフォームが不明な場合
    sendResponse({ success: false, error: '不明なプラットフォーム' });
    return true;
  }

  // 他のリクエスト処理...
}); 