import type {
  BriefingSnapshot,
  BriefingSummaryStats,
  CandidateProfile,
  OfficialSource,
  RecruitmentItem,
  ResumeTrack,
} from './types.ts';

export function normalizeCanonicalKey(employerName: string, title: string, sourceUrl: string): string {
  const cleanUrl = sourceUrl.trim().toLowerCase().replace(/\/+$/, '');
  const cleanEmployer = employerName.trim().toLowerCase().replace(/\s+/g, '');
  const cleanTitle = title
    .trim()
    .toLowerCase()
    .replace(/(补充|更正|延期|变更|调整)?(公告|通知)$/, '')
    .replace(/\s+/g, '');
  return `${cleanEmployer}::${cleanTitle || cleanUrl}`;
}

export function isOfficialSourceUrl(url: string, registeredSources: OfficialSource[]): {
  isOfficial: boolean;
  reason: string;
} {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    if (hostname.endsWith('.gov.cn') || hostname.endsWith('.org.cn')) {
      return { isOfficial: true, reason: '政府/事业单位官方域名' };
    }

    const matchedSource = registeredSources.find((src) => {
      const domain = src.domain.toLowerCase().replace(/^www\./, '');
      const cleanHost = hostname.replace(/^www\./, '');
      return cleanHost === domain || cleanHost.endsWith(`.${domain}`);
    });

    if (matchedSource) {
      return { isOfficial: true, reason: `已认证官方渠道（${matchedSource.name}）` };
    }

    const blockedAggregators = [
      'zhipin.com',
      'liepin.com',
      'zhaopin.com',
      '51job.com',
      'lagou.com',
      'kanzhun.com',
      'yingjiesheng.com',
      'offcn.com',
      'huatu.com',
    ];
    if (blockedAggregators.some((agg) => hostname.includes(agg))) {
      return { isOfficial: false, reason: '第三方商业招聘/培训聚合站，已按信息源优先级规则拦截' };
    }

    return { isOfficial: false, reason: '未在官方一手渠道白名单内的域名' };
  } catch {
    return { isOfficial: false, reason: '无效 URL 格式' };
  }
}

export function evaluateProfileMatch(
  item: Pick<
    RecruitmentItem,
    'title' | 'region' | 'employerCategory' | 'matchedPositions' | 'matchedTrack' | 'matchReasons'
  >,
  profile: CandidateProfile
): {
  isMatch: boolean;
  matchedTrack: ResumeTrack;
  reasons: string[];
} {
  const reasons = new Set<string>(item.matchReasons ?? []);
  const posText = item.matchedPositions
    .map((p) => `${p.positionName} ${p.department} ${p.degreeReq} ${p.majorReq} ${p.notes ?? ''}`)
    .join(' ');
  const fullText = `${item.title} ${posText}`;

  const cityHit = profile.targetCities.some((city) => {
    const shortCity = city.replace(/省|市/g, '');
    return item.region.includes(shortCity) || fullText.includes(shortCity);
  });
  if (item.region === '济南' || item.region === '青岛') {
    reasons.add(`重点意向城市命中：山东省${item.region}市`);
  } else if (cityHit || item.region === '山东省级/国家') {
    reasons.add('覆盖山东地区/省属统筹招聘范围');
  }

  const degreeHit =
    /硕士|研究生/.test(fullText) ||
    item.matchedPositions.some((p) => /硕士|研究生/.test(p.degreeReq));
  if (degreeHit) {
    reasons.add(`学历符合：${profile.degree}（${profile.masterSchool}）`);
  }

  const tcmClinicalHit =
    /针灸|推拿|中医医师|中医科|康复科|康复理疗|小儿推拿/.test(fullText) ||
    item.matchedPositions.some((p) => p.track === 'tcm_physician');
  const craHit =
    /医学事务|CRA|临床研究|临床试验|GCP|医学专员|药物警戒|CRC/.test(fullText) ||
    item.matchedPositions.some((p) => p.track === 'medical_cra');

  const tcmHit = tcmClinicalHit || (/中医/.test(fullText) && !craHit);

  if (tcmHit) {
    reasons.add('专业与临床契合：针灸推拿学硕士，具备执业医师证及山东省中医院规培经历');
  }
  if (craHit) {
    reasons.add('科研与资质契合：持GCP证书+执业医师证，掌握Meta分析、SPSS/R统计');
  }

  if (profile.isFreshGraduate && (/应届|2027|2026|校招|校园/.test(fullText) || item.matchedPositions.some((p) => p.freshGradOnly))) {
    reasons.add('身份与招聘类型匹配：2027届应届毕业生 · 校招通道');
  }

  let matchedTrack: ResumeTrack = item.matchedTrack;
  if (tcmHit && craHit) {
    matchedTrack = 'both';
  } else if (craHit && !tcmHit) {
    matchedTrack = 'medical_cra';
  } else if (tcmHit && !craHit) {
    matchedTrack = 'tcm_physician';
  }

  return {
    isMatch: reasons.size >= 2 && (tcmHit || craHit),
    matchedTrack,
    reasons: Array.from(reasons),
  };
}

function positionSignature(item: RecruitmentItem): string {
  return JSON.stringify({
    deadline: item.deadlineDate,
    type: item.announcementType,
    anomaly: item.hasAnomaly ? item.anomalyDetail ?? 'anomaly' : '',
    positions: item.matchedPositions.map((p) => `${p.positionName}:${p.headcount}:${p.examFormat}`).sort(),
    milestones: item.milestones.map((m) => `${m.type}:${m.dateRange}:${m.status}`).sort(),
  });
}

export function isDeadlineClosed(deadlineDate: string, referenceDate: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(deadlineDate) && deadlineDate < referenceDate;
}

export function normalizeSourceUrlKey(url: string): string {
  return url
    .trim()
    .toLowerCase()
    .replace(/^http:\/\//, 'https://')
    .replace(/\/+$/, '');
}

export function deduplicateRecruitmentItems(items: RecruitmentItem[]): RecruitmentItem[] {
  const seenKeys = new Set<string>();
  const seenUrls = new Set<string>();
  const deduped: RecruitmentItem[] = [];
  for (const item of items) {
    const key = item.canonicalKey || normalizeCanonicalKey(item.employerName, item.title, item.sourceUrl);
    const urlKey = normalizeSourceUrlKey(item.sourceUrl);
    if (seenKeys.has(key) || (urlKey && seenUrls.has(urlKey))) {
      continue;
    }
    seenKeys.add(key);
    if (urlKey) seenUrls.add(urlKey);
    deduped.push({ ...item, canonicalKey: key });
  }
  return deduped;
}

export function computeBriefingStats(items: RecruitmentItem[]): BriefingSummaryStats {
  const activeItems = items.filter((item) => item.diffStatus !== 'closed');
  return {
    totalMatched: activeItems.length,
    newCount: activeItems.filter((i) => i.diffStatus === 'new').length,
    updatedCount: activeItems.filter((i) => i.diffStatus === 'updated').length,
    stillOpenCount: activeItems.filter((i) => i.diffStatus === 'still_open').length,
    anomalyCount: activeItems.filter((i) => i.hasAnomaly).length,
    tcmPhysicianCount: activeItems.filter(
      (i) => i.matchedTrack === 'tcm_physician' || i.matchedTrack === 'both'
    ).length,
    medicalCraCount: activeItems.filter(
      (i) => i.matchedTrack === 'medical_cra' || i.matchedTrack === 'both'
    ).length,
  };
}

export function computeIncrementalDiff(
  incomingItems: RecruitmentItem[],
  baselineBriefing: BriefingSnapshot | null | undefined,
  referenceDate: string
): {
  items: RecruitmentItem[];
  stats: BriefingSummaryStats;
} {
  const baselineMap = new Map<string, RecruitmentItem>();
  const baselineUrlMap = new Map<string, RecruitmentItem>();
  const cleanBaselineItems = baselineBriefing ? deduplicateRecruitmentItems(baselineBriefing.items) : [];
  for (const prev of cleanBaselineItems) {
    const key = prev.canonicalKey || normalizeCanonicalKey(prev.employerName, prev.title, prev.sourceUrl);
    const urlKey = normalizeSourceUrlKey(prev.sourceUrl);
    baselineMap.set(key, prev);
    if (urlKey) baselineUrlMap.set(urlKey, prev);
  }

  const seenKeys = new Set<string>();
  const seenUrls = new Set<string>();
  const result: RecruitmentItem[] = [];

  for (const raw of incomingItems) {
    const key = raw.canonicalKey || normalizeCanonicalKey(raw.employerName, raw.title, raw.sourceUrl);
    const urlKey = normalizeSourceUrlKey(raw.sourceUrl);
    if (seenKeys.has(key) || (urlKey && seenUrls.has(urlKey))) {
      continue;
    }
    seenKeys.add(key);
    if (urlKey) seenUrls.add(urlKey);
    const prev = baselineMap.get(key) ?? (urlKey ? baselineUrlMap.get(urlKey) : undefined);

    if (!prev) {
      const isClosed = isDeadlineClosed(raw.deadlineDate, referenceDate);
      result.push({
        ...raw,
        canonicalKey: key,
        diffStatus: isClosed ? 'closed' : 'new',
        diffNote: raw.diffNote || '较上次简报新增匹配公告/岗位',
      });
      continue;
    }

    const changed =
      positionSignature(prev) !== positionSignature(raw) ||
      raw.publishDate > prev.publishDate ||
      raw.announcementType === 'supplement_correction' ||
      raw.hasAnomaly;

    if (changed) {
      const changeNotes: string[] = [];
      if (raw.hasAnomaly && raw.anomalyDetail) {
        changeNotes.push(raw.anomalyDetail);
      }
      if (raw.deadlineDate !== prev.deadlineDate) {
        changeNotes.push(`报名截止由 ${prev.deadlineDate} 调整为 ${raw.deadlineDate}`);
      }
      if (raw.matchedPositions.length !== prev.matchedPositions.length) {
        changeNotes.push(`匹配岗位数由 ${prev.matchedPositions.length} 个变更为 ${raw.matchedPositions.length} 个`);
      }
      if (raw.announcementType === 'supplement_correction' && changeNotes.length === 0) {
        changeNotes.push('官方发布补充/更正公告');
      }
      result.push({
        ...raw,
        canonicalKey: key,
        diffStatus: 'updated',
        diffNote: raw.diffNote || changeNotes.join('；') || '公告关键节点或岗位明细发生更新',
      });
    } else {
      const isClosed = isDeadlineClosed(raw.deadlineDate, referenceDate);
      const stillOpen = !isClosed;
      result.push({
        ...raw,
        canonicalKey: key,
        diffStatus: stillOpen ? 'still_open' : 'closed',
        diffNote: stillOpen
          ? /^\d{4}-\d{2}-\d{2}$/.test(raw.deadlineDate)
            ? `未截止报名（截止 ${raw.deadlineDate}），延续上次简报状态`
            : '报名时间以官方原文为准，延续上次简报状态'
          : `已过报名截止日（${raw.deadlineDate}）`,
      });
    }
  }

  // Carry forward any previous still-open items not re-emitted in a partial scan
  for (const prev of cleanBaselineItems) {
    const key = prev.canonicalKey || normalizeCanonicalKey(prev.employerName, prev.title, prev.sourceUrl);
    const urlKey = normalizeSourceUrlKey(prev.sourceUrl);
    if (
      !seenKeys.has(key) &&
      (!urlKey || !seenUrls.has(urlKey)) &&
      !isDeadlineClosed(prev.deadlineDate, referenceDate) &&
      prev.diffStatus !== 'closed'
    ) {
      seenKeys.add(key);
      if (urlKey) seenUrls.add(urlKey);
      result.push({
        ...prev,
        canonicalKey: key,
        diffStatus: 'still_open',
        diffNote: /^\d{4}-\d{2}-\d{2}$/.test(prev.deadlineDate)
          ? `延续上次简报（未截止，截止 ${prev.deadlineDate}）`
          : '延续上次简报（截止时间以官方原文为准）',
      });
    }
  }

  // Sort: updated/anomaly & new first, then still_open; explicit dates before '以官方原文为准'
  const priorityOrder: Record<string, number> = {
    updated: 0,
    new: 1,
    still_open: 2,
    closed: 3,
  };

  result.sort((a, b) => {
    const pa = priorityOrder[a.diffStatus] ?? 9;
    const pb = priorityOrder[b.diffStatus] ?? 9;
    if (pa !== pb) return pa - pb;
    if (a.hasAnomaly !== b.hasAnomaly) return a.hasAnomaly ? -1 : 1;
    const aIso = /^\d{4}-\d{2}-\d{2}$/.test(a.deadlineDate);
    const bIso = /^\d{4}-\d{2}-\d{2}$/.test(b.deadlineDate);
    if (aIso && !bIso) return -1;
    if (!aIso && bIso) return 1;
    if (aIso && bIso) return a.deadlineDate.localeCompare(b.deadlineDate);
    return b.publishDate.localeCompare(a.publishDate);
  });

  const stats = computeBriefingStats(result);
  return { items: result, stats };
}

export function isValidTriggerTime(timeStr: string): boolean {
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr.trim());
}

export function computeNextTriggerIso(triggerTime: string, now: Date = new Date()): string {
  const safeTime = isValidTriggerTime(triggerTime) ? triggerTime.trim() : '08:00';
  const [hoursStr, minutesStr] = safeTime.split(':');
  const hours = Number(hoursStr);
  const minutes = Number(minutesStr);

  // Format current date in Asia/Shanghai (UTC+8)
  const shanghaiOffsetMs = 8 * 60 * 60 * 1000;
  const nowUtcMs = now.getTime();
  const shanghaiNow = new Date(nowUtcMs + shanghaiOffsetMs);

  const candidateUtcMs =
    Date.UTC(
      shanghaiNow.getUTCFullYear(),
      shanghaiNow.getUTCMonth(),
      shanghaiNow.getUTCDate(),
      hours,
      minutes,
      0,
      0
    ) - shanghaiOffsetMs;

  const targetUtcMs =
    candidateUtcMs > nowUtcMs ? candidateUtcMs : candidateUtcMs + 24 * 60 * 60 * 1000;

  return new Date(targetUtcMs).toISOString();
}
