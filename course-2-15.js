import { Client, GatewayIntentBits } from "discord.js";
import { OpenAI } from "openai";
import "dotenv/config";
import { z } from "zod";
import { zodTextFormat } from "openai/helpers/zod";

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


// 定義情緒判斷的輸出格式
const EmotionAnalysis = z.object({
  emotion: z.enum(["生氣", "普通"]),
  confidence: z.number().min(0).max(100).describe("判斷的信心程度，0-100分"),
  keywords: z.array(z.string()).describe("觸發這個判斷的關鍵詞")
});

async function analyzeEmotionWithZod(userMessage) {
  console.log(`🔍 正在分析情感：${userMessage}`);

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: [
      {
        role: "system",
        content: "你是一個情緒分析專家，請分析用戶訊息的情緒狀態。"
      },
      {
        role: "user",
        content: userMessage
      }
    ],
    text: {
      format: zodTextFormat(EmotionAnalysis, "emotion_analysis")
    }
  });

  // 直接取得解析好的結果！
  const result = JSON.parse(response.output_text);
  console.log(`😊 情感分析結果：`, result);

  return result;
}

// 監聽新訊息事件
bot.on("messageCreate", async (message) => {
  // 忽略 bot 自己的訊息，避免無限迴圈
  if (message.author.bot) return;

  // 使用新的情緒分析函數
  const emotionResult = await analyzeEmotionWithZod(message.content);
  
  // 現在可以直接使用結構化的資料！
  let selectedModel;
  if (emotionResult.emotion === "生氣") {
    selectedModel = "gpt-4.1";
    console.log(`🔥 用戶情緒激動（信心度：${emotionResult.confidence}%）`);
    console.log(`   關鍵詞：${emotionResult.keywords.join(", ")}`);
  } else {
    selectedModel = "gpt-4.1-nano";
    console.log(`😊 用戶情緒穩定`);
  }
  
  // 獲取對話歷史
  const recentMessages = await message.channel.messages.fetch({ limit: 10 });

  // 整理對話歷史為 OpenAI 格式
  const messages = recentMessages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((msg) => ({
      role: msg.author.bot ? "assistant" : "user",
      content: msg.content,
    }));

  const systemPrompt = "你是一個友善的助理，請自然且有幫助地回應用戶。";

  const response = await openai.responses.create({
    model: selectedModel,
    instructions: systemPrompt,
    input: messages,
  });

  // 第四步：回覆用戶
  await message.reply(response.output_text);

  console.log(`✅ 成功回覆用戶（情感：${emotionResult.emotion}）`);
});
