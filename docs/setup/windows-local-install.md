# xiaoxian AI Windows 本地安装指南

更新时间：2026-08-30

这份文档提供 Windows 10/11 上可逐步复制的安装流程。

## 当前支持范围

| 能力 | Windows 当前状态 |
| --- | --- |
| 本地 Web 应用 | 支持 |
| 云端兼容模型对话 | 支持 |
| Ollama 本地对话 | 支持 |
| 本地记忆、聊天历史、认知日志 | 支持 |
| 欲望与陪伴状态界面 | 支持 |
| VibeThinker + MLX 本地微调 | 尚未在 Windows 验证，默认关闭 |
| 已训练适配器的常驻个性化进程 | 需要兼容的本地训练环境和适配器，Windows 当前不作为正式支持路径 |

Windows 用户现在可以完整运行应用、对话和本地数据层，但不能把“应用可运行”理解为“Windows 本地训练已经实现”。当前正式验证过的训练后端仍是 Apple Silicon 上的 MLX 路径。

## 1. 安装 Git 和 Node.js

以普通用户打开 PowerShell，依次执行：

```powershell
winget install --id Git.Git -e --source winget
winget install --id OpenJS.NodeJS.LTS -e --source winget
```

关闭 PowerShell，重新打开，然后验证：

```powershell
git --version
node --version
npm --version
```

项目要求 Node.js 20 或更高版本。也可以从官方页面下载安装：

- [Node.js 下载](https://nodejs.org/en/download/)
- [Git for Windows](https://git-scm.com/install/windows)

## 2. 克隆项目

```powershell
git clone https://github.com/dentes9988/xiaoxian-ai.git
cd xiaoxian-ai
```

## 3. 安装项目依赖

```powershell
npm run setup:windows
```

该命令会检查 Node.js 版本、安装工作区依赖，并创建本地 `data` 目录。它不会创建、上传或提交 API Key。

## 4. 运行安装自检

```powershell
npm run check:windows
```

自检会运行项目测试和 TypeScript 类型检查。

## 5. 启动应用

```powershell
npm run dev
```

浏览器打开：

```text
http://127.0.0.1:4173
```

如果端口被占用：

```powershell
$env:PORT=4273
npm run dev
```

然后打开：

```text
http://127.0.0.1:4273
```

## 6. 配置对话模型

进入页面右上角的“设置”，填写你自己的：

- Provider
- Model
- Base URL
- API Key

配置保存在本机 `data/runtime-config.json`，该目录已被 Git 忽略。不要把这个文件手动上传到公开仓库。

## 7. 可选：使用 Ollama 做本地对话

Ollama 官方提供原生 Windows 应用。安装说明：

- [Ollama for Windows](https://docs.ollama.com/windows)

安装后，在 PowerShell 验证：

```powershell
ollama --version
```

准备一个本地模型：

```powershell
ollama pull gemma3:1b-it-qat
```

然后在 xiaoxian AI 设置中填写：

```text
Provider: ollama
Model: gemma3:1b-it-qat
```

Ollama 默认接口为：

```text
http://127.0.0.1:11434
```

## 8. 关于 Windows 本地持续训练

当前仓库固定的训练流程使用：

```text
mlx-community/VibeThinker-3B-4bit
mlx-lm==0.31.3
```

这条组合目前只完成了 Apple Silicon 实机验证。上游 MLX 的跨平台能力仍在发展，但 xiaoxian AI 尚未完成 Windows 训练、显存占用、适配器兼容和恢复流程的实机验证，因此 Windows 默认关闭训练。

在 Windows 上强行打开训练开关不属于当前支持范围。聊天、记忆和认知日志仍会正常保存在本地；未来接入经验证的 Windows 训练后端后，这些日志可以继续生成个人训练素材。

## 最短安装路径

```powershell
winget install --id Git.Git -e --source winget
winget install --id OpenJS.NodeJS.LTS -e --source winget
git clone https://github.com/dentes9988/xiaoxian-ai.git
cd xiaoxian-ai
npm run setup:windows
npm run check:windows
npm run dev
```

打开：

```text
http://127.0.0.1:4173
```
