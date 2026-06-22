import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { buildCurrentProjection, buildLifeTrajectory } from "./projection.js";
import type {
  ChatHistoryMessage,
  CognitionLogEntry,
  CurrentProjection,
  LifeTrajectory,
  MemoryItem
} from "./types.js";

interface StoreState {
  memories: MemoryItem[];
  cognitionLogs: CognitionLogEntry[];
  chatHistory: ChatHistoryMessage[];
  currentProjection?: CurrentProjection;
  lifeTrajectory?: LifeTrajectory;
}

const defaultState: StoreState = {
  memories: [],
  cognitionLogs: [],
  chatHistory: []
};

export class FileSystemMemoryStore {
  constructor(private readonly baseDir: string, private readonly userId: string) {}

  private get statePath(): string {
    return join(this.baseDir, `${this.userId}.json`);
  }

  async load(): Promise<StoreState> {
    try {
      const raw = await readFile(this.statePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<StoreState>;
      return {
        ...structuredClone(defaultState),
        ...parsed,
        memories: Array.isArray(parsed.memories) ? parsed.memories : [],
        cognitionLogs: Array.isArray(parsed.cognitionLogs) ? parsed.cognitionLogs : [],
        chatHistory: Array.isArray(parsed.chatHistory) ? parsed.chatHistory : []
      };
    } catch {
      return structuredClone(defaultState);
    }
  }

  private async save(state: StoreState): Promise<void> {
    await mkdir(dirname(this.statePath), { recursive: true });
    await writeFile(this.statePath, JSON.stringify(state, null, 2), "utf8");
  }

  async appendLog(entry: CognitionLogEntry): Promise<void> {
    const state = await this.load();
    state.cognitionLogs.push(entry);
    await this.save(state);
  }

  async appendChatHistory(messages: ChatHistoryMessage[]): Promise<void> {
    if (messages.length === 0) return;

    const state = await this.load();
    const existingIds = new Set(state.chatHistory.map((message) => message.id));
    for (const message of messages) {
      if (existingIds.has(message.id)) continue;
      state.chatHistory.push(message);
      existingIds.add(message.id);
    }
    await this.save(state);
  }

  async listChatHistory(args?: {
    limit?: number;
    beforeId?: string;
  }): Promise<{
    messages: ChatHistoryMessage[];
    hasMore: boolean;
  }> {
    const state = await this.load();
    const limit = Math.min(Math.max(args?.limit ?? 100, 1), 200);
    const ordered = state.chatHistory
      .slice()
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id));

    const endIndex =
      args?.beforeId != null
        ? ordered.findIndex((message) => message.id === args.beforeId)
        : ordered.length;

    const resolvedEndIndex = endIndex >= 0 ? endIndex : ordered.length;
    const startIndex = Math.max(0, resolvedEndIndex - limit);

    return {
      messages: ordered.slice(startIndex, resolvedEndIndex),
      hasMore: startIndex > 0
    };
  }

  async upsertMemory(memory: MemoryItem): Promise<void> {
    const state = await this.load();
    const index = state.memories.findIndex((item) => item.id === memory.id);
    if (index >= 0) {
      state.memories[index] = memory;
    } else {
      state.memories.push(memory);
    }
    state.currentProjection = buildCurrentProjection(this.userId, state.memories);
    state.lifeTrajectory = buildLifeTrajectory(this.userId, state.memories);
    await this.save(state);
  }

  async getSnapshot(): Promise<StoreState> {
    const state = await this.load();
    if (!state.currentProjection) {
      state.currentProjection = buildCurrentProjection(this.userId, state.memories);
    }
    if (!state.lifeTrajectory) {
      state.lifeTrajectory = buildLifeTrajectory(this.userId, state.memories);
    }
    return state;
  }
}
