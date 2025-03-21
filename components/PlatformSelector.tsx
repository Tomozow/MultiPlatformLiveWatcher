import React, { useState, useEffect } from "react";
import type { FC } from "react";

const PlatformSelector: FC = () => {
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // タブ変更時のみのデータ取得用
  useEffect(() => {
    const fetchPlatforms = async () => {
      if (!isOpen) return; // ポップアップが閉じている場合は何もしない
      
      try {
        if (selectedTab === "all") {
          const response = await fetch("/api/platforms");
          const data = await response.json();
          setPlatforms(data);
        } else {
          const response = await fetch(`/api/platforms/${selectedTab.toLowerCase()}`);
          const data = await response.json();
          setPlatforms([data]);
        }
      } catch (error) {
        console.error("プラットフォームの取得に失敗しました:", error);
      }
    };

    fetchPlatforms();
  }, [selectedTab]); // selectedTabの変更時のみ実行

  // ポップアップを開いた時の初期データ取得用
  useEffect(() => {
    const fetchInitialPlatform = async () => {
      if (!isOpen) return;
      
      try {
        // 現在選択されているタブに応じたデータのみを取得
        if (selectedTab === "all") {
          const response = await fetch("/api/platforms");
          const data = await response.json();
          setPlatforms(data);
        } else {
          const response = await fetch(`/api/platforms/${selectedTab.toLowerCase()}`);
          const data = await response.json();
          setPlatforms([data]);
        }
      } catch (error) {
        console.error("プラットフォームの取得に失敗しました:", error);
      }
    };

    fetchInitialPlatform();
  }, [isOpen]); // isOpenの変更時のみ実行

  return (
    <div>
      {/* プラットフォームセレクターのコードをここに追加 */}
    </div>
  );
};

export default PlatformSelector; 