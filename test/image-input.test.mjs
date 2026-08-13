// test/image-input.test.mjs —— src/image-input.js 的单元测试（无外部依赖，node 直接运行）
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { resolveImageInput, MAX_IMAGE_BYTES, detectMime, ImageInputError } from "../src/image-input.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(__dirname, "fixtures");
mkdirSync(fixtureDir, { recursive: true });

// 1x1 红色像素 PNG
const PIXEL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const fixturePath = join(fixtureDir, "pixel.png");
writeFileSync(fixturePath, PIXEL_PNG);

// 1) URL 输入原样透传
{
  const r = await resolveImageInput("https://cdn.bigmodel.cn/static/logo/register.png");
  assert.equal(r.kind, "url");
  assert.equal(r.url, "https://cdn.bigmodel.cn/static/logo/register.png");
}

// 2) data URI 解析出 base64
{
  const dataUri = `data:image/png;base64,${PIXEL_PNG.toString("base64")}`;
  const r = await resolveImageInput(dataUri);
  assert.equal(r.kind, "base64");
  assert.equal(r.mime, "image/png");
  assert.equal(r.url, PIXEL_PNG.toString("base64"));
}

// 3) 本地文件路径读取转 base64
{
  const r = await resolveImageInput(fixturePath);
  assert.equal(r.kind, "base64");
  assert.equal(r.mime, "image/png");
  assert.equal(r.bytes, PIXEL_PNG.length);
  assert.equal(r.fileName, "pixel.png");
  assert.equal(Buffer.from(r.url, "base64").length, PIXEL_PNG.length);
}

// 4) 相对路径也可用
{
  const rel = join(".", "test", "fixtures", "pixel.png");
  const r = await resolveImageInput(rel);
  assert.equal(r.kind, "base64");
}

// 5) 空输入报错
{
  await assert.rejects(() => resolveImageInput("  "), ImageInputError);
}

// 6) 不存在的路径报错
{
  await assert.rejects(() => resolveImageInput("Z:/definitely/not/exists.png"), ImageInputError);
}

// 7) 空内容的 data URI 报错；非 base64 编码的 data URI 可正常转换
{
  await assert.rejects(() => resolveImageInput("data:image/png;base64,"), ImageInputError);
  const r = await resolveImageInput("data:,hello");
  assert.equal(r.kind, "base64");
  assert.equal(r.url, Buffer.from("hello", "utf8").toString("base64"));
}

// 8) 大小限制：构造一个超限文件
{
  const bigPath = join(fixtureDir, "big.png");
  writeFileSync(bigPath, Buffer.alloc(MAX_IMAGE_BYTES + 1, 1));
  await assert.rejects(() => resolveImageInput(bigPath), ImageInputError);
}

// 9) MIME 推断
assert.equal(detectMime("a.JPG"), "image/jpeg");
assert.equal(detectMime("a.webp"), "image/webp");
assert.equal(detectMime("a.unknown"), "application/octet-stream");

console.log("image-input.test.mjs: 全部 9 组断言通过 ✅");
