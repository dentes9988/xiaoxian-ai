import { describe, expect, it } from "vitest";

import { extractJsonPayload } from "../src/json.js";

describe("extractJsonPayload", () => {
  it("parses a JSON object surrounded by prose and code fences", () => {
    expect(extractJsonPayload('result:\n```json\n{"reply":"ready"}\n```')).toEqual({
      reply: "ready"
    });
  });

  it("merges adjacent JSON objects without confusing braces inside strings", () => {
    expect(
      extractJsonPayload(
        '{"reply":"Use {one} bounded test."}{"candidateMemories":[],"answer":"fallback"}'
      )
    ).toEqual({
      reply: "Use {one} bounded test.",
      candidateMemories: [],
      answer: "fallback"
    });
  });

  it("returns null when no complete JSON object exists", () => {
    expect(extractJsonPayload("plain text only")).toBeNull();
  });
});
