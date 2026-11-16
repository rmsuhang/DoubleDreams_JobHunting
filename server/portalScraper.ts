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
    const enterpriseKey = cleanBase.split('.')[0].replace(/grp$/, '');
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
    const enterpriseKey = cleanBase.split('.')[0].replace(/grp$/, '');
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

export interface BeisenJobAd {
  Id: string;
  JobAdId?: number;
  JobAdName: string;
  Org?: string | null;
  CategoryId?: string | null;
  LocNames?: string[] | null;
  Duty?: string | null;
  Require?: string | null;
  Degree?: string | null;
  YearsOfWorking?: string | null;
  PostDate?: string | null;
  EndTime?: string | null;
  ChangeDate?: string | null;
  Status?: number;
}

const BEISEN_CRA_SIGNAL_RE =
  /临床监查|监查员|CRA|医学事务|药物警戒|CRC|临床试验|临床研究|临床数据|数据管理/;

const BEISEN_MEDICAL_MAJOR_RE =
  /医药相关专业|临床医学|中医学|临床药学|医学类|医药类|GCP/;

function matchesCandidateTargetCity(locText: string, profile: CandidateProfile): {
  matched: boolean;
  region: RecruitmentItem['region'];
} {
  const cleanLoc = locText.trim();
  if (!cleanLoc) {
    return { matched: false, region: '山东省级/国家' };
  }
  if (cleanLoc.includes('青岛')) {
    return { matched: true, region: '青岛' };
  }
  if (cleanLoc.includes('济南')) {
    return { matched: true, region: '济南' };
  }
  const hasExplicitCity = profile.targetCities.some((city) => {
    const shortCity = city.replace(/省|市/g, '');
    return shortCity.length >= 2 && cleanLoc.includes(shortCity);
  });
  if (hasExplicitCity) {
    return { matched: true, region: cleanLoc.includes('青岛') ? '青岛' : cleanLoc.includes('济南') ? '济南' : '山东省级/国家' };
  }
  // Allow generic 全国 or province-wide 山东省 without naming another non-target city
  if (cleanLoc === '全国' || /^山东省?$/.test(cleanLoc)) {
    return { matched: true, region: '山东省级/国家' };
  }
  return { matched: false, region: '山东省级/国家' };
}

function failsEnglishRequirement(requireText: string, profile: CandidateProfile): boolean {
  const requiresCet6 =
    /(?:英语\s*CET[- ]?6|CET[- ]?6|英语六级|大学英语六级)/i.test(requireText) &&
    !/CET[- ]?4|四级|六级.*优先|CET[- ]?6.*优先/i.test(requireText);
  if (!requiresCet6) return false;
  const candidateHasCet6 = profile.certificates.some((c) => /CET[- ]?6|CET6|六级/i.test(c));
  return !candidateHasCet6;
}

export function parseBeisenCampusJobToItem(
  job: BeisenJobAd,
  params: {
    source: OfficialSource;
    zhiyeOrigin: string;
    categoryId: string;
    todayStr: string;
    profile: CandidateProfile;
  }
): RecruitmentItem | null {
  const { source, zhiyeOrigin, categoryId, todayStr, profile } = params;
  if (!job.Id || !job.JobAdName) return null;
  if (job.Status !== undefined && job.Status !== 1) return null;

  const employerName = source.name.replace(/（.*?）|官方招聘及公众号|官网|网站|及公众号/g, '').trim();
  const title = job.JobAdName.trim();
  const org = (job.Org || '').trim() || employerName;
  const duty = (job.Duty || '').trim();
  const requireText = (job.Require || '').trim();
  const rawDegree = (job.Degree || '').trim();
  const degree =
    rawDegree === '本科' && /本科及以上/.test(requireText)
      ? '本科及以上'
      : rawDegree || (/硕士|研究生/.test(requireText) ? '硕士研究生' : '本科及以上');
  const locs = (job.LocNames || []).filter(Boolean);

  // Exclude PhD-only or non-Master roles
  if (profile.degree.includes('硕士')) {
    if (degree === '博士研究生' || degree === '大专' || degree === '博士') return null;
    if (/^\s*1[、.]\s*(?:[^。\n]*?专业)?博士\b/.test(requireText) && !/硕士|本科及/.test(requireText)) {
      return null;
    }
  }

  // Reject roles with strict CET-6 requirement when candidate holds CET-4
  if (failsEnglishRequirement(requireText, profile)) return null;

  // Must match Medical / CRA track signals AND accept clinical/medical backgrounds
  if (!BEISEN_CRA_SIGNAL_RE.test(`${title} ${duty} ${requireText}`)) return null;
  if (!BEISEN_MEDICAL_MAJOR_RE.test(requireText)) return null;

  // Enforce target city matching even when Beisen omits LocNames (e.g. "CRC Intern-东莞（2027校招）")
  const inferredTitleCity = title.match(/[-—]([\u4e00-\u9fa5]{2,8})(?:[（(]|$)/)?.[1] ?? '';
  const locText = locs.join('、') || inferredTitleCity;
  if (!locText) return null;
  if (inferredTitleCity && inferredTitleCity !== '全国' && !matchesCandidateTargetCity(inferredTitleCity, profile).matched) {
    return null;
  }
  const cityCheck = matchesCandidateTargetCity(locText, profile);
  if (!cityCheck.matched) return null;

  // Check real closing date (Beisen uses 2222-02-02 / 0001-01-01 as rolling open sentinel)
  let deadlineDate = '以官方原文为准';
  const rawEnd = (job.EndTime || '').slice(0, 10);
  if (/^20[2-3]\d-\d{2}-\d{2}$/.test(rawEnd) && rawEnd <= '2030-12-31') {
    if (rawEnd < todayStr) return null;
    deadlineDate = rawEnd;
  }

  const rawPost = (job.PostDate || '').slice(0, 10);
  const rawChange = (job.ChangeDate || '').slice(0, 10);
  const publishDate =
    /^20[2-3]\d-\d{2}-\d{2}$/.test(rawPost)
      ? rawPost
      : /^20[2-3]\d-\d{2}-\d{2}$/.test(rawChange)
        ? rawChange
        : todayStr;

  const region = cityCheck.region;
  const cleanOrigin = zhiyeOrigin.replace(/\/+$/, '');
  const pathPrefix = categoryId === '5' ? '/5/detail' : '/campus/detail';
  const detailUrl = `${cleanOrigin}${pathPrefix}?jobAdId=${encodeURIComponent(job.Id)}`;
  const isInternCampus = /Intern|实习/i.test(title);
  const examFormat = isInternCampus ? '网申 + 面试 + 实习转正考核' : '网申 + 简历筛选 + 面试/测评';

  const evalResult = evaluateProfileMatch(
    {
      title: `${employerName} 2027届校招：${title}（${locText}）`,
      region,
      employerCategory: '外企/国企药企',
      matchedPositions: [
        {
          positionName: title,
          department: `${org}（工作地点：${locText}）`,
          headcount: 1,
          degreeReq: degree,
          majorReq: requireText.split(/\n/)[0]?.slice(0, 80) || '临床医学 / 医药相关专业',
          freshGradOnly: true,
          examFormat,
          track: 'medical_cra',
          notes: `${requireText.replace(/\s+/g, ' ').slice(0, 180)}`,
        },
      ],
      matchedTrack: 'medical_cra',
      matchReasons: [],
    },
    profile
  );

  if (!evalResult.isMatch) return null;

  const majorSummary =
    requireText
      .replace(/\s+/g, ' ')
      .slice(0, 110)
      .trim() || '医药/临床医学相关专业硕士';

  const reasons = [
    `官方校招平台直采：直连 ${source.name}（北森校园招聘系统）`,
    `校招岗位：${title}（${org} · ${locText}）`,
    ...evalResult.reasons.filter((r) => !r.includes('2027届应届')),
    isInternCampus
      ? '校招实习通道开放：2027校招留用实习项目（官网持续网申，每周需出勤3-5天）'
      : '校招通道开放：面向应届硕士毕业生在招（招满即止）',
  ];

  const milestones: MilestoneNode[] = [
    {
      id: `beisen-reg-${job.JobAdId ?? job.Id.slice(0, 8)}`,
      type: 'registration',
      label: deadlineDate === '以官方原文为准' ? '2027届校招网申开放中（招满即止）' : '校园招聘网申时间',
      dateRange:
        deadlineDate === '以官方原文为准'
          ? `发布于 ${publishDate} · 官网持续开放网申`
          : `${publishDate} 至 ${deadlineDate}`,
      status: 'active',
      note: '网申流程：在线网申 → 简历筛选 → 邀约面试/测评 → 通知录用 → 签订三方',
    },
  ];

  return {
    id: `scrape-${source.id}-beisen-${job.JobAdId ?? job.Id.slice(0, 8)}`,
    canonicalKey: normalizeCanonicalKey(employerName, `${title} ${locText}`, detailUrl),
    title: `${employerName}校园招聘：${title}`,
    sourceName: `${employerName}校招官网（zhiye.com）`,
    sourceUrl: detailUrl,
    sourceTier: source.tier,
    publishDate,
    announcementType: 'new_announcement',
    region,
    employerName,
    employerCategory: '外企/国企药企',
    matchedTrack: 'medical_cra',
    matchReasons: reasons,
    matchedPositions: [
      {
        positionName: title,
        department: `${org} · ${locText}`,
        headcount: 1,
        degreeReq: degree,
        majorReq: majorSummary,
        freshGradOnly: true,
        examFormat,
        track: 'medical_cra',
        notes: duty ? `核心职责：${duty.replace(/\s+/g, ' ').slice(0, 140)}` : undefined,
      },
    ],
    milestones,
    deadlineDate,
    hasAnomaly: false,
    diffStatus: 'new',
    isLiveGrounded: true,
  };
}

async function fetchBeisenCampusJobs(
  source: OfficialSource,
  zhiyeOrigin: string,
  profile: CandidateProfile,
  todayStr: string
): Promise<RecruitmentItem[]> {
  const categories = ['2', '5']; // 2 = 集团校园招聘, 5 = 子公司校园招聘
  const collected: RecruitmentItem[] = [];
  const seenIds = new Set<string>();
  const seenTitleLoc = new Set<string>();

  for (const cat of categories) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const res = await fetch(`${zhiyeOrigin.replace(/\/+$/, '')}/api/Jobad/GetJobAdPageList`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          ...BROWSER_HEADERS,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Requested-With': 'xmlhttprequest',
          Referer: `${zhiyeOrigin.replace(/\/+$/, '')}/campus/jobs`,
        },
        body: JSON.stringify({
          PageIndex: 0,
          PageSize: 200,
          Category: [cat],
          KeyWords: '',
          SpecialType: 0,
          PortalId: '',
          DisplayFields: ['LocId', 'Org', 'Degree', 'PostDate', 'EndTime'],
        }),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { Data?: BeisenJobAd[] };
      const sortedJobs = [...(json.Data ?? [])].sort((a, b) =>
        (b.PostDate ?? '').localeCompare(a.PostDate ?? '')
      );
      for (const job of sortedJobs) {
        if (!job.Id || seenIds.has(job.Id)) continue;
        const titleLocKey = `${(job.JobAdName ?? '').trim().toLowerCase()}::${(job.LocNames ?? []).join(',').trim()}`;
        if (seenTitleLoc.has(titleLocKey)) continue;
        const item = parseBeisenCampusJobToItem(job, {
          source,
          zhiyeOrigin,
          categoryId: cat,
          todayStr,
          profile,
        });
        if (item) {
          seenIds.add(job.Id);
          seenTitleLoc.add(titleLocKey);
          collected.push(item);
        }
      }
    } catch {
      // Ignore transient API error and rely on remaining channels
    } finally {
      clearTimeout(timer);
    }
  }

  return collected;
}

export interface RunjobPosition {
  pubPositionId: string;
  pubPositionName: string;
  brandName?: string | null;
  companyDescr?: string | null;
  locationDescr?: string | null;
  publishDate?: string | null;
  typeId?: string | null;
  typeIdDescr?: string | null;
  rmEducationalRqmtDescr?: string | null;
  rmWorkYearsRqmtDescr?: string | null;
  rmJobDuty?: string | null;
  rmJobRqmt?: string | null;
}

const RUNJOB_EXCLUDED_RE =
  /OTC代表|学术代表|销售代表|销售培训生|推广经理|推广主管|区域经理|生产车间|维修工|店长|护士|财务|采购|党办|供应链|地产|置地|物业|啤酒|燃气|电力/;

const RUNJOB_MEDICAL_SIGNAL_RE =
  /针灸|推拿|中医师|中医科|康复医学|临床监查|监查员|CRA|医学事务|临床研究|临床试验/;

export function parseRunjobPositionToItem(
  job: RunjobPosition,
  params: {
    source: OfficialSource;
    todayStr: string;
    profile: CandidateProfile;
  }
): RecruitmentItem | null {
  const { source, todayStr, profile } = params;
  if (!job.pubPositionId || !job.pubPositionName) return null;

  const title = job.pubPositionName.trim();
  const brand = (job.brandName || '').trim();
  const company = (job.companyDescr || '').trim();
  const orgName = company || brand || '华润集团医药大健康单位';
  const locText = (job.locationDescr || '').trim();
  const publishDate = /^\d{4}-\d{2}-\d{2}$/.test((job.publishDate || '').slice(0, 10))
    ? (job.publishDate || '').slice(0, 10)
    : todayStr;
  const rqmt = (job.rmJobRqmt || '').trim();
  const duty = (job.rmJobDuty || '').trim();
  const degree = (job.rmEducationalRqmtDescr || '').trim() || '本科及以上';
  const workExp = (job.rmWorkYearsRqmtDescr || '').trim();
  const combined = `${title} ${brand} ${company} ${rqmt} ${duty}`;

  // Filter out stale multi-year posts (older than 120 days)
  if (publishDate < addDays(todayStr, -120)) return null;

  // Campus / fresh-grad filter
  const isCampus =
    job.typeIdDescr === '校园招聘' ||
    job.typeId === 'A02' ||
    /2027|校招|应届/.test(combined);
  if (!isCampus) return null;

  if (RUNJOB_EXCLUDED_RE.test(`${title} ${brand} ${company}`)) return null;
  if (/博士/.test(degree) && !/硕士|本科/.test(degree)) return null;
  if (/[2-9]\s*[-~至到]\s*\d+\s*年|[2-9]\s*年以上/.test(`${workExp} ${rqmt}`) && !/无需经验/.test(workExp)) {
    return null;
  }
  if (failsEnglishRequirement(rqmt, profile)) return null;

  // Target city check (济南 / 青岛)
  const cityCheck = matchesCandidateTargetCity(locText, profile);
  if (!cityCheck.matched || cityCheck.region === '山东省级/国家') return null;

  if (!RUNJOB_MEDICAL_SIGNAL_RE.test(combined)) return null;

  const isTcm = /针灸|推拿|中医师|中医科|康复/.test(combined);
  const track: 'tcm_physician' | 'medical_cra' = isTcm ? 'tcm_physician' : 'medical_cra';
  const detailUrl = `https://runjob.crc.com.cn/#/complex/RecruitDetail?id=${encodeURIComponent(
    job.pubPositionId
  )}&comId=1769554545615040514&typeId=${encodeURIComponent(job.typeId || 'A02')}`;

  const evalResult = evaluateProfileMatch(
    {
      title: `${company || '华润大健康'}：${title}（${locText}）`,
      region: cityCheck.region,
      employerCategory: '国企医疗',
      matchedPositions: [
        {
          positionName: title,
          department: `${orgName}（工作地点：${locText}）`,
          headcount: 1,
          degreeReq: degree,
          majorReq: rqmt.replace(/\s+/g, ' ').slice(0, 120) || '中医学 / 针灸推拿学 / 医药相关专业',
          freshGradOnly: true,
          examFormat: '网申 + 简历筛选 + 面试',
          track,
          notes: rqmt.replace(/\s+/g, ' ').slice(0, 180),
        },
      ],
      matchedTrack: track,
      matchReasons: [],
    },
    profile
  );

  if (!evalResult.isMatch) return null;

  const cleanEmployer = company || '华润医药大健康';
  return {
    id: `scrape-${source.id}-runjob-${job.pubPositionId}`,
    canonicalKey: normalizeCanonicalKey(cleanEmployer, `${title} ${locText}`, detailUrl),
    title: `${cleanEmployer}：${title}`,
    sourceName: '华润集团润招网（runjob.crc.com.cn）',
    sourceUrl: detailUrl,
    sourceTier: source.tier,
    publishDate,
    announcementType: 'new_announcement',
    region: cityCheck.region,
    employerName: cleanEmployer,
    employerCategory: '国企医疗',
    matchedTrack: evalResult.matchedTrack,
    matchReasons: [
      `官方校招平台直采：直连 华润集团润招网API（${company || brand || '华润大健康'}）`,
      `校招岗位：${title}（${locText}）`,
      ...evalResult.reasons.filter((r) => !r.includes('2027届应届')),
      '央企华润旗下医药大健康校招通道开放中',
    ],
    matchedPositions: [
      {
        positionName: title,
        department: `${orgName} · ${locText}`,
        headcount: 1,
        degreeReq: degree,
        majorReq: rqmt.replace(/\s+/g, ' ').slice(0, 110) || '中医学 / 针灸推拿学',
        freshGradOnly: true,
        examFormat: '网申 + 简历筛选 + 面试',
        track,
        notes: duty ? `核心职责：${duty.replace(/\s+/g, ' ').slice(0, 140)}` : undefined,
      },
    ],
    milestones: [
      {
        id: `runjob-reg-${job.pubPositionId.slice(-8)}`,
        type: 'registration',
        label: '2027届校招网申开放中',
        dateRange: `发布于 ${publishDate} · 官网在招中`,
        status: 'active',
        note: '网申流程：华润集团润招网在线投递简历 → 初筛 → 面试/测评 → 录用签约',
      },
    ],
    deadlineDate: '以官方原文为准',
    hasAnomaly: false,
    diffStatus: 'new',
    isLiveGrounded: true,
  };
}

function getShanghaiTimestamp(): string {
  const sh = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${sh.getUTCFullYear()}-${pad(sh.getUTCMonth() + 1)}-${pad(sh.getUTCDate())} ${pad(
    sh.getUTCHours()
  )}:${pad(sh.getUTCMinutes())}:${pad(sh.getUTCSeconds())}:${pad(sh.getUTCMilliseconds(), 3)}`;
}

async function fetchRunjobPositions(
  source: OfficialSource,
  profile: CandidateProfile,
  todayStr: string
): Promise<{ ok: boolean; status: number | null; items: RecruitmentItem[] }> {
  const keywords = ['中医', '针灸', '华润健康', '临床监查', '医学'];
  const collected: RecruitmentItem[] = [];
  const seenIds = new Set<string>();
  const seenTitleLoc = new Set<string>();
  let anySuccess = false;
  let lastStatus: number | null = null;

  for (const keyword of keywords) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 9000);
    try {
      const biz = {
        biz: {
          method: 'getSynthesizeHomepagePosition',
          param: {
            homepageConfigId: '1769554545615040514',
            locationDescr: '',
            industryType: '',
            rmWorkYearsRqmt: '',
            rmEducationalRqmt: '',
            keyword,
            positionType: '',
            rmBusiness: '',
            pageNum: 1,
            pageSize: 50,
          },
        },
      };
      const ssdpStr = `Api_Version=1.0&Api_ID=crinfo.hrms.rm.synthesizeHomepagePosition&App_Sub_ID=0006000908YA&App_Token=60fe2d19e5ad491f8a02508da3efe532&Sys_ID=00060009&Partner_ID=00060000&Sign=NO_SIGN&Time_Stamp=${getShanghaiTimestamp()}&User_Token=`;
      const ssdp = Buffer.from(ssdpStr).toString('base64');
      const base64String = Buffer.from(JSON.stringify(biz)).toString('base64');

      const res = await fetch(`https://ssdp.crc.com.cn/ssdp/sys/rf/?ssdp=${encodeURIComponent(ssdp)}`, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          ...BROWSER_HEADERS,
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json',
          Origin: 'https://runjob.crc.com.cn',
          Referer: 'https://runjob.crc.com.cn/',
        },
        body: JSON.stringify({ base64String }),
      });
      lastStatus = res.status;
      if (!res.ok) continue;
      anySuccess = true;
      const json = (await res.json()) as { RESPONSE?: { RETURN_DATA?: string } };
      if (!json.RESPONSE?.RETURN_DATA) continue;
      const decoded = JSON.parse(
        Buffer.from(json.RESPONSE.RETURN_DATA, 'base64').toString('utf8')
      ) as { data?: RunjobPosition[] };

      for (const job of decoded.data ?? []) {
        if (!job.pubPositionId || seenIds.has(job.pubPositionId)) continue;
        const titleLocKey = `${(job.pubPositionName ?? '').trim().toLowerCase()}::${(
          job.locationDescr ?? ''
        ).trim()}`;
        if (seenTitleLoc.has(titleLocKey)) continue;
        const item = parseRunjobPositionToItem(job, { source, todayStr, profile });
        if (item) {
          seenIds.add(job.pubPositionId);
          seenTitleLoc.add(titleLocKey);
          collected.push(item);
        }
      }
    } catch {
      // Continue remaining keyword queries
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    ok: anySuccess,
    status: lastStatus,
    items: collected,
  };
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
  if (
    source.domain === 'crc.com.cn' ||
    source.domain === 'crcare.com.cn' ||
    source.url.includes('runjob.crc.com.cn')
  ) {
    const runjob = await fetchRunjobPositions(source, profile, todayStr);
    const note = runjob.ok
      ? runjob.items.length > 0
        ? `在线 · 华润集团润招网API（直采命中 ${runjob.items.length} 条有效岗位）`
        : '在线 · 华润集团润招网API（华润健康等直连暂无济南/青岛未截止新岗位）'
      : '华润集团润招网API暂不可达';
    return {
      source,
      httpStatus: runjob.status,
      note,
      items: runjob.items,
    };
  }

  const home = await fetchHtmlWithTimeout(source.url, 12000);
  if (!home.ok || !home.html) {
    const note =
      source.domain === 'astrazeneca.com.cn' && home.status === 403
        ? 'HTTP 403（阿斯利康中国受 CloudFront 拦截，海外 Eightfold 暂无中国区在招，需借助 Search Grounding）'
        : home.status
          ? `HTTP ${home.status}（站点拦截或需境内IP）`
          : home.errorNote || '不可达';
    return {
      source,
      httpStatus: home.status,
      note,
      items: [],
    };
  }

  const pageTitle = home.html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  const baseLinks = extractLinksFromHtml(home.html, home.finalUrl);

  const items: RecruitmentItem[] = [];
  const zhiyeLink = baseLinks.find((l) => {
    try {
      const host = new URL(l.url).hostname.toLowerCase();
      return host.endsWith('.zhiye.com') && isTrustedPortalArticleUrl(l.url, source.domain);
    } catch {
      return false;
    }
  });

  let directZhiyeOrigin: string | null = null;
  if (zhiyeLink) {
    directZhiyeOrigin = new URL(zhiyeLink.url).origin;
  } else {
    try {
      const finalParsed = new URL(home.finalUrl);
      if (finalParsed.hostname.toLowerCase().endsWith('.zhiye.com')) {
        directZhiyeOrigin = finalParsed.origin;
      }
    } catch {
      // ignore
    }
    if (!directZhiyeOrigin && source.domain === 'tigermedgrp.com') {
      directZhiyeOrigin = 'https://tigermed.zhiye.com';
    }
  }

  if (source.tier === 'soe_medical_enterprise' && directZhiyeOrigin) {
    const beisenItems = await fetchBeisenCampusJobs(source, directZhiyeOrigin, profile, todayStr);
    items.push(...beisenItems);
  }

  const columnUrls = baseLinks
    .filter((l) => isRecruitmentColumnLink(l.title, l.url, source.domain))
    .map((l) => l.url)
    .filter((u, idx, arr) => arr.indexOf(u) === idx && !u.includes('.zhiye.com'))
    .slice(0, 3);

  const subPages = await Promise.all(columnUrls.map((colUrl) => fetchHtmlWithTimeout(colUrl, 9000)));
  const allLinks: DiscoveredLink[] = [...baseLinks];
  for (const sub of subPages) {
    if (sub.ok && sub.html) {
      allLinks.push(...extractLinksFromHtml(sub.html, sub.finalUrl));
    }
  }

  const seenUrls = new Set<string>(items.map((i) => i.sourceUrl));
  const candidateLinks: DiscoveredLink[] = [];
  for (const link of allLinks) {
    if (link.url.includes('.zhiye.com')) continue;
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
    if (item && !seenUrls.has(item.sourceUrl)) {
      seenUrls.add(item.sourceUrl);
      items.push(item);
    }
  }

  const shortTitle = pageTitle ? pageTitle.slice(0, 32) : '官方页面可访问';
  const note =
    items.length > 0
      ? `在线 · ${shortTitle}（直采命中 ${items.length} 条有效岗位/公告）`
      : `在线 · ${shortTitle}（直连未发现未截止新公告）`;

  return {
    source,
    httpStatus: home.status,
    note,
    items,
  };
}
