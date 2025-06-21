import { Client, GatewayIntentBits } from 'discord.js';
import OpenAI from 'openai';
import 'dotenv/config';
import { encoding_for_model } from 'tiktoken';

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
// 精確計算 Token 數量的函數
function countTokens(messages, model = "gpt-4.1-mini") {
  // 1. 建立對應 AI 模型的編碼器
  const encoder = encoding_for_model(model);
  let totalTokens = 0;
  
  // 2. 逐一計算每個訊息的 Token 數量
  for (const message of messages) {
    totalTokens += encoder.encode(message.content).length;
    totalTokens += 4; // 每個訊息還有格式上的開銷（role、content 等結構）
  }
  
  // 3. 釋放記憶體（重要！避免記憶體洩漏）
  encoder.free();
  return totalTokens;
}

// 訊息截斷函數
function smartTruncateMessages(messages, maxTokens = 900000) {
  let currentTokens = countTokens(messages);
  
  // 如果 Token 數量超過限制，就開始「忘記」舊對話
  while (currentTokens > maxTokens && messages.length > 1) {
    // 找出 system 訊息（AI 的角色設定）
    const systemMessage = messages.find(m => m.role === 'system');
    
    // 移除最舊的對話，但保留 system 訊息
    messages = messages.filter((m, i) => !(i > 0 && m.role !== 'system'));
    
    // 確保 system 訊息永遠在最前面
    if (systemMessage) {
      messages = [systemMessage, ...messages.slice(1)];
    }
    
    // 重新計算 Token 數量
    currentTokens = countTokens(messages);
  }
  
  return messages;
}

bot.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  const recentMessages = await message.channel.messages.fetch({ limit: 10 });

  let messages = recentMessages
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map((msg) => ({
      role: msg.author.bot ? "assistant" : "user",
      content: msg.content,
    })); 

  // 使用我們的智慧型 Token 管理
  messages = smartTruncateMessages(messages, 100000); // 限制 10 萬 Token

  console.log(`對話使用了 ${countTokens(messages)} 個 Token`);

  const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: messages
  });
  
  await message.reply(response.output_text);
});