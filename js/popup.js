/**
 * 配信通知拡張機能のポップアップスクリプト
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM要素
  const streamsGrid = document.getElementById('streams-grid');
  const loader = document.getElementById('loader');
  const errorMessage = document.getElementById('error-message');
  const noStreams = document.getElementById('no-streams');
  const statusMessage = document.getElementById('status-message');
  const refreshButton = document.getElementById('refresh-button');
  const filterToggle = document.getElementById('filter-toggle');
  const filterPanel = document.getElementById('filter-panel');
  const settingsButton = document.getElementById('settings-button');
  const scheduleButton = document.getElementById('schedule-button');
  const tabButtons = document.querySelectorAll('.tab-button');
  
  // ホバー情報表示用要素
  const streamHoverInfo = document.getElementById('stream-hover-info');
  const hoverChannelTitle = streamHoverInfo.querySelector('.channel-title');
  const hoverStreamDetails = streamHoverInfo.querySelector('.stream-details');
  const hoverGameCategory = streamHoverInfo.querySelector('.game-category');
  
  // フィルター要素
  const platformCheckboxes = document.querySelectorAll('input[name="platform"]');
  const categoryFilter = document.getElementById('category-filter');
  const channelFilter = document.getElementById('channel-filter');
  const viewerFilter = document.getElementById('viewer-filter');
  const viewerCount = document.getElementById('viewer-count');
  const favoritesOnly = document.getElementById('favorites-only');
  const saveFilterButton = document.getElementById('save-filter');
  const resetFilterButton = document.getElementById('reset-filter');
  const savedFilterList = document.getElementById('saved-filter-list');
  const loadFilterButton = document.getElementById('load-filter');
  const deleteFilterButton = document.getElementById('delete-filter');
  
  // 状態管理
  let allStreams = [];
  let currentFilter = {
    platforms: [],
    category: '',
    channelName: '',
    minViewers: 0,
    favoritesOnly: false
  };
  let favorites = [];
  let savedFilters = [];
  let currentPlatformTab = 'all'; // デフォルト値
  
  // 更新状態の管理
  let updatingPlatforms = {
    twitch: false,
    youtube: false,
    twitcasting: false
  };
  
  // プラットフォームごとのストリーム
  let platformStreams = {
    twitch: [],
    youtube: [],
    twitcasting: []
  };
  
  // 最後のポップアップ表示時間
  let lastPopupOpenTime = 0;
  
  // 更新キューを保持する変数
  let updateQueue = [];

  // API制限エラーフラグ
  let platformErrors = {
    twitch: false,
    youtube: false,
    twitcasting: false
  };
  
  let selectedTab = "all";
  let platforms = [];
  let isOpen = false;
  
  /**
   * 初期化処理
   */
  async function init() {
    console.log('ポップアップを初期化しています...');
    
    try {
      // 前回選択されていたタブを取得
      const lastTab = await Utils.getStorageData('lastActiveTab', 'all');
      currentPlatformTab = lastTab;
      console.log(`前回選択されていたタブを復元: ${currentPlatformTab}`);
      
      // タブUIを更新
      updateTabUI();
      
      // 現在のタブに応じたデータのみを更新
      if (currentPlatformTab === 'all') {
        // すべてのプラットフォームのデータを表示（更新はしない）
        displayStreams();
      } else {
        // 特定のプラットフォームのみ更新
        requestUpdate(currentPlatformTab);
      }
      
      // DOM要素の存在確認
      if (!streamsGrid || !loader || !errorMessage || !noStreams || !statusMessage) {
        console.error('必須のDOM要素が見つかりません');
        return;
      }
      
      // ボタン要素の存在確認
      if (!refreshButton || !filterToggle || !filterPanel || !settingsButton || !scheduleButton) {
        console.error('ボタン要素が見つかりません');
      }
      
      // UI初期化
      setupEventListeners();
      
      // ヘッダーボタンのテキストを絵文字に変更
      updateHeaderIcons();
      
      // 最終ポップアップ表示時間を取得
      lastPopupOpenTime = await Utils.getStorageData('lastPopupOpenTime', 0);
      
      // 現在の時間を保存
      const currentTime = Date.now();
      await Utils.setStorageData({'lastPopupOpenTime': currentTime});
      
      // ポップアップを開いた回数をカウント（デバッグ用）
      let openCount = await Utils.getStorageData('popupOpenCount', 0);
      openCount++;
      await Utils.setStorageData({'popupOpenCount': openCount});
      console.log(`ポップアップを開いた回数: ${openCount}`);
      
      // 保存されたフィルターを読み込む
      savedFilters = await Utils.getStorageData('savedFilters', []);
      updateSavedFiltersList();
      
      // スライダー値の表示を更新
      updateSliderValue();
      
      // フィルター初期化
      initializeFilters();

      try {
        // 非同期で並行して複数のデータを読み込む
        const [storedData, lastTab, apiErrors, youtubeQuotaError] = await Promise.all([
          // 保存された配信データを取得
          new Promise(resolve => {
            chrome.storage.local.get(['streams', 'favorites', 'settings', 'lastUpdate'], (data) => {
              resolve(data);
            });
          }),
          // 保存されたタブ情報を取得
          new Promise(resolve => {
            chrome.storage.local.get(['lastActiveTab'], (data) => {
              resolve(data.lastActiveTab || 'all');
            });
          }),
          // API制限エラー情報を取得
          new Promise(resolve => {
            chrome.storage.local.get(['platformErrors'], (data) => {
              resolve(data.platformErrors || {});
            });
          }),
          // YouTube APIクォータエラー情報を特に取得
          new Promise(resolve => {
            chrome.storage.local.get(['youtubeQuotaError'], (data) => {
              resolve(data.youtubeQuotaError || null);
            });
          })
        ]);

        // API制限エラー情報を設定
        if (apiErrors && typeof apiErrors === 'object') {
          platformErrors = { ...platformErrors, ...apiErrors };
          console.log('API制限エラー情報を設定:', platformErrors);
        }

        // YouTube APIクォータエラーが明示的に存在する場合は必ずフラグを立てる
        if (youtubeQuotaError) {
          // 24時間以内のエラーなら有効
          const errorAge = Date.now() - youtubeQuotaError.timestamp;
          const HOURS_24 = 24 * 60 * 60 * 1000;
          
          if (errorAge < HOURS_24) {
            platformErrors.youtube = true;
            console.log('YouTubeのAPIクォータエラーフラグを設定しました（24時間以内のエラー）');
          } else {
            console.log('YouTubeのAPIクォータエラーは24時間以上経過しているため、リセット');
          }
        }

        // 設定を適用
        if (storedData.settings) {
          settings = storedData.settings;
          console.log('設定を読み込みました', settings);
        } else {
          settings = {
            hoverInfoEnabled: true,
            viewerCountEnabled: true,
            platformIconEnabled: true,
            favoriteIconEnabled: true,
            platformUpdateOrder: ['twitch', 'youtube', 'twitcasting']
          };
        }
        
        // 配信データを適用
        if (storedData.streams && storedData.streams.length > 0) {
          allStreams = storedData.streams;
          console.log(`${allStreams.length}件の配信データを読み込みました`);
          
          // プラットフォームごとにデータを振り分け
          platformStreams.twitch = allStreams.filter(stream => stream.platform === 'twitch');
          platformStreams.youtube = allStreams.filter(stream => stream.platform === 'youtube');
          platformStreams.twitcasting = allStreams.filter(stream => stream.platform === 'twitcasting');
          
          console.log(`Twitch: ${platformStreams.twitch.length}件`);
          console.log(`YouTube: ${platformStreams.youtube.length}件`);
          console.log(`TwitCasting: ${platformStreams.twitcasting.length}件`);
        }
        
        // お気に入りを適用
        if (storedData.favorites) {
          favorites = storedData.favorites;
        }
        
        // 最終更新時間を表示
        if (storedData.lastUpdate) {
          statusMessage.textContent = `最終更新: ${Utils.formatDate(storedData.lastUpdate, 'time')}`;
        }
        
        // 保存されたタブを設定
        currentPlatformTab = lastTab;
        console.log(`前回選択されていたタブを復元: ${currentPlatformTab}`);
        
        // タブUIを更新
        updateTabUI();
        
        // 配信を表示（この時点でYouTubeエラーがあれば表示される）
        displayStreams();
        
        // 前回の表示から1分以上経過していれば自動更新
        const ONE_MINUTE = 60 * 1000; // 1分をミリ秒で表現
        if (currentTime - (storedData.lastUpdate || 0) > ONE_MINUTE || !storedData.lastUpdate) {
          console.log('前回の更新から1分以上経過したため、自動更新を実行します');
          // UI更新が完了してから自動更新を開始
          setTimeout(() => {
            requestUpdate('all');
          }, 300);
        }
      } catch (error) {
        console.error('初期化中にエラーが発生しました:', error);
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = '初期化エラー: ' + error.message;
      }
    } catch (error) {
      console.error('初期化中にエラーが発生しました:', error);
      errorMessage.classList.remove('hidden');
      errorMessage.textContent = '初期化エラー: ' + error.message;
    }
  }
  
  // タブ変更時のデータ取得
  async function fetchPlatforms() {
    if (!isOpen) return;
    
    try {
      if (selectedTab === "all") {
        const response = await fetch("/api/platforms");
        const data = await response.json();
        platforms = data;
      } else {
        const response = await fetch(`/api/platforms/${selectedTab.toLowerCase()}`);
        const data = await response.json();
        platforms = [data];
      }
      updatePlatformDisplay(); // プラットフォーム表示を更新する関数
    } catch (error) {
      console.error("プラットフォームの取得に失敗しました:", error);
    }
  }

  // ポップアップを開いた時の初期データ取得
  async function fetchInitialPlatform() {
    if (!isOpen) return;
    
    try {
      if (selectedTab === "all") {
        const response = await fetch("/api/platforms");
        const data = await response.json();
        platforms = data;
      } else {
        const response = await fetch(`/api/platforms/${selectedTab.toLowerCase()}`);
        const data = await response.json();
        platforms = [data];
      }
      updatePlatformDisplay(); // プラットフォーム表示を更新する関数
    } catch (error) {
      console.error("プラットフォームの取得に失敗しました:", error);
    }
  }

  // タブ切り替えイベントリスナーを修正
  tabButtons.forEach(button => {
    button.addEventListener('click', (e) => {
      // 前回のタブを記録
      const previousTab = currentPlatformTab;
      
      // 現在のタブを更新
      currentPlatformTab = e.target.dataset.platform;
      
      console.log(`タブを切り替え: ${previousTab} -> ${currentPlatformTab}`);
      
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
   * ヘッダーボタンのアイコンを絵文字に更新
   */
  function updateHeaderIcons() {
    if (refreshButton) {
      refreshButton.innerHTML = '🔄';
      refreshButton.title = '更新';
    }
    if (filterToggle) {
      filterToggle.innerHTML = '🔍';
      filterToggle.title = 'フィルター';
    }
    if (settingsButton) {
      settingsButton.innerHTML = '⚙️';
      settingsButton.title = '設定';
    }
    if (scheduleButton) {
      scheduleButton.innerHTML = '📅';
      scheduleButton.title = 'スケジュール';
    }
  }
  
  /**
   * タブUIを更新する
   */
  function updateTabUI() {
    console.log('タブUIを更新: 現在のタブ =', currentPlatformTab);
    
    // すべてのタブのアクティブ状態をリセット
    tabButtons.forEach(btn => {
      btn.classList.remove('active');
    });
    
    // 現在のタブをアクティブにする
    let activeTabFound = false;
    
    tabButtons.forEach(btn => {
      if (btn.dataset.platform === currentPlatformTab) {
        btn.classList.add('active');
        activeTabFound = true;
        console.log(`タブ "${currentPlatformTab}" をアクティブに設定しました`);
      }
    });
    
    // アクティブなタブが見つからなかった場合は「すべて」をデフォルトにする
    if (!activeTabFound) {
      tabButtons.forEach(btn => {
        if (btn.dataset.platform === 'all') {
          btn.classList.add('active');
          currentPlatformTab = 'all';
          console.log('有効なタブが見つからないため "all" タブをアクティブに設定');
        }
      });
    }
  }
  
  
  /**
   * イベントリスナーの設定
   */
  function setupEventListeners() {
    // 更新ボタン
    if (refreshButton) {
      refreshButton.addEventListener('click', () => {
        // 現在選択中のタブに基づいて更新
        if (currentPlatformTab === 'all') {
          requestUpdate('all');
        } else {
          requestUpdate(currentPlatformTab);
        }
      });
    }
    
    // フィルターパネルの表示切り替え
    if (filterToggle && filterPanel) {
      filterToggle.addEventListener('click', () => {
        filterPanel.classList.toggle('hidden');
      });
    }
    
    // 設定ページを開く
    if (settingsButton) {
      settingsButton.addEventListener('click', () => {
        chrome.runtime.openOptionsPage();
      });
    }
    
    // スケジュールページを開く
    if (scheduleButton) {
      scheduleButton.addEventListener('click', () => {
        chrome.tabs.create({ url: 'schedule.html' });
      });
    }
    
    // フィルターイベント
    if (platformCheckboxes && categoryFilter && channelFilter && viewerFilter && favoritesOnly) {
      platformCheckboxes.forEach(checkbox => {
        checkbox.addEventListener('change', () => {
          updateFilter();
          displayStreams();
        });
      });
      
      categoryFilter.addEventListener('input', () => {
        currentFilter.category = categoryFilter.value;
        displayStreams();
      });
      
      channelFilter.addEventListener('input', () => {
        currentFilter.channelName = channelFilter.value;
        displayStreams();
      });
      
      viewerFilter.addEventListener('input', () => {
        currentFilter.minViewers = parseInt(viewerFilter.value);
        updateSliderValue();
        displayStreams();
      });
      
      favoritesOnly.addEventListener('change', () => {
        currentFilter.favoritesOnly = favoritesOnly.checked;
        displayStreams();
      });
    }
    
    // フィルター保存
    if (saveFilterButton) {
      saveFilterButton.addEventListener('click', saveCurrentFilter);
    }
    
    // フィルターリセット
    if (resetFilterButton) {
      resetFilterButton.addEventListener('click', resetFilter);
    }
    
    // 保存済みフィルターの読み込み
    if (loadFilterButton) {
      loadFilterButton.addEventListener('click', loadSelectedFilter);
    }
    
    // 保存済みフィルターの削除
    if (deleteFilterButton) {
      deleteFilterButton.addEventListener('click', deleteSelectedFilter);
    }
    
    // ホバー情報を非表示にする（マウスがcontainer外に出た時）
    document.querySelector('.container').addEventListener('mouseleave', () => {
      hideStreamInfo();
    });
  }
  
/**
 * フィルターを初期化
 */
function initializeFilters() {
  // デフォルトフィルター設定
  currentFilter = {
    platforms: ['twitch', 'youtube', 'twitcasting'],
    category: '',
    channelName: '',
    minViewers: 0,
    favoritesOnly: false
  };
  
  // UIにデフォルト値を設定
  if (platformCheckboxes) {
    platformCheckboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
  }
  
  // ストレージから保存済みフィルターを読み込む
  chrome.storage.local.get(['lastUsedFilter'], (data) => {
    if (data.lastUsedFilter) {
      try {
        // 保存されていたフィルター設定を適用
        const savedFilter = data.lastUsedFilter;
        
        // プラットフォームチェックボックスを設定
        if (savedFilter.platforms && platformCheckboxes) {
          platformCheckboxes.forEach(checkbox => {
            checkbox.checked = savedFilter.platforms.includes(checkbox.value);
          });
        }
        
        // その他のフィルター項目を設定
        if (categoryFilter && savedFilter.category) 
          categoryFilter.value = savedFilter.category;
        
        if (channelFilter && savedFilter.channelName) 
          channelFilter.value = savedFilter.channelName;
        
        if (viewerFilter && savedFilter.minViewers) 
          viewerFilter.value = savedFilter.minViewers;
        
        if (favoritesOnly && savedFilter.favoritesOnly !== undefined) 
          favoritesOnly.checked = savedFilter.favoritesOnly;
        
        // フィルター状態を更新
        updateFilter();
        
        console.log('保存されていたフィルターを読み込みました:', currentFilter);
      } catch (e) {
        console.error('フィルター設定の読み込みに失敗しました:', e);
        // 失敗した場合はデフォルト設定に戻す
        resetFilter();
      }
    }
  });
}

/**
 * フィルターの更新
 */
function updateFilter() {
  // プラットフォームのフィルターを設定
  currentFilter.platforms = [];
  
  // チェックボックスの状態を確認
  platformCheckboxes.forEach(checkbox => {
    if (checkbox.checked) {
      currentFilter.platforms.push(checkbox.value);
    }
  });
  
  // プラットフォームが選択されていない場合は全て選択状態とする
  if (currentFilter.platforms.length === 0) {
    currentFilter.platforms = ['twitch', 'youtube', 'twitcasting'];
    
    // UIのチェックボックスも更新
    platformCheckboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
  }
  
  // その他のフィルター項目も取得
  if (categoryFilter) currentFilter.category = categoryFilter.value.trim();
  if (channelFilter) currentFilter.channelName = channelFilter.value.trim();
  if (viewerFilter) currentFilter.minViewers = parseInt(viewerFilter.value);
  if (favoritesOnly) currentFilter.favoritesOnly = favoritesOnly.checked;
  
  // フィルター状態のデバッグ出力
  console.log('フィルターを更新しました:', currentFilter);
}
  /**
   * スライダーの値表示を更新
   */
  function updateSliderValue() {
    if (viewerCount) {
      viewerCount.textContent = viewerFilter.value;
    }
  }
  
  /**
   * 現在のフィルター設定を保存
   */
  async function saveCurrentFilter() {
    const filterName = prompt('フィルター名を入力してください：');
    if (!filterName) return;
    
    // 同名のフィルターが存在する場合は上書き
    const existingIndex = savedFilters.findIndex(f => f.name === filterName);
    
    const filterToSave = {
      name: filterName,
      platforms: [...currentFilter.platforms],
      category: currentFilter.category,
      channelName: currentFilter.channelName,
      minViewers: currentFilter.minViewers,
      favoritesOnly: currentFilter.favoritesOnly
    };
    
    if (existingIndex >= 0) {
      savedFilters[existingIndex] = filterToSave;
    } else {
      savedFilters.push(filterToSave);
    }
    
    await Utils.setStorageData({ savedFilters });
    updateSavedFiltersList();
  }
  
/**
 * フィルターをリセット
 */
function resetFilter() {
  // チェックボックスをすべて選択状態に
  if (platformCheckboxes) {
    platformCheckboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
  }
  
  // 入力フィールドをクリア
  if (categoryFilter) categoryFilter.value = '';
  if (channelFilter) channelFilter.value = '';
  if (viewerFilter) viewerFilter.value = 0;
  if (favoritesOnly) favoritesOnly.checked = false;
  
  // フィルター状態をリセット
  currentFilter = {
    platforms: ['twitch', 'youtube', 'twitcasting'],
    category: '',
    channelName: '',
    minViewers: 0,
    favoritesOnly: false
  };
  
  // スライダー値の表示を更新
  updateSliderValue();
  
  // 表示を更新
  displayStreams();
  
  console.log('フィルターをリセットしました');
}
  
  /**
   * 保存済みフィルターリストを更新
   */
  function updateSavedFiltersList() {
    if (!savedFilterList) return;
    
    savedFilterList.innerHTML = '<option value="">選択してください</option>';
    
    savedFilters.forEach(filter => {
      const option = document.createElement('option');
      option.value = filter.name;
      option.textContent = filter.name;
      savedFilterList.appendChild(option);
    });
  }
  
  /**
   * 選択されたフィルターを読み込む
   */
  function loadSelectedFilter() {
    if (!savedFilterList) return;
    
    const selectedName = savedFilterList.value;
    if (!selectedName) return;
    
    const filter = savedFilters.find(f => f.name === selectedName);
    if (!filter) return;
    
    // フィルター設定を適用
    platformCheckboxes.forEach(checkbox => {
      checkbox.checked = filter.platforms.includes(checkbox.value);
    });
    
    categoryFilter.value = filter.category || '';
    channelFilter.value = filter.channelName || '';
    viewerFilter.value = filter.minViewers || 0;
    favoritesOnly.checked = filter.favoritesOnly || false;
    
    // 現在のフィルターを更新
    currentFilter = {
      platforms: [...filter.platforms],
      category: filter.category || '',
      channelName: filter.channelName || '',
      minViewers: filter.minViewers || 0,
      favoritesOnly: filter.favoritesOnly || false
    };
    
    updateSliderValue();
    displayStreams();
  }
  
  /**
   * 選択されたフィルターを削除
   */
  async function deleteSelectedFilter() {
    if (!savedFilterList) return;
    
    const selectedName = savedFilterList.value;
    if (!selectedName) return;
    
    if (!confirm(`フィルター「${selectedName}」を削除してもよろしいですか？`)) {
      return;
    }
    
    savedFilters = savedFilters.filter(f => f.name !== selectedName);
    await Utils.setStorageData({ savedFilters });
    updateSavedFiltersList();
  }
  
/**
 * API制限エラーを表示
 * @param {string} platform - プラットフォーム名
 */
function showAPILimitError(platform) {
  console.log(`${platform}のAPI制限エラーを表示します`);
  
  // エラーメッセージ要素を確認
  if (!errorMessage) {
    console.error('エラーメッセージ要素が見つかりません');
    return;
  }
  
  // 現在のタブをチェック - YouTubeタブまたは全てタブの場合のみ表示
  if (platform === 'youtube' && (currentPlatformTab === 'youtube' || currentPlatformTab === 'all')) {
    // よりコンパクトなエラーメッセージを設定
    errorMessage.innerHTML = `
      <div class="api-error-container">
        <p>YouTube APIの利用制限中</p>
        <a href="https://www.youtube.com/live" target="_blank" class="youtube-link-button">YouTube Live</a>
      </div>
    `;
    
    // エラーメッセージを表示
    errorMessage.classList.remove('hidden');
    
    // "現在配信中のチャンネルはありません" メッセージを隠す
    if (noStreams) {
      noStreams.classList.add('hidden');
    }
  } else if (platform !== 'youtube') {
    // その他のプラットフォーム用のシンプルなメッセージ
    errorMessage.textContent = `${getPlatformName(platform)}の更新に失敗しました`;
    errorMessage.classList.remove('hidden');
  }
}

/**
 * 配信データの表示
 */
function displayStreams() {
  if (!streamsGrid) return;
  
  console.log(`displayStreams: 現在のタブ = ${currentPlatformTab}`);
  
  // まず、YouTubeのAPI制限エラーが存在するかチェック
  const hasYouTubeError = platformErrors.youtube && 
                          (currentPlatformTab === 'youtube' || currentPlatformTab === 'all');
  
  // YouTubeのAPI制限エラーがある場合は、関連するタブのみでエラーメッセージを表示
  if (hasYouTubeError) {
    // エラーメッセージを表示
    showAPILimitError('youtube');
    
    // 「配信なし」メッセージを非表示
    if (noStreams) noStreams.classList.add('hidden');
  } else if (currentPlatformTab !== 'youtube' && currentPlatformTab !== 'all') {
    // YouTube以外のタブではエラーメッセージを隠す
    if (errorMessage) errorMessage.classList.add('hidden');
  }
  
  // グリッドを一度クリア
  streamsGrid.innerHTML = '';
  
  // 現在のプラットフォームタブに応じてデータを集計
  let displayableStreams = [];
  
  if (currentPlatformTab === 'all') {
    // 全プラットフォームのストリームを結合
    displayableStreams = [
      ...platformStreams.twitch,
      ...platformStreams.youtube,
      ...platformStreams.twitcasting
    ];
    console.log(`「すべて」タブ: ${displayableStreams.length}件の配信を表示`);
  } else {
    // 特定のプラットフォームのみ表示
    displayableStreams = platformStreams[currentPlatformTab] || [];
    
    // プラットフォームのフィルタリングを確実に適用
    displayableStreams = displayableStreams.filter(stream => 
      stream.platform === currentPlatformTab
    );
    
    console.log(`「${currentPlatformTab}」タブに表示する配信数(フィルタ前): ${displayableStreams.length}`);
  }
  
  // 更新中かどうかを確認
  const isUpdating = isAnyPlatformUpdating();
  
  // データがない場合かつ更新中でない場合
  if (displayableStreams.length === 0) {
    // YouTube以外のタブでエラーがない場合は「配信なし」を表示
    if (!hasYouTubeError && !isUpdating) {
      if (noStreams) {
        noStreams.classList.remove('hidden');
        noStreams.textContent = '現在配信中のチャンネルはありません';
      }
    } else {
      // エラーか更新中の場合は「配信なし」を非表示
      if (noStreams) {
        noStreams.classList.add('hidden');
      }
    }
  } else {
    // データがある場合は「配信なし」を非表示
    if (noStreams) {
      noStreams.classList.add('hidden');
    }
  }
  
  // お気に入り情報を設定
  displayableStreams = displayableStreams.map(stream => ({
    ...stream,
    isFavorite: favorites.includes(stream.channelId)
  }));
  
  // フィルターの適用
  const filteredStreams = Utils.filterStreams(displayableStreams, currentFilter);
  
  // 視聴者数でソート
  const sortedStreams = Utils.sortStreams(filteredStreams, 'viewerCount', false);
  
  console.log(`表示する配信数(フィルタ後): ${sortedStreams.length}`);
  
  // フィルター適用後の結果がない場合
  if (sortedStreams.length === 0 && !isUpdating && !hasYouTubeError) {
    if (noStreams) {
      noStreams.classList.remove('hidden');
      
      // フィルターが適用されているかをチェック
      const isFiltered = 
        currentFilter.category !== '' || 
        currentFilter.channelName !== '' || 
        currentFilter.minViewers > 0 || 
        currentFilter.favoritesOnly || 
        (currentFilter.platforms && currentFilter.platforms.length < 3);
      
      if (isFiltered) {
        noStreams.textContent = 'フィルター条件に一致する配信はありません';
      } else {
        noStreams.textContent = '現在配信中のチャンネルはありません';
      }
    }
    return;
  }
  
  // 空グリッドを回避するための追加チェック
  if (sortedStreams.length === 0) {
    return;
  }
  
  // CSS Grid列数を設定（アイコンのみなので5列または6列に）
  const columns = sortedStreams.length <= 10 ? 5 : 6;
  streamsGrid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
  
  // 配信アイコンを作成
  sortedStreams.forEach(stream => {
    const icon = createStreamIcon(stream);
    streamsGrid.appendChild(icon);
  });
}
  
  /**
   * 配信アイコンを作成（カードの代わりにアイコンのみ）
   * @param {Object} stream - 配信データ
   * @returns {HTMLElement} 配信アイコン要素
   */
  function createStreamIcon(stream) {
    const iconContainer = document.createElement('div');
    iconContainer.className = 'stream-icon';
    iconContainer.dataset.id = stream.id;
    iconContainer.dataset.platform = stream.platform;
    
    // マウスオーバーで配信情報を表示（設定に応じて）
    if (settings.hoverInfoEnabled !== false) {
      iconContainer.addEventListener('mouseenter', () => {
        showStreamInfo(stream);
      });
      
      iconContainer.addEventListener('mouseleave', () => {
        // マウス移動のタイミングですぐに非表示にしない
        setTimeout(() => {
          // マウスがアイコン上にない場合にのみ非表示
          if (!iconContainer.matches(':hover')) {
            hideStreamInfo();
          }
        }, 200);
      });
    }
    
    // クリックでストリームを開く
    iconContainer.addEventListener('click', (e) => {
      // お気に入りアイコンのクリックを除外
      if (e.target.matches('.favorite-icon, .favorite-icon *')) {
        return;
      }
      
      const url = stream.url;
      // Ctrlキーが押されている場合は新しいタブで開く
      if (e.ctrlKey) {
        chrome.tabs.create({ url, active: false });
      } else {
        chrome.tabs.create({ url });
      }
    });
    
    // チャンネルアイコン画像
    const img = document.createElement('img');
    img.src = stream.channelIcon || stream.thumbnail || `images/${stream.platform}.svg`;
    
    // 配信者名、タイトル、カテゴリを含めたalt属性を生成（改行なし）
    let altText = stream.channelName;
    if (stream.title) {
      altText += `、${stream.title}`;
    }
    if (stream.category) {
      altText += `、${stream.category}`;
    }
    img.alt = altText;
    
    // 同様の情報をtitle属性にも設定（改行あり）
    let titleText = stream.channelName;
    if (stream.title) {
      titleText += `\n${stream.title}`;
    }
    if (stream.category) {
      titleText += `\nカテゴリ: ${stream.category}`;
    }
    img.title = titleText;
    
    iconContainer.appendChild(img);
    
    // プラットフォームアイコン（設定に応じて）
    if (settings.platformIconEnabled !== false) {
      const platformIcon = document.createElement('div');
      platformIcon.className = 'stream-platform-icon';
      platformIcon.textContent = getPlatformEmoji(stream.platform);
      platformIcon.title = stream.platform;
      iconContainer.appendChild(platformIcon);
    }
    
    // 視聴者数（設定に応じて）
    if (settings.viewerCountEnabled !== false) {
      const viewers = document.createElement('div');
      viewers.className = 'viewer-count';
      viewers.textContent = Utils.formatNumber(stream.viewerCount);
      viewers.title = `${Utils.formatNumber(stream.viewerCount)}人視聴中`;
      iconContainer.appendChild(viewers);
    }
    
    // お気に入りアイコン（設定に応じて）
    if (settings.favoriteIconEnabled !== false) {
      const favIcon = document.createElement('div');
      favIcon.className = 'favorite-icon';
      favIcon.textContent = stream.isFavorite ? '★' : '☆';
      favIcon.title = stream.isFavorite ? 'お気に入りから削除' : 'お気に入りに追加';
      favIcon.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        if (stream.isFavorite) {
          // お気に入りから削除
          favorites = favorites.filter(id => id !== stream.channelId);
        } else {
          // お気に入りに追加
          favorites.push(stream.channelId);
        }
        
        await Utils.setStorageData({ favorites });
        
        // 表示を更新
        stream.isFavorite = !stream.isFavorite;
        favIcon.textContent = stream.isFavorite ? '★' : '☆';
        favIcon.title = stream.isFavorite ? 'お気に入りから削除' : 'お気に入りに追加';
        
        // お気に入りのみ表示設定の場合、非表示にする
        if (currentFilter.favoritesOnly && !stream.isFavorite) {
          displayStreams();
        }
      });
      iconContainer.appendChild(favIcon);
    }
    
    return iconContainer;
  }
  
  /**
   * 配信情報をヘッダーに表示
   * @param {Object} stream - 配信データ
   */
  function showStreamInfo(stream) {
    if (!streamHoverInfo) return;
    
    hoverChannelTitle.textContent = stream.channelName;
    
    const startTime = stream.startTime ? new Date(stream.startTime) : null;
    let timeInfo = '';
    
    if (startTime) {
      const duration = Math.floor((new Date() - startTime) / (1000 * 60)); // 分単位
      if (duration < 60) {
        timeInfo = `配信開始: ${duration}分前`;
      } else if (duration < 24 * 60) {
        timeInfo = `配信開始: ${Math.floor(duration / 60)}時間${duration % 60}分前`;
      } else {
        timeInfo = `配信開始: ${Math.floor(duration / (24 * 60))}日前`;
      }
    }
    
    hoverStreamDetails.innerHTML = `
      <div>${stream.title}</div>
      <div>視聴者数: ${Utils.formatNumber(stream.viewerCount)}人</div>
      ${timeInfo ? `<div>${timeInfo}</div>` : ''}
    `;
    
    if (stream.category) {
      hoverGameCategory.textContent = `カテゴリ: ${stream.category}`;
      hoverGameCategory.style.display = 'block';
    } else {
      hoverGameCategory.style.display = 'none';
    }
    
    streamHoverInfo.classList.add('visible');
  }
  
  /**
   * 配信情報の表示を非表示にする
   */
  function hideStreamInfo() {
    if (!streamHoverInfo) return;
    streamHoverInfo.classList.remove('visible');
  }
  
  /**
   * プラットフォーム名から絵文字を取得
   * @param {string} platform - プラットフォーム名
   * @returns {string} 対応する絵文字
   */
  function getPlatformEmoji(platform) {
    switch (platform) {
      case 'twitch':
        return '📺';
      case 'youtube':
        return '🎬';
      case 'twitcasting':
        return '📱';
      default:
        return '🔴';
    }
  }
  
  /**
   * どのプラットフォームも更新中でないかチェック
   * @returns {boolean} いずれかのプラットフォームが更新中ならtrue
   */
  function isAnyPlatformUpdating() {
    return updatingPlatforms.twitch || updatingPlatforms.youtube || updatingPlatforms.twitcasting;
  }
  
  /**
   * 更新中のプラットフォームメッセージを取得
   * @returns {string} 更新中メッセージ
   */
  function getUpdatingMessage() {
    const updatingList = [];
    
    // 実際に更新中のプラットフォーム
    for (const platform in updatingPlatforms) {
      if (updatingPlatforms[platform]) {
        updatingList.push(getPlatformName(platform));
      }
    }
    
    // 更新待ちのプラットフォーム
    const waitingMessage = updateQueue.length > 0 
      ? `（待機中: ${updateQueue.map(p => getPlatformName(p)).join('、')}）` 
      : '';
    
    if (updatingList.length === 0) {
      return updateQueue.length > 0 
        ? `更新待機中... ${waitingMessage}` 
        : '';
    }
    
    return `${updatingList.join('、')}を更新中...${waitingMessage}`;
  }
  
  /**
   * プラットフォーム名を日本語表記で取得
   * @param {string} platform - プラットフォーム識別子
   * @returns {string} 日本語名
   */
  function getPlatformName(platform) {
    switch (platform) {
      case 'twitch': return 'Twitch';
      case 'youtube': return 'YouTube';
      case 'twitcasting': return 'TwitCasting';
      default: return platform;
    }
  }
  
  /**
   * 設定された順序でプラットフォームを更新開始
   */
  function updatePlatformsInOrder() {
    console.log('設定された順序でプラットフォームを更新します');
    
    // 設定から更新順序を取得
    const updateOrder = settings.platformUpdateOrder || ['twitch', 'youtube', 'twitcasting'];
    console.log('更新順序:', updateOrder);
    
    // すべての更新状態をリセット
    updatingPlatforms.twitch = false;
    updatingPlatforms.youtube = false;
    updatingPlatforms.twitcasting = false;
    
    // 更新待ちプラットフォームのキュー
    updateQueue = [...updateOrder];
    
    // 最初のプラットフォームの更新を開始
    if (updateQueue.length > 0) {
      const firstPlatform = updateQueue.shift();
      console.log(`最初に更新するプラットフォーム: ${firstPlatform}`);
      updatingPlatforms[firstPlatform] = true;
      
      // ローダーを表示
      if (loader) {
        loader.classList.remove('hidden');
        loader.textContent = getUpdatingMessage();
      }
      
      // 更新リクエスト送信
      sendUpdateRequest(firstPlatform);
    }
  }
  
  /**
   * 更新リクエストを送信する（実際のリクエスト部分を分離）
   * @param {string} platform - 更新するプラットフォーム
   */
  function sendUpdateRequest(platform) {
    console.log(`${platform}の更新リクエストを送信`);
    
    // 特定のプラットフォームのみ更新するためのメッセージを送信
    chrome.runtime.sendMessage({ 
      action: 'checkStreams',
      platform: platform
    }, response => {
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
          loader.textContent = getUpdatingMessage();
        } else {
          loader.classList.add('hidden');
        }
      }
    });
  }
  
  /**
   * 次のプラットフォームの更新をチェック
   */
  function checkNextPlatformUpdate() {
    // キューに残りがあれば次を更新
    if (updateQueue && updateQueue.length > 0) {
      const nextPlatform = updateQueue.shift();
      console.log(`次のプラットフォームを更新: ${nextPlatform}`);
      updatingPlatforms[nextPlatform] = true;
      
      // ローダーのメッセージを更新
      if (loader) {
        loader.textContent = getUpdatingMessage();
      }
      
      // 更新リクエスト送信
      sendUpdateRequest(nextPlatform);
    } else {
      console.log('すべてのプラットフォームの更新が完了しました');
      
      // 更新完了後にエラーステータスをストレージに保存
      chrome.storage.local.set({ 'platformErrors': platformErrors }, () => {
        console.log('プラットフォームエラーステータスを保存しました:', platformErrors);
      });
    }
  }
  
  /**
   * バックグラウンドに更新リクエストを送信
   * @param {string} platform - 更新するプラットフォーム ('all', 'twitch', 'youtube', 'twitcasting')
   */
  function requestUpdate(platform = 'all') {
    // エラーメッセージは必ずしもクリアしない
    // YouTubeのクォータエラーがある場合は表示を維持する
    if (!platformErrors.youtube || (platform !== 'all' && platform !== 'youtube')) {
      if (errorMessage) errorMessage.classList.add('hidden');
    }
    
    // 全プラットフォーム更新の場合は設定された順序で更新
    if (platform === 'all') {
      updatePlatformsInOrder();
      return;
    }
    
    // 単一プラットフォーム更新の場合は直接更新
    console.log(`単一プラットフォーム更新: ${platform}`);
    updatingPlatforms[platform] = true;
    
    // 更新中メッセージを表示
    if (loader) {
      loader.classList.remove('hidden');
      loader.textContent = getUpdatingMessage();
    }
    
    // 更新リクエスト送信
    sendUpdateRequest(platform);
  }
  
/**
 * 更新エラーの処理
 * @param {string} platform - エラーが発生したプラットフォーム
 * @param {string} error - エラーメッセージ
 */
function handleUpdateError(platform, error) {
  console.error(`${platform}の更新エラー:`, error);
  
  // 特定のプラットフォームの更新を終了
  updatingPlatforms[platform] = false;
  
  // クォータ超過エラーかどうかを判定
  const isQuotaError = error && (
    error.includes('quota') || 
    error.includes('クォータ') || 
    error.includes('制限') || 
    error.includes('exceeded')
  );
  
  // エラータイプに基づいて処理
  if (isQuotaError && platform === 'youtube') {
    // YouTube APIクォータ超過エラー
    platformErrors[platform] = true;
    
    // 専用のエラー表示を呼び出し
    // 現在のタブが「すべて」または「YouTube」の場合のみ表示
    if (currentPlatformTab === 'youtube' || currentPlatformTab === 'all') {
      showAPILimitError('youtube');
    }
  } else if (isQuotaError) {
    // 他のプラットフォームのクォータエラー
    platformErrors[platform] = true;
    
    if (errorMessage) {
      errorMessage.classList.remove('hidden');
      errorMessage.textContent = `${getPlatformName(platform)}のAPI制限に達しました。現在のデータを表示しています。`;
    }
  } else {
    // その他のエラー
    if (errorMessage) {
      errorMessage.classList.remove('hidden');
      errorMessage.textContent = `${getPlatformName(platform)}の更新中にエラーが発生しました: ${error || '不明なエラー'}`;
    }
  }
  
  // プラットフォームエラー状態を保存
  chrome.storage.local.set({ 'platformErrors': platformErrors }, () => {
    console.log('プラットフォームエラーステータスを保存しました:', platformErrors);
  });
  
  // キャッシュデータは維持したまま表示を更新
  displayStreams();
}
  
  // 初期化実行
  init();
});