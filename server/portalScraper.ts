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
  /采购|询价|招标|中标|成交|磋商|废标|环评|环境影响|决算|预算|复印纸|洗涤|呼叫系统|行政处罚|依申请公开|公开指南|办事指南|满意度|招标代理|党风|廉政|节假日|放假|义诊|健康科普|招标公告|竞价|拟聘用.*公示|考察体检.*公示|录用公示|水发集团|济钢集团|山东电工|座谈会|完成.*招聘工作|圆满结束|评选会|中新网|博士后建设|泰山学者论坛|培训班招生|规培.*二次录取|年度考核|工作总结|慰问|新闻报道/;

const COLUMN_LINK_RE =
  /人事招聘|公开招聘|人才招聘|招聘信息|招聘公告|招贤纳士|人才引进|通知公告|医院公告|公示公告|校园招聘|加入我们|招录/;

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
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, ' ');

  let text = stripHtmlTags(withoutChrome);
  if (text.length < 120) {
    text = stripHtmlTags(html);
  }
  const breadcrumbMatch = text.match(/(?:你现在所在的位置|您当前的位置|当前位置)[：:\s]*(.{0,80})/);
  if (breadcrumbMatch && breadcrumbMatch.index !== undefined && breadcrumbMatch.index < text.length * 0.65) {
    text = text.slice(breadcrumbMatch.index + breadcrumbMatch[0].length).trim();
  }
  return text;
}

export function normalizeChineseDate(raw: string): string | null {
  const isoMatch = raw.match(/(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})/);
  if (!isoMatch) return null;
  const year = Number(isoMatch[1]);
  const month = Number(isoMatch[2]);
  const day = Number(isoMatch[3]);
  if (year < 2015 || year > 2030 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function extractAllDates(text: string): string[] {
  const dates: string[] = [];
  let lastYear: number | null = null;
  let lastMonth: number | null = null;

  const tokenRe =
    /(\d{4})\s*[-/.年]\s*(\d{1,2})\s*[-/.月]\s*(\d{1,2})\s*日?|(?<!\d)(\d{1,2})\s*[月/.]\s*(\d{1,2})\s*日|[-–—至到~]\s*(\d{1,2})\s*日/g;

  let m: RegExpExecArray | null;
  while ((m = tokenRe.exec(text)) !== null) {
    if (m[1] && m[2] && m[3]) {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const d = Number(m[3]);
      if (y >= 2024 && y <= 2030 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        lastYear = y;
        lastMonth = mo;
        dates.push(`${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    } else if (m[4] && m[5] && lastYear !== null) {
      const mo = Number(m[4]);
      const d = Number(m[5]);
      if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
        lastMonth = mo;
        dates.push(`${lastYear}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    } else if (m[6] && lastYear !== null && lastMonth !== null) {
      const d = Number(m[6]);
      if (d >= 1 && d <= 31) {
        dates.push(`${lastYear}-${String(lastMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
      }
    }
  }
  return dates;
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
    const rawTitle = (innerText.length >= titleAttr.length ? innerText : titleAttr)
      .replace(/\s+\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}日?(?:\s+\d+)?\s*$/, '')
      .trim();

    if (!rawTitle || rawTitle.length < 4) continue;

    const nearbySlice = normalizedHtml.slice(match.index, match.index + match[0].length + 320);
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
  if (/201\d年度?|202[0-4]年度?/.test(title)) return false;
  if (/^https?:\/\//i.test(url) && /\.(jpg|jpeg|png|gif|css|js|ico|svg)$/i.test(url)) {
    return false;
  }
  if (title.length <= 8 && !/\d{4}|公告|简章|通知/.test(title)) return false;
  return RECRUITMENT_LINK_RE.test(title);
}

export function isTrustedPortalArticleUrl(url: string, baseDomain: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const cleanBase = baseDomain.toLowerCase().replace(/^www\./, '');
    const enterpriseKey = cleanBase.split('.')[0];
    if (host === cleanBase || host.endsWith(`.${cleanBase}`)) return true;
    if (host.endsWith('.gov.cn') || host.endsWith('.edu.cn')) return true;
    if (enterpriseKey.length >= 4 && host.includes(enterpriseKey) && host.endsWith('.zhiye.com')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function isRecruitmentColumnLink(title: string, url: string, baseDomain: string): boolean {
  if (!title || title.length > 24) return false;
  if (EXCLUDED_LINK_RE.test(title)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
    const cleanBase = baseDomain.toLowerCase().replace(/^www\./, '');
    const enterpriseKey = cleanBase.split('.')[0];
    const isSameDomain = host === cleanBase || host.endsWith(`.${cleanBase}`);
    const isEnterpriseCareerSubdomain =
      enterpriseKey.length >= 4 && host.includes(enterpriseKey) && host.endsWith('.zhiye.com');
    if (!isSameDomain && !isEnterpriseCareerSubdomain) {
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
  if (/职位表|岗位表|岗位需求表|岗位汇总表/.test(title) || /岗位汇总表/.test(text)) {
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

export function extractStructuredMilestones(
  bodyText: string,
  publishDate: string,
  todayStr: string,
  announcementType: AnnouncementType
): {
  milestones: MilestoneNode[];
  deadlineDate: string;
  latestActivityDate: string | null;
} {
  const milestones: MilestoneNode[] = [];
  const extractedDates: string[] = [];
  const explicitRegDates: string[] = [];

  // 1. Multi-session campus recruitment / registration blocks (e.g. 第一场 ... 报名时间：2026年11月20日14:00-16:00)
  const sessionRe =
    /(第[一二三四五]场)\s*(?:报名地点[：:\s]*([^。；\n]{4,60}?)\s+)?报名时间[：:\s]*(\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}日?(?:\s*(?:[-–—至到~]\s*(?:\d{4}\s*[-/.年]\s*)?(?:\d{1,2}\s*[-/.月]\s*)?\d{1,2}日?)?(?:\s*[上下午]?\s*\d{1,2}[:：]\d{2}(?:\s*[-–—至到~]\s*[上下午]?\s*\d{1,2}[:：]\d{2})?)?)?)/g;
  let sessionMatch: RegExpExecArray | null;
  let sessionIdx = 0;
  while ((sessionMatch = sessionRe.exec(bodyText)) !== null) {
    sessionIdx++;
    const sessionLabel = sessionMatch[1];
    const venue = sessionMatch[2]?.trim();
    const timeStr = sessionMatch[3].trim();
    const dates = extractAllDates(timeStr);
    extractedDates.push(...dates);
    explicitRegDates.push(...dates);
    const closing = dates[dates.length - 1] ?? publishDate;
    milestones.push({
      id: `ms-session-${sessionIdx}`,
      type: 'registration',
      label: venue ? `${sessionLabel}现场报名（${venue.replace(/[，,]\s*$/, '')}）` : `${sessionLabel}现场报名`,
      dateRange: timeStr,
      status: closing >= todayStr ? 'active' : 'completed',
    });
  }

  // 2. General registration window if no multi-session matched
  if (milestones.length === 0) {
    const regMatches = [
      ...bodyText.matchAll(
        /(?:网上报名时间|报名起止时间|报名时间|报名截止时间|网申时间|现场报名时间|接受报名时间)[：:\s]*([^。；\n]{6,80})/g
      ),
    ];
    for (let i = 0; i < regMatches.length; i++) {
      const rawSnippet = regMatches[i][1].trim();
      if (/确定后|另行公布|计算截止|取得学历|毕业证书|年龄计算/.test(rawSnippet)) continue;
      const dates = extractAllDates(rawSnippet);
      if (dates.length === 0) continue;
      extractedDates.push(...dates);
      explicitRegDates.push(...dates);
      const closing = dates[dates.length - 1];
      milestones.push({
        id: `ms-reg-${i}`,
        type: 'registration',
        label: '报名时间（原文摘录）',
        dateRange: rawSnippet.slice(0, 64),
        status: closing >= todayStr ? 'active' : 'completed',
      });
    }
  }

  // 3. Other key nodes (资格审查 / 缴费 / 准考证 / 笔试 / 面试)
  const extraRules: Array<{
    type: MilestoneNode['type'];
    label: string;
    re: RegExp;
  }> = [
    {
      type: 'qualification_review',
      label: '资格审查',
      re: /(?:资格审查|资格初审|资格审核)[^。；\n]{0,40}?(\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}[^。；\n]{0,35})/,
    },
    {
      type: 'payment',
      label: '考务缴费',
      re: /(?:缴费时间|网上缴费)[^。；\n]{0,40}?(\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}[^。；\n]{0,35})/,
    },
    {
      type: 'admit_card',
      label: '准考证打印',
      re: /(?:准考证打印)[^。；\n]{0,40}?(\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}[^。；\n]{0,35})/,
    },
    {
      type: 'written_exam',
      label: '笔试安排',
      re: /(?:笔试时间|笔试定于|统一笔试)[^。；\n]{0,40}?(\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}[^。；\n]{0,35})/,
    },
    {
      type: 'interview',
      label: '面试安排',
      re: /(?:面试时间|面试定于)[^。；\n]{0,40}?(\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2}[^。；\n]{0,35})/,
    },
  ];

  for (const rule of extraRules) {
    const m = bodyText.match(rule.re);
    if (m?.[1]) {
      const dates = extractAllDates(m[1]);
      if (dates.length > 0) {
        extractedDates.push(...dates);
        const lastD = dates[dates.length - 1];
        milestones.push({
          id: `ms-${rule.type}`,
          type: rule.type,
          label: rule.label,
          dateRange: m[1].trim().slice(0, 56),
          status: lastD >= todayStr ? 'upcoming' : 'completed',
        });
      }
    }
  }

  // Fallback honest node when official notice says "具体时间地点另行确定公布"
  if (milestones.length === 0) {
    const pendingNote = bodyText.match(/[^。；]*?(?:具体时间[^。；]{0,40}公布|另行确定|另行通知)[^。；]{0,30}/)?.[0]?.trim();
    milestones.push({
      id: `ms-pending-${publishDate}`,
      type: announcementType === 'supplement_correction' ? 'supplement' : 'registration',
      label: announcementType === 'supplement_correction' ? '补充/调整公告发布' : '报名日程待官方后续公布',
      dateRange: `公告发布于 ${publishDate}`,
      status: 'active',
      note: pendingNote || '原文未固定具体截止日期，请点击官方原文跟进后续通知',
    });
  }

  const validExtracted = extractedDates.filter((d) => d <= '2028-12-31').sort();
  const latestActivityDate = validExtracted.length > 0 ? validExtracted[validExtracted.length - 1] : null;
  const sortedExplicitReg = explicitRegDates.filter((d) => d <= '2028-12-31').sort();
  const deadlineDate =
    sortedExplicitReg.length > 0
      ? sortedExplicitReg[sortedExplicitReg.length - 1]
      : latestActivityDate ?? '以官方原文为准';

  return {
    milestones,
    deadlineDate,
    latestActivityDate,
  };
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

  // Extract real publish date (supports spaces like "2026 年 6 月 4 日" and header dates like "2020.06.24")
  const metaDateMatch = rawText.match(
    /(?:发布时间|发布日期|时间|日期)[：:\s]*(\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2})/
  );
  const headerDateMatch = bodyText
    .slice(0, 260)
    .match(/(\d{4}\s*[-/.年]\s*\d{1,2}\s*[-/.月]\s*\d{1,2})/);
  const signatureMatches = [
    ...bodyText.matchAll(/(?:201[5-9]|202[0-9])\s*年\s*\d{1,2}\s*月\s*\d{1,2}\s*日/g),
  ];
  const signatureDate =
    signatureMatches.length > 0
      ? normalizeChineseDate(signatureMatches[signatureMatches.length - 1][0])
      : null;

  const publishDate =
    (metaDateMatch ? normalizeChineseDate(metaDateMatch[1]) : null) ||
    dateHint ||
    (headerDateMatch ? normalizeChineseDate(headerDateMatch[1]) : null) ||
    signatureDate ||
    normalizeChineseDate(articleUrl) ||
    todayStr;

  const announcementType = inferAnnouncementType(cleanTitle, bodyText);
  const { milestones, deadlineDate, latestActivityDate } = extractStructuredMilestones(
    bodyText,
    publishDate,
    todayStr,
    announcementType
  );

  // Exclude historical or expired announcements:
  // 1) Title explicitly states an older year (2015-2024) with no future activity >= todayStr
  if (/201\d年度?|202[0-4]年度?/.test(cleanTitle) && (!latestActivityDate || latestActivityDate < todayStr)) {
    return null;
  }
  // 2) Explicit deadline or exam/interview date already strictly before todayStr
  if (latestActivityDate && latestActivityDate < todayStr) {
    return null;
  }
  // 3) Publish date older than 45 days without any future milestone >= todayStr
  const staleCutoff = addDays(todayStr, -45);
  if (publishDate < staleCutoff && (!latestActivityDate || latestActivityDate < todayStr)) {
    return null;
  }

  const combinedText = `${cleanTitle} ${bodyText.slice(0, 4000)}`;

  if (source.tier === 'provincial_municipal_hrss' || source.tier === 'national_gov') {
    if (!MEDICAL_SIGNAL_RE.test(combinedText)) {
      return null;
    }
  } else if (!MEDICAL_SIGNAL_RE.test(combinedText) && source.tier !== 'hospital_official') {
    return null;
  }

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
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

async function attemptFetch(
  url: string,
  timeoutMs: number,
  extraHeaders?: Record<string, string>
): Promise<{ ok: boolean; status: number | null; html: string; finalUrl: string; errorNote?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        ...BROWSER_HEADERS,
        ...extraHeaders,
      },
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
      errorNote: isTimeout ? '连接超时（官方站点限制境外IP访问或响应较慢）' : '官方站暂不可达',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchHtmlWithTimeout(
  url: string,
  timeoutMs = 12000
): Promise<{ ok: boolean; status: number | null; html: string; finalUrl: string; errorNote?: string }> {
  let result = await attemptFetch(url, timeoutMs);

  // Auto-fallback https:// -> http:// if TLS/connection refused
  if (!result.ok && result.status === null && url.startsWith('https://')) {
    const httpFallback = await attemptFetch(url.replace(/^https:\/\//i, 'http://'), timeoutMs);
    if (httpFallback.ok || httpFallback.status !== null) {
      result = httpFallback;
    }
  }

  // Handle simple JS cookie gate like `document.cookie = "visited=1"` (used by sdzydfy.com)
  if (result.ok && result.html.length < 3000 && result.html.includes('visited=1')) {
    const retry = await attemptFetch(result.finalUrl, timeoutMs, { Cookie: 'visited=1' });
    if (retry.ok && retry.html.length > result.html.length) {
      result = retry;
    }
  }

  return result;
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
  const home = await fetchHtmlWithTimeout(source.url, 12000);
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

  const columnUrls = baseLinks
    .filter((l) => isRecruitmentColumnLink(l.title, l.url, source.domain))
    .map((l) => l.url)
    .filter((u, idx, arr) => arr.indexOf(u) === idx)
    .slice(0, 3);

  const subPages = await Promise.all(columnUrls.map((colUrl) => fetchHtmlWithTimeout(colUrl, 9000)));
  const allLinks: DiscoveredLink[] = [...baseLinks];
  for (const sub of subPages) {
    if (sub.ok && sub.html) {
      allLinks.push(...extractLinksFromHtml(sub.html, sub.finalUrl));
    }
  }

  const seenUrls = new Set<string>();
  const candidateLinks: DiscoveredLink[] = [];
  for (const link of allLinks) {
    if (!isTrustedPortalArticleUrl(link.url, source.domain)) continue;
    if (!isRelevantRecruitmentLink(link.title, link.url)) continue;
    if (seenUrls.has(link.url)) continue;
    seenUrls.add(link.url);
    candidateLinks.push(link);
  }

  candidateLinks.sort((a, b) => (b.dateHint ?? '').localeCompare(a.dateHint ?? ''));
  const topCandidates = candidateLinks.slice(0, 6);

  const articlePages = await Promise.all(
    topCandidates.map(async (link) => ({
      link,
      page: await fetchHtmlWithTimeout(link.url, 9000),
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
      ? `在线 · ${shortTitle}（直采命中 ${items.length} 条有效公告）`
      : `在线 · ${shortTitle}（直连未发现未截止新公告）`;

  return {
    source,
    httpStatus: home.status,
    note,
    items,
  };
}
