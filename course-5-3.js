import { OpenAI } from "openai";
import "dotenv/config";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * 上傳檔案到 OpenAI
 */
async function uploadFile(filePath) {
   console.log(`📤 開始上傳檔案：${filePath}`);

   // 處理本地檔案
   const file = fs.createReadStream(filePath);
  
  
   // 上傳到 OpenAI
   const uploadedFile = await openai.files.create({
      file: file,
      purpose: "assistants", // 這告訴 OpenAI 這個檔案是給 AI 助手用的
   });

   console.log(`✅ 檔案上傳成功！ID: ${uploadedFile.id}`);
   return uploadedFile.id;
}

async function uploadMultipleFiles(filePaths, vectorStoreId) {
  console.log(`📚 準備上傳 ${filePaths.length} 個檔案`);
  
  const fileIds = [];
  
  // 上傳所有檔案
  for (const filePath of filePaths) {
    const fileId = await uploadFile(filePath);
    fileIds.push(fileId);
  }
  
  // 批次加入向量資料庫
  console.log(`📎 批次加入向量資料庫...`);
  
  const batch = await openai.vectorStores.fileBatches.createAndPoll(
    vectorStoreId,
    {
      file_ids: fileIds,
    }
  );
  
  console.log(`✅ 批次處理完成！`);
  console.log(`- 成功：${batch.file_counts.completed} 個檔案`);
  console.log(`- 失敗：${batch.file_counts.failed} 個檔案`);
  
  return batch;
}

// 使用範例：建立一個包含多本書的知識庫
const files = [
  "./ray-cat-1.pdf", 
  "./ray-cat-2.pdf",
];

const VECTOR_STORE_ID = "vs_6856b9d25edc8191b833e48cc3b6d885";
async function setVectorStoreExpiration(vectorStoreId, days = 7) {
  await openai.vectorStores.update(vectorStoreId, {
    expires_after: {
      anchor: "last_active_at",
      days: days
    }
  });
  
  console.log(`⏰ 已設定向量資料庫 ${days} 天後自動過期`);
}
setVectorStoreExpiration(VECTOR_STORE_ID, 7);