/**
 * ユーティリティ関数ライブラリ
 */

const Utils = {
  /**
   * ローカルストレージからデータを取得
   * @param {string} key - 取得するキー
   * @param {any} defaultValue - デフォルト値
   * @returns {any} 取得したデータまたはデフォルト値
   */
  getStorageData: async function(key, defaultValue = null) {
    return new Promise((resolve) => {
      chrome.storage.local.get(key, (result) => {
        resolve(result[key] !== undefined ? result[key] : defaultValue);
      });
    });
  },

  /**
   * ローカルストレージにデータを保存
   * @param {Object} data - 保存するデータオブジェクト
   * @returns {Promise<void>} 完了を示すPromise
   */
  setStorageData: async function(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, resolve);
    });
  },

  /**
   * 日時をフォーマット
   * @param {Date|number|string} date - フォーマットする日時
   * @param {string} format - 'time'|'date'|'datetime'
   * @returns {string} フォーマットされた文字列
   */
  formatDate: function(date, format = 'time') {
    const d = new Date(date);
    
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    
    switch (format) {
      case 'time':
        return `${hours}:${minutes}`;
      case 'date':
        return `${year}/${month}/${day}`;
      case 'datetime':
        return `${year}/${month}/${day} ${hours}:${minutes}`;
      default:
        return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
    }
  },

  /**
   * 数値を短縮して表示（例: 1500 -> 1.5K）
   * @param {number} num - 短縮する数値
   * @returns {string} 短縮された表示用文字列
   */
  formatNumber: function(num) {
    if (num === null || num === undefined) return '0';
    
    if (num < 1000) return num.toString();
    if (num < 10000) return (num / 1000).toFixed(1) + 'K';
    if (num < 1000000) return Math.floor(num / 1000) + 'K';
    return (num / 1000000).toFixed(1) + 'M';
  },

  /**
   * エラーメッセージの表示と記録
   * @param {string} message - エラーメッセージ
   * @param {Error} error - エラーオブジェクト（オプション）
   */
  logError: function(message, error = null) {
    console.error(message, error);
    
    // エラーを保存
    this.setStorageData({
      lastError: {
        message: message,
        details: error ? error.toString() : null,
        timestamp: new Date().getTime()
      }
    });
  },

  /**
   * 配信データをフィルタリング
   * @param {Array} streams - 配信データの配列
   * @param {Object} filters - フィルター条件
   * @returns {Array} フィルタリングされた配信データ
   */
  filterStreams: function(streams, filters) {
    // デフォルトで空のフィルターの場合はそのまま返す
    if (!filters || Object.keys(filters).length === 0) {
      return streams;
    }
    
    return streams.filter(stream => {
      // プラットフォームでフィルタリング
      if (filters.platforms && filters.platforms.length > 0) {
        if (!filters.platforms.includes(stream.platform)) {
          return false;
        }
      }
      
      // カテゴリ/ゲームでフィルタリング
      if (filters.category && filters.category.trim() !== '') {
        const categoryLower = filters.category.toLowerCase();
        const streamCategoryLower = (stream.category || '').toLowerCase();
        if (!streamCategoryLower.includes(categoryLower)) {
          return false;
        }
      }
      
      // チャンネル名でフィルタリング
      if (filters.channelName && filters.channelName.trim() !== '') {
        const channelLower = filters.channelName.toLowerCase();
        const streamChannelLower = stream.channelName.toLowerCase();
        if (!streamChannelLower.includes(channelLower)) {
          return false;
        }
      }
      
      // 視聴者数でフィルタリング
      if (filters.minViewers !== undefined && filters.minViewers > 0) {
        if (stream.viewerCount < filters.minViewers) {
          return false;
        }
      }
      
      // お気に入りでフィルタリング
      if (filters.favoritesOnly) {
        if (!stream.isFavorite) {
          return false;
        }
      }
      
      return true;
    });
  },

  /**
   * 配信データをソートする
   * @param {Array} streams - 配信データの配列
   * @param {string} sortBy - ソート基準（'viewerCount', 'startTime', etc.）
   * @param {boolean} ascending - true:昇順、false:降順
   * @returns {Array} ソートされた配信データ
   */
  sortStreams: function(streams, sortBy = 'viewerCount', ascending = false) {
    return [...streams].sort((a, b) => {
      // お気に入りを優先
      if (a.isFavorite && !b.isFavorite) return -1;
      if (!a.isFavorite && b.isFavorite) return 1;
      
      let valueA, valueB;
      
      switch (sortBy) {
        case 'viewerCount':
          valueA = a.viewerCount || 0;
          valueB = b.viewerCount || 0;
          break;
        case 'startTime':
          valueA = new Date(a.startTime || 0).getTime();
          valueB = new Date(b.startTime || 0).getTime();
          break;
        case 'channelName':
          valueA = a.channelName || '';
          valueB = b.channelName || '';
          return ascending 
            ? valueA.localeCompare(valueB) 
            : valueB.localeCompare(valueA);
        default:
          valueA = a[sortBy] || 0;
          valueB = b[sortBy] || 0;
      }
      
      return ascending ? valueA - valueB : valueB - valueA;
    });
  },

  /**
   * CSRFトークンの生成
   * @returns {string} ランダムなトークン
   */
  generateCSRFToken: function() {
    return Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2);
  },

  /**
   * 日付を週間カレンダー用にフォーマット
   * @param {Date} date - フォーマットする日付
   * @returns {Object} 日付情報オブジェクト
   */
  formatCalendarDate: function(date) {
    const d = new Date(date);
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      date: d.getDate(),
      day: weekdays[d.getDay()],
      isToday: this.isToday(d),
      timestamp: d.getTime()
    };
  },

  /**
   * 指定された日付が今日かどうかを判定
   * @param {Date} date - 判定する日付
   * @returns {boolean} 今日の場合はtrue
   */
  isToday: function(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear();
  },

  /**
   * 週の初めの日付を取得
   * @param {Date} date - 基準日
   * @param {number} startDay - 週の開始曜日（0=日曜, 1=月曜, ...）
   * @returns {Date} 週の初めの日付
   */
  getWeekStart: function(date, startDay = 0) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = (day - startDay + 7) % 7;
    d.setDate(d.getDate() - diff);
    return d;
  },

  /**
   * URLから特定のパラメータを取得
   * @param {string} url - URL
   * @param {string} name - パラメータ名
   * @returns {string|null} パラメータ値
   */
  getParameterByName: function(url, name) {
    name = name.replace(/[\[\]]/g, '\\$&');
    const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
    const results = regex.exec(url);
    
    if (!results) return null;
    if (!results[2]) return '';
    
    return decodeURIComponent(results[2].replace(/\+/g, ' '));
  },

  /**
   * YouTubeのAPI制限エラーをチェックする
   * @param {Object} error - エラーオブジェクト
   * @param {number} errorLifetime - エラーの有効期間（ミリ秒）
   * @returns {Promise<boolean>} 有効なエラーかどうか
   */
  checkYoutubeApiLimitError: async function(error, errorLifetime = 24 * 60 * 60 * 1000) {
    if (!error) return false;
    
    const now = Date.now();
    
    // エラーが発生してから指定時間以上経過していたらエラーをクリア
    if (now - error.timestamp > errorLifetime) {
      await this.setStorageData({ youtubeApiLimitError: null });
      return false;
    }
    
    return true;
  }
};

// グローバルに公開
window.Utils = Utils;