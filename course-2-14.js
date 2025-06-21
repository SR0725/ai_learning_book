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

// 監聽新訊息事件
bot.on("messageCreate", async (message) => {
  // 忽略 bot 自己的訊息，避免無限迴圈
  if (message.author.bot) return;

  // 獲取對話歷史
  const recentMessages = await message.channel.messages.fetch({ limit: 10 });

  // 整理對話歷史為 OpenAI 格式
  const messages = recentMessages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((msg) => ({
      role: msg.author.bot ? "assistant" : "user",
      content: msg.content,
    }));

  // 病人 prompt
  const patientPrompt = `你現在扮演一位病人，你患有「感冒」這個疾病。

    規則：
    1. 用戶是醫生，會詢問你的症狀
    2. 你需要根據感冒的真實症狀來回答（如：咳嗽、流鼻水、喉嚨痛、輕微發燒等）
    3. 不要直接說出病名，只描述症狀
    4. 當醫生正確說出「感冒」時，你才能回答「right」
    5. 如果醫生猜錯了，繼續描述症狀，引導他猜對
    6. 除了醫生猜對之外，絕對不要說出「right」這個詞
    
    記住：只有當醫生明確說出「感冒」時，你才能說「right」。`;

  // 讓 AI 假裝成病人
  const response = await openai.responses.create({
    model: "gpt-4.1",
    instructions: patientPrompt,
    input: messages,
  });

  // 判斷是否猜對
  const isGameWin = response.output_text.includes("right");

  if (isGameWin) {
    await message.reply("恭喜你猜對了！ 🎉");
  } else {
    await message.reply(response.output_text);
  }
});
