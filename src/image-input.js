// src/image-input.js
// 统一处理图像输入：URL / data URI（base64）/ 本地文件路径，转换为智谱 API 可用的格式。
// 智谱视觉模型 base64 示例直接传 base64 字符串，URL 直接传 URL。

import { readFileSync, statSync } from "node:fs";
import { basename, extname } from "node:path";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB（智谱视觉输入上限，超出请先压缩）

const MIME_BY_EXT = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".tiff": "image/tiff",
};

export function detectMime(path) {
  return MIME_BY_EXT[extname(path).toLowerCase()] ?? "application/octet-stream";
}

export class ImageInputError extends Error {
  constructor(message, { cause } = {}) {
    super(message);
    this.name = "ImageInputError";
    this.cause = cause;
  }
}

const isUrl = (value) => /^https?:\/\//i.test(value);
const isDataUri = (value) => /^data:/i.test(value);

function assertSize(bytes, where) {
  if (bytes > MAX_IMAGE_BYTES) {
    throw new ImageInputError(
      `图片大小 ${(bytes / 1024 / 1024).toFixed(1)}MB 超过限制（≤ ${MAX_IMAGE_BYTES / 1024 / 1024}MB）${where}`
    );
  }
}

/**
 * 统一处理图像输入，返回智谱 API 可直接使用的 image_url.url 值。
 *
 * 支持三种输入：
 *  1. http(s):// 开头的公开图片 URL
 *  2. data URI，如 data:image/png;base64,<base64>
 *  3. 本地文件路径（Windows / Linux / macOS 绝对路径或相对路径）
 *
 * @param {string} image
 * @returns {Promise<{url: string, kind: 'url'|'base64', source: string, mime?: string, bytes?: number, fileName?: string}>}
 */
export async function resolveImageInput(image) {
  if (typeof image !== "string" || !image.trim()) {
    throw new ImageInputError("image 参数不能为空：请提供图片 URL、data URI 或本地文件路径");
  }
  const value = image.trim();

  if (isUrl(value)) {
    // URL 无法预检大小，交给 API 侧处理
    return { url: value, kind: "url", source: "url" };
  }

  if (isDataUri(value)) {
    const m = value.match(/^data:([^;,]*)(;base64)?,(.*)$/is);
    if (!m || !m[3]) {
      throw new ImageInputError("data URI 格式无效：应为 data:image/png;base64,<内容>");
    }
    const mime = m[1] || "application/octet-stream";
    const b64 = m[2] === ";base64" ? m[3] : Buffer.from(m[3], "utf8").toString("base64");
    const bytes = Buffer.from(b64, "base64").length;
    assertSize(bytes, "");
    return { url: b64, kind: "base64", source: "data-uri", mime, bytes };
  }

  // 剩余视为本地文件路径
  let stat;
  try {
    stat = statSync(value);
  } catch {
    throw new ImageInputError(`找不到本地图片文件：${value}（仅支持 URL、data URI 或真实存在的文件路径）`);
  }
  if (!stat.isFile()) {
    throw new ImageInputError(`路径不是文件：${value}`);
  }
  assertSize(stat.size, "");
  let b64;
  try {
    b64 = readFileSync(value).toString("base64");
  } catch (err) {
    throw new ImageInputError(`读取本地图片失败：${err.message}`, { cause: err });
  }
  return {
    url: b64,
    kind: "base64",
    source: value,
    mime: detectMime(value),
    bytes: stat.size,
    fileName: basename(value),
  };
}
