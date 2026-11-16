import fs from 'node:fs/promises';
import path from 'node:path';
import { computeBriefingStats, deduplicateRecruitmentItems } from '../src/shared/diffEngine.ts';
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
      .map((s) => {
        if (s.id === 'src-qd-wsjkw') {
          return { ...s, name: '青岛市卫生健康委员会官网（含青岛市中医医院/海慈医疗集团招聘）' };
        }
        if (s.id === 'src-crcare') {
          return {
            ...s,
            name: '华润健康 / 华润医疗（华润集团润招网官方平台）',
            tierLabel: '国企医疗大健康官网及公众号',
            url: 'https://runjob.crc.com.cn/#/complex/homepage?id=1769554545615040514',
            domain: 'crc.com.cn',
          };
        }
        if (s.id === 'src-tigermed') {
          return {
            ...s,
            url: 'https://tigermed.zhiye.com/',
          };
        }
        return s;
      });
    const sanitizedBriefings = parsed.briefings
      .filter((b) => b.id !== 'brief-2026-11-14' && b.id !== 'brief-2026-11-15')
      .map((b) => {
        const cleanItems = (b.items ?? []).filter((item) => !item.sourceUrl.includes('crcare.com.cn'));
        const dedupedItems = deduplicateRecruitmentItems(cleanItems);
        return {
          ...b,
          items: dedupedItems,
          stats: computeBriefingStats(dedupedItems),
        };
      });
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
