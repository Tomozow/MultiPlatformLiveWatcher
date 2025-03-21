import { useState, useEffect } from 'react';
import { useQuery } from 'react-query';

// React Queryを使用する方法（推奨）
function YouTubeSubscriptions() {
  const { 
    data: subscriptions, 
    isLoading, 
    error 
  } = useQuery(
    'youtubeSubscriptions', 
    async () => {
      const response = await fetch('/api/youtube/subscriptions');
      return response.json();
    },
    { 
      staleTime: 5 * 60 * 1000, // 5分間はデータを再取得しない
      cacheTime: 30 * 60 * 1000, // 30分間キャッシュする
    }
  );

  // レンダリング部分
  if (isLoading) return <div>読み込み中...</div>;
  if (error) return <div>エラーが発生しました: {error.message}</div>;
  
  return (
    <div>
      {/* subscriptionsを使ったUIの描画 */}
      {/* ... existing code ... */}
    </div>
  );
}

// ... existing code ... 