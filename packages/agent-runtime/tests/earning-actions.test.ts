import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { afterEach, describe, expect, it } from "vitest";

import {
  FileSystemEarningActionStore,
  parseEarningActionProposals
} from "../src/earning-actions.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("earning action approval store", () => {
  it("filters malformed proposals and forces valid external actions into approval", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiaoxian-earning-actions-"));
    temporaryDirectories.push(root);
    const store = new FileSystemEarningActionStore(join(root, "actions.json"));
    const proposals = parseEarningActionProposals([
      {
        kind: "publish_offer",
        title: "Publish a paid pilot offer",
        description: "Publish one bounded service offer without private payment details.",
        rationale: "Test willingness to pay before expanding the product.",
        successMetric: "One qualified lead in seven days.",
        estimatedCostCny: 0
      },
      { kind: "run_shell", title: "Unsafe" },
      {
        kind: "publish_offer",
        title: "Publish private payment details",
        description: "Put account 6222000012345678 on the public page.",
        rationale: "Make payment direct.",
        successMetric: "Receive one payment.",
        estimatedCostCny: 0
      }
    ]);

    const [created] = await store.addProposals(proposals, "log-1", new Date("2026-08-30T01:00:00Z"));

    expect(proposals).toHaveLength(1);
    expect(created).toMatchObject({
      kind: "publish_offer",
      status: "pending_approval",
      requiresApproval: true,
      sourceLogId: "log-1"
    });
  });

  it("requires approval and matching tool evidence before completion", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiaoxian-earning-actions-"));
    temporaryDirectories.push(root);
    const store = new FileSystemEarningActionStore(join(root, "actions.json"));
    const [created] = await store.addProposals(
      [
        {
          kind: "contact_prospect",
          title: "Contact one qualified prospect",
          description: "Send the reviewed offer to one prospect.",
          rationale: "A direct response tests demand.",
          successMetric: "Receive one reply within three days.",
          estimatedCostCny: 0
        }
      ],
      "log-2"
    );
    if (!created) throw new Error("Expected an earning action fixture.");

    await expect(
      store.complete(created.id, {
        kind: "outreach_receipt",
        reference: "local-proof-id",
        recordedAt: new Date().toISOString()
      })
    ).rejects.toThrow("must be approved");

    const approved = await store.decide(created.id, "approved");
    expect(approved.status).toBe("approved");

    await expect(
      store.complete(created.id, {
        kind: "publication_url",
        reference: "https://example.test/offer",
        recordedAt: new Date().toISOString()
      })
    ).rejects.toThrow("cannot complete");

    const completed = await store.complete(created.id, {
      kind: "outreach_receipt",
      reference: "local-proof-id",
      recordedAt: new Date().toISOString()
    });
    expect(completed.status).toBe("completed");
    expect(completed.evidence).toHaveLength(1);
  });

  it("serializes concurrent proposal writes without losing either action", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiaoxian-earning-actions-"));
    temporaryDirectories.push(root);
    const store = new FileSystemEarningActionStore(join(root, "actions.json"));
    const proposal = {
      kind: "publish_offer" as const,
      title: "Publish one bounded offer",
      description: "Publish the reviewed offer without credentials.",
      rationale: "Validate demand.",
      successMetric: "One qualified inquiry.",
      estimatedCostCny: 0
    };

    await Promise.all([
      store.addProposals([proposal], "log-a"),
      store.addProposals([{ ...proposal, title: "Publish a second offer" }], "log-b")
    ]);

    const records = await store.list();
    expect(records).toHaveLength(2);
    expect(records.map((record) => record.sourceLogId).sort()).toEqual(["log-a", "log-b"]);
  });

  it("does not reinterpret a corrupted action ledger as an empty ledger", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiaoxian-earning-actions-"));
    temporaryDirectories.push(root);
    const path = join(root, "actions.json");
    await writeFile(path, "{broken", "utf8");
    const store = new FileSystemEarningActionStore(path);

    await expect(store.list()).rejects.toThrow();
  });
});
