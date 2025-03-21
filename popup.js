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
    
    // ステータスメッセージを更新
    if (statusMessage) {
      statusMessage.textContent = '更新中...';
    }
    
    // 表示を更新
    displayStreams();
  });
});

/**
 * 更新リクエストを送信する（実際のリクエスト部分を分離）
 * @param {string} platform - 更新するプラットフォーム
 */
function sendUpdateRequest(platform) {
  console.log(`${platform}の更新リクエストを送信`);
  
  // リクエスト開始時のタブを記録
  const requestTab = currentPlatformTab;
  
  // ローダーを表示
  if (loader) {
    loader.classList.remove('hidden');
    loader.textContent = getUpdatingMessage();
  }
  
  // 特定のプラットフォームのみ更新するためのメッセージを送信
  chrome.runtime.sendMessage({ 
    action: 'checkStreams',
    platform: platform
  }, response => {
    // タブが切り替わっていたら結果を無視
    if (requestTab !== currentPlatformTab) {
      console.log(`タブが切り替わったため ${platform} の更新結果を無視`);
      return;
    }
    
    // 更新完了の処理
    updatingPlatforms[platform] = false;
    
    if (response && response.success) {
      // APIエラーフラグをリセット（YouTubeのクォータエラーは特別扱い）
      if (!(platform === 'youtube' && platformErrors.youtube)) {
        platformErrors[platform] = false;
      }
      
      // プラットフォーム別のデータを更新（確実に正しいプラットフォームのデータのみを保存）
      if (platform === 'twitch') {
        platformStreams.twitch = response.streams.filter(stream => stream.platform === 'twitch');
        console.log(`Twitchストリーム更新: ${platformStreams.twitch.length}件`);
      } else if (platform === 'youtube') {
        platformStreams.youtube = response.streams.filter(stream => stream.platform === 'youtube');
        console.log(`YouTubeストリーム更新: ${platformStreams.youtube.length}件`);
      } else if (platform === 'twitcasting') {
        platformStreams.twitcasting = response.streams.filter(stream => stream.platform === 'twitcasting');
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
        loader.classList.remove('hidden');
        loader.textContent = getUpdatingMessage();
      } else {
        loader.classList.add('hidden');
      }
    }
  });
}

/**
 * 更新エラーを処理する
 * @param {string} platform - エラーが発生したプラットフォーム
 * @param {string} errorMessage - エラーメッセージ
 */
function handleUpdateError(platform, errorMsg) {
  console.error(`${platform}の更新に失敗:`, errorMsg);
  
  // プラットフォーム別のエラーフラグを設定
  platformErrors[platform] = true;
  
  // エラーメッセージ要素が存在する場合
  if (errorMessage) {
    if (platform === 'youtube' && errorMsg.includes('quota')) {
      // YouTubeのクォータエラーの場合は特別なメッセージを表示
      errorMessage.innerHTML = `
        <div class="api-error-container">
          <p>YouTube APIの制限に達しました。制限は24時間後にリセットされます。</p>
          <a href="https://www.youtube.com/subscriptions" target="_blank" class="youtube-link-button">YouTubeを開く</a>
        </div>`;
      errorMessage.classList.remove('hidden');
    } else {
      // 通常のエラーメッセージ
      errorMessage.textContent = `${platform}の更新に失敗しました: ${errorMsg}`;
      errorMessage.classList.remove('hidden');
    }
  }
  
  // ステータスメッセージも更新
  if (statusMessage) {
    statusMessage.textContent = `最終更新: ${Utils.formatDate(new Date(), 'time')} (一部エラー)`;
  }
} 