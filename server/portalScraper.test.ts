import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractLinksFromHtml,
  isRecruitmentColumnLink,
  isRelevantRecruitmentLink,
  isTrustedPortalArticleUrl,
  normalizeChineseDate,
  parseOfficialArticleToItem,
} from './portalScraper';
import { INITIAL_OFFICIAL_SOURCES, INITIAL_PROFILE } from '../src/shared/seedData';

test('normalizeChineseDate parses standard and spaced Chinese date formats', () => {
  assert.equal(normalizeChineseDate('2026-11-11'), '2026-11-11');
  assert.equal(normalizeChineseDate('2026年11月5日'), '2026-11-05');
  assert.equal(normalizeChineseDate('2026 年 6 月 4 日'), '2026-06-04');
  assert.equal(normalizeChineseDate('2020.06.24'), '2020-06-24');
  assert.equal(normalizeChineseDate('2026/1/9'), '2026-01-09');
  assert.equal(normalizeChineseDate('无日期'), null);
});

test('extractLinksFromHtml discovers recruitment links and skips procurement links', () => {
  const html = `
    <ul>
      <li><a href="/list-110-1.html">人事招聘</a></li>
      <li><a href="/content-110-3976-1.html">济南市机关医院公开招聘急需优秀高校毕业生公告（2027届） 2026-11-11 30</a></li>
      <li><a href="/content-111-3972-1.html">济南市机关医院2026年复印纸采购项目询价公告 2026-11-02</a></li>
    </ul>
  `;
  const links = extractLinksFromHtml(html, 'https://www.jnsjgyy.com/');
  assert.equal(links.length, 3);
  assert.equal(links[1].url, 'https://www.jnsjgyy.com/content-110-3976-1.html');
  assert.equal(links[1].dateHint, '2026-11-11');

  assert.equal(isRecruitmentColumnLink(links[0].title, links[0].url, 'jnsjgyy.com'), true);
  assert.equal(isRelevantRecruitmentLink(links[1].title, links[1].url), true);
  assert.equal(isRelevantRecruitmentLink(links[2].title, links[2].url), false);
});

test('parseOfficialArticleToItem extracts real article metadata and multi-session milestones', () => {
  const source = INITIAL_OFFICIAL_SOURCES.find((s) => s.domain === 'jnsjgyy.com')!;
  const articleHtml = `
    <html>
      <head><title>济南市机关医院公开招聘急需优秀高校毕业生公告（北京站·2027届）</title></head>
      <body>
        <h1>济南市机关医院公开招聘急需优秀高校毕业生公告（北京站·2027届）</h1>
        <div>来源：济南市机关医院 时间：2026-11-12 18:48:17</div>
        <article>
          一、第一场 报名地点：北京中医药大学和平街校区 报名时间：2026年11月20日14:00-16:00
          二、第二场 报名地点：北京大学医学部 报名时间：2026年11月21日9:00-11:00
          欢迎2027年应届硕士毕业生（含针灸推拿学、中医学）现场报名参加。
        </article>
      </body>
    </html>
  `;

  const item = parseOfficialArticleToItem({
    source,
    articleUrl: 'https://www.jnsjgyy.com/content-110-3977-1.html',
    linkTitle: '济南市机关医院公开招聘急需优秀高校毕业生公告（北京站·2027届）',
    html: articleHtml,
    todayStr: '2026-11-15',
    dateHint: '2026-11-12',
    profile: INITIAL_PROFILE,
  });

  assert.ok(item);
  assert.equal(item.publishDate, '2026-11-12');
  assert.equal(item.deadlineDate, '2026-11-21');
  assert.equal(item.milestones.length, 2);
  assert.ok(item.milestones[0].label.includes('北京中医药大学'));
  assert.ok(item.milestones[1].label.includes('北京大学医学部'));
});

test('parseOfficialArticleToItem avoids fake +14d deadlines and filters expired June notices', () => {
  const source = INITIAL_OFFICIAL_SOURCES.find((s) => s.domain === 'jnslyy.com')!;

  const pendingHtml = `
    <html><body>
      <h1>济南市第一人民医院公开招聘急需优秀高校毕业生公告（2027届）</h1>
      <article>
        本次招聘对象为2027年应届硕士研究生，采取宣讲会现场报名方式，现场报名的具体时间和地点确定后在官网公布。
        济南市第一人民医院 2026年11月11日
      </article>
    </body></html>
  `;
  const pendingItem = parseOfficialArticleToItem({
    source,
    articleUrl: 'http://www.jnslyy.com/contents/51/56396.html',
    linkTitle: '济南市第一人民医院公开招聘急需优秀高校毕业生公告（2027届）',
    html: pendingHtml,
    todayStr: '2026-11-15',
    profile: INITIAL_PROFILE,
  });
  assert.ok(pendingItem);
  assert.equal(pendingItem.publishDate, '2026-11-11');
  assert.equal(pendingItem.deadlineDate, '以官方原文为准');

  const staleJuneHtml = `
    <html><body>
      <h1>济南市第一人民医院公开招聘人员面试有关事宜的公告</h1>
      <article>
        面试时间定于 2026 年 6 月 25 日 -26日。请保持通讯畅通，应届硕士考生按时参加。
        济南市第一人民医院 2026 年 6 月 4 日
      </article>
    </body></html>
  `;
  const staleItem = parseOfficialArticleToItem({
    source,
    articleUrl: 'http://www.jnslyy.com/contents/38/55776.html',
    linkTitle: '济南市第一人民医院公开招聘人员面试有关事宜的公告',
    html: staleJuneHtml,
    todayStr: '2026-11-15',
    profile: INITIAL_PROFILE,
  });
  assert.equal(staleItem, null);
});

test('filters historical 2020 summaries, news URLs, and parses cross-month deadline ranges', () => {
  const sdzydfy = INITIAL_OFFICIAL_SOURCES.find((s) => s.domain === 'sdzydfy.com')!;
  assert.equal(isTrustedPortalArticleUrl('https://m.chinanews.com/wap/detail/chs/zw/463185.shtml', 'sdzydfy.com'), false);
  assert.equal(isTrustedPortalArticleUrl('https://www.sdzydfy.com/notice_notice/123.html', 'sdzydfy.com'), true);

  const old2020Html = `
    <html><body>
      <h1>医院完成2020年度校园招聘工作</h1>
      <div>2020.06.24 来源部门：人事处</div>
      <article>近日我院面向2020年应届毕业生完成了针灸推拿等专业笔试面试工作。</article>
    </body></html>
  `;
  const oldItem = parseOfficialArticleToItem({
    source: sdzydfy,
    articleUrl: 'https://www.sdzydfy.com/renshizongheguanli/010006500008617.html',
    linkTitle: '医院完成2020年度校园招聘工作',
    html: old2020Html,
    todayStr: '2026-11-15',
    profile: INITIAL_PROFILE,
  });
  assert.equal(oldItem, null);

  const rangeHtml = `
    <html><body>
      <h1>山东省中医院2027年公开招聘急需紧缺人才公告</h1>
      <div>发布时间：2026-11-14</div>
      <article>
        网上报名时间：2026年11月15日9:00至11月22日17:00。招聘针灸推拿学硕士研究生。
      </article>
    </body></html>
  `;
  const rangeItem = parseOfficialArticleToItem({
    source: sdzydfy,
    articleUrl: 'https://www.sdzydfy.com/rencaizhaoping/2027.html',
    linkTitle: '山东省中医院2027年公开招聘急需紧缺人才公告',
    html: rangeHtml,
    todayStr: '2026-11-15',
    profile: INITIAL_PROFILE,
  });
  assert.ok(rangeItem);
  assert.equal(rangeItem.publishDate, '2026-11-14');
  assert.equal(rangeItem.deadlineDate, '2026-11-22');
});

