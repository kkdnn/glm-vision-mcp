// test/smoke.mjs —— MCP 协议冒烟测试：以 stdio 连接真实 server 进程，验证握手/工具列表/错误链路
// 说明：本测试不消耗 API 额度 —— 调用 analyze_image 时故意不带 ZHIPU_API_KEY，
// 验证 server 正确返回「未配置 key」的错误消息（错误处理链路完整可用）。
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverScript = join(__dirname, "..", "src", "index.js");
const fixture = join(__dirname, "fixtures", "pixel.png");

// 确保子进程不带 ZHIPU_API_KEY，验证错误链路
const env = { ...process.env };
delete env.ZHIPU_API_KEY;

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverScript],
  env,
});

const client = new Client({ name: "smoke-test", version: "0.1.0" });

try {
  // 1) 握手 + 工具列表
  await client.connect(transport);
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  console.log("工具列表:", names.join(", "));
  assert.deepEqual(names, ["analyze_image", "extract_text"]);

  // 2) 调用 analyze_image（本地 fixture 图，无 key → 预期 isError + 中文提示）
  const res = await client.callTool({
    name: "analyze_image",
    arguments: { image: fixture, prompt: "描述这张图" },
  });
  console.log("analyze_image → isError:", res.isError);
  console.log("错误消息:", res.content?.[0]?.text?.slice(0, 60) ?? "(空)");
  assert.equal(res.isError, true);
  assert.ok(res.content?.[0]?.text?.includes("ZHIPU_API_KEY"), "错误消息应提示缺少 ZHIPU_API_KEY");

  // 3) 调用 extract_text（缺 key 路径同样走通）
  const res2 = await client.callTool({ name: "extract_text", arguments: { image: fixture } });
  assert.equal(res2.isError, true);
  assert.ok(res2.content?.[0]?.text?.includes("ZHIPU_API_KEY"));

  console.log("smoke.mjs: MCP 协议冒烟测试通过 ✅");
} finally {
  await client.close();
}
