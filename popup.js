// タブ切り替えイベントリスナーを修正
tabButtons.forEach(button => {
  button.addEventListener('click', (e) => {
    // 前回のタブを記録
    const previousTab = currentPlatformTab;
    
    // 現在のタブを更新
    currentPlatformTab = e.target.dataset.platform;
    
    console.log(`タブを切り替え: ${previousTab} -> ${currentPlatformTab}`);

    // 前のタブの更新を中断
    if (isAnyPlatformUpdating()) {
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