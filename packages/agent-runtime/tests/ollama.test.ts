import { afterEach, describe, expect, it, vi } from "vitest";

import { OllamaRuntimeClient } from "../src/ollama.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OllamaRuntimeClient", () => {
  it("bounds generation and accepts adjacent structured objects", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        message: {
          content: '{"reply":"Start with one paid test."}{"candidateMemories":[]}'
        }
      })
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = new OllamaRuntimeClient({
      model: "test-model",
      maxOutputTokens: 512,
      keepAlive: "10m"
    });
    const result = await client.run([{ role: "user", content: "Help me earn." }], "Be useful.");

    expect(result).toEqual({
      reply: "Start with one paid test.",
      candidateMemories: [],
      proposedActions: []
    });
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request).toMatchObject({
      model: "test-model",
      stream: false,
      format: "json",
      think: false,
      keep_alive: "10m",
      options: { temperature: 0.2, num_predict: 512 }
    });
  });
});
