import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FileSystemEarningExperimentStore } from "../src/earning-experiments.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("earning experiment ledger", () => {
  it("keeps projected revenue separate from evidence-backed revenue", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiaoxian-earning-experiments-"));
    temporaryDirectories.push(root);
    const store = new FileSystemEarningExperimentStore(join(root, "experiments.json"));
    const created = await store.create(
      {
        id: "paid-pilot",
        title: "Paid local installation pilot",
        hypothesis: "A bounded setup service can attract a first paying user.",
        offerSummary: "Five setup slots with seven days of support.",
        windowDays: 7,
        targetQualifiedInquiries: 3,
        targetPaidCustomers: 1,
        projectedRevenueCny: 1_995,
        cashCostLimitCny: 100
      },
      new Date("2026-08-30T01:00:00Z")
    );

    expect(created).toMatchObject({
      status: "draft",
      projectedRevenueCny: 1_995,
      verifiedRevenueCny: 0
    });

    await store.attachAction(created.id, "publish-action");
    const [started] = await store.startForAction(
      "publish-action",
      new Date("2026-08-30T02:00:00Z")
    );
    expect(started?.status).toBe("running");

    const measured = await store.recordMetrics(created.id, {
      qualifiedInquiries: 2,
      notes: "Two people asked for installation details."
    });
    expect(measured.metrics).toMatchObject({
      qualifiedInquiries: 2,
      paidCustomers: 0,
      deliveredOrders: 0
    });
    expect(measured.verifiedRevenueCny).toBe(0);

    const paid = await store.recordRevenue(created.id, {
      id: "payment-1",
      kind: "payment_record",
      amountCny: 399,
      reference: "payment-receipt-1",
      recordedAt: "2026-08-30T03:00:00.000Z"
    });
    expect(paid.projectedRevenueCny).toBe(1_995);
    expect(paid.verifiedRevenueCny).toBe(399);
    expect(paid.revenueEvidence).toHaveLength(1);

    await expect(
      store.recordRevenue(created.id, {
        kind: "payment_record",
        amountCny: 399,
        reference: "payment-receipt-1",
        recordedAt: "2026-08-30T04:00:00.000Z"
      })
    ).rejects.toThrow("already exists");
  });

  it("does not count revenue before an experiment starts", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiaoxian-earning-experiments-"));
    temporaryDirectories.push(root);
    const store = new FileSystemEarningExperimentStore(join(root, "experiments.json"));
    const created = await store.create({
      title: "Draft experiment",
      hypothesis: "A draft should not accept revenue.",
      offerSummary: "Not published.",
      windowDays: 7,
      targetQualifiedInquiries: 1,
      targetPaidCustomers: 1,
      projectedRevenueCny: 399,
      cashCostLimitCny: 0
    });

    await expect(
      store.recordRevenue(created.id, {
        kind: "payment_record",
        amountCny: 399,
        reference: "unstarted-payment",
        recordedAt: new Date().toISOString()
      })
    ).rejects.toThrow("draft experiment");
  });

  it("serializes concurrent payment records without losing revenue", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiaoxian-earning-experiments-"));
    temporaryDirectories.push(root);
    const store = new FileSystemEarningExperimentStore(join(root, "experiments.json"));
    const created = await store.create({
      title: "Concurrent payment experiment",
      hypothesis: "Two receipts can arrive close together.",
      offerSummary: "A small paid service.",
      windowDays: 7,
      targetQualifiedInquiries: 2,
      targetPaidCustomers: 2,
      projectedRevenueCny: 600,
      cashCostLimitCny: 0
    });
    await store.start(created.id);

    await Promise.all([
      store.recordRevenue(created.id, {
        kind: "payment_record",
        amountCny: 200,
        reference: "concurrent-receipt-a",
        recordedAt: "2026-08-30T03:00:00.000Z"
      }),
      store.recordRevenue(created.id, {
        kind: "payment_record",
        amountCny: 300,
        reference: "concurrent-receipt-b",
        recordedAt: "2026-08-30T03:00:01.000Z"
      })
    ]);

    const [saved] = await store.list();
    expect(saved?.verifiedRevenueCny).toBe(500);
    expect(saved?.revenueEvidence).toHaveLength(2);
  });

  it("does not reinterpret a corrupted experiment ledger as empty", async () => {
    const root = await mkdtemp(join(tmpdir(), "xiaoxian-earning-experiments-"));
    temporaryDirectories.push(root);
    const path = join(root, "experiments.json");
    await writeFile(path, "{broken", "utf8");
    const store = new FileSystemEarningExperimentStore(path);

    await expect(store.list()).rejects.toThrow();
  });
});
