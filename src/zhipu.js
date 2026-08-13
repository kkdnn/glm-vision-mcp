// src/zhipu.js
// 智谱 AI OpenAI 兼容接口封装 —— 仅使用 Node 内置 fetch，无额外 HTTP 依赖。
// 文档参考：https://docs.bigmodel.cn/cn/guide/models/free/glm-4.6v-flash

export const ZHIPU_API_BASE = "https://open.bigmodel.cn/api/paas/v4";
export const DEFAULT_MODEL = "glm-4.6v-flash";

export class ZhipuError extends Error {
  constructor(message, { status, code, cause } = {}) {
    super(message);
    this.name = "ZhipuError";
    this.status = status;
    this.code = code;
    this.cause = cause;
  }
}

/**
 * 调用智谱 chat/completions 接口（OpenAI 兼容格式）。
 *
 * @param {object} options
 * @param {string} [options.apiKey] 优先使用传入值，否则读环境变量 ZHIPU_API_KEY
 * @param {string} [options.model=DEFAULT_MODEL] 模型名，默认免费视觉模型 glm-4.6v-flash
 * @param {Array}  options.messages OpenAI 兼容 messages（多模态内容用 image_url / video_url / file_url）
 * @param {boolean} [options.thinking=true] 是否开启思考模式（GLM-4.6V-Flash 支持开关）
 * @param {number} [options.timeoutMs=120000] 请求超时（毫秒），视觉任务通常较慢
 * @param {number} [options.maxTokens=8192] 最大输出 token 数
 * @returns {Promise<{text: string, reasoning: string|null, usage: object|null, model: string}>}
 */
export async function chatCompletion({
  apiKey = process.env.ZHIPU_API_KEY,
  model = DEFAULT_MODEL,
  messages,
  thinking = true,
  timeoutMs = 120000,
  maxTokens = 8192,
} = {}) {
  if (!apiKey) {
    throw new ZhipuError(
      "未配置 ZHIPU_API_KEY：请在环境变量中设置智谱开放平台的 API Key（获取地址 https://bigmodel.cn/usercenter/proj-mgmt/apikeys）"
    );
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new ZhipuError("messages 不能为空");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res;
  try {
    res = await fetch(`${ZHIPU_API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        thinking: { type: thinking ? "enabled" : "disabled" },
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ZhipuError(`请求智谱 API 超时（${timeoutMs}ms），请稍后重试`, { cause: err });
    }
    throw new ZhipuError(`无法连接智谱 API：${err.message}`, { cause: err });
  } finally {
    clearTimeout(timer);
  }

  const raw = await res.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  if (!res.ok) {
    const errMsg = data?.error?.message ?? data?.msg ?? data?.error ?? raw;
    const code = data?.error?.code ?? data?.code;
    throw new ZhipuError(
      `智谱 API 返回错误（HTTP ${res.status}）${code ? `，错误码 ${code}` : ""}：${String(errMsg)}`,
      { status: res.status, code }
    );
  }

  const choice = data?.choices?.[0];
  const message = choice?.message ?? {};

  // content 可能是字符串，也可能是多段内容数组（text/refusal 等），统一归一为纯文本
  let content = message.content;
  if (Array.isArray(content)) {
    content = content
      .filter((part) => part?.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }

  return {
    text: typeof content === "string" ? content : (content ?? ""),
    reasoning: message.reasoning_content ?? null,
    usage: data?.usage ?? null,
    model: data?.model ?? model,
  };
}
