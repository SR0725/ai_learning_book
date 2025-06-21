import { Client, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';  // 在最上方引入

// =========== 1. 初始化 Discord Client ==========
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// =========== 2. 登入 Discord ==========
const token = process.env.DISCORD_BOT_TOKEN;

await bot.login(token);

// =========== 3. Bot 成功上線 ==========
bot.once('ready', () => {
  console.log(`🤖 已登入：${bot.user?.tag}`);
});

// =========== 4. 收到訊息時觸發 ==========
bot.on('messageCreate', async (message) => {
  // 避免無限自言自語，所以遇到機器人的訊息就提早停止程式
  if (message.author.bot) return; 

  // 取得訊息所在的頻道名稱
  const channelName =
    "name" in message.channel ? message.channel.name : message.channelId;

  // 打印出來
  console.log(
    `收到來自 ${message.author.username} 在 #${channelName} 的訊息: ${message.content}`
  );

  // 回覆該訊息早安
  await message.reply("早安");
});