import { GoogleGenAI } from '@google/genai';
import {
  computeIncrementalDiff,
  evaluateProfileMatch,
  isOfficialSourceUrl,
  normalizeCanonicalKey,
} from '../src/shared/diffEngine.ts';
import type {
  AppDataState,
  BriefingSnapshot,
  GroundingLink,
  OfficialSource,
  RecruitmentItem,
} from '../src/shared/types.ts';
import { scrapeOfficialPortal } from './portalScraper.ts';

function getShanghaiDateString(date: Date = new Date()): string {
  const shanghaiMs = date.getTime() + 8 * 60 * 60 * 1000;
  const d = new Date(shanghaiMs);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function extractJsonArrayFromText(rawText: string): unknown[] {
  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : rawText.trim();
  const start = candidate.indexOf('[');
  const end = candidate.lastIndexOf(']');
  if (start === -1 || end === -1 || end <= start) {
    return [];
  }
  try {
    const parsed = JSON.parse(candidate.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function runOfficialRecruitmentScan(
  state: AppDataState,
  triggerType: 'scheduled' | 'manual'
): Promise<{
  newBriefing: BriefingSnapshot;
  updatedSources: OfficialSource[];
}> {
  const now = new Date();
  const todayStr = getShanghaiDateString(now);
  const enabledSources = state.sources.filter((s) => s.enabled);

  // 1. Real HTTP scraping across enabled official portals (homepage + recruitment columns + article details)
  const scrapeResults = await Promise.all(
    enabledSources.map((src) => scrapeOfficialPortal(src, state.profile, todayStr))
  );
  const scrapeMap = new Map(scrapeResults.map((p) => [p.source.id, p]));
  const nowIso = now.toISOString();

  const updatedSources = state.sources.map((src) => {
    const res = scrapeMap.get(src.id);
    if (!res) return src;
    return {
      ...src,
      lastCheckedAt: nowIso,
      lastHttpStatus: res.httpStatus,
      lastCheckNote: res.note,
    };
  });

  const directScrapedItems: RecruitmentItem[] = [];
  const seenUrls = new Set<string>();
  const seenKeys = new Set<string>();
  for (const res of scrapeResults) {
    for (const item of res.items) {
      if (!seenUrls.has(item.sourceUrl) && !seenKeys.has(item.canonicalKey)) {
        seenUrls.add(item.sourceUrl);
        seenKeys.add(item.canonicalKey);
        directScrapedItems.push(item);
      }
    }
  }

  // Carry forward only real live-verified baseline items (never retain legacy placeholder items)
  const baselineBriefing = state.briefings[0] ?? null;
  const baselineItems = (baselineBriefing?.items ?? []).filter((item) => item.isLiveGrounded === true);

  const geminiItems: RecruitmentItem[] = [];
  const groundingLinks: GroundingLink[] = [];
  let groundingUsed = false;
  let geminiStatusNote = '';

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey && apiKey.trim().length > 0 && apiKey !== 'MY_GEMINI_API_KEY') {
    try {
      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const sourceListText = enabledSources
        .map((s) => `- ${s.name} (${s.url})`)
        .join('\n');

      const prompt = `今天是 ${todayStr}。请严格使用 Google 搜索检索中国官方一手渠道近期发布的、适合以下求职者画像的招聘公告、职位表、补充/更正公告及关键时间节点（校招日程、报名、资格审查、缴费、准考证打印、笔试、面试及延期/变更异动）：

【求职者画像】
- 姓名：${state.profile.name}
- 学历与专业：${state.profile.degree}，${state.profile.major}（${state.profile.masterSchool}）
- 应届身份：2027届应届毕业生（校招为主，面试/笔试）
- 重点城市：${state.profile.targetCities.join('、')}
- 持有证书：${state.profile.certificates.join('、')}
- 双赛道意向：1) 针灸推拿医师/中医临床/康复理疗；2) 医学事务/临床研究 CRA（持GCP证书+执业医师证）

【唯一允许的信息源（严禁返回第三方商业招聘站或培训机构网站，且每条必须为真实可打开的公告详情页URL）】
${sourceListText}
以及国家公务员局官网(scs.gov.cn)、山东/济南/青岛人社局及卫健委官网、公立医院官网、国企医疗/药企官方招聘渠道。

请输出一个 JSON 数组（放在 \`\`\`json ... \`\`\` 中），只输出真实检索到的最新或未截止官方公告（找不到则输出空数组 []，严禁编造日期或公告）。每条必须严格包含字段：
{
  "title": "官方原文标题",
  "sourceName": "官方发布单位名称",
  "sourceUrl": "必须为官方来源真实公告详情页URL",
  "publishDate": "YYYY-MM-DD",
  "announcementType": "new_announcement | position_table | supplement_correction",
  "region": "济南 | 青岛 | 山东省级/国家",
  "employerName": "招录医院或单位名称",
  "employerCategory": "公立医院 | 人社/卫健委 | 国企医疗 | 外企/国企药企",
  "deadlineDate": "YYYY-MM-DD",
  "hasAnomaly": false,
  "anomalyDetail": "",
  "matchedPositions": [
    {
      "positionName": "岗位名称",
      "department": "科室/部门",
      "headcount": 1,
      "degreeReq": "硕士研究生及以上",
      "majorReq": "针灸推拿学等",
      "freshGradOnly": true,
      "examFormat": "笔试+面试",
      "track": "tcm_physician | medical_cra"
    }
  ],
  "milestones": [
    {
      "type": "registration | qualification_review | payment | admit_card | written_exam | interview | campus_talk | supplement",
      "label": "节点名称",
      "dateRange": "时间范围",
      "status": "upcoming | active | urgent | delayed | cancelled | completed"
    }
  ]
}`;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          tools: [{ googleSearch: {} }],
        },
      });

      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
      for (const chunk of chunks) {
        if (chunk.web?.uri) {
          const check = isOfficialSourceUrl(chunk.web.uri, updatedSources);
          if (check.isOfficial) {
            groundingLinks.push({
              title: chunk.web.title || chunk.web.uri,
              uri: chunk.web.uri,
            });
          }
        }
      }

      const rawArray = extractJsonArrayFromText(response.text ?? '');
      for (let idx = 0; idx < rawArray.length; idx++) {
        const entry = rawArray[idx] as Record<string, unknown>;
        const url = String(entry.sourceUrl || '').trim();
        const urlValidation = isOfficialSourceUrl(url, updatedSources);
        if (!urlValidation.isOfficial) {
          continue;
        }

        const title = String(entry.title || '').trim();
        const employerName = String(entry.employerName || entry.sourceName || '官方招录单位').trim();
        if (!title) continue;

        const candidateItem: RecruitmentItem = {
          id: `live-${todayStr}-${idx}-${Date.now()}`,
          canonicalKey: normalizeCanonicalKey(employerName, title, url),
          title,
          sourceName: String(entry.sourceName || employerName),
          sourceUrl: url,
          sourceTier: url.includes('.gov.cn') ? 'provincial_municipal_hrss' : 'hospital_official',
          publishDate: /^\d{4}-\d{2}-\d{2}$/.test(String(entry.publishDate || ''))
            ? String(entry.publishDate)
            : todayStr,
          announcementType:
            entry.announcementType === 'position_table' || entry.announcementType === 'supplement_correction'
              ? entry.announcementType
              : 'new_announcement',
          region:
            entry.region === '青岛' || entry.region === '山东省级/国家' ? entry.region : '济南',
          employerName,
          employerCategory:
            entry.employerCategory === '人社/卫健委' ||
            entry.employerCategory === '国企医疗' ||
            entry.employerCategory === '外企/国企药企'
              ? entry.employerCategory
              : '公立医院',
          matchedTrack: 'tcm_physician',
          matchReasons: [],
          matchedPositions: Array.isArray(entry.matchedPositions)
            ? (entry.matchedPositions as RecruitmentItem['matchedPositions'])
            : [],
          milestones: Array.isArray(entry.milestones)
            ? (entry.milestones as RecruitmentItem['milestones']).map((m, mIdx) => ({
                ...m,
                id: m.id || `live-ms-${idx}-${mIdx}`,
              }))
            : [],
          deadlineDate: /^\d{4}-\d{2}-\d{2}$/.test(String(entry.deadlineDate || ''))
            ? String(entry.deadlineDate)
            : todayStr,
          hasAnomaly: Boolean(entry.hasAnomaly),
          anomalyDetail: entry.anomalyDetail ? String(entry.anomalyDetail) : undefined,
          diffStatus: 'new',
          isLiveGrounded: true,
        };

        const matchEval = evaluateProfileMatch(candidateItem, state.profile);
        if (matchEval.isMatch && !seenUrls.has(url)) {
          seenUrls.add(url);
          geminiItems.push({
            ...candidateItem,
            matchedTrack: matchEval.matchedTrack,
            matchReasons: matchEval.reasons,
          });
        }
      }

      groundingUsed = true;
      geminiStatusNote = `Search Grounding 额外检索核验 ${geminiItems.length} 条`;
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : '';
      if (rawMsg.includes('429') || rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('quota')) {
        geminiStatusNote = 'Search Grounding 配额暂达上限，本次仅保留直连抓取结果';
      } else if (rawMsg.includes('403') || rawMsg.includes('400') || rawMsg.includes('API_KEY')) {
        geminiStatusNote = 'Search Grounding 鉴权未就绪，本次仅保留直连抓取结果';
      } else {
        geminiStatusNote = 'Search Grounding 暂不可用，本次仅保留直连抓取结果';
      }
    }
  } else {
    geminiStatusNote = '未配置 GEMINI_API_KEY（可在 GitHub Secrets 添加以补充检索因境外网络限制无法直连的医院官网）';
  }

  const reachableCount = scrapeResults.filter((p) => p.httpStatus !== null && p.httpStatus < 400).length;
  const freshItems = [...directScrapedItems, ...geminiItems];
  const liveScanUsed = reachableCount > 0 || groundingUsed;
  const scanStatusMessage = `已完成真实官源巡检（直连成功 ${reachableCount}/${enabledSources.length} 个官方门户，网页直采解析出 ${directScrapedItems.length} 条真实公告；${geminiStatusNote}）。绝不包含任何示例假数据。`;

  // Merge fresh real items with previous real items before incremental diff
  const incomingForDiff: RecruitmentItem[] = [...freshItems, ...baselineItems];
  const cleanBaseline =
    baselineBriefing && baselineItems.length > 0
      ? { ...baselineBriefing, items: baselineItems }
      : null;

  const diffed = computeIncrementalDiff(incomingForDiff, cleanBaseline, todayStr);

  const newBriefing: BriefingSnapshot = {
    id: `brief-${todayStr}-${Date.now()}`,
    briefingDate: todayStr,
    generatedAt: nowIso,
    triggerType,
    baselineBriefingId: cleanBaseline?.id ?? null,
    baselineDate: cleanBaseline?.briefingDate ?? null,
    sourcesCheckedCount: enabledSources.length,
    liveScanUsed,
    scanStatusMessage,
    stats: diffed.stats,
    items: diffed.items,
    groundingLinks,
  };

  return { newBriefing, updatedSources };
}
