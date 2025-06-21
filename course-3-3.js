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
  },
];

// 使用一個簡單的 Array 來儲存筆記
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

  console.log(notes);

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

bot.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const recentMessages = await message.channel.messages.fetch({ limit: 10 });

  const messages = recentMessages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((msg) => ({
      role: msg.author.bot ? "assistant" : "user",
      content: msg.content,
    }));

  // 第一次 AI 對話，AI 會根據用戶的聊天決定是否使用工具
  const firstChatResponse = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: messages,
    tools: tools,
  });

  // 我們的程式判斷 AI 是否想使用工具
  const functionCalls = firstChatResponse.output.filter(
    (item) => item.type === "function_call"
  );

  // 如果 AI 沒有使用任何工具，那不需要繼續執行了，直接把 AI 講的話回覆到 Discord 上即可
  if (functionCalls.length === 0) {
    await message.reply(firstChatResponse.output_text);
    return;
  }

  // 記得將 AI 剛剛新生成的文字加入「對話紀錄」中
  messages.push(...firstChatResponse.output);

  // 透過 for 迴圈把 AI 要求執行的工具都執行一遍
  for (const toolCall of functionCalls) {
    const args = JSON.parse(toolCall.arguments);
    let result;

    // 根據 name 判斷 AI 想要調用哪個工具
    if (toolCall.name === "save_note") {
      result = saveNote(args.title, args.content);
    } else if (toolCall.name === "get_all_notes") {
      result = getAllNotes();
    }

    // 將工具的執行結果加入「對話紀錄」
    messages.push({
      type: "function_call_output",
      call_id: toolCall.call_id,
      output: JSON.stringify(result),
    });
  }

  // 將「對話紀錄」（這裡頭包含了剛剛工具的執行結果）告訴給 AI，讓他重新生成對話
  const secondChatResponse = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: messages,
    tools: tools,
  });

  // 最後回覆給用
  await message.reply(secondChatResponse.output_text);
});
