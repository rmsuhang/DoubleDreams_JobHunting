import fs from 'node:fs/promises';
import path from 'node:path';
import { createInitialSeedState } from '../src/shared/seedData.ts';
import type { AppDataState } from '../src/shared/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'briefings.json');

let writeQueue: Promise<void> = Promise.resolve();

export async function loadAppState(): Promise<AppDataState> {
  try {
    const raw = await fs.readFile(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as AppDataState;
    if (!parsed || !Array.isArray(parsed.briefings) || !Array.isArray(parsed.sources)) {
      throw new Error('Invalid persisted structure');
    }
    const sanitizedSources = parsed.sources
      .filter((s) => s.id !== 'src-qdzyy' && s.domain !== 'qdzyy.cn')
      .map((s) =>
        s.id === 'src-qd-wsjkw'
          ? { ...s, name: '青岛市卫生健康委员会官网（含青岛市中医医院/海慈医疗集团招聘）' }
          : s
      );
    const sanitizedBriefings = parsed.briefings.filter(
      (b) => b.id !== 'brief-2026-11-14' && b.id !== 'brief-2026-11-15'
    );
    if (sanitizedBriefings.length === 0) {
      const cleanSeed = createInitialSeedState();
      const migrated: AppDataState = {
        ...parsed,
        sources: sanitizedSources,
        briefings: cleanSeed.briefings,
      };
      await saveAppState(migrated);
      return migrated;
    }
    return {
      ...parsed,
      sources: sanitizedSources,
      briefings: sanitizedBriefings,
    };
  } catch {
    const seed = createInitialSeedState();
    await saveAppState(seed);
    return seed;
  }
}

export async function saveAppState(state: AppDataState): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(state, null, 2), 'utf-8');
  });
  return writeQueue;
}
