# xiaoxian AI macOS 本地安装指南

更新时间：2026-08-30

这份文档对应当前开源版 `xiaoxian AI` 的 macOS 本地安装流程。

它覆盖两层内容：

1. 先把 Web 应用跑起来
2. 再启用本地小模型自训练能力

## 推荐的小模型基座

当前项目推荐的本地个性化训练基座模型是：

- `mlx-community/VibeThinker-3B-4bit`

推荐它作为默认基座的原因：

- 它已经是当前仓库里的默认训练基座模型
- 它和当前训练模块使用的 MLX 路线完全匹配
- 它在 Apple Silicon 上的本地可用性和个性化能力之间比较平衡
- 对第一次本地部署来说，它比更大的模型更容易成功跑通

如果你后面想尝试更大的版本，可以再测试 `mlx-community/VibeThinker-3B`，但第一次安装建议先用 `mlx-community/VibeThinker-3B-4bit` 跑通。

## 需要安装的依赖

### Web 应用必需依赖

- macOS
- Node.js 20 or newer
- npm 10 or newer

### 本地自训练必需依赖

- Apple Silicon Mac (`arm64`)
- Python 3.11 recommended
- Python 虚拟环境
- MLX 训练依赖文件：
  - `packages/local-model-finetune/requirements-macos-mlx.txt`

这个依赖文件当前会安装：

- `mlx-lm==0.31.3`
- `huggingface_hub==1.20.1`
- `httpx==0.28.1`

## 1. 克隆项目

```bash
git clone https://github.com/dentes9988/xiaoxian-ai.git
cd xiaoxian-ai
```

## 2. 安装 Node.js 依赖

```bash
npm install
```

或者：

```bash
npm run setup
```

## 3. 启动 Web 应用

```bash
npm run dev
```

然后打开：

```text
http://127.0.0.1:4173
```

如果 `4173` 端口已经被占用，用下面这条：

```bash
PORT=4273 npm run dev
```

然后打开：

```text
http://127.0.0.1:4273
```

## 4. 配置对话模型

应用界面本身可以先启动，但真正聊天需要一个可用的推理服务提供方。

你有两种实用途径：

1. 在 **Settings** 里配置你自己的 OpenAI 兼容云端接口
2. 自己额外安装并运行一个本地对话模型服务

对大多数用户来说，最容易跑通的是第一种云端兼容接口方案。

### 方案 A：直接写运行时配置文件

先把下面命令里的占位符改成你自己的值，再执行：

```bash
mkdir -p data
cat > data/runtime-config.json <<'EOF'
{
  "provider": "qyuanai",
  "model": "deepseek-v4-flash",
  "baseUrl": "https://YOUR-OPENAI-COMPATIBLE-ENDPOINT/v1",
  "apiKey": "YOUR_API_KEY"
}
EOF
```

然后重启应用：

```bash
npm run dev
```

### 方案 B：直接在界面里点 Settings 配置

先启动应用：

```bash
npm run dev
```

然后打开页面，填写：

- provider
- model
- base URL
- API key

不要把 `data/runtime-config.json` 提交到 Git 仓库。

### 可选：启用互联网搜索和网页读取

执行：

```bash
npm run setup:internet:mac
```

验证：

```bash
npm run check:internet
```

完整说明见：[互联网工具安装指南](internet-tools.md)。

## 5. 安装本地自训练环境

这一步会启用“本地小模型负责长期个性化”的那条链路。

执行：

```bash
npm run setup:training:mac
```

这条命令会：

- 创建 `.venv/`
- 升级 `pip`、`setuptools` 和 `wheel`
- 安装 MLX 训练依赖

## 6. 校验本地训练模型是否可用

执行：

```bash
npm run check:training:mac
```

默认校验模型是：

```text
mlx-community/VibeThinker-3B-4bit
```

如果本机还没有缓存这个模型，第一次执行时可能会先下载。

## 7. 可选：切换本地训练基座模型

应用当前默认使用：

```text
mlx-community/VibeThinker-3B-4bit
```

如果你想改成别的 MLX 兼容模型做训练校验，可以这样执行：

```bash
TRAINING_BASE_MODEL=mlx-community/VibeThinker-3B npm run check:training:mac
```

## 8. 可选：使用前先做仓库自检

```bash
npm test
npm run typecheck
```

## 9. 持续学习何时运行

应用启动后会检查设置中的本地训练时间窗口，默认窗口是本地时间 `01:00-06:00`。

- 每个休息窗口最多自动尝试一次
- 训练开始前会让常驻个性化模型休眠，避免同时占用两份模型内存
- 训练完成后会先运行不含私人数据的本地冒烟提示
- 只有能生成至少两条不同有效提示的新适配器才会设为 active
- 验证失败的适配器会标记为 failed，上一份 active 继续使用
- 下一次对话只加载完整的新适配器，不混用新旧版本
- 调度状态保存在 `data/training-scheduler-state.json`

可以在设置中修改训练窗口或关闭本地训练。手动测试训练仍可使用页面中的训练按钮。

## 10. 本地个性化模型常驻策略

有可用适配器后，每轮对话会先调用本地个人模型提取当轮个性化提示，再交给强模型生成正式回答。

- 活跃对话复用同一个已加载进程
- 空闲 10 分钟后自动释放
- 进程只缓存模型、分词器和适配器
- 每轮仍显式传入当前消息、自我模型摘要和当前投影
- 常驻进程不保存绕开记忆确认流程的隐藏用户画像

查看运行状态：

```bash
curl http://127.0.0.1:4173/api/local-personalization/health
```

让进程立即休眠并在下一轮重新加载：

```bash
curl -X POST http://127.0.0.1:4173/api/local-personalization/restart
```

## 依赖清单汇总

### JavaScript 侧

安装命令：

```bash
npm install
```

核心依赖包括：

- `typescript`
- `vitest`
- `tsx`
- workspace packages under `apps/*` and `packages/*`

### Python 侧

安装命令：

```bash
npm run setup:training:mac
```

当前明确安装的 Python 包：

- `mlx-lm==0.31.3`
- `huggingface_hub==1.20.1`
- `httpx==0.28.1`

## 最短可跑通路径

如果你只想拿一套最短、可逐步复制的命令直接跑：

```bash
git clone https://github.com/dentes9988/xiaoxian-ai.git
cd xiaoxian-ai
npm install
npm run setup:training:mac
npm run check:training:mac
PORT=4273 npm run dev
```

然后打开：

```text
http://127.0.0.1:4273
```

完成之后，再去 **Settings** 里配置对话模型，或者直接写 `data/runtime-config.json`。

Windows 用户请使用：[Windows 安装说明](windows-local-install.md)。
