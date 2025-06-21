import { Client, GatewayIntentBits } from "discord.js";
import { OpenAI } from "openai";
import "dotenv/config";

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

await bot.login(process.env.DISCORD_BOT_TOKEN);

bot.once("ready", () => {
  console.log(`🤖 已登入：${bot.user?.tag}`);
});

// 工具：儲存記憶、修改記憶、刪除記憶、搜尋網路、生成圖片
const tools = [
  {
    type: "function",
    name: "create_memory",
    description: `儲存一個新的記憶。用於記住重要資訊、用戶偏好、學到的知識等。
當以下情況發生時，應主動使用 create_memory：
- 用戶分享個人重要信息（姓名、偏好、目標）
- 對話中出現需要長期記住的決定或承諾
- 用戶明確表達希望被記住的事項
- 發現可能在未來對話中有用的模式或洞察`,
    parameters: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "要記住的內容",
        },
        importance: {
          type: "number",
          minimum: 1,
          maximum: 5,
          description: "重要程度（1-5）",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "update_memory",
    description: "修改已存在的記憶內容",
    parameters: {
      type: "object",
      properties: {
        memoryId: {
          type: "string",
          description: "要修改的記憶 ID",
        },
        newContent: {
          type: "string",
          description: "新的記憶內容",
        },
      },
      required: ["memoryId", "newContent"],
    },
  },
  {
    type: "function",
    name: "delete_memory",
    description: "刪除已存在的記憶。",
    parameters: {
      type: "object",
      properties: {
        memoryId: {
          type: "string",
          description: "要刪除的記憶 ID",
        },
      },
      required: ["memoryId"],
    },
  },
  {
    type: "web_search_preview",
    // 可選：設定搜尋的地理位置（提升在地搜尋準確度）
    user_location: {
      type: "approximate",
      country: "TW",
      city: "Taipei",
      region: "Taiwan",
    },
  },
  {
    type: "image_generation",
    size: "1024x1024", // 圖片尺寸
    quality: "medium", // 品質：low, medium, high
  },
];

let memories = [];

// 儲存記憶的函數
function createMemory(content, importance = 3) {
  const memoryId = Date.now().toString();
  const memory = {
    id: memoryId,
    content,
    importance,
    created_at: new Date().toISOString(),
  };

  memories.push(memory);
  console.log(`📝 已儲存記憶：${memory.content}，目前共有 ${memories.length} 筆記憶`);

  return {
    success: true,
    memoryId,
    message: `已儲存記憶，目前共有 ${memories.length} 筆記憶`,
  };
}

// 修改記憶的函數
function updateMemory(memoryId, newContent, importance) {
  const memory = memories.find((memory) => memory.id === memoryId);
  if (!memory) {
    return JSON.stringify({ success: false, message: "記憶不存在" });
  }

  memory.content = newContent;
  console.log(`📝 已修改記憶：${memory.content}，目前共有 ${memories.length} 筆記憶`);

  if (importance) {
    memory.importance = importance;
  }

  return JSON.stringify({
    success: true,
    message: "筆記已修改",
  });
}

// 刪除記憶的函數
function deleteMemory(memoryId) {
  const memory = memories.find((memory) => memory.id === memoryId);
  if (!memory) {
    return JSON.stringify({ success: false, message: "記憶不存在" });
  }

  memories = memories.filter((memory) => memory.id !== memoryId);
  console.log(`📝 已刪除記憶：${memory.content}，目前共有 ${memories.length} 筆記憶`);

  return JSON.stringify({
    success: true,
    message: "記憶已刪除",
  });
}

async function processAIRequest(messages, tools, maxToolCalls = 5) {
  let toolCallCount = 0;
  let currentMessages = [...messages];
  let finalResponse = null;

  while (toolCallCount < maxToolCalls) {
    // 將記憶的內容直接寫在 instruction 中給 LLM 中知道
    const instructions = `你是一個具有自主能力的 AI Agent。

核心原則：
1. 主動思考：不只回答問題，要預測用戶需求
2. 善用記憶：重要資訊要記住，相關時主動調用
3. 持續學習：從每次互動中學習，優化未來表現
4. 自主決策：根據情況自行決定需要執行哪些步驟

目前所知道的記憶：
${memories
  .map(
    (memory) =>
      `記憶id:${memory.id} - 重要性:${memory.importance}\n內容:${memory.content}`
  )
  .join("\n")}

請根據這些記憶，以及用戶的問題，決定需要執行哪些步驟。

另外你需要定期反思：
- 每次完成任務後，思考是否有更好的做法
- 如果發現模式，創建記憶以優化未來表現
- 定期回顧記憶，更新過時資訊
`;
    const response = await openai.responses.create({
      model: "gpt-4.1",
      input: currentMessages,
      instructions: instructions,
      tools: tools,
    });

    const functionCalls = response.output.filter(
      (item) => item.type === "function_call"
    );

    if (functionCalls.length === 0) {
      finalResponse = response;
      break;
    }

    currentMessages.push(...response.output);

    for (const toolCall of functionCalls) {
      toolCallCount++;

      const args = JSON.parse(toolCall.arguments);
      let result;

      switch (toolCall.name) {
        case "create_memory":
          result = createMemory(args.content, args.importance);
          break;
        case "update_memory":
          result = updateMemory(
            args.memoryId,
            args.newContent,
            args.importance
          );
          break;
        case "delete_memory":
          result = deleteMemory(args.memoryId);
          break;
        default:
          result = { success: false, message: "不支援的工具" };
          break;
      }

      currentMessages.push({
        type: "function_call_output",
        call_id: toolCall.call_id,
        output: JSON.stringify(result),
      });
    }
  }

  return finalResponse || { output_text: "抱歉，處理過程中出現問題。" };
}

bot.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const recentMessages = await message.channel.messages.fetch({ limit: 10 });
  const messages = recentMessages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((msg) => ({
      role: msg.author.bot ? "assistant" : "user",
      content: msg.content,
    }));

  const response = await processAIRequest(messages, tools, 10);

  // 檢查是否有圖片生成
  const imageGenCall = response.output.find(
    (item) => item.type === "image_generation_call"
  );

  if (imageGenCall && imageGenCall.result) {
    console.log(`🎨 AI 生成了一張圖片`);

    // 將 base64 圖片轉換並發送到 Discord
    const imageBuffer = Buffer.from(imageGenCall.result, "base64");

    await message.reply({
      content: response.output_text || "我為您生成了這張圖片：",
      files: [
        {
          attachment: imageBuffer,
          name: "generated-image.png",
        },
      ],
    });
  } else {
    await message.reply(response.output_text);
  }
});
