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

/**
 * 建立向量資料庫，這樣我們便可以直接搜尋
 */
async function createVectorStore(name) {
  console.log(`📚 建立向量資料庫：${name}`);
  
  const vectorStore = await openai.vectorStores.create({
    name: name,
  });

  console.log(`✅ 向量資料庫建立成功！ID: ${vectorStore.id}`);
  return vectorStore.id;
}

/**
 * 將檔案加入向量資料庫
 * 這個過程 OpenAI 會自動：
 * 1. 解析 PDF 內容
 * 2. 切分成適當大小的段落
 * 3. 生成每個段落的向量
 * 4. 建立搜尋索引
 */
async function addFileToVectorStore(vectorStoreId, fileId) {
  console.log("將檔案加入向量資料庫");
  await openai.vectorStores.files.create(vectorStoreId, {
    file_id: fileId,
  });
  console.log("檔案加入向量資料庫成功！");
}


// 如果沒有建立過向量資料庫，可以先建立一個
const VECTOR_STORE_ID = await createVectorStore("中二小說資料庫");

// 如果已經建立過向量資料庫，可以先使用你建立好的 Vector Store ID
// const VECTOR_STORE_ID = "vs_XXXXXXXXXXXXXXXXX";

// 上傳檔案
const fileId = await uploadFile("./ray-cat-story.pdf");

// 將檔案加入向量資料庫
await addFileToVectorStore(VECTOR_STORE_ID, fileId);