/**
 * 配信通知拡張機能の設定スクリプト
 */

document.addEventListener('DOMContentLoaded', async function() {
  console.log('オプションページが読み込まれました');
  
  // DOM要素
  const saveButton = document.getElementById('save-button');
  const statusMessage = document.getElementById('status-message');
  const tabButtons = document.querySelectorAll('.tab-button');
  
  // 一般設定
  const updateInterval = document.getElementById('update-interval');
  const notificationsEnabled = document.getElementById('notifications-enabled');
  const badgeEnabled = document.getElementById('badge-enabled');
  
  // 新しいUI表示設定
  const hoverInfoEnabled = document.getElementById('hover-info-enabled');
  const viewerCountEnabled = document.getElementById('viewer-count-enabled');
  const platformIconEnabled = document.getElementById('platform-icon-enabled');
  const favoriteIconEnabled = document.getElementById('favorite-icon-enabled');
  
  // Twitch設定
  const twitchEnabled = document.getElementById('twitch-enabled');
  const twitchClientId = document.getElementById('twitch-client-id');
  const twitchRedirectUri = document.getElementById('twitch-redirect-uri');
  const twitchAuthStatus = document.getElementById('twitch-auth-status');
  const twitchAuthButton = document.getElementById('twitch-auth-button');
  const twitchClearAuth = document.getElementById('twitch-clear-auth');
  const copyTwitchUri = document.getElementById('copy-twitch-uri');
  
  // YouTube設定
  const youtubeEnabled = document.getElementById('youtube-enabled');
  const youtubeApiKey = document.getElementById('youtube-api-key');
  const youtubeClientId = document.getElementById('youtube-client-id');
  const youtubeRedirectUri = document.getElementById('youtube-redirect-uri');
  const youtubeAuthStatus = document.getElementById('youtube-auth-status');
  const youtubeAuthButton = document.getElementById('youtube-auth-button');
  const youtubeClearAuth = document.getElementById('youtube-clear-auth');
  const copyYoutubeUri = document.getElementById('copy-youtube-uri');
  
  // TwitCasting設定
  const twitcastingEnabled = document.getElementById('twitcasting-enabled');
  const twitcastingClientId = document.getElementById('twitcasting-client-id');
  const twitcastingClientSecret = document.getElementById('twitcasting-client-secret');
  const twitcastingUserIds = document.getElementById('twitcasting-user-ids');
  const newUserId = document.getElementById('new-user-id');
  const addUserIdButton = document.getElementById('add-user-id');
  
  // フィルター設定
  const defaultPlatforms = document.querySelectorAll('input[name="default-platform"]');
  const savedFiltersList = document.getElementById('saved-filters-list');
  const favoritesList = document.getElementById('favorites-list');
  
  // スケジュール設定
  const scheduleUpdateInterval = document.getElementById('schedule-update-interval');
  const defaultScheduleView = document.getElementById('default-schedule-view');
  const defaultReminderTime = document.getElementById('default-reminder-time');
  const exportIcalButton = document.getElementById('export-ical');
  const exportGoogleButton = document.getElementById('export-google');
  
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
  
  // フィルター情報
  let savedFilters = [];
  let favorites = [];
  
  // タブ切り替え機能
  function setupTabs() {
    console.log('タブセットアップを開始します');
    console.log('タブボタン数:', tabButtons.length);
    
    tabButtons.forEach(button => {
      button.addEventListener('click', function() {
        console.log('タブがクリックされました:', button.dataset.tab);
        
        // すべてのタブボタンから'active'クラスを削除
        tabButtons.forEach(btn => {
          btn.classList.remove('active');
        });
        
        // クリックされたボタンに'active'クラスを追加
        button.classList.add('active');
        
        // すべてのタブコンテンツを非表示
        document.querySelectorAll('.tab-content').forEach(content => {
          content.classList.remove('active');
          content.style.display = 'none'; // 非表示に設定
        });
        
        // 対応するタブコンテンツを表示
        const tabContentId = button.dataset.tab;
        const tabContent = document.getElementById(tabContentId);
        
        if (tabContent) {
          tabContent.classList.add('active');
          tabContent.style.display = 'block'; // 表示に設定
          console.log('表示したタブコンテンツ:', tabContentId);
        } else {
          console.error('タブコンテンツが見つかりません:', tabContentId);
        }
      });
    });
  }
  
/**
 * 初期化処理
 */
async function init() {
  console.log('初期化を開始します');
  
  // タブ機能のセットアップ
  setupTabs();
  
  // 設定を読み込む
  await loadSettings();
  
  // リダイレクトURIを設定
  setRedirectUris();
  
  // イベントリスナーを設定
  setupEventListeners();
  
  // プラットフォーム更新順序のドラッグ&ドロップを設定
  setupPlatformOrderDragDrop();
  
  // URLパラメータを確認（認証リダイレクト）
  checkAuthRedirect();
  
  // タブの初期表示設定
  initializeTabDisplay();
  
  console.log('初期化が完了しました');
}
  
  /**
   * タブの初期表示を設定
   */
  function initializeTabDisplay() {
    document.querySelectorAll('.tab-content').forEach(content => {
      if (content.classList.contains('active')) {
        content.style.display = 'block';
      } else {
        content.style.display = 'none';
      }
    });
  }
  
/**
 * 設定を読み込む
 */
async function loadSettings() {
  console.log('設定を読み込みます');
  
  const data = await new Promise(resolve => {
    chrome.storage.local.get(['authInfo', 'settings', 'savedFilters', 'favorites'], resolve);
  });
  
  console.log('ストレージから読み込んだデータ:', data);
  
  if (data.authInfo) {
    console.log('読み込んだauthInfo:', data.authInfo);
    authInfo = { ...authInfo, ...data.authInfo };
    console.log('マージ後のauthInfo:', authInfo);
    
    // YouTube設定が正しく読み込まれているか確認
    console.log('YouTubeクライアントID:', authInfo.youtube.clientId);
  } else {
    console.log('authInfoが見つかりませんでした。デフォルト値を使用します。');
  }
  
  if (data.settings) {
    settings = { ...settings, ...data.settings };
    
    // プラットフォーム更新順序がない場合はデフォルト値を設定
    if (!settings.platformUpdateOrder) {
      settings.platformUpdateOrder = ['twitch', 'youtube', 'twitcasting'];
    }
  }
  
  if (data.savedFilters) {
    savedFilters = data.savedFilters;
  }
  
  if (data.favorites) {
    favorites = data.favorites;
  }
  
  // UIに設定を反映
  updateUI();
  
  console.log('設定の読み込みが完了しました');
}

/**
 * UIに設定を反映
 */
function updateUI() {
  console.log('UIを更新します');
  
  // 一般設定
  if (updateInterval) updateInterval.value = settings.updateInterval.toString();
  if (notificationsEnabled) notificationsEnabled.checked = settings.notificationsEnabled;
  if (badgeEnabled) badgeEnabled.checked = settings.badgeEnabled;
  
  // 新しいUI表示設定
  if (hoverInfoEnabled) hoverInfoEnabled.checked = settings.hoverInfoEnabled !== false;
  if (viewerCountEnabled) viewerCountEnabled.checked = settings.viewerCountEnabled !== false;
  if (platformIconEnabled) platformIconEnabled.checked = settings.platformIconEnabled !== false;
  if (favoriteIconEnabled) favoriteIconEnabled.checked = settings.favoriteIconEnabled !== false;
  
  // プラットフォーム更新順序を反映
  updatePlatformOrderUI();
  
  // Twitch設定
  if (twitchEnabled) twitchEnabled.checked = authInfo.twitch.enabled;
  if (twitchClientId) twitchClientId.value = authInfo.twitch.clientId || '';
  if (twitchAuthStatus) {
    twitchAuthStatus.textContent = authInfo.twitch.accessToken ? '認証済み' : '未認証';
    twitchAuthStatus.style.color = authInfo.twitch.accessToken ? '#27ae60' : '#e74c3c';
  }
  if (twitchAuthButton) twitchAuthButton.disabled = !authInfo.twitch.clientId;
  
  // YouTube設定
  if (youtubeEnabled) youtubeEnabled.checked = authInfo.youtube.enabled;
  if (youtubeApiKey) youtubeApiKey.value = authInfo.youtube.apiKey || '';
  if (youtubeClientId) {
    youtubeClientId.value = authInfo.youtube.clientId || '';
    console.log('表示するYouTubeクライアントID:', youtubeClientId.value);
  }
  if (youtubeAuthStatus) {
    youtubeAuthStatus.textContent = authInfo.youtube.accessToken ? '認証済み' : '未認証';
    youtubeAuthStatus.style.color = authInfo.youtube.accessToken ? '#27ae60' : '#e74c3c';
  }
  
  // TwitCasting設定
  if (twitcastingEnabled) twitcastingEnabled.checked = authInfo.twitcasting.enabled;
  if (twitcastingClientId) twitcastingClientId.value = authInfo.twitcasting.clientId || '';
  if (twitcastingClientSecret) twitcastingClientSecret.value = authInfo.twitcasting.clientSecret || '';
  if (twitcastingUserIds) updateUserIdsList();
  
  // フィルター設定
  if (defaultPlatforms) {
    defaultPlatforms.forEach(checkbox => {
      checkbox.checked = true; // デフォルトですべてチェック
    });
  }
  updateSavedFiltersList();
  updateFavoritesList();
  
  // スケジュール設定
  if (scheduleUpdateInterval) scheduleUpdateInterval.value = settings.scheduleUpdateInterval.toString();
  if (defaultScheduleView) defaultScheduleView.value = settings.defaultScheduleView;
  if (defaultReminderTime) defaultReminderTime.value = settings.defaultReminderTime.toString();
  
  console.log('UIの更新が完了しました');
}
  /**
   * リダイレクトURIを設定
   */
  function setRedirectUris() {
    console.log('リダイレクトURIを設定します');
    
    // 拡張機能のIDを取得
    const extensionId = chrome.runtime.id;
    
    // Twitch向けリダイレクトURI
    if (twitchRedirectUri) {
      const twitchUri = `https://${extensionId}.chromiumapp.org/twitch_callback`;
      twitchRedirectUri.textContent = twitchUri;
    }
    
    // YouTube向けリダイレクトURI
    if (youtubeRedirectUri) {
      // 現在のテキストがデフォルトのもの（他の拡張機能ID）かチェック
      const currentUri = youtubeRedirectUri.textContent || '';
      if (currentUri.includes('oauth-redirect.googleusercontent.com/r/') && 
          !currentUri.includes(extensionId)) {
        // 拡張機能IDを使用して新しいURIを生成
        const youtubeUri = `https://oauth-redirect.googleusercontent.com/r/${extensionId}`;
        youtubeRedirectUri.textContent = youtubeUri;
      } else if (!currentUri) {
        // URIが設定されていない場合は新しいものを設定
        const youtubeUri = `https://oauth-redirect.googleusercontent.com/r/${extensionId}`;
        youtubeRedirectUri.textContent = youtubeUri;
      }
    }
    
    console.log('リダイレクトURIの設定が完了しました');
  }
  
  /**
   * イベントリスナーの設定
   */
  function setupEventListeners() {
    console.log('イベントリスナーを設定します');
    
    // 保存ボタン
    if (saveButton) {
      saveButton.addEventListener('click', saveSettings);
    }
    
    // Twitch認証
    if (twitchAuthButton) {
      twitchAuthButton.addEventListener('click', startTwitchAuth);
    }
    
    if (twitchClearAuth) {
      twitchClearAuth.addEventListener('click', clearTwitchAuth);
    }
    
    if (copyTwitchUri) {
      copyTwitchUri.addEventListener('click', () => {
        copyToClipboard(twitchRedirectUri.textContent);
      });
    }
    
    // YouTube認証
    if (youtubeAuthButton) {
      youtubeAuthButton.addEventListener('click', startYoutubeAuth);
    }
    
    if (youtubeClearAuth) {
      youtubeClearAuth.addEventListener('click', clearYoutubeAuth);
    }
    
    if (copyYoutubeUri) {
      copyYoutubeUri.addEventListener('click', () => {
        copyToClipboard(youtubeRedirectUri.textContent);
      });
    }
    
    // TwitCastingユーザーID
    if (addUserIdButton) {
      addUserIdButton.addEventListener('click', addTwitCastingUserId);
    }
    
    // キー入力イベント
    if (twitchClientId) {
      twitchClientId.addEventListener('input', () => {
        if (twitchAuthButton) twitchAuthButton.disabled = !twitchClientId.value;
      });
    }
    
    // カレンダーエクスポート
    if (exportIcalButton) {
      exportIcalButton.addEventListener('click', exportICalendar);
    }
    
    if (exportGoogleButton) {
      exportGoogleButton.addEventListener('click', exportGoogleCalendar);
    }
    
    console.log('イベントリスナーの設定が完了しました');
  }
  
  /**
   * 設定を保存
   */
  async function saveSettings() {
    console.log('設定を保存します');
    
    // 一般設定を取得
    if (updateInterval) settings.updateInterval = parseInt(updateInterval.value);
    if (notificationsEnabled) settings.notificationsEnabled = notificationsEnabled.checked;
    if (badgeEnabled) settings.badgeEnabled = badgeEnabled.checked;
    
    // 新しいUI表示設定を取得
    if (hoverInfoEnabled) settings.hoverInfoEnabled = hoverInfoEnabled.checked;
    if (viewerCountEnabled) settings.viewerCountEnabled = viewerCountEnabled.checked;
    if (platformIconEnabled) settings.platformIconEnabled = platformIconEnabled.checked;
    if (favoriteIconEnabled) settings.favoriteIconEnabled = favoriteIconEnabled.checked;
    
    // スケジュール設定を取得
    if (scheduleUpdateInterval) settings.scheduleUpdateInterval = parseInt(scheduleUpdateInterval.value);
    if (defaultScheduleView) settings.defaultScheduleView = defaultScheduleView.value;
    if (defaultReminderTime) settings.defaultReminderTime = parseInt(defaultReminderTime.value);
    
    // Twitch設定を取得
    if (twitchEnabled) authInfo.twitch.enabled = twitchEnabled.checked;
    if (twitchClientId) authInfo.twitch.clientId = twitchClientId.value;
    
    // YouTube設定を取得
    if (youtubeEnabled) authInfo.youtube.enabled = youtubeEnabled.checked;
    if (youtubeApiKey) authInfo.youtube.apiKey = youtubeApiKey.value;
    if (youtubeClientId) authInfo.youtube.clientId = youtubeClientId.value;
    
    // TwitCasting設定を取得
    if (twitcastingEnabled) authInfo.twitcasting.enabled = twitcastingEnabled.checked;
    if (twitcastingClientId) authInfo.twitcasting.clientId = twitcastingClientId.value;
    if (twitcastingClientSecret) authInfo.twitcasting.clientSecret = twitcastingClientSecret.value;
    
    // フィルター設定を取得
    const defaultPlatformValues = [];
    if (defaultPlatforms) {
      defaultPlatforms.forEach(checkbox => {
        if (checkbox.checked) {
          defaultPlatformValues.push(checkbox.value);
        }
      });
    }
    
    // ストレージにデータを保存する前にコンソールに出力して確認
    console.log('保存する設定:', settings);
    console.log('保存する認証情報:', authInfo);
    
    // 保存
    await new Promise(resolve => {
      chrome.storage.local.set({
        settings,
        authInfo,
        savedFilters,
        favorites
      }, () => {
        if (chrome.runtime.lastError) {
          console.error('保存エラー:', chrome.runtime.lastError);
          resolve(false);
        } else {
          console.log('設定が正常に保存されました');
          resolve(true);
        }
      });
    });
    
    // 設定が保存されたことをユーザーに通知
    showStatusMessage('設定が保存されました');
    
    // バックグラウンドスクリプトにメッセージを送信して更新
    chrome.runtime.sendMessage({ 
      action: 'settingsUpdated',
      settings: settings,
      authInfo: authInfo
    });
    
    console.log('設定の保存が完了しました');
  }
  
  /**
   * ステータスメッセージの表示
   * @param {string} message - 表示するメッセージ
   * @param {boolean} isError - エラーフラグ
   */
  function showStatusMessage(message, isError = false) {
    console.log('ステータスメッセージ:', message, isError ? '(エラー)' : '');
    
    if (!statusMessage) {
      console.error('statusMessage要素が見つかりません');
      return;
    }
    
    statusMessage.textContent = message;
    
    if (isError) {
      statusMessage.classList.add('error');
    } else {
      statusMessage.classList.remove('error');
    }
    
    // 3秒後にメッセージを消す
    setTimeout(() => {
      statusMessage.textContent = '';
    }, 3000);
  }
  
  /**
   * Twitch認証の開始
   */
  function startTwitchAuth() {
    console.log('Twitch認証を開始します');
    
    if (!twitchClientId) {
      console.error('twitchClientId要素が見つかりません');
      return;
    }
    
    const clientId = twitchClientId.value.trim();
    
    if (!clientId) {
      showStatusMessage('Client IDを入力してください', true);
      return;
    }
    
    // 認証状態を保存
    authInfo.twitch.clientId = clientId;
    saveSettings();
    
    // Chrome Identity APIを使用して認証
    chrome.identity.launchWebAuthFlow({
      url: `https://id.twitch.tv/oauth2/authorize?` +
        `client_id=${encodeURIComponent(clientId)}` +
        `&redirect_uri=${encodeURIComponent(twitchRedirectUri.textContent)}` +
        `&response_type=token` +
        `&scope=user:read:follows user:read:subscriptions channel:read:subscriptions`,
      interactive: true
    }, (redirectUrl) => {
      if (chrome.runtime.lastError) {
        showStatusMessage('認証エラー: ' + chrome.runtime.lastError.message, true);
        return;
      }
      
      if (redirectUrl) {
        // URLからアクセストークンを抽出
        const hash = redirectUrl.substring(redirectUrl.indexOf('#') + 1);
        const params = new URLSearchParams(hash);
        const accessToken = params.get('access_token');
        
        if (accessToken) {
          authInfo.twitch.accessToken = accessToken;
          authInfo.twitch.expiresAt = Date.now() + 14400000; // 4時間
          
          if (twitchAuthStatus) {
            twitchAuthStatus.textContent = '認証済み';
            twitchAuthStatus.style.color = '#27ae60';
          }
          
          saveSettings();
          showStatusMessage('Twitch認証が完了しました');
        }
      }
    });
  }
  
  /**
   * Twitch認証のクリア
   */
  function clearTwitchAuth() {
    console.log('Twitch認証をクリアします');
    
    authInfo.twitch.accessToken = '';
    authInfo.twitch.expiresAt = 0;
    
    if (twitchAuthStatus) {
      twitchAuthStatus.textContent = '未認証';
      twitchAuthStatus.style.color = '#e74c3c';
    }
    
    saveSettings();
    showStatusMessage('Twitch認証情報がクリアされました');
  }
  
  /**
   * YouTube認証の開始
   */
  async function startYoutubeAuth() {
    console.log('YouTube認証を開始します');
    console.log('現在の認証情報状態:', authInfo);
    
    if (!youtubeApiKey || !youtubeClientId) {
      console.error('YouTube設定要素が見つかりません');
      return;
    }
    
    const apiKey = youtubeApiKey.value.trim();
    const clientId = youtubeClientId.value.trim();
    
    if (!apiKey) {
      showStatusMessage('API Keyを入力してください', true);
      return;
    }
    
    if (!clientId) {
      showStatusMessage('クライアントIDを入力してください', true);
      return;
    }
    
    // API KeyとクライアントIDを保存
    console.log('保存前のYouTubeクライアントID:', authInfo.youtube.clientId);
    console.log('入力されたYouTubeクライアントID:', clientId);
    
    authInfo.youtube.apiKey = apiKey;
    authInfo.youtube.clientId = clientId;
    authInfo.youtube.enabled = true;
    
    // 即時にストレージに保存して確認
    await new Promise(resolve => {
      chrome.storage.local.set({ authInfo }, () => {
        console.log('認証前にクライアントIDを保存しました');
        resolve();
      });
    });
    
    // 保存後の状態を確認
    const savedData = await new Promise(resolve => {
      chrome.storage.local.get(['authInfo'], resolve);
    });
    console.log('保存後のauthInfo:', savedData.authInfo);
    console.log('保存されたYouTubeクライアントID:', savedData.authInfo?.youtube?.clientId);
    
    // 拡張機能のIDを取得
    const extensionId = chrome.runtime.id;
    
    // リダイレクトURLの決定（表示されているものを使用、なければ生成）
    let redirectUri;
    if (youtubeRedirectUri && youtubeRedirectUri.textContent) {
      redirectUri = youtubeRedirectUri.textContent.trim();
    } else {
      // デフォルトを使用
      redirectUri = `https://oauth-redirect.googleusercontent.com/r/${extensionId}`;
    }
    
    console.log('使用するリダイレクトURI:', redirectUri);
    
    // OAuth2認証URL
    const authUrl = 'https://accounts.google.com/o/oauth2/auth' +
      '?client_id=' + encodeURIComponent(clientId) +
      '&redirect_uri=' + encodeURIComponent(redirectUri) +
      '&response_type=token' +
      '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly');
    
    console.log('認証URL:', authUrl);
    
    // 認証を開始（新しいタブで直接開く方法を試す）
    try {
      chrome.tabs.create({ url: authUrl }, (tab) => {
        console.log('認証タブを開きました:', tab.id);
        
        // タブの更新を監視して認証リダイレクトを検出
        chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, updatedTab) {
          if (tabId === tab.id && changeInfo.url && changeInfo.url.includes(redirectUri)) {
            // リダイレクトを検出
            console.log('認証リダイレクトを検出:', changeInfo.url);
            
            // URLからアクセストークンを抽出
            const url = new URL(changeInfo.url);
            const hash = url.hash.substring(1);
            const params = new URLSearchParams(hash);
            const accessToken = params.get('access_token');
            const expiresIn = params.get('expires_in');
            
            if (accessToken) {
              // タブを閉じる
              chrome.tabs.remove(tabId);
              
              // リスナーを削除
              chrome.tabs.onUpdated.removeListener(listener);
              
              // トークンを保存
              authInfo.youtube.accessToken = accessToken;
              const expiresInMs = expiresIn ? parseInt(expiresIn) * 1000 : 3600000;
              authInfo.youtube.expiresAt = Date.now() + expiresInMs;
              
              if (youtubeAuthStatus) {
                youtubeAuthStatus.textContent = '認証済み';
                youtubeAuthStatus.style.color = '#27ae60';
              }
              
              saveSettings();
              showStatusMessage('YouTube認証が完了しました');
              
              // 認証テスト
              testYoutubeAuth(accessToken);
            }
          }
        });
      });
    } catch (error) {
      console.error('認証タブを開く際にエラーが発生しました:', error);
      showStatusMessage('認証プロセスの開始に失敗しました', true);
    }
  }
  
  /**
   * YouTube認証のクリア
   */
  function clearYoutubeAuth() {
    console.log('YouTube認証をクリアします');
    
    authInfo.youtube.accessToken = '';
    authInfo.youtube.expiresAt = 0;
    
    if (youtubeAuthStatus) {
      youtubeAuthStatus.textContent = '未認証';
      youtubeAuthStatus.style.color = '#e74c3c';
    }
    
    saveSettings();
    showStatusMessage('YouTube認証情報がクリアされました');
  }
  
  /**
   * YouTube認証をテスト
   * @param {string} accessToken - アクセストークン
   */
  function testYoutubeAuth(accessToken) {
    const apiKey = authInfo.youtube.apiKey;
    
    // チャンネル情報を取得するリクエスト
    fetch(`https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&key=${apiKey}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('YouTube API テスト成功:', data);
      if (data.items && data.items.length > 0) {
        showStatusMessage(`認証成功: ${data.items[0].snippet.title} としてログイン中`);
      }
    })
    .catch(error => {
      console.error('YouTube API テストエラー:', error);
      showStatusMessage('認証テストに失敗しました: ' + error.message, true);
    });
  }
  
  /**
   * TwitCastingユーザーIDの追加
   */
  function addTwitCastingUserId() {
    console.log('TwitCastingユーザーIDを追加します');
    
    if (!newUserId) {
      console.error('newUserId要素が見つかりません');
      return;
    }
    
    const userId = newUserId.value.trim();
    
    if (!userId) {
      showStatusMessage('ユーザーIDを入力してください', true);
      return;
    }
    
    // 既存のIDと重複チェック
    if (authInfo.twitcasting.userIds.includes(userId)) {
      showStatusMessage('既に追加されているユーザーIDです', true);
      return;
    }
    
   // 追加
   authInfo.twitcasting.userIds.push(userId);
    
   // UI更新
   updateUserIdsList();
   
   // 入力フィールドをクリア
   newUserId.value = '';
   
   showStatusMessage('ユーザーIDが追加されました');
 }
 
 /**
  * TwitCastingユーザーIDの削除
  * @param {string} userId - 削除するユーザーID
  */
 function removeTwitCastingUserId(userId) {
   console.log('TwitCastingユーザーIDを削除します:', userId);
   
   authInfo.twitcasting.userIds = authInfo.twitcasting.userIds.filter(id => id !== userId);
   
   // UI更新
   updateUserIdsList();
   
   showStatusMessage('ユーザーIDが削除されました');
 }
 
 /**
  * ユーザーIDリストの更新
  */
 function updateUserIdsList() {
   console.log('ユーザーIDリストを更新します');
   
   if (!twitcastingUserIds) {
     console.error('twitcastingUserIds要素が見つかりません');
     return;
   }
   
   twitcastingUserIds.innerHTML = '';
   
   // ユーザーIDがない場合
   if (authInfo.twitcasting.userIds.length === 0) {
     const emptyMessage = document.createElement('div');
     emptyMessage.textContent = 'ユーザーIDが登録されていません';
     emptyMessage.className = 'empty-message';
     twitcastingUserIds.appendChild(emptyMessage);
     return;
   }
   
   // 各ユーザーIDの要素を作成
   authInfo.twitcasting.userIds.forEach(userId => {
     const item = document.createElement('div');
     item.className = 'user-id-item';
     
     const idText = document.createElement('span');
     idText.textContent = userId;
     item.appendChild(idText);
     
     const removeButton = document.createElement('button');
     removeButton.className = 'remove-button';
     removeButton.textContent = '×';
     removeButton.addEventListener('click', () => removeTwitCastingUserId(userId));
     item.appendChild(removeButton);
     
     twitcastingUserIds.appendChild(item);
   });
 }
 
 /**
  * 保存済みフィルターリストの更新
  */
 function updateSavedFiltersList() {
   console.log('保存済みフィルターリストを更新します');
   
   if (!savedFiltersList) {
     console.log('savedFiltersList要素が見つからないか、フィルターが保存されていません');
     return;
   }
   
   savedFiltersList.innerHTML = '';
   
   // フィルターがない場合
   if (savedFilters.length === 0) {
     const emptyMessage = document.createElement('div');
     emptyMessage.textContent = '保存済みフィルターはありません';
     emptyMessage.className = 'empty-message';
     savedFiltersList.appendChild(emptyMessage);
     return;
   }
   
   // 各フィルターの要素を作成
   savedFilters.forEach(filter => {
     const item = document.createElement('div');
     item.className = 'filter-item';
     
     const nameText = document.createElement('div');
     nameText.className = 'name';
     nameText.textContent = filter.name;
     item.appendChild(nameText);
     
     // フィルター詳細
     const details = document.createElement('div');
     details.className = 'details';
     
     // プラットフォーム
     const platforms = filter.platforms.join(', ');
     details.innerHTML = `プラットフォーム: ${platforms}`;
     
     // カテゴリやチャンネル名
     if (filter.category) {
       details.innerHTML += `<br>カテゴリ: ${filter.category}`;
     }
     if (filter.channelName) {
       details.innerHTML += `<br>チャンネル名: ${filter.channelName}`;
     }
     if (filter.minViewers > 0) {
       details.innerHTML += `<br>最小視聴者数: ${filter.minViewers}人`;
     }
     if (filter.favoritesOnly) {
       details.innerHTML += `<br>お気に入りのみ`;
     }
     
     item.appendChild(details);
     
     // 削除ボタン
     const deleteButton = document.createElement('button');
     deleteButton.className = 'delete-button';
     deleteButton.textContent = '×';
     deleteButton.addEventListener('click', () => removeFilter(filter.name));
     item.appendChild(deleteButton);
     
     savedFiltersList.appendChild(item);
   });
 }
 
 /**
  * フィルターの削除
  * @param {string} filterName - 削除するフィルター名
  */
 function removeFilter(filterName) {
   console.log('フィルターを削除します:', filterName);
   
   if (confirm(`フィルター「${filterName}」を削除してもよろしいですか？`)) {
     savedFilters = savedFilters.filter(filter => filter.name !== filterName);
     updateSavedFiltersList();
     showStatusMessage('フィルターが削除されました');
   }
 }
 
 /**
  * お気に入りリストの更新
  */
 function updateFavoritesList() {
   console.log('お気に入りリストを更新します');
   
   if (!favoritesList) {
     console.log('favoritesList要素が見つからないか、お気に入りがありません');
     return;
   }
   
   favoritesList.innerHTML = '';
   
   // お気に入りがない場合
   if (favorites.length === 0) {
     const emptyMessage = document.createElement('div');
     emptyMessage.textContent = 'お気に入り配信者はありません';
     emptyMessage.className = 'empty-message';
     favoritesList.appendChild(emptyMessage);
     return;
   }
   
   // ストリームデータを読み込んでチャンネル名を取得
   chrome.storage.local.get(['streams'], data => {
     const streams = data.streams || [];
     const channelInfo = {};
     
     // チャンネル情報を収集
     streams.forEach(stream => {
       if (!channelInfo[stream.channelId]) {
         channelInfo[stream.channelId] = {
           channelName: stream.channelName,
           platform: stream.platform,
           thumbnail: stream.thumbnail
         };
       }
     });
     
     // お気に入り要素を作成
     favorites.forEach(channelId => {
       const info = channelInfo[channelId] || { 
         channelName: channelId,
         platform: 'unknown'
       };
       
       const item = document.createElement('div');
       item.className = 'favorite-item';
       
       // プラットフォームアイコン
       if (info.platform !== 'unknown') {
         const platformIcon = document.createElement('img');
         platformIcon.className = 'platform-icon';
         platformIcon.src = `images/${info.platform}.svg`;
         platformIcon.alt = info.platform;
         item.appendChild(platformIcon);
       }
       
       // チャンネル名
       const nameText = document.createElement('div');
       nameText.className = 'name';
       nameText.textContent = info.channelName;
       item.appendChild(nameText);
       
       // 削除ボタン
       const removeButton = document.createElement('button');
       removeButton.className = 'remove-button';
       removeButton.textContent = '×';
       removeButton.addEventListener('click', () => removeFavorite(channelId));
       item.appendChild(removeButton);
       
       favoritesList.appendChild(item);
     });
   });
 }
 
 /**
  * お気に入りの削除
  * @param {string} channelId - 削除するチャンネルID
  */
 function removeFavorite(channelId) {
   console.log('お気に入りを削除します:', channelId);
   
   favorites = favorites.filter(id => id !== channelId);
   updateFavoritesList();
   showStatusMessage('お気に入りから削除されました');
 }
 
 /**
  * iCalendarへのエクスポート
  */
 function exportICalendar() {
   console.log('iCalendarにエクスポートします');
   
   chrome.storage.local.get(['schedules'], data => {
     const schedules = data.schedules || [];
     
     if (schedules.length === 0) {
       showStatusMessage('エクスポートするスケジュールがありません', true);
       return;
     }
     
     // iCalendarフォーマットの生成
     let icalContent = [
       'BEGIN:VCALENDAR',
       'VERSION:2.0',
       'PRODID:-//配信通知拡張機能//JP',
       'CALSCALE:GREGORIAN',
       'METHOD:PUBLISH'
     ];
     
     schedules.forEach(schedule => {
       const startDate = new Date(schedule.startTime);
       const endDate = schedule.endTime ? new Date(schedule.endTime) : new Date(startDate.getTime() + 3600000); // 1時間後
       
       const formatDate = (date) => {
         return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+/g, '');
       };
       
       icalContent.push('BEGIN:VEVENT');
       icalContent.push(`UID:${schedule.id}`);
       icalContent.push(`DTSTAMP:${formatDate(new Date())}`);
       icalContent.push(`DTSTART:${formatDate(startDate)}`);
       icalContent.push(`DTEND:${formatDate(endDate)}`);
       icalContent.push(`SUMMARY:${schedule.title || '配信予定'}`);
       icalContent.push(`DESCRIPTION:${schedule.channelName} (${schedule.platform})`);
       icalContent.push(`URL:${schedule.url}`);
       icalContent.push('END:VEVENT');
     });
     
     icalContent.push('END:VCALENDAR');
     
     // ダウンロード
     const blob = new Blob([icalContent.join('\r\n')], { type: 'text/calendar' });
     const url = URL.createObjectURL(blob);
     
     const a = document.createElement('a');
     a.href = url;
     a.download = 'stream_schedules.ics';
     a.click();
     
     setTimeout(() => {
       URL.revokeObjectURL(url);
     }, 100);
     
     showStatusMessage('iCalendarファイルをエクスポートしました');
   });
 }
 
 /**
  * Googleカレンダーへのエクスポート
  */
 function exportGoogleCalendar() {
   console.log('Googleカレンダーにエクスポートします');
   
   chrome.storage.local.get(['schedules'], data => {
     const schedules = data.schedules || [];
     
     if (schedules.length === 0) {
       showStatusMessage('エクスポートするスケジュールがありません', true);
       return;
     }
     
     // 最初の予定だけをエクスポート（Google CalendarのURLパラメータには制限があるため）
     const schedule = schedules[0];
     
     const startDate = new Date(schedule.startTime);
     const endDate = schedule.endTime ? new Date(schedule.endTime) : new Date(startDate.getTime() + 3600000); // 1時間後
     
     // フォーマット：YYYYMMDDTHHmmssZ
     const formatDate = (date) => {
       return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+/g, '');
     };
     
     const params = new URLSearchParams({
       action: 'TEMPLATE',
       text: `${schedule.title || '配信予定'} - ${schedule.channelName}`,
       dates: `${formatDate(startDate)}/${formatDate(endDate)}`,
       details: `${schedule.channelName} (${schedule.platform}) - ${schedule.url}`,
       location: schedule.url
     });
     
     const googleCalendarUrl = `https://calendar.google.com/calendar/render?${params.toString()}`;
     
     // 新しいタブでGoogleカレンダーを開く
     chrome.tabs.create({ url: googleCalendarUrl });
     
     showStatusMessage('Googleカレンダーにエクスポートしました');
   });
 }
 
 /**
  * クリップボードにコピー
  * @param {string} text - コピーするテキスト
  */
 function copyToClipboard(text) {
   console.log('テキストをクリップボードにコピーします:', text);
   
   // 新しいClipboard APIを使用（より安全で推奨される方法）
   if (navigator.clipboard && navigator.clipboard.writeText) {
     navigator.clipboard.writeText(text)
       .then(() => {
         showStatusMessage('クリップボードにコピーしました');
       })
       .catch(err => {
         console.error('コピーエラー:', err);
         // フォールバック: 古い方法を試す
         legacyCopyToClipboard(text);
       });
   } else {
     // Clipboard APIが利用できない場合は古い方法を使用
     legacyCopyToClipboard(text);
   }
 }
 
 /**
  * 古い方法でクリップボードにコピー
  * @param {string} text - コピーするテキスト 
  */
 function legacyCopyToClipboard(text) {
   try {
     const textArea = document.createElement('textarea');
     textArea.value = text;
     textArea.style.position = 'fixed';  // 画面外に配置
     textArea.style.top = '-9999px';
     textArea.style.left = '-9999px';
     document.body.appendChild(textArea);
     textArea.focus();
     textArea.select();
     
     const successful = document.execCommand('copy');
     if (successful) {
       showStatusMessage('クリップボードにコピーしました');
     } else {
       showStatusMessage('コピーに失敗しました', true);
     }
     
     document.body.removeChild(textArea);
   } catch (err) {
     console.error('コピーエラー:', err);
     showStatusMessage('コピーに失敗しました', true);
   }
 }
 
 /**
  * 認証リダイレクトを確認
  */
 function checkAuthRedirect() {
   console.log('認証リダイレクトを確認します');
   
   const hash = window.location.hash;
   const path = window.location.pathname;
   const queryParams = new URLSearchParams(window.location.search);
   
   // Twitch認証コールバック
   if (path.includes('callback.html') && hash) {
     const params = new URLSearchParams(hash.slice(1));
     const accessToken = params.get('access_token');
     
     if (accessToken) {
       authInfo.twitch.accessToken = accessToken;
       authInfo.twitch.expiresAt = Date.now() + 14400000; // 4時間
       
       if (twitchAuthStatus) {
         twitchAuthStatus.textContent = '認証済み';
         twitchAuthStatus.style.color = '#27ae60';
       }
       
       saveSettings();
       showStatusMessage('Twitch認証が完了しました');
     }
   }
   
   // YouTube認証コールバック
   if (queryParams.has('youtube_auth') && queryParams.has('access_token')) {
     const accessToken = queryParams.get('access_token');
     
     if (accessToken) {
       authInfo.youtube.accessToken = accessToken;
       authInfo.youtube.expiresAt = Date.now() + 3600000; // 1時間（デフォルト）
       
       if (youtubeAuthStatus) {
         youtubeAuthStatus.textContent = '認証済み';
         youtubeAuthStatus.style.color = '#27ae60';
       }
       
       saveSettings();
       showStatusMessage('YouTube認証が完了しました');
       
       // URLパラメータを削除してリロード（履歴に認証情報を残さない）
       const cleanUrl = window.location.pathname;
       window.history.replaceState({}, document.title, cleanUrl);
     }
   }
 }
 
/**
 * プラットフォーム更新順序のドラッグ&ドロップ機能を設定
 */
function setupPlatformOrderDragDrop() {
  const container = document.querySelector('.platform-order-container');
  const items = document.querySelectorAll('.platform-order-item');
  
  if (!container || items.length === 0) {
    console.log('プラットフォーム更新順序の要素が見つかりません');
    return;
  }
  
  let draggedItem = null;
  
  // 各アイテムにドラッグイベントを追加
  items.forEach(item => {
    // ドラッグ開始
    item.addEventListener('dragstart', function(e) {
      draggedItem = this;
      setTimeout(() => {
        this.classList.add('dragging');
      }, 0);
    });
    
    // ドラッグ終了
    item.addEventListener('dragend', function() {
      this.classList.remove('dragging');
      draggedItem = null;
      
      // 順序を保存
      savePlatformOrder();
    });
    
    // ドラッグオーバー（他の要素の上）
    item.addEventListener('dragover', function(e) {
      e.preventDefault();
    });
    
    // ドラッグエンター（他の要素に入った）
    item.addEventListener('dragenter', function(e) {
      e.preventDefault();
      if (this !== draggedItem) {
        this.classList.add('over');
      }
    });
    
    // ドラッグリーブ（他の要素から出た）
    item.addEventListener('dragleave', function() {
      this.classList.remove('over');
    });
    
    // ドロップ（他の要素にドロップした）
    item.addEventListener('drop', function(e) {
      e.preventDefault();
      if (this !== draggedItem) {
        this.classList.remove('over');
        
        // ドロップした位置によって前後を判断
        const bounding = this.getBoundingClientRect();
        const offset = bounding.y + (bounding.height / 2);
        
        if (e.clientY - offset > 0) {
          // 下にドロップ
          container.insertBefore(draggedItem, this.nextSibling);
        } else {
          // 上にドロップ
          container.insertBefore(draggedItem, this);
        }
      }
    });
    
    // ドラッグ操作を有効にする
    item.setAttribute('draggable', 'true');
  });
}

/**
 * プラットフォームの更新順序を保存
 */
function savePlatformOrder() {
  const items = document.querySelectorAll('.platform-order-item');
  const platformOrder = [];
  
  items.forEach(item => {
    platformOrder.push(item.dataset.platform);
  });
  
  // settings オブジェクトに更新順序を追加
  settings.platformUpdateOrder = platformOrder;
  
  console.log('プラットフォーム更新順序を保存:', platformOrder);
}

/**
 * 保存されたプラットフォーム更新順序をUIに反映
 */
function updatePlatformOrderUI() {
  if (!settings.platformUpdateOrder || settings.platformUpdateOrder.length === 0) {
    console.log('保存された更新順序がありません');
    return;
  }
  
  const container = document.querySelector('.platform-order-container');
  if (!container) return;
  
  // 現在の順序を取得
  const currentOrder = Array.from(document.querySelectorAll('.platform-order-item')).map(item => item.dataset.platform);
  
  // 保存された順序と現在の順序が異なる場合のみ更新
  if (JSON.stringify(currentOrder) !== JSON.stringify(settings.platformUpdateOrder)) {
    // 要素を保存済みの順序に並べ替え
    settings.platformUpdateOrder.forEach(platform => {
      const item = document.querySelector(`.platform-order-item[data-platform="${platform}"]`);
      if (item) {
        container.appendChild(item);
      }
    });
  }
}

 // 初期化実行
 init();
});