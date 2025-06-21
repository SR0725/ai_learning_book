import { Client, GatewayIntentBits } from "discord.js";
import { OpenAI } from "openai";
import "dotenv/config";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import fs from "fs/promises";
import path from "path";

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

const orchestratorPrompt = `你是一位資深的研究總監，擅長將複雜主題拆解成結構清晰的研究報告。

任務：將用戶提供的研究主題拆解成 4-6 個章節。

要求：
1. 每個章節要有明確的研究方向
2. 章節之間要有邏輯關聯但不重複
3. 涵蓋該主題的核心面向
4. 適合深度研究（每章節約 800-1200 字）

請以 JSON 格式輸出，包含：
- 報告標題
- 章節列表（每個章節包含標題和研究重點）`;

// 定義協調者的輸出格式
const ResearchOutline = z.object({
  title: z.string().describe("研究報告的標題"),
  chapters: z
    .array(
      z.object({
        chapterNumber: z.number().describe("章節編號"),
        title: z.string().describe("章節標題"),
        researchFocus: z.string().describe("該章節的研究重點"),
        keywords: z.array(z.string()).describe("關鍵詞，用於搜尋"),
      })
    )
    .min(4)
    .max(6)
    .describe("章節列表"),
});

async function orchestrateResearch(topic) {
  console.log(`📋 協調者開始分析主題：${topic}`);

  const response = await openai.responses.create({
    model: "gpt-4.1",
    instructions: orchestratorPrompt,
    input: `請為以下主題設計研究大綱：${topic}`,
    text: {
      format: zodTextFormat(ResearchOutline, "research_outline"),
    },
  });

  const outline = JSON.parse(response.output_text);
  console.log(`✅ 研究大綱已生成，共 ${outline.chapters.length} 個章節`);

  return outline;
}

const workerPrompt = `你是一位專業的研究員，擅長深度研究和撰寫報告。

你的任務：
1. 深入研究指定的章節主題
2. 使用網路搜尋獲取最新資訊
3. 撰寫 800-1200 字的專業內容
4. 包含具體數據、案例和分析

寫作要求：
- 保持客觀專業的語氣
- 引用具體數據和來源
- 結構清晰，邏輯連貫
- 避免空泛的描述`;

async function researchChapter(chapter, reportTitle) {
  console.log(`🔍 研究員 ${chapter.chapterNumber} 開始工作：${chapter.title}`);

  const input = `
報告主題：${reportTitle}
章節編號：第 ${chapter.chapterNumber} 章
章節標題：${chapter.title}
研究重點：${chapter.researchFocus}
關鍵詞：${chapter.keywords.join(", ")}

請撰寫這個章節的內容。`;

  const response = await openai.responses.create({
    model: "gpt-4.1",
    instructions: workerPrompt,
    input: input,
    // 啟用網路搜尋功能
    tools: [
      {
        type: "web_search_preview",
        search_context_size: "medium", // 可以根據需求調整
      },
    ],
  });

  console.log(`✅ 章節 ${chapter.chapterNumber} 研究完成`);

  return {
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    content: response.output_text,
  };
}

async function researchAllChapters(outline) {
  console.log(`👥 派遣 ${outline.chapters.length} 位研究員同時開始工作...`);

  // 所有工作者同時開始研究
  const chapterPromises = outline.chapters.map((chapter) =>
    researchChapter(chapter, outline.title)
  );

  // 等待所有章節完成
  const chapters = await Promise.all(chapterPromises);

  console.log(`🎉 所有研究員都完成工作了！`);

  // 按章節編號排序
  return chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
}

const synthesizerPrompt = `你是一位資深編輯，擅長將多個章節整合成連貫的報告。

任務：
1. 審視所有章節內容
2. 確保章節之間的連貫性
3. 統一寫作風格和術語
4. 加入適當的過渡段落
5. 撰寫執行摘要和結論

要求：
- 保持原有內容的專業性
- 修正明顯的重複或矛盾
- 確保整體邏輯流暢
- 生成完整的研究報告`;

async function synthesizeReport(outline, chapters) {
  console.log(`📝 統合者開始整合報告...`);

  // 將工作者們撰寫的章節內容彙整為同一個陣列
  const chaptersText = chapters
    .map((ch) => `## 第 ${ch.chapterNumber} 章：${ch.title}\n\n${ch.content}`)
    .join("\n\n---\n\n");

  const input = `
報告標題：${outline.title}

以下是各章節的內容：

${chaptersText}

請整合成一份完整的研究報告，包含：
1. 執行摘要（200-300字）
2. 各章節內容（保留但可適當調整）
3. 結論與展望（300-400字）`;

  const response = await openai.responses.create({
    model: "gpt-4.1",
    instructions: synthesizerPrompt,
    input: input,
  });

  console.log(`✅ 報告整合完成！`);

  return response.output_text;
}

const tools = [
  {
    type: "function", // 固定是 "function"
    name: "deep_research", // 工具名稱，請注意工具之間不要重複名稱
    description: "對某個主題進行進行深度研究", // 告訴 AI 這個工具的用途
    parameters: {
      // 這個 function 的傳入參數定義
      type: "object", // 這個 function 必須傳入一個物件
      properties: {
        topic: {
          // 這個物件裡頭有一個 topic 的屬性，他是 string，用來放主題
          type: "string",
          description: "主題",
        },
      },
      required: ["topic"], // 必填參數，這個物件一定得要有 topic
      additionalProperties: false, // 不允許額外參數
    },
  },
];

async function deepResearch(topic) {
  // 1. 協調者分解任務
  const outline = await orchestrateResearch(topic);

  // 2. 工作者並行研究
  const chapters = await researchAllChapters(outline);

  // 3. 統合者整合報告
  const finalReport = await synthesizeReport(outline, chapters);

  // 4. 把報告儲存為文件
  const fileName = `research_${Date.now()}.md`;

  // 把報告儲存到 ./reports 資料夾
  const filePath = path.join("./reports", fileName);

  // 確保 ./reports 資料夾存在
  await fs.mkdir("./reports", { recursive: true });

  // 寫入文件
  await fs.writeFile(filePath, finalReport, "utf8");

  // 回傳文件路徑
  return { filePath, fileName };
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

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: messages,
    tools: tools,
  });

  const functionCalls = response.output.filter(
    (item) => item.type === "function_call"
  );

  if (functionCalls.length === 0) {
    return await message.reply(response.output_text);
  }

  messages.push(...response.output);

  for (const toolCall of functionCalls) {
    const args = JSON.parse(toolCall.arguments);
    let result;

    // 如果 AI 想要調用 deep_research 工具，那就執行 deepResearch 函式
    if (toolCall.name === "deep_research") {
      const { filePath, fileName } = await deepResearch(args.topic);

      // 這邊就直接回傳報告給用戶了，因為再把報告回傳給 AI 意義不大
      return await message.reply({
        content: `✅ 研究報告已完成！`,
        files: [
          {
            attachment: filePath,
            name: `${fileName}`,
          },
        ],
      });
    }

    // 將工具的執行結果加入「對話紀錄」
    messages.push({
      type: "function_call_output",
      call_id: toolCall.call_id,
      output: JSON.stringify(result),
    });
  }

  const finalResponse = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: messages,
  });

  // 最後回覆給用
  await message.reply(finalResponse);
});
