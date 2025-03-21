import React, { useState, useEffect } from "react";
import type { FC } from "react";

const PlatformSelector: FC = () => {
  const [selectedTab, setSelectedTab] = useState<string>("all");
  const [platforms, setPlatforms] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState<boolean>(false);

  useEffect(() => {
    const fetchPlatforms = async () => {
      try {
        if (selectedTab === "all") {
          // すべてのプラットフォームを取得
          const response = await fetch("/api/platforms");
          const data = await response.json();
          setPlatforms(data);
        } else {
          // 選択されたタブのプラットフォームのみ取得
          const response = await fetch(`/api/platforms/${selectedTab.toLowerCase()}`);
          const data = await response.json();
          setPlatforms([data]);
        }
      } catch (error) {
        console.error("プラットフォームの取得に失敗しました:", error);
      }
    };

    if (isOpen) {  // ポップアップが開いている場合のみ実行
      fetchPlatforms();
    }
  }, [selectedTab, isOpen]); // isOpenとselectedTabの変更時に実行

  return (
    <div>
      {/* プラットフォームセレクターのコードをここに追加 */}
    </div>
  );
};

export default PlatformSelector; 