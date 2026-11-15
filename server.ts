import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  computeNextTriggerIso,
  isOfficialSourceUrl,
  isValidTriggerTime,
} from './src/shared/diffEngine.ts';
import {
  generateBriefingMarkdown,
  generateStandaloneWorkbenchHtml,
} from './src/shared/exportHtml.ts';
import type { CandidateProfile, OfficialSource } from './src/shared/types.ts';
import { runOfficialRecruitmentScan } from './server/scanner.ts';
import { loadAppState, saveAppState } from './server/store.ts';

const PORT = Number(process.env.PORT) || 3000;

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Allow standalone exported HTML / GitHub Pages personal pages to sync with this API
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  // Ensure initial data state exists on boot
  let appState = await loadAppState();

  // API: Get full workspace state
  app.get('/api/state', async (_req, res) => {
    try {
      appState = await loadAppState();
      res.json(appState);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '加载状态失败' });
    }
  });

  // API: Trigger manual briefing scan
  app.post('/api/briefings/run', async (_req, res) => {
    try {
      appState = await loadAppState();
      const { newBriefing, updatedSources } = await runOfficialRecruitmentScan(appState, 'manual');
      appState = {
        ...appState,
        sources: updatedSources,
        schedule: {
          ...appState.schedule,
          lastRunAt: newBriefing.generatedAt,
          nextRunAt: computeNextTriggerIso(appState.schedule.triggerTime),
        },
        briefings: [newBriefing, ...appState.briefings].slice(0, 30),
      };
      await saveAppState(appState);
      res.json(appState);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '汇总执行失败' });
    }
  });

  // API: External cron webhook (for Cloud Scheduler / cron-job.org / GitHub Actions daily 08:00 wakeup)
  const handleCronRun = async (req: express.Request, res: express.Response) => {
    try {
      const secret = process.env.CRON_SECRET;
      if (secret && req.query.token !== secret && req.headers.authorization !== `Bearer ${secret}`) {
        res.status(401).json({ error: 'Unauthorized cron trigger' });
        return;
      }
      appState = await loadAppState();
      const { newBriefing, updatedSources } = await runOfficialRecruitmentScan(appState, 'scheduled');
      appState = {
        ...appState,
        sources: updatedSources,
        schedule: {
          ...appState.schedule,
          lastRunAt: newBriefing.generatedAt,
          nextRunAt: computeNextTriggerIso(appState.schedule.triggerTime),
        },
        briefings: [newBriefing, ...appState.briefings].slice(0, 30),
      };
      await saveAppState(appState);
      res.json({
        ok: true,
        briefingDate: newBriefing.briefingDate,
        stats: newBriefing.stats,
        scanStatusMessage: newBriefing.scanStatusMessage,
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '定时触发失败' });
    }
  };
  app.get('/api/cron/run', handleCronRun);
  app.post('/api/cron/run', handleCronRun);

  // API: Update schedule configuration (08:00 trigger time & enabled toggle)
  app.patch('/api/schedule', async (req, res) => {
    try {
      const { triggerTime, enabled } = req.body as {
        triggerTime?: string;
        enabled?: boolean;
      };

      if (triggerTime !== undefined && !isValidTriggerTime(triggerTime)) {
        res.status(400).json({ error: '触发时间格式须为 HH:mm（例如 08:00）' });
        return;
      }

      appState = await loadAppState();
      const nextTime = triggerTime ? triggerTime.trim() : appState.schedule.triggerTime;
      const nextEnabled = enabled !== undefined ? Boolean(enabled) : appState.schedule.enabled;

      appState = {
        ...appState,
        schedule: {
          ...appState.schedule,
          triggerTime: nextTime,
          enabled: nextEnabled,
          nextRunAt: computeNextTriggerIso(nextTime),
        },
      };
      await saveAppState(appState);
      res.json(appState.schedule);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '更新调度配置失败' });
    }
  });

  // API: Add a custom official source
  app.post('/api/sources', async (req, res) => {
    try {
      const { name, url, tier, region, channelType } = req.body as Partial<OfficialSource>;
      if (!name?.trim() || !url?.trim()) {
        res.status(400).json({ error: '请填写官方机构名称与官网链接' });
        return;
      }

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url.trim());
      } catch {
        res.status(400).json({ error: '请输入有效的完整 URL（需包含 http:// 或 https://）' });
        return;
      }

      appState = await loadAppState();
      const check = isOfficialSourceUrl(parsedUrl.toString(), appState.sources);
      if (!check.isOfficial && check.reason.includes('第三方商业')) {
        res.status(400).json({ error: check.reason });
        return;
      }

      const tierLabels: Record<OfficialSource['tier'], string> = {
        national_gov: '国家级官方门户',
        provincial_municipal_hrss: '省/市人社与考试网',
        hospital_official: '医院官方网站',
        soe_medical_enterprise: '国企/外企药企官网及公众号',
      };

      const safeTier: OfficialSource['tier'] =
        tier && tier in tierLabels ? tier : 'hospital_official';

      const newSource: OfficialSource = {
        id: `src-custom-${Date.now()}`,
        name: name.trim(),
        url: parsedUrl.toString(),
        domain: parsedUrl.hostname.replace(/^www\./, ''),
        tier: safeTier,
        tierLabel: tierLabels[safeTier],
        region: region || '济南',
        channelType: channelType === '官网及公众号' ? '官网及公众号' : '官网',
        enabled: true,
      };

      appState = {
        ...appState,
        sources: [...appState.sources, newSource],
      };
      await saveAppState(appState);
      res.status(201).json(appState.sources);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '添加官方源失败' });
    }
  });

  // API: Toggle official source enabled state
  app.patch('/api/sources/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const { enabled } = req.body as { enabled: boolean };
      appState = await loadAppState();
      appState = {
        ...appState,
        sources: appState.sources.map((s) => (s.id === id ? { ...s, enabled: Boolean(enabled) } : s)),
      };
      await saveAppState(appState);
      res.json(appState.sources);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '更新官方源状态失败' });
    }
  });

  // API: Delete custom official source
  app.delete('/api/sources/:id', async (req, res) => {
    try {
      const { id } = req.params;
      appState = await loadAppState();
      appState = {
        ...appState,
        sources: appState.sources.filter((s) => s.id !== id),
      };
      await saveAppState(appState);
      res.json(appState.sources);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '删除官方源失败' });
    }
  });

  // API: Update candidate profile criteria
  app.patch('/api/profile', async (req, res) => {
    try {
      const patch = req.body as Partial<CandidateProfile>;
      appState = await loadAppState();
      appState = {
        ...appState,
        profile: {
          ...appState.profile,
          ...patch,
          tracks: appState.profile.tracks,
        },
      };
      await saveAppState(appState);
      res.json(appState.profile);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '更新个人画像失败' });
    }
  });

  // API: Export standalone personal HTML workbench
  app.get('/api/export/html', async (req, res) => {
    try {
      const state = await loadAppState();
      const briefingId = typeof req.query.briefingId === 'string' ? req.query.briefingId : undefined;
      const rawApiBase = typeof req.query.apiBaseUrl === 'string' ? req.query.apiBaseUrl.trim() : '';
      let safeApiBase = '';
      if (rawApiBase) {
        try {
          const parsed = new URL(rawApiBase);
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            safeApiBase = parsed.origin;
          }
        } catch {
          // Ignore invalid URL
        }
      }
      const html = generateStandaloneWorkbenchHtml(state, briefingId, {
        apiBaseUrl: safeApiBase || undefined,
      });
      const dateStr =
        state.briefings.find((b) => b.id === briefingId)?.briefingDate ??
        state.briefings[0]?.briefingDate ??
        'latest';
      if (req.query.download === '1') {
        const filename = encodeURIComponent(`周梦梦_个人招聘工作台_${dateStr}.html`);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      }
      res.type('text/html; charset=utf-8').send(html);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '导出 HTML 工作台失败' });
    }
  });

  // API: Export Markdown daily briefing
  app.get('/api/export/markdown', async (req, res) => {
    try {
      const state = await loadAppState();
      const briefingId = typeof req.query.briefingId === 'string' ? req.query.briefingId : undefined;
      const md = generateBriefingMarkdown(state, briefingId);
      const dateStr =
        state.briefings.find((b) => b.id === briefingId)?.briefingDate ??
        state.briefings[0]?.briefingDate ??
        'latest';
      if (req.query.download === '1') {
        const filename = encodeURIComponent(`周梦梦_每日招聘简报_${dateStr}.md`);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      }
      res.type('text/markdown; charset=utf-8').send(md);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '导出 Markdown 简报失败' });
    }
  });

  // API: Export full JSON snapshot
  app.get('/api/export/json', async (_req, res) => {
    try {
      const state = await loadAppState();
      const dateStr = state.briefings[0]?.briefingDate ?? 'latest';
      const filename = encodeURIComponent(`周梦梦_招聘工作台数据备份_${dateStr}.json`);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${filename}`);
      res.type('application/json; charset=utf-8').send(JSON.stringify(state, null, 2));
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : '导出 JSON 备份失败' });
    }
  });

  // Background daily scheduler ticker (checks every 30s if Asia/Shanghai HH:mm matches triggerTime)
  let lastTriggeredDateKey = '';
  setInterval(async () => {
    try {
      const state = await loadAppState();
      if (!state.schedule.enabled) return;

      const now = new Date();
      const shanghaiMs = now.getTime() + 8 * 60 * 60 * 1000;
      const d = new Date(shanghaiMs);
      const hh = String(d.getUTCHours()).padStart(2, '0');
      const mm = String(d.getUTCMinutes()).padStart(2, '0');
      const currentHHmm = `${hh}:${mm}`;
      const dateKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

      if (currentHHmm === state.schedule.triggerTime && lastTriggeredDateKey !== dateKey) {
        lastTriggeredDateKey = dateKey;
        const { newBriefing, updatedSources } = await runOfficialRecruitmentScan(state, 'scheduled');
        const nextState = {
          ...state,
          sources: updatedSources,
          schedule: {
            ...state.schedule,
            lastRunAt: newBriefing.generatedAt,
            nextRunAt: computeNextTriggerIso(state.schedule.triggerTime, now),
          },
          briefings: [newBriefing, ...state.briefings].slice(0, 30),
        };
        await saveAppState(nextState);
      }
    } catch (err) {
      console.error('[Scheduler] Failed to run scheduled scan:', err);
    }
  }, 30_000);

  // Vite dev middleware vs static production dist
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.use('/assets', express.static(path.resolve(process.cwd(), 'public/assets')));
    app.get('*', async (_req, res) => {
      const html = await fs.readFile(path.join(distDir, 'index.html'), 'utf-8');
      res.send(html);
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
