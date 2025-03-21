// タブ切り替えイベントリスナーを修正
tabButtons.forEach(button => {
  button.addEventListener('click', async (e) => {
    // 前回のタブを記録
    const previousTab = currentPlatformTab;
    
    // 現在のタブを更新
    currentPlatformTab = e.target.dataset.platform;
    
    console.log(`タブを切り替え: ${previousTab} -> ${currentPlatformTab}`);

    // 前のタブの更新を中断
    if (isAnyPlatformUpdating()) {
      // バックグラウンドに実行中のリクエストをキャンセルするよう通知
      await new Promise(resolve => {
        chrome.runtime.sendMessage({ 
          action: 'cancelUpdates',
          platforms: Object.keys(updatingPlatforms).filter(p => updatingPlatforms[p])
        }, response => {
          console.log('更新キャンセル結果:', response);
          resolve();
        });
      });
      
      // 更新中のプラットフォームをキャンセル
      for (const platform in updatingPlatforms) {
        if (updatingPlatforms[platform]) {
          console.log(`${platform}の更新を中断`);
          updatingPlatforms[platform] = false;
        }
      }
      
      // 更新キューをクリア
      updateQueue = [];
      
      // ローダーを非表示
      if (loader) {
        loader.classList.add('hidden');
      }
    }
    
    // すべてのタブから active クラスを削除
    tabButtons.forEach(btn => {
      btn.classList.remove('active');
    });
    
    // クリックされたタブに active クラスを追加
    e.target.classList.add('active');
    
    // 選択したタブを保存
    chrome.storage.local.set({ 'lastActiveTab': currentPlatformTab }, () => {
      console.log(`タブ "${currentPlatformTab}" を保存しました`);
    });
    
    // グリッドを一旦クリア
    if (streamsGrid) {
      streamsGrid.innerHTML = '';
    }
    
    // 新しいタブのデータを取得
    if (currentPlatformTab === 'all') {
      updatePlatformsInOrder();
    } else {
      requestUpdate(currentPlatformTab);
    }
    
    // 表示を更新
    displayStreams();
  });
});

/**
 * プラットフォーム更新のリクエストを管理
 * @param {string} platform - 更新するプラットフォーム
 */
function requestUpdate(platform, isUserInitiated = false) {
  console.log(`${platform}の更新をリクエスト`);
  
  // 更新中フラグを確認
  if (updatingPlatforms[platform]) {
    console.log(`${platform}は既に更新中です`);
    return;
  }
  
  // 前回の更新からの経過時間を確認
  const now = Date.now();
  const lastUpdateKey = `last${platform.charAt(0).toUpperCase() + platform.slice(1)}Update`;
  
  chrome.storage.local.get([lastUpdateKey], (data) => {
    const lastUpdate = data[lastUpdateKey] || 0;
    const timeSinceLastUpdate = now - lastUpdate;
    
    // 一定時間内の重複更新を防止（10秒）
    if (timeSinceLastUpdate < 10000) {
      console.log(`${platform}の前回の更新から${Math.floor(timeSinceLastUpdate/1000)}秒しか経過していません。スキップします`);
      return;
    }
    
    // 更新中フラグを設定
    updatingPlatforms[platform] = true;
    
    // ローダーを表示
    if (loader) {
      loader.textContent = getUpdatingMessage();
      loader.classList.remove('hidden');
    }
    
    // 実際の更新リクエストを送信
    sendUpdateRequest(platform, isUserInitiated);
    
    // 最終更新時間を保存
    chrome.storage.local.set({ [lastUpdateKey]: now });
  });
}

/**
 * 更新リクエストを送信する（実際のリクエスト部分を分離）
 * @param {string} platform - 更新するプラットフォーム
 */
function sendUpdateRequest(platform, isUserInitiated = false) {
  console.log(`${platform}の更新リクエストを送信`);
  
  // リクエスト開始時のタブを記録
  const requestTab = currentPlatformTab;
  
  // ローダーを表示
  if (loader) {
    loader.textContent = getUpdatingMessage();
    loader.classList.remove('hidden');
  }
  
  // ログ記録
  logMessage(`${platform}の更新リクエストを送信`, { time: new Date().toISOString() });
  
  // 特定のプラットフォームのみ更新するためのメッセージを送信
  chrome.runtime.sendMessage({ 
    action: 'checkStreams',
    platform: platform,
    isUserInitiated: isUserInitiated
  }, response => {
    // タブが切り替わっていたら結果を無視
    if (requestTab !== currentPlatformTab) {
      console.log(`タブが切り替わったため ${platform} の更新結果を無視`);
      return;
    }
    
    // 更新完了の処理
    updatingPlatforms[platform] = false;
    
    if (response && response.success) {
      // noRefreshフラグがある場合は処理をスキップ
      if (response.noRefresh) {
        console.log(`${platform}: ${response.info || '更新なし'}`);
        
        // 情報メッセージを表示
        if (statusMessage) {
          statusMessage.textContent = response.info || '最近更新済み';
          // 3秒後に元に戻す
          setTimeout(() => {
            chrome.storage.local.get([`last${platform.charAt(0).toUpperCase() + platform.slice(1)}Update`], (data) => {
              const lastUpdate = data[`last${platform.charAt(0).toUpperCase() + platform.slice(1)}Update`] || Date.now();
              statusMessage.textContent = `最終更新: ${Utils.formatDate(new Date(lastUpdate), 'time')}`;
            });
          }, 3000);
        }
        
        // 次のプラットフォームの更新をチェック
        checkNextPlatformUpdate();
        
        // 更新状態の表示を更新
        if (loader) {
          if (isAnyPlatformUpdating() || updateQueue.length > 0) {
            loader.textContent = getUpdatingMessage();
          } else {
            loader.classList.add('hidden');
          }
        }
        
        return;
      }
      
      // APIエラーフラグをリセット（YouTubeのクォータエラーは特別扱い）
      if (!(platform === 'youtube' && platformErrors.youtube)) {
        platformErrors[platform] = false;
      }
      
      // プラットフォーム別のデータを更新（確実に正しいプラットフォームのデータのみを保存）
      if (platform === 'twitch') {
        platformStreams.twitch = response.streams.map(stream => ({
          ...stream,
          platform: 'twitch'
        }));
        console.log(`Twitchストリーム更新: ${platformStreams.twitch.length}件`);
      } else if (platform === 'youtube') {
        platformStreams.youtube = response.streams.map(stream => ({
          ...stream,
          platform: 'youtube'
        }));
        console.log(`YouTubeストリーム更新: ${platformStreams.youtube.length}件`);
      } else if (platform === 'twitcasting') {
        platformStreams.twitcasting = response.streams.map(stream => ({
          ...stream,
          platform: 'twitcasting'
        }));
        console.log(`TwitCastingストリーム更新: ${platformStreams.twitcasting.length}件`);
      }
      
      // 全体のストリームも更新
      allStreams = [
        ...platformStreams.twitch,
        ...platformStreams.youtube,
        ...platformStreams.twitcasting
      ];
      
      console.log(`${platform}の更新完了: 全${allStreams.length}件の配信`);
      if (statusMessage) statusMessage.textContent = `最終更新: ${Utils.formatDate(new Date(), 'time')}`;
      
      // エラーメッセージの表示状態はYouTubeのクォータ制限エラーに応じて調整
      if (platform === 'youtube' && !platformErrors.youtube) {
        if (errorMessage && (currentPlatformTab === 'youtube' || currentPlatformTab === 'all')) {
          errorMessage.classList.add('hidden');
        }
      }
      
      // 表示を更新（現在のタブに関係なく更新）
      displayStreams();
    } else {
      handleUpdateError(platform, response ? response.error : '更新に失敗しました');
    }
    
    // 次のプラットフォームの更新をチェック
    checkNextPlatformUpdate();
    
    // 更新状態の表示を更新
    if (loader) {
      if (isAnyPlatformUpdating() || updateQueue.length > 0) {
        loader.textContent = getUpdatingMessage();
      } else {
        loader.classList.add('hidden');
      }
    }
  });
}

// デバッグ関連の関数を追加
function logMessage(message, data) {
  if (chrome.runtime && chrome.runtime.id) {
    chrome.storage.local.get(['settings'], result => {
      if (result.settings && result.settings.debugModeEnabled) {
        console.log(`[${new Date().toISOString()}][popup] ${message}`, data || '');
      }
    });
  }
}

// DOMContentLoaded イベントリスナーを修正
document.addEventListener('DOMContentLoaded', async () => {
  // デバッグモードを一時的に有効化
  chrome.storage.local.set({
    settings: {
      debugModeEnabled: true,
      testModeEnabled: false
    }
  }, () => {
    console.log('デバッグモードを有効化しました');
  });
  
  // 各プラットフォームの最新のキャッシュデータを取得して表示
  chrome.storage.local.get(['youtubeData', 'twitchData', 'twitcastingData'], (data) => {
    // キャッシュデータがあれば読み込む
    if (data.youtubeData) {
      platformStreams.youtube = data.youtubeData;
      console.log(`YouTubeキャッシュデータを読み込み: ${platformStreams.youtube.length}件`);
    }
    
    if (data.twitchData) {
      platformStreams.twitch = data.twitchData;
      console.log(`Twitchキャッシュデータを読み込み: ${platformStreams.twitch.length}件`);
    }
    
    if (data.twitcastingData) {
      platformStreams.twitcasting = data.twitcastingData;
      console.log(`TwitCastingキャッシュデータを読み込み: ${platformStreams.twitcasting.length}件`);
    }
    
    // 全体のストリームも更新
    allStreams = [
      ...platformStreams.twitch,
      ...platformStreams.youtube,
      ...platformStreams.twitcasting
    ];
    
    // 表示を更新
    displayStreams();
  });
  
  // 前回の更新から一定時間経過しているか確認
  // 30秒以上経過していれば自動更新（短縮）
  const checkLastUpdate = (platform) => {
    const lastUpdateKey = `last${platform.charAt(0).toUpperCase() + platform.slice(1)}Update`;
    
    chrome.storage.local.get([lastUpdateKey], (data) => {
      const now = Date.now();
      const lastUpdate = data[lastUpdateKey] || 0;
      
      if ((now - lastUpdate) > 30000) { // 30秒以上経過
        if (currentPlatformTab === platform || currentPlatformTab === 'all') {
          requestUpdate(platform);
        }
      } else {
        console.log(`前回の${platform}更新から${Math.floor((now - lastUpdate)/1000)}秒しか経過していません。初期更新をスキップします`);
      }
    });
  };
  
  // 現在のタブに基づいて更新
  if (currentPlatformTab === 'all') {
    // すべてのプラットフォームをチェック - 間隔を広げる
    setTimeout(() => checkLastUpdate('youtube'), 0);
    setTimeout(() => checkLastUpdate('twitch'), 3000);  // 3秒後
    setTimeout(() => checkLastUpdate('twitcasting'), 6000);  // 6秒後
  } else if (['youtube', 'twitch', 'twitcasting'].includes(currentPlatformTab)) {
    checkLastUpdate(currentPlatformTab);
  }
});

// 更新ボタンのイベントリスナー
document.getElementById('refreshButton').addEventListener('click', () => {
  if (currentPlatformTab === 'all') {
    updatePlatformsInOrder(true);
  } else {
    requestUpdate(currentPlatformTab, true);
  }
});

function displayStreams() {
  if (!streamsGrid) return;
  
  console.log('displayStreams呼び出し - 現在のタブ:', currentPlatformTab);
  console.log('表示データ:', {
    all: allStreams.length,
    twitch: platformStreams.twitch.length,
    youtube: platformStreams.youtube.length,
    twitcasting: platformStreams.twitcasting.length
  });
  
  // 表示するストリーム
  let streamsToDisplay = [];
  
  if (currentPlatformTab === 'all') {
    streamsToDisplay = allStreams;
  } else if (currentPlatformTab === 'twitch') {
    streamsToDisplay = platformStreams.twitch;
  } else if (currentPlatformTab === 'youtube') {
    streamsToDisplay = platformStreams.youtube;
  } else if (currentPlatformTab === 'twitcasting') {
    streamsToDisplay = platformStreams.twitcasting;
  }
  
  console.log(`表示対象: ${streamsToDisplay.length}件`);
  
  // ここに実際の表示ロジック...
}

// 変数の初期化が適切に行われているか確認
let platformStreams = {
  twitch: [],
  youtube: [],
  twitcasting: []
};

let allStreams = []; 