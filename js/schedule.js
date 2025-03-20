/**
 * 配信スケジュール表示スクリプト
 */

document.addEventListener('DOMContentLoaded', async () => {
  // DOM要素
  const loader = document.getElementById('loader');
  const errorMessage = document.getElementById('error-message');
  const noSchedules = document.getElementById('no-schedules');
  const statusMessage = document.getElementById('status-message');
  const refreshButton = document.getElementById('refresh-button');
  const filterToggle = document.getElementById('filter-toggle');
  const filterPanel = document.getElementById('filter-panel');
  const homeButton = document.getElementById('home-button');
  const viewButtons = document.querySelectorAll('.view-button');
  const currentDateDisplay = document.getElementById('current-date');
  const prevDateButton = document.getElementById('prev-date');
  const nextDateButton = document.getElementById('next-date');
  const todayButton = document.getElementById('today-button');
  
  // ビュー要素
  const dayScheduleList = document.getElementById('day-schedule-list');
  const weekHeader = document.getElementById('week-header');
  const weekScheduleGrid = document.getElementById('week-schedule-grid');
  const categoryScheduleList = document.getElementById('category-schedule-list');
  const timelineScale = document.getElementById('timeline-scale');
  const timelineScheduleList = document.getElementById('timeline-schedule-list');
  
  // フィルター要素
  const platformCheckboxes = document.querySelectorAll('input[name="platform"]');
  const categoryFilter = document.getElementById('category-filter');
  const channelFilter = document.getElementById('channel-filter');
  const favoritesOnly = document.getElementById('favorites-only');
  const applyFilterButton = document.getElementById('apply-filter');
  const resetFilterButton = document.getElementById('reset-filter');
  
  // モーダル要素
  const scheduleModal = document.getElementById('schedule-modal');
  const closeButton = document.querySelector('.close-button');
  const modalTitle = document.getElementById('modal-title');
  const modalPlatform = document.getElementById('modal-platform');
  const modalChannel = document.getElementById('modal-channel');
  const modalStartTime = document.getElementById('modal-start-time');
  const modalEndTime = document.getElementById('modal-end-time');
  const modalCategory = document.getElementById('modal-category');
  const modalDescription = document.getElementById('modal-description');
  const openStreamButton = document.getElementById('open-stream');
  const reminderTimeSelect = document.getElementById('reminder-time');
  const setReminderButton = document.getElementById('set-reminder');
  
  // 状態管理
  let schedules = [];
  let filteredSchedules = [];
  let favorites = [];
  let currentView = 'day';
  let currentDate = new Date();
  let currentSchedule = null; // モーダル表示用の選択済みスケジュール
  
  // フィルター条件
  let filterConditions = {
    platforms: ['twitch', 'youtube', 'twitcasting'],
    category: '',
    channelName: '',
    favoritesOnly: false
  };
  
  // 設定
  let settings = {
    scheduleUpdateInterval: 60,
    defaultScheduleView: 'day',
    defaultReminderTime: 15
  };
  
/**
 * 初期化処理
 */
async function init() {
  console.log('初期化を開始します');
  
  // 設定とお気に入りを読み込む
  await loadSettingsAndFavorites();
  
  // イベントリスナーを設定
  setupEventListeners();
  
  // スケジュールデータを読み込む
  await loadSchedules();
  
  // 現在の日付を表示
  updateDateDisplay();
  
  // スケジュールを表示
  displaySchedules();
  
  // タブの初期表示設定
  initializeTabDisplay();
  
  console.log('初期化が完了しました');
}

/**
 * 設定とお気に入りを読み込む
 */
async function loadSettingsAndFavorites() {
  try {
    const data = await Utils.getStorageData(['settings', 'favorites'], {});
    
    // 設定を適用
    if (data.settings) {
      settings = { ...settings, ...data.settings };
    }
    
    // お気に入りを適用
    if (data.favorites) {
      favorites = data.favorites;
    }
    
    console.log('設定とお気に入りを読み込みました', { settings, favoritesCount: favorites.length });
  } catch (error) {
    console.error('設定とお気に入りの読み込みエラー:', error);
  }
}

/**
 * タブの初期表示を設定
 */
function initializeTabDisplay() {
  document.querySelectorAll('.schedule-view').forEach(view => {
    if (view.classList.contains('active')) {
      view.style.display = 'block';
    } else {
      view.style.display = 'none';
    }
  });
}
  
/**
 * スケジュールデータを読み込む
 */
async function loadSchedules() {
  loader.classList.remove('hidden');
  noSchedules.classList.add('hidden');
  errorMessage.classList.add('hidden');
  
  try {
    // ローカルストレージからスケジュールを読み込む
    const data = await Utils.getStorageData('schedules', []);
    schedules = data || [];
    
    // 最終更新時間を表示
    const lastUpdate = await Utils.getStorageData('lastScheduleUpdate', null);
    if (lastUpdate) {
      statusMessage.textContent = `最終更新: ${Utils.formatDate(lastUpdate, 'datetime')}`;
    }
    
    loader.classList.add('hidden');
    
    // フィルタリングとソート
    filterAndSortSchedules();
    
    // スケジュールがない場合
    if (filteredSchedules.length === 0) {
      noSchedules.classList.remove('hidden');
    }
  } catch (error) {
    console.error('スケジュール読み込みエラー:', error);
    loader.classList.add('hidden');
    errorMessage.classList.remove('hidden');
    errorMessage.textContent = 'スケジュールの読み込みに失敗しました';
  }
}
  
/**
 * イベントリスナーの設定
 */
function setupEventListeners() {
  // 更新ボタン
  refreshButton.addEventListener('click', refreshSchedules);
  
  // フィルターパネルの表示切り替え
  filterToggle.addEventListener('click', () => {
    filterPanel.classList.toggle('hidden');
  });
  
  // ホームボタン（ポップアップに戻る）
  homeButton.addEventListener('click', () => {
    window.close();
  });
  
// ビュー切り替え
viewButtons.forEach(button => {
  button.addEventListener('click', () => {
    // 現在のビューを更新
    currentView = button.dataset.view;
    
    // アクティブなボタンを更新
    viewButtons.forEach(btn => {
      btn.classList.toggle('active', btn === button);
    });
    
    // ビューの表示を切り替える
    document.querySelectorAll('.schedule-view').forEach(view => {
      if (view.id === `${currentView}-view`) {
        view.classList.add('active');
        view.style.display = 'block';
      } else {
        view.classList.remove('active');
        view.style.display = 'none';
      }
    });
    
    // 週間表示の場合は特別な初期化が必要
    if (currentView === 'week') {
      // 週間表示のコンテナが既に存在するか確認
      let weekContainer = document.querySelector('.week-container');
      if (!weekContainer && weekHeader && weekScheduleGrid) {
        // コンテナが存在しない場合は作成
        weekContainer = document.createElement('div');
        weekContainer.className = 'week-container';
        
        // 親要素を取得
        const parent = weekHeader.parentNode;
        
        // 既存の要素を一時的に退避
        const headerClone = weekHeader.cloneNode(false); // 中身はクリア
        const gridClone = weekScheduleGrid.cloneNode(false); // 中身はクリア
        
        // 既存要素をDOMから削除
        const headerParent = weekHeader.parentNode;
        const gridParent = weekScheduleGrid.parentNode;
        
        if (headerParent) headerParent.removeChild(weekHeader);
        if (gridParent) gridParent.removeChild(weekScheduleGrid);
        
        // 新しいコンテナに追加
        weekContainer.appendChild(headerClone);
        weekContainer.appendChild(gridClone);
        
        // 元の位置に新しいコンテナを挿入
        parent.appendChild(weekContainer);
        
        // グローバル参照を更新 - ここがエラーの原因だった可能性が高い
        weekHeader = headerClone;
        weekScheduleGrid = gridClone;
      }
    }
    
    // スケジュールを表示
    displaySchedules();
  });
});
    
  // 日付ナビゲーション
  prevDateButton.addEventListener('click', () => {
    if (currentView === 'day') {
      currentDate.setDate(currentDate.getDate() - 1);
    } else if (currentView === 'week') {
      currentDate.setDate(currentDate.getDate() - 7);
    }
    updateDateDisplay();
    displaySchedules();
  });
  
  nextDateButton.addEventListener('click', () => {
    if (currentView === 'day') {
      currentDate.setDate(currentDate.getDate() + 1);
    } else if (currentView === 'week') {
      currentDate.setDate(currentDate.getDate() + 7);
    }
    updateDateDisplay();
    displaySchedules();
  });
  
  todayButton.addEventListener('click', () => {
    currentDate = new Date();
    updateDateDisplay();
    displaySchedules();
  });
  
  // フィルター適用
  applyFilterButton.addEventListener('click', () => {
    updateFilterConditions();
    filterAndSortSchedules();
    displaySchedules();
    filterPanel.classList.add('hidden');
  });
  
  // フィルターリセット
  resetFilterButton.addEventListener('click', () => {
    resetFilterConditions();
    filterAndSortSchedules();
    displaySchedules();
  });
  
  // モーダルを閉じる
  closeButton.addEventListener('click', closeModal);
  window.addEventListener('click', (e) => {
    if (e.target === scheduleModal) {
      closeModal();
    }
  });
  
  // ストリームを開く
  openStreamButton.addEventListener('click', () => {
    if (currentSchedule) {
      chrome.tabs.create({ url: currentSchedule.url });
      closeModal();
    }
  });
  
  // リマインダーを設定
  setReminderButton.addEventListener('click', setReminder);
}
  
/**
 * 日付表示を更新
 */
function updateDateDisplay() {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' };
  currentDateDisplay.textContent = currentDate.toLocaleDateString('ja-JP', options);
}
  
/**
 * フィルター条件を更新
 */
function updateFilterConditions() {
  // プラットフォームフィルター
  filterConditions.platforms = [];
  platformCheckboxes.forEach(checkbox => {
    if (checkbox.checked) {
      filterConditions.platforms.push(checkbox.value);
    }
  });
  
  // その他のフィルター
  filterConditions.category = categoryFilter.value.trim();
  filterConditions.channelName = channelFilter.value.trim();
  filterConditions.favoritesOnly = favoritesOnly.checked;
}
  
/**
 * フィルター条件をリセット
 */
function resetFilterConditions() {
  platformCheckboxes.forEach(checkbox => {
    checkbox.checked = true;
  });
  
  categoryFilter.value = '';
  channelFilter.value = '';
  favoritesOnly.checked = false;
  
  filterConditions = {
    platforms: ['twitch', 'youtube', 'twitcasting'],
    category: '',
    channelName: '',
    favoritesOnly: false
  };
}
  
/**
 * スケジュールをフィルタリングとソート
 */
function filterAndSortSchedules() {
  // フィルタリング
  filteredSchedules = schedules.filter(schedule => {
    // プラットフォームでフィルタリング
    if (!filterConditions.platforms.includes(schedule.platform)) {
      return false;
    }
    
    // カテゴリでフィルタリング
    if (filterConditions.category && schedule.category) {
      if (!schedule.category.toLowerCase().includes(filterConditions.category.toLowerCase())) {
        return false;
      }
    }
    
    // チャンネル名でフィルタリング
    if (filterConditions.channelName) {
      if (!schedule.channelName.toLowerCase().includes(filterConditions.channelName.toLowerCase())) {
        return false;
      }
    }
    
    // お気に入りのみでフィルタリング
    if (filterConditions.favoritesOnly) {
      if (!favorites.includes(schedule.channelId)) {
        return false;
      }
    }
    
    return true;
  });
  
  // 時間でソート
  filteredSchedules.sort((a, b) => {
    return new Date(a.startTime) - new Date(b.startTime);
  });
  
  // スケジュールがない場合
  if (filteredSchedules.length === 0) {
    noSchedules.classList.remove('hidden');
  } else {
    noSchedules.classList.add('hidden');
  }
}
  
/**
 * スケジュールの表示
 */
function displaySchedules() {
  switch (currentView) {
    case 'day':
      displayDayView();
      break;
    case 'week':
      displayWeekView();
      break;
    case 'category':
      displayCategoryView();
      break;
    case 'timeline':
      displayTimelineView();
      break;
  }
}
  
/**
 * 日別表示
 */
function displayDayView() {
  dayScheduleList.innerHTML = '';
  
  // 当日のスケジュールをフィルタリング
  const dayStart = new Date(currentDate);
  dayStart.setHours(0, 0, 0, 0);
  
  const dayEnd = new Date(currentDate);
  dayEnd.setHours(23, 59, 59, 999);
  
  const daySchedules = filteredSchedules.filter(schedule => {
    const startTime = new Date(schedule.startTime);
    return startTime >= dayStart && startTime <= dayEnd;
  });
  
  if (daySchedules.length === 0) {
    noSchedules.classList.remove('hidden');
    return;
  }
  
  noSchedules.classList.add('hidden');
  
  // スケジュールカードを作成
  daySchedules.forEach(schedule => {
    const card = createScheduleCard(schedule);
    dayScheduleList.appendChild(card);
  });
}
  
/**
 * 週間表示
 */
function displayWeekView() {
  // 既存コンテンツをクリア
  weekHeader.innerHTML = '';
  weekScheduleGrid.innerHTML = '';
  
  // コンテナをラップする要素がなければ作成
  let weekContainer = document.querySelector('.week-container');
  if (!weekContainer) {
    weekContainer = document.createElement('div');
    weekContainer.className = 'week-container';
    
    // 親要素を取得して、元の要素を新しいコンテナでラップ
    const parent = weekHeader.parentNode;
    
    // 既存の要素を一時的に退避
    const headerClone = weekHeader.cloneNode(true);
    const gridClone = weekScheduleGrid.cloneNode(true);
    
    // 既存要素をDOMから削除
    if (weekHeader.parentNode) weekHeader.parentNode.removeChild(weekHeader);
    if (weekScheduleGrid.parentNode) weekScheduleGrid.parentNode.removeChild(weekScheduleGrid);
    
    // 新しいコンテナに追加
    weekContainer.appendChild(headerClone);
    weekContainer.appendChild(gridClone);
    
    // 親要素に新しいコンテナを追加
    if (parent) parent.appendChild(weekContainer);
    
    // 参照を更新
    weekHeader = headerClone;
    weekScheduleGrid = gridClone;
  }
  
  // 週の初めの日付を取得（日曜日起点）
  const weekStart = Utils.getWeekStart(currentDate);
  
  // 各曜日のヘッダーと列を作成
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    
    // 曜日ヘッダー
    const dayHeader = document.createElement('div');
    dayHeader.className = 'day-header';
    
    if (Utils.isToday(day)) {
      dayHeader.classList.add('today');
    }
    
    const dateInfo = Utils.formatCalendarDate(day);
    dayHeader.textContent = `${dateInfo.month}/${dateInfo.date} (${dateInfo.day})`;
    weekHeader.appendChild(dayHeader);
    
    // 日別の列
    const dayColumn = document.createElement('div');
    dayColumn.className = 'day-column';
    dayColumn.dataset.date = `${dateInfo.month}/${dateInfo.date} (${dateInfo.day})`;
    
    if (Utils.isToday(day)) {
      dayColumn.classList.add('today');
    }
    
    // 当日のスケジュール
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    
    const dayEnd = new Date(day);
    dayEnd.setHours(23, 59, 59, 999);
    
    const daySchedules = filteredSchedules.filter(schedule => {
      const startTime = new Date(schedule.startTime);
      return startTime >= dayStart && startTime <= dayEnd;
    });
    
    // スケジュールのミニカードを作成
    if (daySchedules.length > 0) {
      daySchedules.forEach(schedule => {
        const miniCard = createScheduleMiniCard(schedule);
        dayColumn.appendChild(miniCard);
      });
    } else {
      // 配信予定がない場合の表示
      const emptyMessage = document.createElement('div');
      emptyMessage.className = 'day-column-empty';
      emptyMessage.textContent = '配信予定はありません';
      dayColumn.appendChild(emptyMessage);
    }
    
    weekScheduleGrid.appendChild(dayColumn);
  }
}
  
/**
 * カテゴリ別表示
 */
function displayCategoryView() {
  categoryScheduleList.innerHTML = '';
  
  // カテゴリでグループ化
  const categoryGroups = {};
  
  filteredSchedules.forEach(schedule => {
    const category = schedule.category || 'その他';
    
    if (!categoryGroups[category]) {
      categoryGroups[category] = [];
    }
    
    categoryGroups[category].push(schedule);
  });
  
  // カテゴリがない場合
  if (Object.keys(categoryGroups).length === 0) {
    noSchedules.classList.remove('hidden');
    return;
  }
  
  noSchedules.classList.add('hidden');
  
  // カテゴリごとにグループを作成
  Object.entries(categoryGroups).forEach(([category, schedules]) => {
    const categoryGroup = document.createElement('div');
    categoryGroup.className = 'category-group';
    
    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'category-header';
    categoryHeader.textContent = category;
    categoryGroup.appendChild(categoryHeader);
    
    const categoryItems = document.createElement('div');
    categoryItems.className = 'category-items';
    
    // スケジュールカードを作成
    schedules.forEach(schedule => {
      const card = createScheduleCard(schedule);
      categoryItems.appendChild(card);
    });
    
    categoryGroup.appendChild(categoryItems);
    categoryScheduleList.appendChild(categoryGroup);
  });
}
  
/**
 * タイムライン表示
 */
function displayTimelineView() {
  timelineScale.innerHTML = '';
  timelineScheduleList.innerHTML = '';
  
  // 時間スケールを作成（00:00 〜 23:00）
  for (let hour = 0; hour <= 23; hour++) {
    const hourMarker = document.createElement('div');
    hourMarker.className = 'hour-marker';
    hourMarker.textContent = `${hour}:00`;
    hourMarker.style.left = `${(hour / 24) * 100}%`;
    timelineScale.appendChild(hourMarker);
  }
  
  // チャンネルごとにグループ化
  const channelGroups = {};
  
  filteredSchedules.forEach(schedule => {
    if (!channelGroups[schedule.channelId]) {
      channelGroups[schedule.channelId] = {
        channelName: schedule.channelName,
        platform: schedule.platform,
        schedules: []
      };
    }
    
    channelGroups[schedule.channelId].schedules.push(schedule);
  });
  
  // チャンネルがない場合
  if (Object.keys(channelGroups).length === 0) {
    noSchedules.classList.remove('hidden');
    return;
  }
  
  noSchedules.classList.add('hidden');
  
  // チャンネルごとにタイムラインを作成
  Object.entries(channelGroups).forEach(([channelId, info]) => {
    const channelTimeline = document.createElement('div');
    channelTimeline.className = 'timeline-channel';
    
    const channelLabel = document.createElement('div');
    channelLabel.className = 'channel-label';
    channelLabel.textContent = info.channelName;
    channelTimeline.appendChild(channelLabel);
    
    const channelEvents = document.createElement('div');
    channelEvents.className = 'channel-timeline';
    
    // タイムラインイベントを作成
    info.schedules.forEach(schedule => {
      const startTime = new Date(schedule.startTime);
      const endTime = schedule.endTime ? new Date(schedule.endTime) : new Date(startTime.getTime() + 3600000); // デフォルト1時間
      
      // 一日の中での位置を計算（0〜1）
      const dayStart = new Date(startTime);
      dayStart.setHours(0, 0, 0, 0);
      
      const startPosition = (startTime - dayStart) / (24 * 60 * 60 * 1000);
      const endPosition = (endTime - dayStart) / (24 * 60 * 60 * 1000);
      const duration = endPosition - startPosition;
      
      const event = document.createElement('div');
      event.className = `timeline-event ${schedule.platform}`;
      event.style.left = `${startPosition * 100}%`;
      event.style.width = `${duration * 100}%`;
      event.textContent = schedule.title || '配信予定';
      event.title = `${schedule.channelName} - ${schedule.title || '配信予定'}`;
      
      event.addEventListener('click', () => {
        openScheduleModal(schedule);
      });
      
      channelEvents.appendChild(event);
    });
    
    channelTimeline.appendChild(channelEvents);
    timelineScheduleList.appendChild(channelTimeline);
  });
}
  
/**
 * スケジュールカードを作成
 * @param {Object} schedule - スケジュールデータ
 * @returns {HTMLElement} スケジュールカード要素
 */
function createScheduleCard(schedule) {
  const card = document.createElement('div');
  card.className = 'schedule-card';
  
  // クリックでモーダルを開く
  card.addEventListener('click', () => {
    openScheduleModal(schedule);
  });
  
  // 時間部分
  const timeSection = document.createElement('div');
  timeSection.className = 'schedule-time';
  
  const startTimeElement = document.createElement('div');
  startTimeElement.className = 'start-time';
  startTimeElement.textContent = new Date(schedule.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  timeSection.appendChild(startTimeElement);
  
  if (schedule.endTime) {
    const endTimeElement = document.createElement('div');
    endTimeElement.className = 'end-time';
    endTimeElement.textContent = new Date(schedule.endTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    timeSection.appendChild(endTimeElement);
  }
  
  card.appendChild(timeSection);
  
  // 情報部分
  const infoSection = document.createElement('div');
  infoSection.className = 'schedule-info';
  
  // チャンネルアイコンコンテナ
  const channelIconContainer = document.createElement('div');
  channelIconContainer.className = 'channel-icon-container';
  
  // チャンネルアイコン
  const channelIcon = document.createElement('img');
  channelIcon.className = 'channel-icon';
  
  // チャンネルアイコンの設定 - ポップアップ画面と同様の優先順位で
  if (schedule.channelIcon) {
    channelIcon.src = schedule.channelIcon;
  } else if (schedule.thumbnail) {
    channelIcon.src = schedule.thumbnail;
  } else {
    // プラットフォーム別のデフォルトアイコン（SVGではなく画像ファイルを想定）
    switch (schedule.platform) {
      case 'twitch':
        channelIcon.src = 'images/twitch.png';
        break;
      case 'youtube':
        channelIcon.src = 'images/youtube.png';
        break;
      case 'twitcasting':
        channelIcon.src = 'images/twitcasting.png';
        break;
      default:
        channelIcon.src = 'images/default.png';
    }
  }
  
  // 画像読み込みエラー時の処理
  channelIcon.onerror = function() {
    // 代替表示としてプラットフォームの絵文字を表示
    this.style.display = 'none';
    
    // 絵文字を表示する要素を作成
    const emojiPlaceholder = document.createElement('div');
    emojiPlaceholder.className = 'emoji-placeholder';
    emojiPlaceholder.textContent = getPlatformEmoji(schedule.platform);
    channelIconContainer.appendChild(emojiPlaceholder);
  };
  
  channelIcon.alt = schedule.channelName;
  channelIconContainer.appendChild(channelIcon);
  infoSection.appendChild(channelIconContainer);
  
  // プラットフォームバッジ
  const platformBadge = document.createElement('div');
  platformBadge.className = `platform-badge ${schedule.platform}`;
  platformBadge.textContent = getPlatformEmoji(schedule.platform);
  platformBadge.title = schedule.platform;
  infoSection.appendChild(platformBadge);
  
  // リマインダーバッジ（設定されている場合）
  if (schedule.reminder) {
    const reminderBadge = document.createElement('div');
    reminderBadge.className = 'reminder-badge';
    reminderBadge.textContent = '🔔';
    reminderBadge.title = `配信${schedule.reminder}分前に通知`;
    infoSection.appendChild(reminderBadge);
  }
  
  // タイトル
  const title = document.createElement('div');
  title.className = 'schedule-title';
  title.textContent = schedule.title || '配信予定';
  infoSection.appendChild(title);
  
  // チャンネル名
  const channelName = document.createElement('div');
  channelName.className = 'channel-name';
  channelName.textContent = schedule.channelName;
  infoSection.appendChild(channelName);
  
  // カテゴリ（存在する場合）
  if (schedule.category) {
    const category = document.createElement('div');
    category.className = 'category';
    category.textContent = schedule.category;
    infoSection.appendChild(category);
  }
  
  card.appendChild(infoSection);
  
  return card;
}

/**
 * スケジュールのミニカードを作成（週間表示用）
 * @param {Object} schedule - スケジュールデータ
 * @returns {HTMLElement} ミニカード要素
 */
function createScheduleMiniCard(schedule) {
  const miniCard = document.createElement('div');
  miniCard.className = `schedule-mini-card ${schedule.platform}`;
  
  // クリックでモーダルを開く
  miniCard.addEventListener('click', () => {
    openScheduleModal(schedule);
  });
  
  // チャンネルアイコン
  const channelIcon = document.createElement('img');
  channelIcon.className = 'mini-channel-icon';
  
  // チャンネルアイコンの設定 - ポップアップ画面と同様の優先順位で
  if (schedule.channelIcon) {
    channelIcon.src = schedule.channelIcon;
  } else if (schedule.thumbnail) {
    channelIcon.src = schedule.thumbnail;
  } else {
    // プラットフォーム別のデフォルトアイコン
    switch (schedule.platform) {
      case 'twitch':
        channelIcon.src = 'images/twitch.png';
        break;
      case 'youtube':
        channelIcon.src = 'images/youtube.png';
        break;
      case 'twitcasting':
        channelIcon.src = 'images/twitcasting.png';
        break;
      default:
        channelIcon.src = 'images/default.png';
    }
  }
  
  // 画像読み込みエラー時の処理
  channelIcon.onerror = function() {
    // 代替表示としてプラットフォームの絵文字を表示
    this.outerHTML = `<div class="mini-emoji-placeholder">${getPlatformEmoji(schedule.platform)}</div>`;
  };
  
  channelIcon.alt = schedule.channelName;
  miniCard.appendChild(channelIcon);
  
  // 時間
  const timeElement = document.createElement('div');
  timeElement.className = 'mini-time';
  timeElement.textContent = new Date(schedule.startTime).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  miniCard.appendChild(timeElement);
  
  // タイトル
  const titleElement = document.createElement('div');
  titleElement.className = 'mini-title';
  titleElement.textContent = schedule.title || '配信予定';
  miniCard.appendChild(titleElement);
  
  // チャンネル名
  const channelElement = document.createElement('div');
  channelElement.className = 'mini-channel';
  channelElement.textContent = schedule.channelName;
  miniCard.appendChild(channelElement);
  
  // リマインダーが設定されている場合は印をつける
  if (schedule.reminder) {
    miniCard.title = `${schedule.title || '配信予定'} - ${schedule.channelName}\n配信${schedule.reminder}分前に通知`;
    
    const reminderIcon = document.createElement('span');
    reminderIcon.textContent = ' 🔔';
    reminderIcon.style.color = '#ffd700';
    timeElement.appendChild(reminderIcon);
  } else {
    miniCard.title = `${schedule.title || '配信予定'} - ${schedule.channelName}`;
  }
  
  return miniCard;
}

/**
 * スケジュールモーダルを開く
 * @param {Object} schedule - スケジュールデータ
 */
function openScheduleModal(schedule) {
  currentSchedule = schedule;
  
  // モーダル内容を設定
  modalTitle.textContent = schedule.title || '配信予定';
  
  // プラットフォームバッジを設定
  modalPlatform.className = `platform-badge ${schedule.platform}`;
  modalPlatform.textContent = getPlatformEmoji(schedule.platform);
  modalPlatform.title = schedule.platform;
  
  // モーダルにチャンネルアイコンを追加
  if (!document.getElementById('modal-channel-icon')) {
    const channelIconElement = document.createElement('img');
    channelIconElement.id = 'modal-channel-icon';
    channelIconElement.className = 'modal-channel-icon';
    modalPlatform.parentNode.insertBefore(channelIconElement, modalPlatform);
  }
  
  // チャンネルアイコンを設定
  const channelIconElement = document.getElementById('modal-channel-icon');
  
  // チャンネルアイコンの設定 - ポップアップ画面と同様の優先順位で
  if (schedule.channelIcon) {
    channelIconElement.src = schedule.channelIcon;
  } else if (schedule.thumbnail) {
    channelIconElement.src = schedule.thumbnail;
  } else {
    // プラットフォーム別のデフォルトアイコン
    switch (schedule.platform) {
      case 'twitch':
        channelIconElement.src = 'images/twitch.png';
        break;
      case 'youtube':
        channelIconElement.src = 'images/youtube.png';
        break;
      case 'twitcasting':
        channelIconElement.src = 'images/twitcasting.png';
        break;
      default:
        channelIconElement.src = 'images/default.png';
    }
  }
  
  // 画像読み込みエラー時の処理
  channelIconElement.onerror = function() {
    // 代替表示としてプラットフォームの絵文字を表示
    this.outerHTML = `<div class="modal-emoji-placeholder">${getPlatformEmoji(schedule.platform)}</div>`;
  };
  
  channelIconElement.alt = schedule.channelName;
  
  modalChannel.textContent = schedule.channelName;
  
  // 開始時間と終了時間
  const startTime = new Date(schedule.startTime);
  modalStartTime.textContent = startTime.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  if (schedule.endTime) {
    const endTime = new Date(schedule.endTime);
    modalEndTime.textContent = endTime.toLocaleTimeString('ja-JP', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } else {
    modalEndTime.textContent = '終了時間未定';
  }
  
  // カテゴリ
  if (schedule.category) {
    modalCategory.textContent = schedule.category;
    modalCategory.classList.remove('hidden');
  } else {
    modalCategory.classList.add('hidden');
  }
  
  // 説明
  if (schedule.description) {
    modalDescription.textContent = schedule.description;
    modalDescription.classList.remove('hidden');
  } else {
    modalDescription.classList.add('hidden');
  }
  
  // リマインダー選択の現在値を設定
  reminderTimeSelect.value = schedule.reminder || '';
  
  // モーダルを表示
  scheduleModal.classList.remove('hidden');
}

/**
 * プラットフォームに応じたデフォルトサムネイル画像を取得
 * @param {string} platform - プラットフォーム名
 * @returns {string} デフォルト画像のURL
 */
function getDefaultThumbnail(platform) {
  // データURL形式のシンプルなアイコン画像（絵文字を表示するのと同等）
  const emojiMap = {
    'twitch': '📺',
    'youtube': '🎬',
    'twitcasting': '📱',
    'default': '🔴'
  };
  
  // 実際のシナリオではデータURLよりも適切な画像へのパスを返す方が良い
  // この例では単純なプレースホルダー画像を返します
  return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-size="20">${emojiMap[platform] || emojiMap.default}</text></svg>`;
}
  
/**
 * モーダルを閉じる
 */
function closeModal() {
  scheduleModal.classList.add('hidden');
  currentSchedule = null;
}
  
/**
 * リマインダーを設定
 */
async function setReminder() {
  if (!currentSchedule) return;
  
  const reminderTime = parseInt(reminderTimeSelect.value, 10);
  
  try {
    // バックグラウンドスクリプトにリマインダー設定を送信
    await chrome.runtime.sendMessage({
      action: 'setReminder',
      scheduleId: currentSchedule.id,
      reminderTime: reminderTime || null
    });
    
    // スケジュールのリマインダー情報を更新
    const scheduleIndex = schedules.findIndex(s => s.id === currentSchedule.id);
    if (scheduleIndex >= 0) {
      schedules[scheduleIndex].reminder = reminderTime || null;
      
      // 状態を更新
      currentSchedule.reminder = reminderTime || null;
      
      // UIを更新
      displaySchedules();
    }
    
    // モーダルを閉じる
    closeModal();
    
    // 通知
    const message = reminderTime 
      ? `${currentSchedule.title || '配信予定'}の${reminderTime}分前に通知します` 
      : 'リマインダーを解除しました';
    
    statusMessage.textContent = message;
    setTimeout(() => {
      statusMessage.textContent = `最終更新: ${Utils.formatDate(new Date(), 'datetime')}`;
    }, 3000);
  } catch (error) {
    console.error('リマインダー設定エラー:', error);
    alert('リマインダーの設定に失敗しました');
  }
}
  
/**
 * スケジュールを更新
 */
async function refreshSchedules() {
  loader.classList.remove('hidden');
  noSchedules.classList.add('hidden');
  errorMessage.classList.add('hidden');
  
  try {
    // バックグラウンドスクリプトにスケジュール更新を要求
    const response = await chrome.runtime.sendMessage({ action: 'checkSchedules' });
    
    if (response && response.success) {
      schedules = response.schedules || [];
      
      // フィルタリングとソート
      filterAndSortSchedules();
      
      // スケジュールを表示
      displaySchedules();
      
      // 更新時間を表示
      statusMessage.textContent = `最終更新: ${Utils.formatDate(new Date(), 'datetime')}`;
    } else {
      throw new Error(response ? response.error : '更新に失敗しました');
    }
  } catch (error) {
    console.error('スケジュール更新エラー:', error);
    errorMessage.classList.remove('hidden');
    errorMessage.textContent = error.message || 'スケジュールの更新に失敗しました';
  } finally {
    loader.classList.add('hidden');
  }
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
 * リダイレクトURIを設定
 */
function setRedirectUris() {
  console.log('リダイレクトURIは設定済みです');
}

// 初期化実行
init();
});