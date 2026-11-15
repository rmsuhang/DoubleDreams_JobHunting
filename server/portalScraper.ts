import type {
  AnnouncementType,
  CandidateProfile,
  MatchedPosition,
  MilestoneNode,
  OfficialSource,
  RecruitmentItem,
} from '../src/shared/types.ts';
import { evaluateProfileMatch, normalizeCanonicalKey } from '../src/shared/diffEngine.ts';

export interface DiscoveredLink {
  title: string;
  url: string;
  dateHint?: string;
}

const RECRUITMENT_LINK_RE =
  /招聘|招录|引才|人才|公开招聘|校招|校园招聘|急需紧缺|补充公告|更正公告|调整.*时间|延期|笔试|面试|资格审查|准考证|选聘|毕业生/;

const EXCLUDED_LINK_RE =
  /采购|询价|招标|中标|成交|磋商|废标|环评|环境影响|决算|预算|复印纸|洗涤|呼叫系统|行政处罚|依申请公开|公开指南|办事指南|满意度|招标代理|党风|廉政|节假日|放假|义诊|健康科普|招标公告|竞价|拟聘用.*公示|考察体检.*公示|录用公示|水发集团|济钢集团|山东电工/;

const COLUMN_LINK_RE =
  /人事招聘|公开招聘|人才招聘|招聘信息|招聘公告|招贤纳士|人才引进|通知公告|公示公告|校园招聘|加入我们|招录/;

const MEDICAL_SIGNAL_RE =
  /医院|卫健|卫生健康|中医|针灸|推拿|康复|医药|临床医学|医师|药师|护理|制药|医疗器械|医学院|疾控|妇幼|CRA|GCP/;

export function decodeHtmlBuffer(buffer: ArrayBuffer, contentType = ''): string {
  const utf8Preview = new TextDecoder('utf-8', { fatal: false }).decode(buffer.slice(0, 2048));
  const declaredCharset =
    contentType.match(/charset=([^;\s]+)/i)?.[1]?.toLowerCase() ||
    utf8Preview.match(/<meta[^>]+charset=["']?([^"'\s>/>]+)/i)?.[1]?.toLowerCase() ||
    '';

  if (declaredCharset.includes('gb')) {
    try {
      return new TextDecoder('gbk').decode(buffer);
    } catch {
      return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    }
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(buffer);
}

export function stripHtmlTags(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractArticleBodyText(html: string): string {
  const withoutChrome = html
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ');

  let text = stripHtmlTags(withoutChrome);
  if (text.length < 120) {
    text = stripHtmlTags(html);
  }
  // Trim repetitive top navigation before breadcrumb marker if present
  const breadcrumbMatch = text.match(/(?:你现在所在的位置|您当前的位置|当前位置)[：:\s]*(.{0,80})/);
  if (breadcrumbMatch && breadcrumbMatch.index !== undefined && breadcrumbMatch.index < text.length * 0.65) {
    text = text.slice(breadcrumbMatch.index + breadcrumbMatch[0].length).trim();
  }
  return text;
}

export function normalizeChineseDate(raw: string): string | null {
  const isoMatch = raw.match(/(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (!isoMatch) return null;
  const year = Number(isoMatch[1]);
  const month = Number(isoMatch[2]);
  const day = Number(isoMatch[3]);
  if (year < 2024 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(
    dt.getUTCDate()
  ).padStart(2, '0')}`;
}

export function extractLinksFromHtml(html: string, baseUrl: string): DiscoveredLink[] {
  const results: DiscoveredLink[] = [];
  const seen = new Set<string>();

  // Include both normal HTML and JCMS XML <![CDATA[...]]> records
  const normalizedHtml = html.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  const anchorRe = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;

  let match: RegExpExecArray | null;
  while ((match = anchorRe.exec(normalizedHtml)) !== null) {
    const attrs = match[1];
    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    const rawHref = hrefMatch[1].trim();
    if (
      !rawHref ||
      rawHref.startsWith('#') ||
      rawHref.startsWith('javascript:') ||
      rawHref.startsWith('mailto:') ||
      rawHref.startsWith('tel:')
    ) {
      continue;
    }

    let resolvedUrl: string;
    try {
      resolvedUrl = new URL(rawHref, baseUrl).toString();
    } catch {
      continue;
    }

    const titleAttr = attrs.match(/title\s*=\s*["']([^"']+)["']/i)?.[1] ?? '';
    const innerText = stripHtmlTags(match[2]);
    // Strip trailing dates or counters like "2026-11-11 30" or "2026-11-11"
    const rawTitle = (innerText.length >= titleAttr.length ? innerText : titleAttr)
      .replace(/\s+\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?(?:\s+\d+)?\s*$/, '')
      .trim();

    if (!rawTitle || rawTitle.length < 4) continue;

    // Look for date in anchor body or nearby sibling slice (up to 160 chars after </a>)
    const nearbySlice = normalizedHtml.slice(match.index, match.index + match[0].length + 160);
    const dateHint =
      normalizeChineseDate(innerText) ??
      normalizeChineseDate(stripHtmlTags(nearbySlice)) ??
      undefined;

    const dedupeKey = `${resolvedUrl}::${rawTitle}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    results.push({
      title: rawTitle,
      url: resolvedUrl,
      dateHint,
    });
  }

  return results;
}

export function isRelevantRecruitmentLink(title: string, url: string): boolean {
  if (!title || title.length < 6) return false;
  if (EXCLUDED_LINK_RE.test(title)) return false;
  if (/^https?:\/\//i.test(url) && /\.(jpg|jpeg|png|gif|css|js|ico|svg)$/i.test(url)) {
    return false;
  }
  // Ignore pure navigation links like "人事招聘" or "公开招聘" (too short to be an announcement)
  if (title.length <= 8 && !/\d{4}|公告|简章|通知/.test(title)) return false;
  return RECRUITMENT_LINK_RE.test(title);
}

export function isRecruitmentColumnLink(title: string, url: string, baseDomain: string): boolean {
  if (!title || title.length > 24) return false;
  if (EXCLUDED_LINK_RE.test(title)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const cleanBase = baseDomain.toLowerCase().replace(/^www\./, '');
    if (host !== cleanBase && !host.endsWith(`.${cleanBase}`)) {
      return false;
    }
  } catch {
    return false;
  }
  return COLUMN_LINK_RE.test(title);
}

function inferAnnouncementType(title: string, text: string): AnnouncementType {
  if (/补充|更正|调整|延期|推迟|取消|变更/.test(title)) {
    return 'supplement_correction';
  }
  if (/职位表|岗位表|岗位需求表/.test(title) || /岗位汇总表/.test(text)) {
    return 'position_table';
  }
  return 'new_announcement';
}

function inferRegion(source: OfficialSource, title: string, text: string): RecruitmentItem['region'] {
  if (source.region === '青岛' || /青岛/.test(title)) return '青岛';
  if (source.region === '济南' || /济南/.test(title)) return '济南';
  if (/青岛/.test(text.slice(0, 600))) return '青岛';
  if (/济南/.test(text.slice(0, 600))) return '济南';
  return '山东省级/国家';
}

function inferEmployerCategory(source: OfficialSource): RecruitmentItem['employerCategory'] {
  if (source.tier === 'hospital_official') return '公立医院';
  if (source.tier === 'soe_medical_enterprise') return '外企/国企药企';
  return '人社/卫健委';
}

export function parseOfficialArticleToItem(params: {
  source: OfficialSource;
  articleUrl: string;
  linkTitle: string;
  html: string;
  todayStr: string;
  dateHint?: string;
  profile: CandidateProfile;
}): RecruitmentItem | null {
  const { source, articleUrl, linkTitle, html, todayStr, dateHint, profile } = params;
  const htmlTitle = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim() ?? '';
  const cleanTitle =
    linkTitle.length >= 8
      ? linkTitle
      : htmlTitle.split(/\s*[-|_—]\s*/)[0]?.trim() || linkTitle;

  if (EXCLUDED_LINK_RE.test(cleanTitle)) return null;

  const rawText = stripHtmlTags(html);
  const bodyText = extractArticleBodyText(html);
  if (bodyText.length < 80) return null;

  // Extract publish date: explicit header metadata -> list hint -> bottom signature date -> URL -> today
  const metaDateMatch = rawText.match(
    /(?:发布时间|发布日期|时间|日期)[：:\s]*(\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2})/
  );
  const signatureMatches = [...bodyText.matchAll(/(?:202[4-9])年\d{1,2}月\d{1,2}日/g)];
  const signatureDate =
    signatureMatches.length > 0
      ? normalizeChineseDate(signatureMatches[signatureMatches.length - 1][0])
      : null;

  const publishDate =
    (metaDateMatch ? normalizeChineseDate(metaDateMatch[1]) : null) ||
    dateHint ||
    signatureDate ||
    normalizeChineseDate(articleUrl) ||
    todayStr;

  if (publishDate < '2026-06-01' && !/2026|2027/.test(cleanTitle)) {
    return null;
  }

  // Extract deadline if explicitly stated in bodyText
  let deadlineDate = addDays(publishDate, 14);
  const deadlineSentence = bodyText.match(
    /(?:报名时间|报名截止|截止时间|截至|网申截止|接受报名)[^。；;\n]{0,120}/g
  );
  if (deadlineSentence && deadlineSentence.length > 0) {
    const lastSnippet = deadlineSentence[deadlineSentence.length - 1];
    const allDates = [...lastSnippet.matchAll(/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}/g)];
    const lastDate = allDates.length > 0 ? normalizeChineseDate(allDates[allDates.length - 1][0]) : null;
    if (lastDate && lastDate >= publishDate) {
      deadlineDate = lastDate;
    }
  }

  const combinedText = `${cleanTitle} ${bodyText.slice(0, 4000)}`;

  // For general HRSS/gov portals, require explicit medical/hospital/pharma keywords in clean body
  if (source.tier === 'provincial_municipal_hrss' || source.tier === 'national_gov') {
    if (!MEDICAL_SIGNAL_RE.test(combinedText)) {
      return null;
    }
  } else if (!MEDICAL_SIGNAL_RE.test(combinedText) && source.tier !== 'hospital_official') {
    return null;
  }

  const announcementType = inferAnnouncementType(cleanTitle, combinedText);
  const hasAnomaly =
    announcementType === 'supplement_correction' ||
    /延期|顺延|推迟|取消|时间调整|补充公告|更正公告/.test(cleanTitle);

  let anomalyDetail: string | undefined;
  if (hasAnomaly) {
    const snippet = bodyText.match(/[^。；]*?(?:延期|顺延|推迟|调整|更正|取消)[^。；]{0,90}/)?.[0];
    anomalyDetail = snippet ? snippet.trim() : '官方发布补充/调整通知，请点击官方原文核对最新时间节点';
  }

  const region = inferRegion(source, cleanTitle, bodyText);
  const employerCategory = inferEmployerCategory(source);
  const defaultTrack = source.tier === 'soe_medical_enterprise' ? 'medical_cra' : 'tcm_physician';

  // Run evaluateProfileMatch strictly against real title + real bodyText (never placeholder strings)
  const evalResult = evaluateProfileMatch(
    {
      title: `${cleanTitle} ${bodyText.slice(0, 1200)}`,
      region,
      employerCategory,
      matchedPositions: [],
      matchedTrack: defaultTrack,
      matchReasons: [],
    },
    profile
  );

  const isHospitalGraduateNotice =
    source.tier === 'hospital_official' &&
    /硕士|研究生|2027|应届|急需|紧缺/.test(combinedText);

  if (!evalResult.isMatch && !isHospitalGraduateNotice) {
    return null;
  }

  const matchedPositions: MatchedPosition[] = [];
  if (/针灸|推拿/.test(combinedText)) {
    matchedPositions.push({
      positionName: '针灸推拿 / 中医临床相关岗位（见官方原文）',
      department: '以官方原文职位表为准',
      headcount: 1,
      degreeReq: /博士/.test(combinedText) && !/硕士/.test(combinedText) ? '博士研究生' : '硕士研究生及以上',
      majorReq: '针灸推拿学 / 中医学（请核对附件职位表）',
      freshGradOnly: /应届/.test(combinedText),
      examFormat: /笔试/.test(combinedText) && /面试/.test(combinedText) ? '笔试 + 面试' : '以官方公告为准',
      track: 'tcm_physician',
      notes: '系统从官方正文命中针灸/推拿关键词，具体岗位人数与代码请点击原文附件查看。',
    });
  } else if (/医学事务|CRA|临床研究|临床试验|GCP/.test(combinedText)) {
    matchedPositions.push({
      positionName: '医学事务 / 临床研究（CRA）相关岗位',
      department: '以官方原文职位表为准',
      headcount: 1,
      degreeReq: /硕士|研究生/.test(combinedText) ? '硕士研究生及以上' : '本科及以上',
      majorReq: '临床医学 / 中医学 / 医药相关专业',
      freshGradOnly: /校招|应届/.test(combinedText),
      examFormat: '网申 + 面试/测评',
      track: 'medical_cra',
      notes: '系统从官方正文命中临床研究/医学事务关键词，具体以官方原文为准。',
    });
  } else {
    matchedPositions.push({
      positionName: '医疗卫生高校毕业生 / 紧缺人才岗位（需核对原文附件）',
      department: source.name.replace(/官网.*$/, ''),
      headcount: 1,
      degreeReq: /硕士|研究生/.test(combinedText) ? '硕士研究生及以上' : '以原文为准',
      majorReq: '公告正文未单列全部分科，请打开原文附件职位表核对具体专业要求',
      freshGradOnly: /应届|2027/.test(combinedText),
      examFormat: /笔试/.test(combinedText) ? '笔试 / 面试（以原文为准）' : '面试 / 考核（以原文为准）',
      track: defaultTrack,
      notes: '官方直连抓包命中该单位招聘公告，未捏造具体科室人数，请点击官方链接核对附件。',
    });
  }

  const milestones: MilestoneNode[] = [];
  const regWindow = bodyText.match(/报名时间[：:\s]*([^。；\n]{6,60})/)?.[1]?.trim();
  if (regWindow) {
    milestones.push({
      id: `ms-reg-${publishDate}`,
      type: 'registration',
      label: '网上报名 / 投递（原文摘录）',
      dateRange: regWindow.slice(0, 48),
      status: deadlineDate >= todayStr ? 'active' : 'completed',
    });
  } else {
    milestones.push({
      id: `ms-pub-${publishDate}`,
      type: announcementType === 'supplement_correction' ? 'supplement' : 'registration',
      label: announcementType === 'supplement_correction' ? '补充/调整公告发布' : '公告发布与报名跟踪',
      dateRange: `${publishDate} ~ ${deadlineDate}`,
      status: deadlineDate >= todayStr ? 'active' : 'completed',
      note: '具体报名起止时段请点击官方原文核对',
    });
  }

  const baseReasons = [
    `官方直连抓包验证：直采自 ${source.name} 原文详情页`,
    `原文发布日期：${publishDate}`,
  ];
  const reasons = evalResult.isMatch
    ? [...baseReasons, ...evalResult.reasons]
    : [
        ...baseReasons,
        `重点意向地区命中：${region}`,
        '命中公立医院2027届应届/硕士招录公告，请点击官方链接下载附件《岗位汇总表》核对针灸推拿岗位',
      ];

  return {
    id: `scrape-${source.id}-${publishDate}-${Buffer.from(articleUrl).toString('base64url').slice(0, 10)}`,
    canonicalKey: normalizeCanonicalKey(source.name, cleanTitle, articleUrl),
    title: cleanTitle,
    sourceName: source.name,
    sourceUrl: articleUrl,
    sourceTier: source.tier,
    publishDate,
    announcementType,
    region,
    employerName: source.name.replace(/（.*?）|官网|网站|及公众号/g, '').trim(),
    employerCategory,
    matchedTrack: evalResult.isMatch ? evalResult.matchedTrack : defaultTrack,
    matchReasons: reasons,
    matchedPositions,
    milestones,
    deadlineDate,
    hasAnomaly,
    anomalyDetail,
    diffStatus: 'new',
    isLiveGrounded: true,
  };
}

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

async function fetchHtmlWithTimeout(
  url: string,
  timeoutMs = 8000
): Promise<{ ok: boolean; status: number | null; html: string; finalUrl: string; errorNote?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: BROWSER_HEADERS,
    });
    const contentType = res.headers.get('content-type') || '';
    const buffer = await res.arrayBuffer();
    const html = decodeHtmlBuffer(buffer, contentType);
    return {
      ok: res.ok,
      status: res.status,
      html,
      finalUrl: res.url || url,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      status: null,
      html: '',
      finalUrl: url,
      errorNote: isTimeout ? '连接超时（官方站点限制海外访问或响应较慢）' : '官方站暂不可达',
    };
  } finally {
    clearTimeout(timer);
  }
}

export interface PortalScrapeSummary {
  source: OfficialSource;
  httpStatus: number | null;
  note: string;
  items: RecruitmentItem[];
}

export async function scrapeOfficialPortal(
  source: OfficialSource,
  profile: CandidateProfile,
  todayStr: string
): Promise<PortalScrapeSummary> {
  const home = await fetchHtmlWithTimeout(source.url, 8000);
  if (!home.ok || !home.html) {
    const note = home.status ? `HTTP ${home.status}（站点拦截或需境内IP）` : home.errorNote || '不可达';
    return {
      source,
      httpStatus: home.status,
      note,
      items: [],
    };
  }

  const pageTitle = home.html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const baseLinks = extractLinksFromHtml(home.html, home.finalUrl);

  // Discover up to 2 recruitment/notice sub-column pages on the same official domain
  const columnUrls = baseLinks
    .filter((l) => isRecruitmentColumnLink(l.title, l.url, source.domain))
    .map((l) => l.url)
    .filter((u, idx, arr) => arr.indexOf(u) === idx)
    .slice(0, 2);

  const subPages = await Promise.all(columnUrls.map((colUrl) => fetchHtmlWithTimeout(colUrl, 6000)));
  const allLinks: DiscoveredLink[] = [...baseLinks];
  for (const sub of subPages) {
    if (sub.ok && sub.html) {
      allLinks.push(...extractLinksFromHtml(sub.html, sub.finalUrl));
    }
  }

  // Deduplicate and keep top 5 most recent/relevant announcement links
  const seenUrls = new Set<string>();
  const candidateLinks: DiscoveredLink[] = [];
  for (const link of allLinks) {
    if (!isRelevantRecruitmentLink(link.title, link.url)) continue;
    if (seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    candidateLinks.push(link);
  }

  // Sort newer dates first if dateHint exists
  candidateLinks.sort((a, b) => (b.dateHint ?? '').localeCompare(a.dateHint ?? ''));
  const topCandidates = candidateLinks.slice(0, 5);

  const articlePages = await Promise.all(
    topCandidates.map(async (link) => ({
      link,
      page: await fetchHtmlWithTimeout(link.url, 6000),
    }))
  );

  const items: RecruitmentItem[] = [];
  for (const { link, page } of articlePages) {
    if (!page.ok || !page.html) continue;
    const item = parseOfficialArticleToItem({
      source,
      articleUrl: page.finalUrl || link.url,
      linkTitle: link.title,
      html: page.html,
      todayStr,
      dateHint: link.dateHint,
      profile,
    });
    if (item) {
      items.push(item);
    }
  }

  const shortTitle = pageTitle ? pageTitle.slice(0, 32) : '官方页面可访问';
  const note =
    items.length > 0
      ? `在线 · ${shortTitle}（直采命中 ${items.length} 条真实公告）`
      : `在线 · ${shortTitle}（直连未发现新增匹配公告）`;

  return {
    source,
    httpStatus: home.status,
    note,
    items,
  };
}
