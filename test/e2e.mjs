// test/e2e.mjs —— 端到端真实识别测试（需要 ZHIPU_API_KEY 环境变量；真实调用智谱免费模型 GLM-4.6V-Flash）
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverScript = join(__dirname, "..", "src", "index.js");
const fixture = join(__dirname, "fixtures", "pixel.png");

if (!process.env.ZHIPU_API_KEY) {
  console.error("缺少环境变量 ZHIPU_API_KEY");
  process.exit(1);
}

const DEMO_URL = "https://cdn.bigmodel.cn/static/logo/register.png"; // 智谱官方 demo 图（含界面文字）

// 分段运行：--which=all|url|local（url=仅 extract_text(URL)，local=仅 extract_text(本地)）
const which = process.argv.find((a) => a.startsWith("--which="))?.split("=")[1] ?? "all";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverScript],
  env: process.env,
});
const client = new Client({ name: "e2e-test", version: "0.1.0" });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1305 = 平台服务过载（模型访问量大），官方建议增大重试间隔、避免高频重试
async function callWithRetry(name, args, retries = 4) {
  for (let i = 0; i < retries; i++) {
    const res = await client.callTool({ name, arguments: args });
    if (res.isError !== true) return res;
    const msg = res.content?.[0]?.text ?? "";
    if (msg.includes("429") || msg.includes("1305") || msg.includes("访问量过大")) {
      const wait = 60_000 * (i + 1);
      console.log(`   ⏳ 平台过载/限流，等待 ${wait / 1000}s 后重试（第 ${i + 1}/${retries} 次）`);
      await sleep(wait);
      continue;
    }
    throw new Error(`${name} 失败: ${msg}`);
  }
  throw new Error(`${name} 多次重试后仍被限流`);
}

try {
  await client.connect(transport);

  if (which === "all") {
    // 1) analyze_image —— URL 图片
    const r1 = await callWithRetry("analyze_image", {
      image: DEMO_URL,
      prompt: "这张图片展示了什么？用一句话回答。",
    });
    console.log("✅ analyze_image(URL) →", r1.content[0].text.replace(/\n+/g, " ").slice(0, 160));
    await sleep(20_000); // 错开过载窗口
  }

  // 2) extract_text —— URL 图片（应提取出文字）
  if (which === "all" || which === "url") {
    const r2 = await callWithRetry("extract_text", { image: DEMO_URL });
    console.log("✅ extract_text(URL) →", r2.content[0].text.replace(/\n+/g, " ").slice(0, 200));
    await sleep(20_000);
  }

  // 3) extract_text —— 本地文件路径（1x1 无文字图，应返回「未检测到文字」）
  if (which === "all" || which === "local") {
    const r3 = await callWithRetry("extract_text", { image: fixture });
    console.log("✅ extract_text(本地路径) →", r3.content[0].text.replace(/\n+/g, " ").slice(0, 120));
  }

  console.log(`e2e.mjs(--which=${which}): 端到端真实识别测试全部通过 ✅`);
} finally {
  await client.close();
}
