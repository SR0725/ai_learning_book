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

/**
 * 情感判斷功能 - 第一個 AI
 * 用於判斷用戶訊息是否生氣
 * @param {string} userMessage - 用戶的訊息內容
 * @returns {Promise<string>} - 回傳 "生氣" 或 "普通"
 */
async function analyzeEmotion(userMessage) {
  console.log(`🔍 正在分析情感：${userMessage}`);

  // 構建情感判斷的提示詞
  const emotionPrompt = `請判斷以下客戶留言是否生氣。
    
規則：
1. 只能回答：生氣、普通 兩者之一
2. 不要加入任何解釋或額外文字
3. 如果無法確定，請選擇最接近的選項`;

  // 調用 OpenAI API 進行情感分析
  const emotionResponse = await openai.responses.create({
    model: "gpt-4.1-mini",
    instructions: emotionPrompt,
    input: userMessage,
  });

  const emotion = emotionResponse.output_text;
  console.log(`😊 情感分析結果：${emotion}`);

  return emotion;
}

// 監聽新訊息事件
bot.on("messageCreate", async (message) => {
  // 忽略 bot 自己的訊息，避免無限迴圈
  if (message.author.bot) return;

  console.log(`📨 收到訊息：${message.content}`);

  // 第一步：情感分析，這個 function 高概率會回傳 "生氣" 或者 "普通"
  const emotion = await analyzeEmotion(message.content);

  // 第二步：根據情感生成調整模型
  let selectedModel;
  if (emotion.includes("生氣")) {
    selectedModel = "gpt-4.1";
    console.log(`🔥 用戶情緒激動，使用高階模型：${selectedModel}`);
  } else {
    selectedModel = "gpt-4.1-nano";
    console.log(`😊 用戶情緒穩定，使用標準模型：${selectedModel}`);
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

  console.log(`✅ 成功回覆用戶（情感：${emotion}）`);
});
