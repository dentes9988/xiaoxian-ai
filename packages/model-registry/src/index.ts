import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface ModelCheckpointRecord {
  id: string;
  baseModel: string;
  adapterPath?: string;
  createdAt: string;
  trainingMode: "mlx-lora" | "manual" | "none";
  status: "ready" | "failed" | "active";
  isolationMode: "adapter_only" | "full_model_copy";
  trainingDataScope:
    | "profile_seed_only"
    | "cognition_log_only"
    | "profile_and_cognition"
    | "profile_cognition_and_skill_priors";
  notes?: string;
}

export class FileSystemModelRegistry {
  constructor(private readonly registryPath: string) {}

  async load(): Promise<ModelCheckpointRecord[]> {
    try {
      return JSON.parse(await readFile(this.registryPath, "utf8")) as ModelCheckpointRecord[];
    } catch {
      return [];
    }
  }

  async save(records: ModelCheckpointRecord[]): Promise<void> {
    await mkdir(dirname(this.registryPath), { recursive: true });
    await writeFile(this.registryPath, JSON.stringify(records, null, 2), "utf8");
  }

  async add(record: ModelCheckpointRecord): Promise<void> {
    const records = await this.load();
    records.push(record);
    await this.save(records);
  }

  async activate(id: string): Promise<void> {
    const records = await this.load();
    for (const record of records) {
      record.status = record.id === id ? "active" : record.status === "active" ? "ready" : record.status;
    }
    await this.save(records);
  }

  async rollbackTo(id: string): Promise<void> {
    await this.activate(id);
  }
}
