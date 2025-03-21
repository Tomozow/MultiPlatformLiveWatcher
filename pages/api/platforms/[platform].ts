import { NextApiRequest, NextApiResponse } from 'next';
import { getPlatformDataFromDatabase } from '@/lib/database'; // データベースヘルパーをインポート

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { platform } = req.query;

  try {
    // 特定のプラットフォームのデータを取得するロジック
    const platformData = await getPlatformDataFromDatabase(platform as string);
    res.status(200).json(platformData);
  } catch (error) {
    res.status(500).json({ error: 'プラットフォームデータの取得に失敗しました' });
  }
} 