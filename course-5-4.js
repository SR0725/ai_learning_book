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

// 這邊記得改成剛剛拿到的向量資料庫 id
const VECTOR_STORE_ID = "vs_XXXXXXXXXXXXXXXXX";

bot.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  
  console.log(`📨 收到訊息：${message.content}`);
  
  try {
    // 使用 file_search 工具來搜尋相關內容
    const response = await openai.responses.create({
      model: "gpt-4o-mini",
      input: message.content,
      instructions: `你是一個熟讀《轉生成貓的我，單挑神明成為宇宙最強》的專家。
請根據搜尋到的內容回答用戶的問題。
如果找不到相關資料，請誠實告知。`,
      tools: [{
        type: "file_search",
        vector_store_ids: [VECTOR_STORE_ID],
      }],
    });
    
    // 檢查是否有使用 file_search
    const fileSearchCall = response.output.find(
      item => item.type === "file_search_call"
    );
    
    if (fileSearchCall) {
      console.log(`🔍 AI 搜尋了知識庫`);
      console.log(`📍 搜尋關鍵字：${fileSearchCall.queries.join(", ")}`);
    }
    
    await message.reply(response.output_text);
    
  } catch (error) {
    console.error("錯誤：", error);
    await message.reply("抱歉，處理您的問題時發生錯誤。");
  }
});