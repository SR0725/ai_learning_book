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

const evaluatorPrompt = `你是一位嚴格的學術審稿人，負責評估研究報告章節的品質。

評估標準：
1. 內容深度（30分）：是否有充分的分析和見解
2. 資料新穎（20分）：是否引用最新數據和案例  
3. 邏輯結構（20分）：論述是否清晰有條理
4. 相關性（20分）：是否緊扣章節主題
5. 可讀性（10分）：是否易於理解

請給出：
- 總分（0-100）
- 具體問題點
- 改進建議`;

const EvaluationResult = z.object({
  score: z.number().min(0).max(100),
  issues: z.array(z.string()).describe("發現的具體問題"),
  suggestions: z.array(z.string()).describe("改進建議"),
});

async function evaluateChapter(chapter) {
  console.log(`🔍 評估者開始審查章節 ${chapter.chapterNumber}...`);

  const input = `
章節標題：${chapter.title}
章節內容：

${chapter.content}

請評估這個章節的品質。`;

  const response = await openai.responses.create({
    model: "gpt-4.1",
    instructions: evaluatorPrompt,
    input: input,
    text: {
      format: zodTextFormat(EvaluationResult, "evaluation"),
    },
  });

  const evaluation = JSON.parse(response.output_text);
  console.log(`📊 章節 ${chapter.chapterNumber} 評分：${evaluation.score}/100`);

  return evaluation;
}

const optimizerPrompt = `你是一位專業的內容優化專家，負責根據審稿意見改進研究報告。

你的任務：
1. 仔細閱讀原始內容和審稿意見
2. 針對每個問題進行改進
3. 保持原有的核心觀點
4. 提升整體品質

改進原則：
- 增加具體數據和案例
- 加強邏輯論證
- 改善文章結構
- 確保內容相關性`;

async function optimizeChapter(chapter, evaluation) {
  console.log(`✏️ 優化者開始改進章節 ${chapter.chapterNumber}...`);

  // 只有分數不夠高時才需要優化
  if (evaluation.score >= 85) {
    console.log(`✅ 章節 ${chapter.chapterNumber} 品質優秀，無需優化`);
    return chapter;
  }

  const input = `
原始章節：
標題：${chapter.title}
內容：${chapter.content}

評估結果：
總分：${evaluation.score}/100

發現的問題：
${evaluation.issues.map((issue, i) => `${i + 1}. ${issue}`).join("\n")}

改進建議：
${evaluation.suggestions
  .map((suggestion, i) => `${i + 1}. ${suggestion}`)
  .join("\n")}

請根據以上意見，重新撰寫這個章節。`;

  const response = await openai.responses.create({
    model: "gpt-4.1",
    instructions: optimizerPrompt,
    input: input,
    // 優化時也可以上網查新資料
    tools: [
      {
        type: "web_search_preview",
        search_context_size: "medium",
      },
    ],
  });

  return {
    ...chapter,
    content: response.output_text,
    optimized: true,
  };
}

async function researchChapterWithQualityControl(
  chapter,
  reportTitle,
  maxIterations = 3,
  targetScore = 80
) {
  console.log(
    `🎯 開始研究章節 ${chapter.chapterNumber}，目標分數：${targetScore}`
  );

  // 第一步：初始研究
  let currentChapter = await researchChapter(chapter, reportTitle);

  // 優化循環
  for (let iteration = 0; iteration < maxIterations; iteration++) {
    console.log(`🔄 第 ${iteration + 1} 輪優化...`);

    // 評估當前版本
    const evaluation = await evaluateChapter(currentChapter);

    // 如果已達標，提前結束
    if (evaluation.score >= targetScore) {
      console.log(`✨ 章節 ${chapter.chapterNumber} 達到品質標準！`);
      return {
        ...currentChapter,
        finalScore: evaluation.score,
        iterations: iteration + 1,
      };
    }

    // 如果是最後一輪，即使沒達標也要結束
    if (iteration === maxIterations - 1) {
      console.log(`⚠️ 章節 ${chapter.chapterNumber} 未達標，但已達迭代上限`);
      return {
        ...currentChapter,
        finalScore: evaluation.score,
        iterations: maxIterations,
        belowTarget: true,
      };
    }

    // 優化章節
    currentChapter = await optimizeChapter(currentChapter, evaluation);
  }
}

async function researchAllChaptersWithQuality(outline, options = {}) {
  const { targetScore = 80, maxIterations = 3, onProgress = null } = options;

  console.log(`🚀 啟動高品質研究模式...`);
  console.log(`   目標分數：${targetScore}`);
  console.log(`   最大迭代：${maxIterations} 輪`);

  const startTime = Date.now();

  // 並行處理所有章節
  const chapterPromises = outline.chapters.map(async (chapter) => {
    const result = await researchChapterWithQualityControl(
      chapter,
      outline.title,
      maxIterations,
      targetScore
    );

    // 回報進度
    if (onProgress) {
      await onProgress({
        chapter: chapter.title,
        score: result.finalScore,
        iterations: result.iterations,
      });
    }

    return result;
  });

  const chapters = await Promise.all(chapterPromises);

  // 統計品質數據
  const avgScore =
    chapters.reduce((sum, ch) => sum + ch.finalScore, 0) / chapters.length;
  const totalTime = (Date.now() - startTime) / 1000;

  console.log(`📊 研究完成統計：`);
  console.log(`   平均分數：${avgScore.toFixed(1)}`);
  console.log(`   總耗時：${totalTime.toFixed(1)} 秒`);
  console.log(
    `   未達標章節：${chapters.filter((ch) => ch.belowTarget).length}`
  );

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

  // 2. 工作者並行研究，並且使用 評估者-優化者模式
  const chapters = await researchAllChaptersWithQuality(outline, {
    targetScore: 85,
    maxIterations: 3,
    onProgress: async (progress) => {
      console.log(`⏳ ${progress.chapter}`,
          `✅ ${progress.chapter} (${progress.score}分, ${progress.iterations}輪)`);
    },
  });

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
