import { basename, dirname } from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";

import type { PriorSkillOutput } from "@98agent/prior-engines";

export interface ImportedSource {
  id: string;
  kind: "file" | "url";
  label: string;
  content: string;
  importedAt: string;
  provenance: Record<string, string>;
}

export async function importTextFile(path: string): Promise<ImportedSource> {
  const { readFile } = await import("node:fs/promises");
  const content = await readFile(path, "utf8");
  return {
    id: crypto.randomUUID(),
    kind: "file",
    label: basename(path),
    content,
    importedAt: new Date().toISOString(),
    provenance: { path }
  };
}

export async function importUrl(url: string): Promise<ImportedSource> {
  const response = await fetch(url);
  const content = await response.text();
  return {
    id: crypto.randomUUID(),
    kind: "url",
    label: url,
    content,
    importedAt: new Date().toISOString(),
    provenance: { url }
  };
}

export async function loadPriorSkillOutputs(path: string): Promise<PriorSkillOutput[]> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as PriorSkillOutput[];
  } catch {
    return [];
  }
}

export async function savePriorSkillOutputs(
  path: string,
  outputs: PriorSkillOutput[]
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(outputs, null, 2), "utf8");
}
