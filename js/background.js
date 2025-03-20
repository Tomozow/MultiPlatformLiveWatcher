/**
 * 配信通知拡張機能のバックグラウンドスクリプト
 */

// ストリームデータの構造
// {
//   id: string,           // プラットフォーム内のユニークID
//   platform: string,     // 'twitch', 'youtube', 'twitcasting'
//   channelId: string,    // プラットフォーム内のチャンネルID
//   channelName: string,  // チャンネル名
//   title: string,        // 配信タイトル
//   url: string,          // 配信URL
//   thumbnail: string,    // サムネイルURL
//   viewerCount: number,  // 視聴者数
//   startTime: string,    // 開始時間
//   category: string      // カテゴリ/ゲーム
// }

// スケジュールデータの構造
// {
//   id: string,           // プラットフォーム内のユニークID
//   platform: string,     // 'twitch', 'youtube', 'twitcasting'
//   channelId: string,    // プラットフォーム内のチャンネルID
//   channelName: string,  // チャンネル名
//   title: string,        // 配信タイトル
//   url: string,          // 配信URL
//   thumbnail: string,    // サムネイルURL (存在する場合)
//   startTime: string,    // 開始予定時間
//   endTime: string,      // 終了予定時間 (存在する場合)
//   category: string,     // カテゴリ/ゲーム (存在する場合)
//   description: string   // 説明 (存在する場合)
// }

// APIクライアント
const apiClients = {
  twitch: null,
  youtube: null,
  twitcasting: null
};

// 認証情報
let authInfo = {
  twitch: {
    enabled: false,
    clientId: '',
    accessToken: '',
    expiresAt: 0
  },
  youtube: {
    enabled: false,
    apiKey: '',
    clientId: '',  // クライアントID追加
    accessToken: '',
    expiresAt: 0
  },
  twitcasting: {
    enabled: false,
    clientId: '',
    clientSecret: '',
    accessToken: '',
    expiresAt: 0,
    userIds: []
  }
};

// 設定データ
let settings = {
  updateInterval: 5,
  notificationsEnabled: true,
  badgeEnabled: true,
  hoverInfoEnabled: true,
  viewerCountEnabled: true,
  platformIconEnabled: true,
  favoriteIconEnabled: true,
  scheduleUpdateInterval: 60,
  defaultScheduleView: 'day',
  defaultReminderTime: 15
};

let streams = [];
let lastNotifiedStreams = [];
let schedules = [];

/**
 * 初期化処理
 */
async function initialize() {
  console.log('バックグラウンドスクリプトを初期化しています');
  
  // インストール・更新イベントリスナー
  chrome.runtime.onInstalled.addListener(handleInstalled);
  
  // アラームハンドラ
  chrome.alarms.onAlarm.addListener(handleAlarm);
  
  // メッセージハンドラ
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('メッセージを受信しました:', message);
    
    if (message.action === 'checkStreams') {
      const platformFilter = message.platform || null;
      console.log(`配信チェック要求を受信: プラットフォーム=${platformFilter || 'すべて'}`);
      
      checkAllStreams(platformFilter)
        .then(streams => {
          sendResponse({ success: true, streams });
        })
        .catch(error => {
          console.error('配信チェックエラー:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // 非同期レスポンスを許可
    }
    
    if (message.action === 'checkSchedules') {
      checkAllSchedules()
        .then(schedules => {
          sendResponse({ success: true, schedules });
        })
        .catch(error => {
          console.error('スケジュールチェックエラー:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // 非同期レスポンスを許可
    }
    
    if (message.action === 'setReminder') {
      const { scheduleId, reminderTime } = message;
      setScheduleReminder(scheduleId, reminderTime)
        .then(result => {
          sendResponse({ success: true });
        })
        .catch(error => {
          console.error('リマインダー設定エラー:', error);
          sendResponse({ success: false, error: error.message });
        });
      return true; // 非同期レスポンスを許可
    }
    
    if (message.action === 'twitchCallback') {
      console.log('Twitchコールバックを受信:', message.hash);
      sendResponse({ success: true });
      return true; // 非同期レスポンスを許可
    }

    if (message.action === 'settingsUpdated') {
      console.log('設定更新メッセージを受信しました');
      
      // 受信した設定情報で更新
      if (message.settings) {
        settings = { ...settings, ...message.settings };
      }
      
      if (message.authInfo) {
        authInfo = { ...authInfo, ...message.authInfo };
        
        // APIクライアントを再初期化
        initializeApiClients();
      }
      
      // 応答を返す
      sendResponse({ success: true });
      return true; // 非同期レスポンスを許可
    }

    if (message.action === 'youtubeAuthenticated') {
      const authData = message.authInfo;
      if (authData && authData.accessToken) {
        console.log('YouTube認証データを受信しました');
        authInfo.youtube.accessToken = authData.accessToken;
        
        // 有効期限を設定（秒をミリ秒に変換）
        const expiresInMs = authData.expiresIn ? parseInt(authData.expiresIn) * 1000 : 3600000; // デフォルト1時間
        authInfo.youtube.expiresAt = Date.now() + expiresInMs;
        
        // ストレージに保存
        chrome.storage.local.set({ authInfo }, () => {
          console.log('YouTube認証情報を保存しました');
          sendResponse({ success: true });
        });
        
        return true; // 非同期レスポンスを許可
      }
    }
  });
  
  // リダイレクト監視用のリスナー
  chrome.webNavigation.onBeforeNavigate.addListener(function(details) {
    // 認証リダイレクトURLかどうかを確認
    const url = details.url;
    
    // YouTube認証リダイレクトを検出
    if (url.includes('oauth-redirect.googleusercontent.com/r/') && url.includes('access_token')) {
      console.log('YouTube認証リダイレクトを検出:', url);
      
      try {
        // URLからアクセストークンを抽出
        const hashPart = url.split('#')[1];
        if (hashPart) {
          const params = new URLSearchParams(hashPart);
          const accessToken = params.get('access_token');
          const expiresIn = params.get('expires_in');
          
          if (accessToken) {
            // 認証情報を更新
            authInfo.youtube.accessToken = accessToken;
            const expiresInMs = expiresIn ? parseInt(expiresIn) * 1000 : 3600000;
            authInfo.youtube.expiresAt = Date.now() + expiresInMs;
            
            // ストレージに保存
            chrome.storage.local.set({ authInfo }, () => {
              console.log('YouTube認証情報を保存しました');
            });
            
            // オプションページが開いている場合は通知
            chrome.runtime.sendMessage({ 
              action: 'youtubeAuthenticated',
              token: accessToken
            });
          }
        }
      } catch (error) {
        console.error('YouTube認証情報の処理中にエラーが発生しました:', error);
      }
    }
  });
  
  // 設定を読み込む
  await loadSettings();
  
  // 配信データを読み込む
  await loadStreams();
  
  // スケジュールデータを読み込む
  await loadSchedules();
  
  // アラームをセットアップ
  setupAlarms();
  
  console.log('バックグラウンドスクリプトの初期化が完了しました');
}

/**
 * アラームセットアップ
 */
function setupAlarms() {
  // 配信チェック用アラーム
  chrome.alarms.create('checkStreams', { 
    periodInMinutes: settings.updateInterval 
  });
  
  // スケジュールチェック用アラーム
  chrome.alarms.create('checkSchedules', { 
    periodInMinutes: settings.scheduleUpdateInterval 
  });
}

/**
 * アラームハンドラ
 * @param {Object} alarm - アラームオブジェクト
 */
function handleAlarm(alarm) {
  switch (alarm.name) {
    case 'checkStreams':
      checkAllStreams();
      break;
    case 'checkSchedules':
      checkAllSchedules();
      break;
    default:
      // リマインダーアラームの処理
      if (alarm.name.startsWith('reminder_')) {
        const scheduleId = alarm.name.replace('reminder_', '');
        showReminderNotification(scheduleId);
      }
      break;
  }
}

/**
 * インストール・更新時の処理
 * @param {Object} details - インストール詳細
 */
function handleInstalled(details) {
  if (details.reason === 'install') {
    // 初回インストール時
    chrome.runtime.openOptionsPage();
  } else if (details.reason === 'update') {
    // 更新時
    const newVersion = chrome.runtime.getManifest().version;
    console.log(`拡張機能がバージョン ${newVersion} に更新されました`);
  }
}

/**
 * 設定の読み込み
 */
async function loadSettings() {
  const data = await new Promise(resolve => {
    chrome.storage.local.get(['authInfo', 'settings'], resolve);
  });
  
  if (data.authInfo) {
    authInfo = data.authInfo;
  }
  
  if (data.settings) {
    settings = { ...settings, ...data.settings };
  }
  
  // APIクライアントの初期化
  initializeApiClients();
}

/**
 * 配信データの読み込み
 */
async function loadStreams() {
  const data = await new Promise(resolve => {
    chrome.storage.local.get(['streams', 'lastNotifiedStreams'], resolve);
  });
  
  if (data.streams) {
    streams = data.streams;
  }
  
  if (data.lastNotifiedStreams) {
    lastNotifiedStreams = data.lastNotifiedStreams;
  }
}

/**
 * スケジュールデータの読み込み
 */
async function loadSchedules() {
  const data = await new Promise(resolve => {
    chrome.storage.local.get(['schedules'], resolve);
  });
  
  if (data.schedules) {
    schedules = data.schedules;
  }
}

/**
 * APIクライアントの初期化
 */
function initializeApiClients() {
  if (authInfo.twitch.enabled && authInfo.twitch.clientId) {
    apiClients.twitch = new TwitchApiClient(
      authInfo.twitch.clientId,
      authInfo.twitch.accessToken
    );
  }
  
  if (authInfo.youtube.enabled && authInfo.youtube.apiKey) {
    apiClients.youtube = new YouTubeApiClient(
      authInfo.youtube.apiKey,
      authInfo.youtube.clientId,
      authInfo.youtube.accessToken
    );
  }
  
  if (authInfo.twitcasting.enabled && authInfo.twitcasting.clientId && authInfo.twitcasting.clientSecret) {
    apiClients.twitcasting = new TwitCastingApiClient(
      authInfo.twitcasting.clientId,
      authInfo.twitcasting.clientSecret,
      authInfo.twitcasting.accessToken
    );
  }
}

/**
 * すべてのプラットフォームの配信をチェック
 * @param {string} platformFilter - 特定のプラットフォームのみチェックする場合に指定 ('twitch', 'youtube', 'twitcasting')
 */
async function checkAllStreams(platformFilter = null) {
  try {
    let allStreams = [];
    let promises = [];
    
    // 現在の配信データを保持
    const currentStreams = [...streams];
    
    // Twitchのチェック
    if ((platformFilter === null || platformFilter === 'all' || platformFilter === 'twitch') && 
        authInfo.twitch.enabled && apiClients.twitch) {
      promises.push(
        apiClients.twitch.getFollowedStreams()
          .then(result => {
            console.log(`Twitch: ${result.length}件の配信を取得しました`);
            allStreams = allStreams.concat(result);
          })
          .catch(error => {
            console.error('Twitchの配信チェックエラー:', error);
            // 認証エラーの場合はトークンをリフレッシュ
            if (error.isAuthError) {
              return refreshTwitchToken();
            }
            // エラーの場合は現在のデータを保持
            const twitchStreams = currentStreams.filter(stream => stream.platform === 'twitch');
            allStreams = allStreams.concat(twitchStreams);
          })
      );
    } else if (platformFilter !== 'all' && platformFilter !== 'twitch') {
      // 指定外のプラットフォームは現在のデータを保持
      const twitchStreams = currentStreams.filter(stream => stream.platform === 'twitch');
      allStreams = allStreams.concat(twitchStreams);
    }
    
    // YouTubeのチェック
    if ((platformFilter === null || platformFilter === 'all' || platformFilter === 'youtube') && 
        authInfo.youtube.enabled && apiClients.youtube) {
      promises.push(
        apiClients.youtube.getLiveStreams()
          .then(result => {
            console.log(`YouTube: ${result.length}件の配信を取得しました`);
            allStreams = allStreams.concat(result);
          })
          .catch(error => {
            console.error('YouTubeの配信チェックエラー:', error);
            // 認証エラーの場合はトークンをリフレッシュ
            if (error.isAuthError) {
              return refreshYouTubeToken();
            }
            // エラーの場合は現在のデータを保持
            const youtubeStreams = currentStreams.filter(stream => stream.platform === 'youtube');
            allStreams = allStreams.concat(youtubeStreams);
          })
      );
    } else if (platformFilter !== 'all' && platformFilter !== 'youtube') {
      // 指定外のプラットフォームは現在のデータを保持
      const youtubeStreams = currentStreams.filter(stream => stream.platform === 'youtube');
      allStreams = allStreams.concat(youtubeStreams);
    }
    
    // TwitCastingのチェック
    if ((platformFilter === null || platformFilter === 'all' || platformFilter === 'twitcasting') && 
        authInfo.twitcasting.enabled && apiClients.twitcasting && authInfo.twitcasting.userIds.length > 0) {
      promises.push(
        apiClients.twitcasting.getLiveStreams(authInfo.twitcasting.userIds)
          .then(result => {
            console.log(`TwitCasting: ${result.length}件の配信を取得しました`);
            allStreams = allStreams.concat(result);
          })
          .catch(error => {
            console.error('TwitCastingの配信チェックエラー:', error);
            // エラーの場合は現在のデータを保持
            const twitcastingStreams = currentStreams.filter(stream => stream.platform === 'twitcasting');
            allStreams = allStreams.concat(twitcastingStreams);
          })
      );
    } else if (platformFilter !== 'all' && platformFilter !== 'twitcasting') {
      // 指定外のプラットフォームは現在のデータを保持
      const twitcastingStreams = currentStreams.filter(stream => stream.platform === 'twitcasting');
      allStreams = allStreams.concat(twitcastingStreams);
    }
    
    // すべてのチェックが完了するのを待つ
    await Promise.allSettled(promises);
    
    console.log(`全プラットフォーム合計: ${allStreams.length}件の配信を取得しました`);
    
    // 新しい配信の通知
    const newStreams = findNewStreams(allStreams, lastNotifiedStreams);
    if (newStreams.length > 0 && settings.notificationsEnabled) {
      console.log(`${newStreams.length}件の新規配信を通知します`);
      notifyNewStreams(newStreams);
    }
    
    // バッジ更新
    if (settings.badgeEnabled) {
      console.log(`バッジを更新: ${allStreams.length}`);
      updateBadge(allStreams.length);
    }
    
    // ストレージに保存
    streams = allStreams;
    lastNotifiedStreams = allStreams.map(stream => stream.id);
    
    await new Promise(resolve => {
      chrome.storage.local.set({
        streams: allStreams,
        lastNotifiedStreams: lastNotifiedStreams,
        lastUpdate: new Date().getTime()
      }, resolve);
    });
    
    return allStreams;
  } catch (error) {
    console.error('配信チェック全体エラー:', error);
    throw error;
  }
}

/**
 * すべてのプラットフォームのスケジュールをチェック
 */
async function checkAllSchedules() {
  try {
    let allSchedules = [];
    let promises = [];
    
    // Twitchのスケジュールチェック
    if (authInfo.twitch.enabled && apiClients.twitch) {
      promises.push(
        apiClients.twitch.getSchedules()
          .then(result => {
            allSchedules = allSchedules.concat(result);
          })
          .catch(error => {
            console.error('Twitchのスケジュールチェックエラー:', error);
            // 認証エラーの場合はトークンをリフレッシュ
            if (error.isAuthError) {
              return refreshTwitchToken();
            }
          })
      );
    }
    
    // YouTubeのスケジュールチェック
    if (authInfo.youtube.enabled && apiClients.youtube) {
      promises.push(
        apiClients.youtube.getUpcomingStreams()
          .then(result => {
            allSchedules = allSchedules.concat(result);
          })
          .catch(error => {
            console.error('YouTubeのスケジュールチェックエラー:', error);
            // 認証エラーの場合はトークンをリフレッシュ
            if (error.isAuthError) {
              return refreshYouTubeToken();
            }
          })
      );
    }
    
    // TwitCastingはスケジュールAPIが存在しない場合は処理しない
    
    // すべてのチェックが完了するのを待つ
    await Promise.allSettled(promises);
    
    // 既存のリマインダー情報を保持
    const existingSchedules = schedules || [];
    const reminders = {};
    
    existingSchedules.forEach(schedule => {
      if (schedule.reminder) {
        reminders[schedule.id] = schedule.reminder;
      }
    });
    
    // リマインダー情報を新しいスケジュールに適用
    allSchedules.forEach(schedule => {
      if (reminders[schedule.id]) {
        schedule.reminder = reminders[schedule.id];
      }
    });
    
    // ストレージに保存
    schedules = allSchedules;
    
    await new Promise(resolve => {
      chrome.storage.local.set({
        schedules: allSchedules,
        lastScheduleUpdate: new Date().getTime()
      }, resolve);
    });
    
    // リマインダーアラームを更新
    updateReminderAlarms();
    
    return allSchedules;
  } catch (error) {
    console.error('スケジュールチェック全体エラー:', error);
    throw error;
  }
}

/**
 * 新規配信を見つける
 * @param {Array} currentStreams - 現在の配信リスト
 * @param {Array} previousStreams - 前回通知済み配信ID
 * @returns {Array} 新規配信リスト
 */
function findNewStreams(currentStreams, previousStreams) {
  return currentStreams.filter(stream => 
    !previousStreams.includes(stream.id)
  );
}

/**
 * 新規配信を通知
 * @param {Array} newStreams - 新規配信リスト
 */
function notifyNewStreams(newStreams) {
  newStreams.forEach(stream => {
    const notificationId = `stream_${stream.id}`;
    const notificationOptions = {
      type: 'basic',
      iconUrl: stream.thumbnail || `images/${stream.platform}.svg`,
      title: `${stream.channelName}が配信を開始しました`,
      message: stream.title || '',
      contextMessage: stream.platform.toUpperCase(),
      buttons: [{ title: '視聴する' }]
    };
    
    chrome.notifications.create(notificationId, notificationOptions);
  });
  
  // 通知クリックハンドラ
  chrome.notifications.onClicked.addListener(notificationId => {
    if (notificationId.startsWith('stream_')) {
      const streamId = notificationId.replace('stream_', '');
      const stream = streams.find(s => s.id === streamId);
      
      if (stream) {
        chrome.tabs.create({ url: stream.url });
        chrome.notifications.clear(notificationId);
      }
    }
  });
  
  // 通知ボタンクリックハンドラ
  chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
    if (notificationId.startsWith('stream_') && buttonIndex === 0) {
      const streamId = notificationId.replace('stream_', '');
      const stream = streams.find(s => s.id === streamId);
      
      if (stream) {
        chrome.tabs.create({ url: stream.url });
        chrome.notifications.clear(notificationId);
      }
    }
  });
}

/**
 * バッジ表示を更新
 * @param {number} count - 配信数
 */
function updateBadge(count) {
  chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#6441a5' });
}

/**
 * スケジュールのリマインダーを設定
 * @param {string} scheduleId - スケジュールID
 * @param {number} reminderTime - 開始前の通知時間（分）
 */
async function setScheduleReminder(scheduleId, reminderTime) {
  const schedule = schedules.find(s => s.id === scheduleId);
  if (!schedule) {
    throw new Error('スケジュールが見つかりません');
  }
  
  // リマインダー情報を設定
  schedule.reminder = reminderTime;
  
  // ストレージに保存
  await new Promise(resolve => {
    chrome.storage.local.set({ schedules }, resolve);
  });
  
  // アラームを設定
  updateReminderAlarms();
  
  return true;
}

/**
 * リマインダーアラームを更新
 */
function updateReminderAlarms() {
  // 既存のリマインダーアラームを削除
  chrome.alarms.getAll(alarms => {
    alarms.forEach(alarm => {
      if (alarm.name.startsWith('reminder_')) {
        chrome.alarms.clear(alarm.name);
      }
    });
    
    // 新しいリマインダーアラームを設定
    schedules.forEach(schedule => {
      if (!schedule.reminder) return;
      
      const startTime = new Date(schedule.startTime).getTime();
      const now = Date.now();
      const reminderTimeMs = schedule.reminder * 60 * 1000;
      
      // リマインダー時間の計算
      const alarmTime = startTime - reminderTimeMs;
      
      // 現在時刻より後の場合のみ設定
      if (alarmTime > now) {
        chrome.alarms.create(`reminder_${schedule.id}`, {
          when: alarmTime
        });
      }
    });
  });
}

/**
 * リマインダー通知を表示
 * @param {string} scheduleId - スケジュールID
 */
function showReminderNotification(scheduleId) {
  const schedule = schedules.find(s => s.id === scheduleId);
  if (!schedule) return;
  
  const notificationId = `reminder_${schedule.id}`;
  const notificationOptions = {
    type: 'basic',
    iconUrl: schedule.thumbnail || `images/${schedule.platform}.svg`,
    title: `配信がまもなく開始されます`,
    message: `${schedule.channelName} - ${schedule.title || ''}`,
    contextMessage: `${schedule.platform.toUpperCase()} - ${new Date(schedule.startTime).toLocaleTimeString()}`,
    buttons: [{ title: 'リンクを開く' }]
  };
  
  chrome.notifications.create(notificationId, notificationOptions);
  
  // 通知クリックハンドラ
  chrome.notifications.onClicked.addListener(id => {
    if (id === notificationId) {
      chrome.tabs.create({ url: schedule.url });
      chrome.notifications.clear(id);
    }
  });
  
  // 通知ボタンクリックハンドラ
  chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
    if (id === notificationId && buttonIndex === 0) {
      chrome.tabs.create({ url: schedule.url });
      chrome.notifications.clear(id);
    }
  });
}

/**
 * Twitchトークンをリフレッシュ
 */
async function refreshTwitchToken() {
  // ここにTwitchのOAuth2認証トークンリフレッシュ処理を実装
  // 実際の実装では、クライアントサイドからのリフレッシュトークンの使用は推奨されないため、
  // ユーザーに再認証を促すのが適切
  
  // 認証モードで設定ページを開く
  chrome.runtime.openOptionsPage();
  
  // エラー通知
  const notificationOptions = {
    type: 'basic',
    iconUrl: 'images/icon128.png',
    title: '認証エラー',
    message: 'Twitchの認証が切れました。設定から再認証してください。'
  };
  
  chrome.notifications.create('twitch_auth_error', notificationOptions);
}

/**
 * YouTubeトークンをリフレッシュ
 */
async function refreshYouTubeToken() {
  // ここにYouTubeのOAuth2認証トークンリフレッシュ処理を実装
  // 実際の実装では、クライアントサイドからのリフレッシュトークンの使用は推奨されないため、
  // ユーザーに再認証を促すのが適切
  
  // 認証モードで設定ページを開く
  chrome.runtime.openOptionsPage();
  
  // エラー通知
  const notificationOptions = {
    type: 'basic',
    iconUrl: 'images/icon128.png',
    title: '認証エラー',
    message: 'YouTubeの認証が切れました。設定から再認証してください。'
  };
  
  chrome.notifications.create('youtube_auth_error', notificationOptions);
}

/**
 * TwitchApiClientクラス
 */
class TwitchApiClient {
  constructor(clientId, accessToken) {
    this.clientId = clientId;
    this.accessToken = accessToken;
    this.baseUrl = 'https://api.twitch.tv/helix';
  }
  
  /**
   * APIリクエストを送信
   * @param {string} endpoint - APIエンドポイント
   * @param {Object} params - URLパラメータ
   * @returns {Promise<Object>} レスポンスデータ
   */
  async request(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
// パラメータを追加
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => {
        url.searchParams.append(key, item);
      });
    } else {
      url.searchParams.append(key, value);
    }
  });
  
  try {
    const headers = {};
    
    if (useAuth && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    
    console.log(`YouTube API リクエスト: ${endpoint}`, 
                {useAuth: useAuth, hasToken: !!this.accessToken});
    
    const response = await fetch(url, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      // 詳細なエラー情報を取得
      let errorDetails = '';
      let errorData = null;
      
      try {
        errorData = await response.json();
        errorDetails = JSON.stringify(errorData);
      } catch (e) {
        try {
          errorDetails = await response.text();
        } catch (e2) {
          errorDetails = `Status: ${response.status} ${response.statusText}`;
        }
      }
      
      console.error(`YouTube API エラー: ${response.status} ${response.statusText}`, errorData);
      
      if (response.status === 401) {
        const error = new Error(`認証エラー: ${errorDetails}`);
        error.isAuthError = true;
        throw error;
      } else if (response.status === 403) {
        const error = new Error(`権限エラー: ${errorDetails}`);
        error.isAuthError = true;
        throw error;
      } else if (response.status === 429 || (errorData && errorData.error && errorData.error.errors && 
                errorData.error.errors.some(err => err.reason === 'quotaExceeded'))) {
        console.error('YouTube API クォータ超過エラーを検出しました');
        // API制限エラーをストレージに保存
        await Utils.setStorageData({
          youtubeApiLimitError: {
            timestamp: Date.now(),
            message: 'YouTubeのAPI制限に達しました。直接YouTubeで配信を確認してください。',
            url: 'https://www.youtube.com/live'
          }
        });
        
        const error = new Error(`クォータ超過: ${errorDetails}`);
        error.isQuotaError = true;
        throw error;
      }
      
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorDetails}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(`YouTube API Error at ${endpoint}:`, error);
    
    // エラーメッセージからクォータ超過を検出する追加チェック
    if (error.message && (error.message.includes('quota') || 
        error.message.includes('クォータ') || 
        error.message.includes('Quota') || 
        error.message.includes('exceeded') || 
        error.message.includes('limit'))) {
      
      console.error('エラーメッセージからYouTube API クォータ超過を検出しました');
      error.isQuotaError = true;
      
      // API制限エラーをストレージに保存
      try {
        await Utils.setStorageData({
          youtubeApiLimitError: {
            timestamp: Date.now(),
            message: 'YouTubeのAPI制限に達しました。直接YouTubeで配信を確認してください。',
            url: 'https://www.youtube.com/live'
          }
        });
      } catch (e) {
        console.error('API制限エラーの保存に失敗:', e);
      }
    }
    
    throw error;
  }
}  
  /**
   * フォロー中のライブ配信を取得
   * @returns {Promise<Array>} 配信データの配列
   */
  async getFollowedStreams() {
    try {
      // 自分のユーザーIDを取得
      const userResponse = await this.request('/users');
      if (!userResponse.data || userResponse.data.length === 0) {
        throw new Error('ユーザー情報の取得に失敗しました');
      }
      
      const userId = userResponse.data[0].id;
      console.log(`Twitch ユーザーID: ${userId}`);
      
      // フォロー中のチャンネルを取得
      const followsResponse = await this.request('/channels/followed', {
        user_id: userId,
        first: 100 // 最大数を取得
      });
      
      if (!followsResponse.data) {
        console.log('フォロー中のチャンネルが見つかりませんでした');
        return [];
      }
      
      console.log(`フォロー中チャンネル数: ${followsResponse.data.length}`);
      
      // フォロー中のチャンネルIDを抽出
      const followedUserIds = followsResponse.data.map(follow => follow.broadcaster_id);
      
      // 大量のIDを複数回のリクエストに分割
      const chunks = [];
      for (let i = 0; i < followedUserIds.length; i += 100) {
        chunks.push(followedUserIds.slice(i, i + 100));
      }
      
      console.log(`チャンク数: ${chunks.length}`);
      
      // 全チャンクの配信情報を取得
      let streamsData = [];
      
      for (const chunk of chunks) {
        if (chunk.length === 0) continue;
        
        // ユーザーIDパラメータを適切に構築 - 修正箇所: 複数のIDをパラメータで渡す方法
        const params = { user_id: chunk };
        
        const streamsResponse = await this.request('/streams', params);
        
        if (streamsResponse.data) {
          console.log(`チャンク内の配信数: ${streamsResponse.data.length}`);
          streamsData = streamsData.concat(streamsResponse.data);
        }
      }
      
      console.log(`取得した配信の総数: ${streamsData.length}`);
      
      // 別の方法でも試す - 全配信を取得してフィルタリング
      try {
        console.log('フォロー中の配信を別の方法で取得します...');
        const followedStreamsResponse = await this.request('/streams/followed', {
          user_id: userId
        });
        
        if (followedStreamsResponse.data && followedStreamsResponse.data.length > 0) {
          console.log(`/streams/followed で取得した配信数: ${followedStreamsResponse.data.length}`);
          
          // 既に取得したIDのリスト
          const existingIds = new Set(streamsData.map(stream => stream.id));
          
          // 重複を避けて追加
          for (const stream of followedStreamsResponse.data) {
            if (!existingIds.has(stream.id)) {
              streamsData.push(stream);
              existingIds.add(stream.id);
            }
          }
        }
      } catch (err) {
        console.log('streams/followed エンドポイントでエラー:', err.message);
      }
      
      console.log(`最終的な配信数: ${streamsData.length}`);
      
      // チャンネル情報を取得するためのID一覧
      const channelIds = streamsData.map(stream => stream.user_id);
      
      // チャンネルの詳細情報を取得
      let channelDetails = {};
      
      if (channelIds.length > 0) {
        // チャンクで処理
        for (let i = 0; i < channelIds.length; i += 100) {
          const idChunk = channelIds.slice(i, i + 100);
          
          // 修正: 正しいパラメータ形式を使用
          try {
            const usersResponse = await this.request('/users', { id: idChunk });
            
            if (usersResponse.data) {
              // チャンネルIDをキーとした詳細情報のマップを作成
              usersResponse.data.forEach(user => {
                channelDetails[user.id] = {
                  profile_image_url: user.profile_image_url,
                  display_name: user.display_name
                };
              });
            }
          } catch (err) {
            console.error('ユーザー情報取得エラー:', err);
          }
        }
      }
      
      console.log(`取得したチャンネル詳細数: ${Object.keys(channelDetails).length}`);
      
      // データを標準フォーマットに変換
      const formattedStreams = streamsData.map(stream => ({
        id: stream.id,
        platform: 'twitch',
        channelId: stream.user_id,
        channelName: stream.user_name,
        title: stream.title,
        url: `https://twitch.tv/${stream.user_login}`,
        thumbnail: stream.thumbnail_url ? stream.thumbnail_url.replace('{width}', '320').replace('{height}', '180') : null,
        channelIcon: channelDetails[stream.user_id]?.profile_image_url || null,
        viewerCount: stream.viewer_count,
        startTime: stream.started_at,
        category: stream.game_name
      }));
      
      console.log(`フォーマット後の配信数: ${formattedStreams.length}`);
      return formattedStreams;
    } catch (error) {
      console.error('Twitch ライブ配信取得エラー:', error);
      throw error;
    }
  }
  
  /**
   * スケジュールを取得
   * @returns {Promise<Array>} スケジュールデータの配列
   */
  async getSchedules() {
    try {
      // 自分のユーザーIDを取得
      const userResponse = await this.request('/users');
      if (!userResponse.data || userResponse.data.length === 0) {
        throw new Error('ユーザー情報の取得に失敗しました');
      }
      
      const userId = userResponse.data[0].id;
      
      // フォロー中のチャンネルを取得 - 新しいエンドポイントを使用
      const followsResponse = await this.request('/channels/followed', {
        user_id: userId,
        first: 100
      });
      
      if (!followsResponse.data) {
        return [];
      }
      
      // スケジュールデータを取得
      let schedulesData = [];
      
      for (const follow of followsResponse.data) {
        try {
          const scheduleResponse = await this.request('/schedule', {
            broadcaster_id: follow.broadcaster_id
          });
          
          if (scheduleResponse.data && scheduleResponse.data.segments) {
            schedulesData = schedulesData.concat(
              scheduleResponse.data.segments.map(segment => ({
                broadcasterId: follow.broadcaster_id,
                broadcasterName: follow.broadcaster_name || follow.broadcaster_login,
                segment
              }))
            );
          }
        } catch (error) {
          // スケジュールがない場合はスキップ
          continue;
        }
      }
      
      // データを標準フォーマットに変換
      return schedulesData.map(item => ({
        id: item.segment.id,
        platform: 'twitch',
        channelId: item.broadcasterId,
        channelName: item.broadcasterName,
        title: item.segment.title,
        url: `https://twitch.tv/${item.broadcasterName}`,
        thumbnail: '', // スケジュールにはサムネイルがない
        startTime: item.segment.start_time,
        endTime: item.segment.end_time,
        category: item.segment.category ? item.segment.category.name : '',
        description: ''
      }));
    } catch (error) {
      console.error('Twitch スケジュール取得エラー:', error);
      throw error;
    }
  }
}

/**
 * YouTubeApiClientクラス
 */
class YouTubeApiClient {
  constructor(apiKey, clientId, accessToken) {
    this.apiKey = apiKey;
    this.clientId = clientId;
    this.accessToken = accessToken;
    this.baseUrl = 'https://www.googleapis.com/youtube/v3';
    this.cachedChannels = {};  // チャンネル情報のキャッシュ
    this.lastSubscriptionsCheck = 0;  // 最後にサブスクリプションを取得した時間
    this.subscriptions = [];  // 登録チャンネル情報のキャッシュ
    this.cachedLiveStreams = [];  // ライブ配信のキャッシュ
    this.lastLiveStreamsCheck = 0;  // 最後にライブ配信を取得した時間
    this.cachedUpcomingStreams = [];  // 予定配信のキャッシュ
    this.lastUpcomingStreamsCheck = 0;  // 最後に予定配信を取得した時間
    
    // キャッシュ設定（時間はミリ秒）
    this.SUBSCRIPTION_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24時間
    this.LIVESTREAMS_CACHE_DURATION = 5 * 60 * 1000;        // 5分
    this.UPCOMING_CACHE_DURATION = 30 * 60 * 1000;          // 30分
  }
  
/**
 * APIリクエストを送信
 * @param {string} endpoint - APIエンドポイント
 * @param {Object} params - URLパラメータ
 * @param {boolean} useAuth - 認証を使用するかどうか
 * @returns {Promise<Object>} レスポンスデータ
 */
async request(endpoint, params = {}, useAuth = true) {
  const url = new URL(`${this.baseUrl}${endpoint}`);
  
  // APIキーを追加（認証の場合でも必要なエンドポイントがあるため）
  url.searchParams.append('key', this.apiKey);
  
  // パラメータを追加
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      value.forEach(item => {
        url.searchParams.append(key, item);
      });
    } else {
      url.searchParams.append(key, value);
    }
  });
  
  try {
    const headers = {};
    
    if (useAuth && this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }
    
    console.log(`YouTube API リクエスト: ${endpoint}`, 
                {useAuth: useAuth, hasToken: !!this.accessToken});
    
    const response = await fetch(url, {
      method: 'GET',
      headers
    });
    
    if (!response.ok) {
      // 詳細なエラー情報を取得
      let errorDetails = '';
      try {
        const errorJson = await response.json();
        errorDetails = JSON.stringify(errorJson);
      } catch (e) {
        errorDetails = await response.text();
      }
      
      if (response.status === 401) {
        const error = new Error(`認証エラー: ${errorDetails}`);
        error.isAuthError = true;
        throw error;
      } else if (response.status === 403) {
        const error = new Error(`権限エラー: ${errorDetails}`);
        error.isAuthError = true;
        throw error;
      } else if (response.status === 429) {
        const error = new Error(`クォータ超過: ${errorDetails}`);
        error.isQuotaError = true;
        throw error;
      }
      throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorDetails}`);
    }
    
    return response.json();
  } catch (error) {
    console.error(`YouTube API Error at ${endpoint}:`, error);
    throw error;
  }
}
  
  /**
   * チャンネル登録情報を取得（キャッシュ対応）
   * @returns {Promise<Array>} チャンネル登録情報
   */
  async getSubscriptions() {
    const now = Date.now();
    
    // キャッシュが有効な場合はキャッシュを返す
    if (this.subscriptions.length > 0 && 
        now - this.lastSubscriptionsCheck < this.SUBSCRIPTION_CACHE_DURATION) {
      console.log('YouTube: サブスクリプションキャッシュを使用');
      return this.subscriptions;
    }
    
    try {
      console.log('YouTube: サブスクリプションを取得中...');
      
      // 一度に最大限取得（50件）
      const subscriptionsResponse = await this.request('/subscriptions', {
        part: 'snippet',
        mine: true,
        maxResults: 50,
        order: 'relevance'
      }, true);
      
      if (!subscriptionsResponse.items || subscriptionsResponse.items.length === 0) {
        return [];
      }
      
      // キャッシュを更新
      this.subscriptions = subscriptionsResponse.items.map(item => ({
        channelId: item.snippet.resourceId.channelId,
        channelTitle: item.snippet.title
      }));
      
      this.lastSubscriptionsCheck = now;
      
      console.log(`YouTube: ${this.subscriptions.length}件のチャンネル登録情報を取得しました`);
      return this.subscriptions;
    } catch (error) {
      console.error('YouTube サブスクリプション取得エラー:', error);
      // エラーが発生した場合、古いキャッシュがあればそれを返す
      if (this.subscriptions.length > 0) {
        console.log('YouTube: エラーにより古いサブスクリプションキャッシュを使用');
        return this.subscriptions;
      }
      throw error;
    }
  }
  
/**
 * YouTube用のライブ配信取得メソッド
 * @returns {Promise<Array>} 配信データの配列
 */
async getLiveStreams() {
  try {
    // 現在時刻を取得
    const now = Date.now();
    
    // キャッシュが有効な場合はキャッシュを返す
    if (this.cachedLiveStreams.length > 0 && 
        now - this.lastLiveStreamsCheck < this.LIVESTREAMS_CACHE_DURATION) {
      console.log('YouTube: ライブ配信キャッシュを使用');
      return this.cachedLiveStreams;
    }
    
    // 認証情報を確認
    if (!this.accessToken) {
      console.log('YouTube: アクセストークンがありません');
      
      // 認証エラーを通知用のフラグを設定
      await Utils.setStorageData({
        youtubeAuthError: {
          timestamp: now,
          message: 'YouTube APIの認証情報が不足しています。YouTube設定タブで認証を行ってください。'
        }
      });
      
      return [];
    }
    
    // トークンの有効期限をチェック
    if (this.expiresAt && this.expiresAt < now) {
      console.log('YouTube: アクセストークンの期限が切れています');
      
      await Utils.setStorageData({
        youtubeAuthError: {
          timestamp: now,
          message: 'YouTube APIのアクセストークンの期限が切れています。YouTube設定タブで再認証を行ってください。'
        }
      });
      
      // トークンリフレッシュを試みる
      if (typeof refreshYouTubeToken === 'function') {
        refreshYouTubeToken();
      }
      
      return [];
    }

    // チャンネル情報を取得して登録チャンネルを取得
    const subscriptionsResponse = await this.request('/subscriptions', {
      part: 'snippet',
      mine: true,
      maxResults: 50,
      order: 'relevance'
    }, true);
    
    console.log(`YouTube: ${subscriptionsResponse.items?.length || 0}件のチャンネル登録情報を取得しました`);
    
    if (!subscriptionsResponse.items || subscriptionsResponse.items.length === 0) {
      return [];
    }
    
    // チャンネルIDのリストを作成
    const channelIds = subscriptionsResponse.items.map(item => 
      item.snippet.resourceId.channelId
    );
    
    // チャンネルごとのライブ配信を確認
    let liveStreams = [];
    
    // APIの制限を考慮し、バッチサイズを小さくする
    const batchSize = 5;
    
    // チャンネルをbatchSizeずつに分割してバッチ処理
    for (let i = 0; i < channelIds.length; i += batchSize) {
      const batchIds = channelIds.slice(i, i + batchSize);
      
      // 各チャンネルの現在のライブ配信を検索
      for (const channelId of batchIds) {
        try {
          // レート制限を避けるためにより長く待機
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const searchResponse = await this.request('/search', {
            part: 'snippet',
            channelId: channelId,
            eventType: 'live',
            type: 'video',
            maxResults: 1
          }, false);
          
          if (searchResponse.items && searchResponse.items.length > 0) {
            // ライブ配信の詳細情報を取得
            const videoIds = searchResponse.items.map(item => item.id.videoId);
            
            // 再度待機してAPI制限を回避
            await new Promise(resolve => setTimeout(resolve, 300));
            
            const videosResponse = await this.request('/videos', {
              part: 'snippet,liveStreamingDetails,statistics',
              id: videoIds.join(',')
            }, false);
            
            if (videosResponse.items) {
              liveStreams = liveStreams.concat(videosResponse.items.map(video => ({
                id: video.id,
                platform: 'youtube',
                channelId: video.snippet.channelId,
                channelName: video.snippet.channelTitle,
                title: video.snippet.title,
                url: `https://www.youtube.com/watch?v=${video.id}`,
                thumbnail: video.snippet.thumbnails.medium?.url || null,
                channelIcon: null, // チャンネルアイコンは別途取得
                viewerCount: parseInt(video.liveStreamingDetails?.concurrentViewers || '0'),
                startTime: video.liveStreamingDetails?.actualStartTime || null,
                category: video.snippet.categoryId
              })));
            }
          }
        } catch (error) {
          console.error(`YouTubeチャンネル ${channelId} の配信チェックエラー:`, error);
          // エラーが発生しても続行
          continue;
        }
      }
      
      // バッチ間でのウェイト
      if (i + batchSize < channelIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`YouTube: ${liveStreams.length}件のライブ配信を取得しました`);
    
    // チャンネルアイコンの取得（存在する場合のみ）
    if (liveStreams.length > 0) {
      // ユニークなチャンネルIDのリストを作成
      const uniqueChannelIds = [...new Set(liveStreams.map(stream => stream.channelId))];
      
      // バッチサイズを小さくして処理
      const iconBatchSize = 10;
      const channelIcons = {};
      
      for (let i = 0; i < uniqueChannelIds.length; i += iconBatchSize) {
        try {
          const batchIds = uniqueChannelIds.slice(i, i + iconBatchSize);
          
          // API呼び出しの間隔を空ける
          await new Promise(resolve => setTimeout(resolve, 300));
          
          const channelsResponse = await this.request('/channels', {
            part: 'snippet',
            id: batchIds.join(',')
          }, false);
          
          if (channelsResponse.items) {
            channelsResponse.items.forEach(channel => {
              channelIcons[channel.id] = channel.snippet.thumbnails.default?.url || null;
            });
          }
        } catch (error) {
          console.error('YouTubeチャンネルアイコン取得エラー:', error);
          // エラーが発生しても続行
        }
      }
      
      // チャンネルアイコンを追加
      liveStreams = liveStreams.map(stream => ({
        ...stream,
        channelIcon: channelIcons[stream.channelId] || null
      }));
    }
    
    return liveStreams;
  } catch (error) {
    console.error('YouTube ライブ配信取得エラー:', error);
    
    // API制限エラーの場合
    if (error.isQuotaError) {
      await Utils.setStorageData({
        youtubeApiLimitError: {
          timestamp: Date.now(),
          message: 'YouTubeのAPI制限に達しました。直接YouTubeで配信を確認してください。',
          url: 'https://www.youtube.com/live'
        }
      });
      console.log('YouTubeのAPI制限エラーを保存しました');
    }
    // 認証エラーの場合
    else if (error.isAuthError) {
      await Utils.setStorageData({
        youtubeAuthError: {
          timestamp: Date.now(),
          message: 'YouTube APIの認証に失敗しました。認証情報が無効か期限切れの可能性があります。YouTube設定タブで再認証を行ってください。'
        }
      });
      
      // トークンリフレッシュを試みる
      if (typeof refreshYouTubeToken === 'function') {
        refreshYouTubeToken();
      }
    }
    
    // エラーがあっても空の配列を返す
    return [];
  }
}
  
  /**
   * 予定配信を取得（最適化版）
   * @returns {Promise<Array>} 予定配信データの配列
   */
  async getUpcomingStreams() {
    try {
      const now = Date.now();
      
      // キャッシュが有効な場合はキャッシュを返す
      if (this.cachedUpcomingStreams.length > 0 && 
          now - this.lastUpcomingStreamsCheck < this.UPCOMING_CACHE_DURATION) {
        console.log('YouTube: 予定配信キャッシュを使用');
        return this.cachedUpcomingStreams;
      }
      
      // チャンネル登録情報を取得
      const subscriptions = await this.getSubscriptions();
      
      if (subscriptions.length === 0) {
        return [];
      }
      
      console.log(`YouTube: ${subscriptions.length}件のチャンネルから予定配信を検索`);
      
      // 予定配信を効率的に取得
      let upcomingStreams = [];
      
      // チャンネルをグループに分割して処理（バッチサイズを小さくして効率化）
      const channelGroups = [];
      const batchSize = 10; // 一度に処理するチャンネル数を削減
      
      for (let i = 0; i < subscriptions.length; i += batchSize) {
        channelGroups.push(subscriptions.slice(i, i + batchSize));
      }
      
      // 各チャンネルグループを処理
      for (let groupIndex = 0; groupIndex < channelGroups.length; groupIndex++) {
        const group = channelGroups[groupIndex];
        
        // グループ内で人気/アクティブなチャンネルを優先
        // ここでは単純化のため最初の数チャンネルだけを処理
        const priorityChannels = group.slice(0, 3);
        
        for (const channel of priorityChannels) {
          try {
            // 予定配信を直接検索（API使用量は高いが効率的）
            const searchResponse = await this.request('/search', {
              part: 'snippet',
              channelId: channel.channelId,
              eventType: 'upcoming',
              type: 'video',
              maxResults: 3 // 各チャンネルごとに最大3件に制限
            }, false);
            
            if (searchResponse.items && searchResponse.items.length > 0) {
              // 動画IDを取得
              const videoIds = searchResponse.items.map(item => item.id.videoId);
              
              // API呼び出しの間隔を空ける
              await new Promise(resolve => setTimeout(resolve, 300));
              
              // 動画の詳細情報を取得
              const videosResponse = await this.request('/videos', {
                part: 'snippet,liveStreamingDetails',
                id: videoIds.join(',')
              }, false);
              
              if (videosResponse.items) {
                // スケジュールデータに変換
                const schedules = videosResponse.items
                  .filter(video => 
                    video.snippet.liveBroadcastContent === 'upcoming' &&
                    video.liveStreamingDetails?.scheduledStartTime
                  )
                  .map(video => ({
                    id: video.id,
                    platform: 'youtube',
                    channelId: video.snippet.channelId,
                    channelName: video.snippet.channelTitle,
                    title: video.snippet.title,
                    url: `https://www.youtube.com/watch?v=${video.id}`,
                    thumbnail: video.snippet.thumbnails.medium?.url || null,
                    startTime: video.liveStreamingDetails?.scheduledStartTime || null,
                    endTime: video.liveStreamingDetails?.scheduledEndTime || null,
                    category: video.snippet.categoryId,
                    description: video.snippet.description
                  }));
                
                upcomingStreams = upcomingStreams.concat(schedules);
              }
            }
          } catch (error) {
            console.error(`YouTube チャンネル ${channel.channelId} の予定配信取得エラー:`, error);
            continue;
          }
          
          // APIクォータを節約するための待機
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        // グループ間の待機時間を長めに設定
        if (groupIndex < channelGroups.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        // キャッシュ時間が長いため、一定数の結果が得られたら処理を終了
        if (upcomingStreams.length >= 20) {
          console.log('YouTube: 十分な予定配信が見つかったため、残りのチャンネルはスキップします');
          break;
        }
      }
      
      console.log(`YouTube: ${upcomingStreams.length}件の予定配信を検出しました`);
      
      // キャッシュを更新
      this.cachedUpcomingStreams = upcomingStreams;
      this.lastUpcomingStreamsCheck = now;
      
      return upcomingStreams;
    } catch (error) {
      console.error('YouTube 予定配信取得エラー:', error);
      
      // エラーの場合、キャッシュがあればそれを返す
      if (this.cachedUpcomingStreams.length > 0) {
        console.log('YouTube: エラーによりキャッシュされた予定配信データを使用');
        return this.cachedUpcomingStreams;
      }
      
      return [];
    }
  }
}
/**
 * TwitCastingApiClient クラス
 */
class TwitCastingApiClient {
  constructor(clientId, clientSecret, accessToken = null) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accessToken = accessToken;
    this.baseUrl = 'https://apiv2.twitcasting.tv';
  }
  
  /**
   * API リクエストを送信
   * @param {string} endpoint - API エンドポイント
   * @param {Object} params - クエリパラメータ
   * @returns {Promise<Object>} レスポンスデータ
   */
  async request(endpoint, params = {}) {
    const url = new URL(`${this.baseUrl}${endpoint}`);
    
    // クエリパラメータを追加
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
    
    try {
      // 認証ヘッダーを設定
      const headers = {
        'Accept': 'application/json',
        'X-Api-Version': '2.0'
      };
      
      if (this.accessToken) {
        headers['Authorization'] = `Bearer ${this.accessToken}`;
      } else {
        // Basic認証
        const basicAuth = btoa(`${this.clientId}:${this.clientSecret}`);
        headers['Authorization'] = `Basic ${basicAuth}`;
      }
      
      console.log(`TwitCasting API リクエスト: ${endpoint}`);
      
      const response = await fetch(url, {
        method: 'GET',
        headers
      });
      
      if (!response.ok) {
        // 詳細なエラー情報を取得
        let errorDetails = '';
        try {
          const errorJson = await response.json();
          errorDetails = JSON.stringify(errorJson);
        } catch (e) {
          errorDetails = await response.text();
        }
        
        // ステータスコード別のエラーハンドリング
        if (response.status === 404) {
          throw new Error(`リソースが見つかりません: ${endpoint} - ${errorDetails}`);
        } else if (response.status === 401) {
          throw new Error(`認証エラー: ${errorDetails}`);
        } else if (response.status === 403) {
          throw new Error(`権限エラー: ${errorDetails}`);
        } else if (response.status === 429) {
          throw new Error(`レート制限超過: ${errorDetails}`);
        }
        
        throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorDetails}`);
      }
      
      return response.json();
    } catch (error) {
      console.error(`TwitCasting API Error at ${endpoint}:`, error);
      throw error;
    }
  }
  
  /**
   * 配信状態を取得
   * @param {Array} userIds - ユーザーIDの配列
   * @returns {Promise<Array>} 配信データの配列
   */
  async getLiveStreams(userIds) {
    const streams = [];
    
    if (!userIds || userIds.length === 0) {
      console.log('TwitCasting: ユーザーIDが指定されていません');
      return streams;
    }
    
    // 無効なユーザーIDを検出して除外するための正規表現
    // TwitCastingのユーザーIDは通常、英数字とアンダースコアで構成される
    const validUserIdPattern = /^[a-zA-Z0-9_]+$/;
    const validUserIds = userIds.filter(userId => validUserIdPattern.test(userId));
    
    if (validUserIds.length === 0) {
      console.log('TwitCasting: 有効なユーザーIDがありません');
      return streams;
    }
    
    console.log(`TwitCasting: ${validUserIds.length}件の有効なユーザーIDを処理します`);
    
    // 各ユーザーIDについて処理
    for (const userId of validUserIds) {
      try {
        // レート制限対策のため200ms待機
        await new Promise(resolve => setTimeout(resolve, 200));
        
        // ユーザー情報を取得（アイコンURL取得のため）
        let userIcon = null;
        try {
          const userInfoResponse = await this.request(`/users/${userId}`);
          userIcon = userInfoResponse.user?.profile?.image || null;
        } catch (userError) {
          console.warn(`TwitCasting: ユーザー情報取得エラー - ${userId}`, userError.message);
          // ユーザー情報が取得できなくても配信情報は試す
        }
        
        // ユーザーの現在の配信を取得
        try {
          const liveResponse = await this.request(`/users/${userId}/current_live`);
          
          if (liveResponse.movie && liveResponse.movie.is_live) {
            const movie = liveResponse.movie;
            const user = liveResponse.broadcaster;
            
            streams.push({
              id: movie.id,
              platform: 'twitcasting',
              channelId: user.id,
              channelName: user.name,
              title: movie.title || user.screen_id,
              url: `https://twitcasting.tv/${user.screen_id}`,
              thumbnail: movie.small_thumbnail,
              channelIcon: userIcon,
              viewerCount: movie.current_view_count,
              startTime: new Date(movie.created * 1000).toISOString(),
              category: movie.category || ''
            });
          }
        } catch (liveError) {
          // 配信情報の取得に失敗しても継続
          console.warn(`TwitCasting: 配信情報取得エラー - ${userId}`, liveError.message);
        }
      } catch (error) {
        console.error(`TwitCasting ユーザー ${userId} の取得エラー:`, error);
        // エラーが発生しても次のユーザーの処理を継続
        continue;
      }
    }
    
    console.log(`TwitCasting: ${streams.length}件の配信を取得しました`);
    return streams;
  }
}

// 初期化実行
initialize();