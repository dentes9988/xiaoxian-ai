import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const indexPath = new URL("../public/index.html", import.meta.url);
const appPath = new URL("../public/app.js", import.meta.url);

describe("web static entry", () => {
  it("redirects file-opened pages to the running local service", async () => {
    const html = await readFile(indexPath, "utf8");

    expect(html).toContain('window.location.protocol === "file:"');
    expect(html).toContain('window.location.replace("http://127.0.0.1:4173/")');
    expect(html).toContain('<script type="module" src="./app.js"></script>');
  });

  it("shows internet tool health and sourced answers in the chat UI", async () => {
    const [html, app] = await Promise.all([
      readFile(indexPath, "utf8"),
      readFile(appPath, "utf8")
    ]);

    expect(html).toContain('id="settingsInternetToolsStatus"');
    expect(html).toContain(".chat-sources {");
    expect(app).toContain('class="chat-sources"');
    expect(app).toContain("renderMessageSources(message.sources)");
    expect(app).toContain("本轮已查看互联网来源");
  });

  it("keeps public market research internal until the user authorizes publishing", async () => {
    const [html, app] = await Promise.all([
      readFile(indexPath, "utf8"),
      readFile(appPath, "utf8")
    ]);

    expect(html).toContain('id="runEarningResearch"');
    expect(html).toContain('id="settingsEarningResearchStatus"');
    expect(app).toContain('postJson("/api/earning/research/run", {})');
    expect(app).toContain("公开市场研究");
    expect(app).toContain("内部草稿");
  });
});
