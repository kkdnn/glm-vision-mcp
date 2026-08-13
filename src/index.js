// src/index.js —— glm-vision-mcp：基于智谱免费视觉模型 GLM-4.6V-Flash 的图像识别 MCP server
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { chatCompletion, DEFAULT_MODEL } from "./zhipu.js";
import { resolveImageInput } from "./image-input.js";

const SERVER_NAME = "glm-vision-mcp";
const SERVER_VERSION = "1.0.0";

// 统一错误处理：MCP 工具返回 isError: true + 中文错误消息
function errorResult(err) {
  return {
    content: [{ type: "text", text: `❌ ${err?.message ?? String(err)}` }],
    isError: true,
  };
}

// 把图像输入统一处理为智谱多模态 message
async function buildVisionMessage(image, text) {
  const resolved = await resolveImageInput(image);
  return {
    messages: [
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: resolved.url } },
          { type: "text", text },
        ],
      },
    ],
    sourceInfo: resolved,
  };
}

const imageArg = {
  image: z
    .string()
    .describe("图片输入：http(s) 图片 URL、data URI（data:image/png;base64,...）或本地文件路径"),
};

const thinkingArg = {
  thinking: z
    .boolean()
    .optional()
    .describe("是否开启思考模式（GLM-4.6V-Flash 支持开关，复杂分析建议开启，追求速度可关闭）"),
};

const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

// ---------- 工具 1：通用图像识别 ----------
server.tool(
  "analyze_image",
  {
    ...imageArg,
    prompt: z
      .string()
      .optional()
      .describe("对图片提出的问题或指令，例如「描述这张图」「图中有什么文字」「识别图中物体」"),
    ...thinkingArg,
  },
  async ({ image, prompt, thinking }) => {
    try {
      const question = prompt?.trim() || "请详细描述这张图片的内容，包括主体、场景、关键细节和图中文字。";
      const { messages, sourceInfo } = await buildVisionMessage(image, question);
      const result = await chatCompletion({ messages, thinking: thinking ?? true });
      const head = sourceInfo.kind === "url" ? `📷 图片：${sourceInfo.source}\n` : "";
      return {
        content: [{ type: "text", text: `${head}${result.text}` }],
      };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---------- 工具 2：OCR 文字提取 ----------
server.tool(
  "extract_text",
  {
    ...imageArg,
    ...thinkingArg,
  },
  async ({ image, thinking }) => {
    try {
      const ocrInstruction =
        "你是 OCR 引擎。请提取这张图片中的全部文字，按原始版式顺序输出。要求：1) 只输出图片中的文字本身，" +
        "不要添加解释、评论或翻译；2) 保留换行与段落结构；3) 若图片没有文字，仅回复「未检测到文字」。";
      const { messages, sourceInfo } = await buildVisionMessage(image, ocrInstruction);
      // OCR 追求速度，默认关闭思考模式
      const result = await chatCompletion({ messages, thinking: thinking ?? false });
      const head = sourceInfo.kind === "url" ? `📷 图片：${sourceInfo.source}\n` : "";
      return {
        content: [{ type: "text", text: `${head}${result.text}` }],
      };
    } catch (err) {
      return errorResult(err);
    }
  }
);

// ---------- 启动 ----------
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] 已启动（模型：${DEFAULT_MODEL}），通过 stdio 与客户端通信`);
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] 启动失败：`, err);
  process.exit(1);
});
