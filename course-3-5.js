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

// 定義兩個工具：儲存筆記和取得所有筆記
const tools = [
  {
    type: "function",
    name: "save_note",
    description:
      "當用戶想要記錄某些事情時使用此功能。自動為筆記生成標題（如果用戶沒有提供）。",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "筆記的標題，如果用戶沒有明確提供，請根據內容自動生成。可以傳入空字符串",
        },
        content: {
          type: "string",
          description: "筆記的完整內容",
        },
      },
      required: ["content"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "get_all_notes",
    description:
      "取得所有儲存的筆記。當用戶詢問有哪些筆記或想查看所有筆記時使用。",
    parameters: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    strict: true,
  },
  {
    type: "function",
    name: "update_note",
    description: "修改已存在的筆記內容",
    parameters: {
      type: "object",
      properties: {
        noteId: {
          type: "string",
          description: "要修改的筆記 ID",
        },
        newContent: {
          type: "string",
          description: "新的筆記內容",
        },
      },
      required: ["noteId", "newContent"],
    },
  },
  {
    type: "function",
    name: "delete_note",
    description:
      "刪除已存在的筆記，在使用此工具前，請先使用 get_all_notes 工具取得所有筆記，確認要刪除的筆記 ID 是否正確。",
    parameters: {
      type: "object",
      properties: {
        noteId: {
          type: "string",
          description: "要刪除的筆記 ID",
        },
      },
      required: ["noteId"],
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

let notes = [];

// 儲存筆記的函數
function saveNote(title, content) {
  const note = {
    id: Date.now().toString(), // 直接拿現在的時間當作筆記 id
    title: title || `筆記 #${Date.now()}`, // 如果沒有標題，自動生成
    content,
  };

  notes.push(note);
  console.log(`📝 已儲存筆記：${note.title}`);

  return {
    success: true,
    noteId: note.id,
    message: `筆記已儲存，ID: ${note.id}`,
  };
}

// 取得所有筆記的函數
function getAllNotes() {
  if (notes.length === 0) {
    return JSON.stringify({
      success: true,
      message: "目前還沒有任何筆記。",
      notes: [],
    });
  }

  const notesList = notes.map((note) => ({
    id: note.id,
    title: note.title,
    preview:
      note.content.substring(0, 50) + (note.content.length > 50 ? "..." : ""),
    createdAt: note.createdAt,
  }));

  return JSON.stringify({
    success: true,
    message: `找到 ${notes.length} 條筆記`,
    notes: notesList,
  });
}

// 修改筆記的函數
function updateNote(noteId, newContent) {
  const note = notes.find((note) => note.id === noteId);
  if (!note) {
    return JSON.stringify({ success: false, message: "筆記不存在" });
  }

  note.content = newContent;

  return JSON.stringify({
    success: true,
    message: "筆記已修改",
  });
}

// 刪除筆記的函數
function deleteNote(noteId) {
  const note = notes.find((note) => note.id === noteId);
  if (!note) {
    return JSON.stringify({ success: false, message: "筆記不存在" });
  }

  notes = notes.filter((note) => note.id !== noteId);

  return JSON.stringify({
    success: true,
    message: "筆記已刪除",
  });
}

async function processAIRequest(messages, tools, maxToolCalls = 5) {
  let toolCallCount = 0;
  let currentMessages = [...messages];
  let finalResponse = null;

  while (toolCallCount < maxToolCalls) {
    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: currentMessages,
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
        case "save_note":
          result = saveNote(args.title, args.content);
          break;
        case "get_all_notes":
          result = getAllNotes();
          break;
        case "update_note":
          result = updateNote(args.noteId, args.newContent);
          break;
        case "delete_note":
          result = deleteNote(args.noteId);
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

  const response = await processAIRequest(messages, tools, 5);

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
