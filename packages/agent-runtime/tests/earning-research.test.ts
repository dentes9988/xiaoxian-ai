import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DailyEarningResearchScheduler,
  extractPricingSignals,
  FileSystemEarningResearchStore,
  runEarningResearch
} from "../src/earning-research.js";
import type {
  InternetToolExecutionResult,
  InternetToolExecutor,
  InternetToolRequest
} from "../src/internet-tools.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

function createExecutor(
  handler: (request: InternetToolRequest) => InternetToolExecutionResult
): InternetToolExecutor & { execute: ReturnType<typeof vi.fn> } {
  return {
    execute: vi.fn(async (request: InternetToolRequest) => handler(request))
  };
}

describe("earning research", () => {
  it("builds a private internal offer draft from deduplicated public evidence", async () => {
    const executor = createExecutor((request) => {
      const query = request.kind === "web_search" ? request.query : request.url;
      return {
        request,
        ok: true,
        content: "Public market evidence",
        sources: query.includes("本地部署")
          ? [
              {
                title: "500元上门安装本地 AI 助手",
                url: "https://example.cn/local-ai-setup",
                snippet: "服务价格为500元，包含安装和基础调试。"
              }
            ]
          : [
              {
                title: "Private AI setup service for $499",
                url: "https://example.com/private-ai-setup",
                snippet: "A one-time local installation package costs $499."
              }
            ]
      };
    });

    const record = await runEarningResearch({
      experimentId: "paid-pilot",
      offerName: "xiaoxian AI 本地安装",
      publicOfferTopic: "local-first personal AI assistant installation",
      executor,
      proposedUnitPriceCny: 399,
      capacity: 5,
      supportDays: 7,
      now: new Date("2026-09-01T02:00:00.000Z")
    });

    expect(executor.execute).toHaveBeenCalledTimes(3);
    expect(record.status).toBe("completed");
    expect(record.sources).toHaveLength(2);
    expect(record.pricingSignals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ currency: "CNY", amount: 500 }),
        expect.objectContaining({ currency: "USD", amount: 499 })
      ])
    );
    expect(record.recommendation).toMatchObject({
      proposedUnitPriceCny: 399,
      recommendedUnitPriceCny: 399,
      positioning: "early_access"
    });
    expect(record.publicDraft).toMatchObject({
      priceText: "早鸟价 ¥399 / 台",
      capacity: 5,
      supportDays: 7,
      approvalRequired: true
    });
    expect(record.boundaries).toEqual({
      publicResearchOnly: true,
      containsPrivatePaymentData: false,
      published: false,
      contactedAnyone: false,
      spentMoney: false
    });
    expect(JSON.stringify(record.publicDraft)).not.toMatch(
      /(?:api[_ -]?key|password|secret|token|银行卡|身份证|密码|密钥)/i
    );
    expect(record.publicDraft.headline).toBe("xiaoxian AI 本地安装早鸟计划");
  });

  it("ignores infrastructure, hardware, and account fees when pricing setup service", () => {
    const signals = extractPricingSignals([
      {
        title: "本地 AI 部署成本",
        url: "https://example.com/costs",
        snippet:
          "上门安装服务一口价500元。账户相关费用需额外支付 ¥100。云主机部署月费 $7，本地硬件 Mac Mini 一次性 $599。"
      }
    ]);

    expect(signals).toEqual([
      expect.objectContaining({ currency: "CNY", amount: 500 })
    ]);
  });

  it("rejects credential-like public topics before running a search", async () => {
    const executor = createExecutor((request) => ({
      request,
      ok: true,
      content: "",
      sources: []
    }));

    await expect(
      runEarningResearch({
        experimentId: "unsafe",
        offerName: "Unsafe offer",
        publicOfferTopic: "api_key: example-secret-value",
        executor
      })
    ).rejects.toThrow("private or credential-like");
    await expect(
      runEarningResearch({
        experimentId: "unsafe-name",
        offerName: "contact test@example.com",
        publicOfferTopic: "local personal AI installation",
        executor
      })
    ).rejects.toThrow("private or credential-like");
    expect(executor.execute).not.toHaveBeenCalled();
  });

  it("persists research records without losing prior runs", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiaoxian-earning-research-"));
    temporaryDirectories.push(root);
    const path = join(root, "research.json");
    const executor = createExecutor((request) => ({
      request,
      ok: true,
      content: "Evidence",
      sources: [{ title: "Public source", url: "https://example.com/source" }]
    }));
    const store = new FileSystemEarningResearchStore(path);
    const record = await runEarningResearch({
      experimentId: "persisted-pilot",
      offerName: "Local setup",
      publicOfferTopic: "local personal AI setup",
      executor
    });

    await store.append(record);

    const reloaded = new FileSystemEarningResearchStore(path);
    expect(await reloaded.list("persisted-pilot")).toEqual([record]);
  });

  it("runs once per completed day and retries a same-day failure", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiaoxian-earning-scheduler-"));
    temporaryDirectories.push(root);
    const statePath = join(root, "scheduler.json");
    const successfulRun = vi.fn().mockResolvedValue([]);
    const scheduler = new DailyEarningResearchScheduler({ statePath, run: successfulRun });
    const now = new Date("2026-09-01T03:00:00.000Z");

    expect(await scheduler.tick(now)).toMatchObject({ status: "no_experiments" });
    expect(await scheduler.tick(now)).toEqual({ status: "already_attempted" });
    expect(successfulRun).toHaveBeenCalledTimes(1);

    const retryStatePath = join(root, "retry-scheduler.json");
    const retryRun = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce([]);
    const retryScheduler = new DailyEarningResearchScheduler({
      statePath: retryStatePath,
      run: retryRun
    });

    expect(await retryScheduler.tick(now)).toMatchObject({
      status: "failed",
      error: "temporary network failure"
    });
    expect(await retryScheduler.tick(now)).toMatchObject({ status: "no_experiments" });
    expect(retryRun).toHaveBeenCalledTimes(2);
  });
});
