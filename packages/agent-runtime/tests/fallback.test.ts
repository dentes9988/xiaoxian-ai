import { describe, expect, it, vi } from "vitest";

import {
  FallbackRuntimeProvider,
  classifyRuntimeProviderError
} from "../src/fallback.js";
import type { RuntimeTurnResult } from "../src/schemas.js";

const primaryResult: RuntimeTurnResult = {
  reply: "Primary reply",
  candidateMemories: [],
  proposedActions: []
};

const fallbackResult: RuntimeTurnResult = {
  reply: "Fallback reply",
  candidateMemories: [],
  proposedActions: []
};

describe("FallbackRuntimeProvider", () => {
  it("does not call the fallback when the primary succeeds", async () => {
    const primary = { run: vi.fn().mockResolvedValue(primaryResult) };
    const fallback = { run: vi.fn().mockResolvedValue(fallbackResult) };
    const onFallback = vi.fn();
    const provider = new FallbackRuntimeProvider(primary, fallback, onFallback);

    await expect(provider.run([], "system")).resolves.toEqual(primaryResult);
    expect(fallback.run).not.toHaveBeenCalled();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("uses the fallback and reports a sanitized reason when the primary fails", async () => {
    const primary = { run: vi.fn().mockRejectedValue(new Error("Cloud chat failed with 401")) };
    const fallback = { run: vi.fn().mockResolvedValue(fallbackResult) };
    const onFallback = vi.fn();
    const provider = new FallbackRuntimeProvider(primary, fallback, onFallback);

    await expect(provider.run([], "system")).resolves.toEqual(fallbackResult);
    expect(fallback.run).toHaveBeenCalledOnce();
    expect(onFallback).toHaveBeenCalledWith("primary_auth_failed");
  });

  it("keeps the second pass on fallback after the primary fails once", async () => {
    const primary = { run: vi.fn().mockRejectedValue(new Error("Cloud chat failed with 401")) };
    const fallback = { run: vi.fn().mockResolvedValue(fallbackResult) };
    const provider = new FallbackRuntimeProvider(primary, fallback);

    await provider.run([], "first pass");
    await provider.run([], "second pass");

    expect(primary.run).toHaveBeenCalledOnce();
    expect(fallback.run).toHaveBeenCalledTimes(2);
  });

  it("does not expose provider error contents when both providers fail", async () => {
    const primary = { run: vi.fn().mockRejectedValue(new Error("secret-primary-detail")) };
    const fallback = { run: vi.fn().mockRejectedValue(new Error("secret-fallback-detail")) };
    const provider = new FallbackRuntimeProvider(primary, fallback);

    await expect(provider.run([], "system")).rejects.toThrow(
      "Primary and fallback runtime providers failed."
    );
  });
});

describe("classifyRuntimeProviderError", () => {
  it.each([
    ["request returned 403", "primary_auth_failed"],
    ["too many requests", "primary_rate_limited"],
    ["operation timed out", "primary_timeout"],
    ["connection refused", "primary_unavailable"]
  ] as const)("classifies %s", (message, expected) => {
    expect(classifyRuntimeProviderError(new Error(message))).toBe(expected);
  });
});
