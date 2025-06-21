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

// =========== 5. 收到訊息時觸發 ==========
// 修改訊息處理函數
bot.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  
  // 呼叫 ChatGPT
  const response = await openai.responses.create({
    model: 'gpt-4.1',
    input: message.content 
  });

  // 回覆到 Discord
  await message.reply(response.output_text);
});