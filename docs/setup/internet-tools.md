# xiaoxian AI 互联网工具安装指南

xiaoxian AI 的核心联网能力由三部分组成：

- Exa：通用网页搜索
- Jina Reader：读取公开网页正文
- GitHub CLI：在查询 GitHub 或开源仓库时补充直接仓库搜索

聊天运行时最多使用两次对话模型调用：第一次决定是否需要联网，工具在本地执行检索或读取，第二次只根据工具返回的公开证据生成最终回答。来源链接会和回答一起保存到本地聊天历史。

## 隐私与网络边界

- 搜索词不得包含用户画像、记忆、邮箱、电话号码、密钥或财务标识。
- 网页读取只接受公开的 `http` 或 `https` 地址。
- 本机地址、局域网地址、带凭据的 URL、敏感查询参数和非常用端口会被拒绝。
- 网页内容被视为不可信证据，不能改变系统指令，也不能触发下一轮工具调用。
- 工具结果不会自动执行发布、购买、开户、转账或联系他人等外部动作。

## macOS

先进入项目并安装 Node.js 依赖：

```bash
cd xiaoxian-ai
npm install
```

安装 Agent Reach、配置 Exa，并执行一次真实搜索自检：

```bash
npm run setup:internet:mac
```

以后可以单独检查：

```bash
npm run check:internet
```

GitHub 专用搜索是可选增强。安装 GitHub CLI：

```bash
brew install gh
gh auth login
```

没有安装或登录 `gh` 时，通用 Exa 搜索仍然可用。

## Windows 10/11

在 PowerShell 中进入项目并安装 Node.js 依赖：

```powershell
cd xiaoxian-ai
npm install
```

安装 Agent Reach、配置 Exa，并执行一次真实搜索自检：

```powershell
npm run setup:internet:windows
```

以后可以单独检查：

```powershell
npm run check:internet
```

可选安装 GitHub CLI：

```powershell
winget install --id GitHub.cli
gh auth login
```

## 使用

启动应用：

```bash
npm run dev
```

可以直接在对话中输入：

```text
请联网搜索 xiaoxian AI 的 GitHub 项目，并给出来源。
```

也可以发送一个公开网页地址：

```text
请阅读 https://example.com/ 并总结主要内容。
```

在“设置 → 互联网工具”中可以看到本机工具是否已经连接。联网回答下方会显示可点击的来源链接。

进行中的本地赚钱实验会每天触发一次公开市场研究，整理公开价格信号、来源和发布草稿。也可以在“设置 → 互联网工具”中点击“立即刷新市场研究”。这些结果只保存在本地；公开发布、联系潜在客户和收款仍需单独授权。

## 手动配置 Exa

安装脚本会把 xiaoxian 专用配置和 `mcporter` 标准用户配置保存在用户目录，不会写入项目仓库：

```text
~/.agent-reach/mcporter.json
~/.mcporter/mcporter.json
```

需要手动重建时执行：

```bash
mkdir -p ~/.agent-reach
./node_modules/.bin/mcporter --config ~/.agent-reach/mcporter.json config add exa https://mcp.exa.ai/mcp
./node_modules/.bin/mcporter config add exa https://mcp.exa.ai/mcp --scope home
npm run check:internet
```

Exa 当前这条 MCP 搜索链路不要求项目保存 API key。对话模型的 API key 仍然只保存在本地 `data/runtime-config.json`，不应提交到 Git。
