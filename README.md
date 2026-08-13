# glm-vision-mcp

基于智谱 AI 开放平台**免费**视觉模型 **GLM-4.6V-Flash** 的 MCP server，为 AI 助手提供图像识别与 OCR 能力。

- 图像理解（看图问答、描述、识别物体/场景）
- OCR 文字提取（截图、票据、文档、界面文案）
- 图片输入支持 **URL**、**base64 data URI**、**本地文件路径** 三种方式
- 支持思考模式开关（`thinking` 参数），复杂分析可开启

## 工具

| 工具 | 说明 | 参数 |
| --- | --- | --- |
| `analyze_image` | 通用图像识别/理解 | `image`（必填）、`prompt`（可选，对图片的提问）、`thinking`（可选，默认 true） |
| `extract_text` | OCR 文字提取，按原始版式输出 | `image`（必填）、`thinking`（可选，默认 false，OCR 追求速度） |

`image` 支持三种格式：

```
https://example.com/photo.jpg          # 公开图片 URL
data:image/png;base64,iVBORw0...       # base64 data URI
C:\Users\me\Desktop\截图.png            # 本地文件路径（≤10MB）
```

## 一、获取免费 API Key（一次性）

1. 打开 [智谱 AI 开放平台](https://bigmodel.cn) 注册账号并完成实名认证
2. 进入 [API Keys 页面](https://bigmodel.cn/usercenter/proj-mgmt/apikeys) → 点击「创建 API Key」→ 复制生成的 key（形如 `xxxxx.xxxxx`）
3. **GLM-4.6V-Flash 本身免费调用**，新用户注册还赠送体验额度，无需充值

## 二、配置 API Key（Windows）

**方式 A（推荐）：系统环境变量**

```powershell
# 在 PowerShell / CMD 执行（之后需新开终端或重启 Reasonix 才生效）
setx ZHIPU_API_KEY "你的key"
```

**方式 B：仅当前会话**

```powershell
$env:ZHIPU_API_KEY = "你的key"   # PowerShell 临时设置
```

> ⚠️ 不要把 key 直接写进 `.mcp.json` 或 `config.toml`——项目已用 `${ZHIPU_API_KEY}` 占位符，从环境变量读取，避免 key 落盘泄露。

## 三、安装与注册

```bash
npm install          # 安装依赖（仅需一次）
node src/index.js    # 手动启动（MCP 客户端会自动拉起，一般无需手动运行）
```

本项目已注册为 **Reasonix 全局 MCP**（配置在 `%APPDATA%\reasonix\config.toml`），
本机所有项目都可直接使用。如需重新注册或卸载：

```bash
# 重新注册（读取 .mcp.json）
# 在 Reasonix 对话中使用 install_source 工具，source 指向本目录的 .mcp.json，scope=global

# 卸载
# install_source op=uninstall，name=glm-vision-mcp
```

## 四、使用示例

注册完成后，直接在对话里告诉 AI「看」图即可，例如：

```
帮我识别这张图片：C:\Users\me\Desktop\票据.png
把这张截图里的文字提取出来：https://example.com/receipt.png
这张图里有什么异常？data:image/png;base64,……
```

AI 会自动调用 `analyze_image` / `extract_text` 工具完成识别。

## 五、注意事项（免费模型限流）

GLM-4.6V-Flash 免费版在高峰期可能遇到平台过载，API 返回
`HTTP 429 / 错误码 1305（该模型当前访问量过大）`。处理建议：

- **稍等 30–90 秒再重试**，避免连续高频请求（平台文档明确建议）
- 识别任务间留出间隔；并发任务可考虑排队
- 这不是 key 或代码问题，是平台侧的临时保护

## 六、开发与测试

```bash
npm test              # 单元测试（图像输入处理）+ MCP 冒烟测试（不需要 key）
ZHIPU_API_KEY=xxx node test/e2e.mjs            # 端到端真实识别测试（需要 key）
ZHIPU_API_KEY=xxx node test/e2e.mjs --which=url    # 只测 extract_text(URL)
ZHIPU_API_KEY=xxx node test/e2e.mjs --which=local  # 只测 extract_text(本地路径)
```

## 项目结构

```
src/index.js           # MCP server 入口：注册 analyze_image / extract_text
src/zhipu.js           # 智谱 chat/completions 封装（内置 fetch、超时、中文错误）
src/image-input.js     # 图像输入统一处理（URL / data URI / 本地路径，≤10MB）
test/                  # 单元测试、冒烟测试、端到端测试
.mcp.json              # MCP 注册描述
```
