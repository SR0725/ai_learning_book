import { Client, GatewayIntentBits } from 'discord.js';
import OpenAI from 'openai';
import 'dotenv/config';

// =========== 1. 初始化 Discord Client ==========
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =========== 2. 初始化 OpenAI ==========
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});   

// =========== 3. 登入 Discord ==========
const token = process.env.DISCORD_BOT_TOKEN;

await bot.login(token);

// =========== 4. Bot 成功上線 ==========
bot.once('ready', () => {
  console.log(`🤖 已登入：${bot.user?.tag}`);
});

// =========== 5. 收到訊息 → 交給 GPT 思考 → 回覆 ==========
bot.on("messageCreate", async (message) => {
  // 避免無限自言自語，所以遇到機器人的訊息就提早停止程式
  if (message.author.bot) return;

  /* 5-1 從 Discord 取得最近 10 條訊息（這會包含用戶最新訊息） */
  const recentMessages = await message.channel.messages.fetch({ limit: 10 });

  /* 5-2 將 Discord 訊息轉換成 ChatGPT 格式 */
  const messages = recentMessages
    /* 5-2-1 根據時間，重新排序訊息，由舊到新 */
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    /* 5-2-2 只要這個訊息來自機器人，則默認他是 AI 生成的訊息 */
    .map((msg) => ({
      role: msg.author.bot ? "assistant" : "user",
      content: msg.content,
    })); 

  /* 5-3 把用戶輸入送給 ChatGPT */
  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: messages,
  });

  /* 5-4 取得 ChatGPT 回答並回覆至 Discord */
  const reply = response.output_text;
  await message.reply(reply);
});