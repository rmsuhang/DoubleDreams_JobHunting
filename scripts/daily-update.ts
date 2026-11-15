import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runOfficialRecruitmentScan } from '../server/scanner.ts';
import { loadAppState, saveAppState } from '../server/store.ts';
import { computeNextTriggerIso } from '../src/shared/diffEngine.ts';
import {
  generateBriefingMarkdown,
  generateStandaloneWorkbenchHtml,
} from '../src/shared/exportHtml.ts';

async function main() {
  const state = await loadAppState();
  const { newBriefing, updatedSources } = await runOfficialRecruitmentScan(state, 'scheduled');

  const nextState = {
    ...state,
    sources: updatedSources,
    schedule: {
      ...state.schedule,
      lastRunAt: newBriefing.generatedAt,
      nextRunAt: computeNextTriggerIso(state.schedule.triggerTime),
    },
    briefings: [newBriefing, ...state.briefings].slice(0, 30),
  };

  await saveAppState(nextState);

  const docsDir = path.resolve(process.cwd(), 'docs');
  await fs.mkdir(docsDir, { recursive: true });

  const apiBaseUrl = process.env.WORKBENCH_API_URL || '';
  const html = generateStandaloneWorkbenchHtml(nextState, newBriefing.id, {
    apiBaseUrl: apiBaseUrl || undefined,
  });
  const md = generateBriefingMarkdown(nextState, newBriefing.id);

  await fs.writeFile(path.join(docsDir, 'index.html'), html, 'utf-8');
  await fs.writeFile(path.join(docsDir, 'latest.md'), md, 'utf-8');

  console.log(
    `[daily-update] Generated docs/index.html (${newBriefing.briefingDate}): total=${newBriefing.stats.totalMatched}, new=${newBriefing.stats.newCount}, updated=${newBriefing.stats.updatedCount}`
  );
}

main().catch((err) => {
  console.error('[daily-update] Failed:', err);
  process.exit(1);
});
