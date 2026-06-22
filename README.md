# xiaoxian AI

`xiaoxian AI` is a local-first personal assistant that helps each person build a clearer understanding of their own desires, emotions, patterns, and decision style.

The product idea is simple:

- everyone should have an assistant that understands them better over time
- that understanding should stay inspectable, correctable, and user-owned
- important self-model changes should require confirmation
- local training and memory management should protect personal privacy

This repository currently focuses on the first macOS-friendly local web version.

## What It Does

- live chat with a stronger online model for conversation
- candidate memory extraction from each conversation turn
- confirmation gates for high-impact profile changes
- a seven-direction desire panel that shows current hypotheses, not fixed labels
- local cognition logs and nightly local fine-tuning workflow
- low-authority prior systems used only as cold-start personality hypotheses

## Privacy Rules

This repository is intended for public open-source use, but personal data is not part of the public codebase.

Do not commit:

- `data/`
- `apps/web/data/`
- local runtime API keys
- user profile snapshots
- chat history
- local training outputs and adapters

## Project Structure

- `apps/web`: local web app for chat, self-modeling, and settings
- `packages/agent-runtime`: runtime prompt and structured-output handling
- `packages/memory-core`: memory store, projection, confirmation, and history logic
- `packages/training-data`: training example generation and self-model digest logic
- `packages/local-model-finetune`: local fine-tuning orchestration
- `packages/prior-engines`: low-authority prior-system adapters and translation layer
- `site/landing`: public project page for `xiaoxian.qyuanai.com`

## Local Development

```bash
npm install
npm run dev
```

The local app runs at:

```text
http://127.0.0.1:4173
```

## Runtime Setup

The app stores local runtime configuration in ignored files under `data/`.

Typical values you will configure locally:

- provider
- model name
- base URL
- API key

Keep those values local. Do not hardcode or commit them.

## Validation

```bash
npm test
npm run typecheck
```

## License

MIT
