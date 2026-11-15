import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractLinksFromHtml,
  isRecruitmentColumnLink,
  isRelevantRecruitmentLink,
  normalizeChineseDate,
  parseOfficialArticleToItem,
} from './portalScraper';
import { INITIAL_OFFICIAL_SOURCES, INITIAL_PROFILE } from '../src/shared/seedData';

test('normalizeChineseDate parses standard and Chinese date formats', () => {
  assert.equal(normalizeChineseDate('2026-11-11'), '2026-11-11');
  assert.equal(normalizeChineseDate('2026年11月5日'), '2026-11-05');
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

test('parseOfficialArticleToItem extracts real article metadata without inventing fake positions', () => {
  const source = INITIAL_OFFICIAL_SOURCES.find((s) => s.domain === 'jnsjgyy.com')!;
  const articleHtml = `
    <html>
      <head><title>济南市机关医院公开招聘急需优秀高校毕业生公告（2027届）</title></head>
      <body>
        <h1>济南市机关医院公开招聘急需优秀高校毕业生公告（2027届）</h1>
        <div>来源：济南市机关医院 时间：2026-11-11 08:55:00</div>
        <article>
          按照国家、省和我市事业单位公开招聘有关规定，济南市机关医院拟公开招聘急需优秀高校毕业生7名。
          本次招聘对象为博士研究生和急需优秀国内外高校2027年应届毕业的硕士研究生，岗位涵盖中医科、针灸推拿科及康复医学科。
          网上报名时间：2026年11月12日至2026年11月22日。考核方式为笔试加面试。
        </article>
      </body>
    </html>
  `;

  const item = parseOfficialArticleToItem({
    source,
    articleUrl: 'https://www.jnsjgyy.com/content-110-3976-1.html',
    linkTitle: '济南市机关医院公开招聘急需优秀高校毕业生公告（2027届）',
    html: articleHtml,
    todayStr: '2026-11-15',
    dateHint: '2026-11-11',
    profile: INITIAL_PROFILE,
  });

  assert.ok(item);
  assert.equal(item.sourceUrl, 'https://www.jnsjgyy.com/content-110-3976-1.html');
  assert.equal(item.publishDate, '2026-11-11');
  assert.equal(item.deadlineDate, '2026-11-22');
  assert.equal(item.matchedTrack, 'tcm_physician');
  assert.equal(item.isLiveGrounded, true);
});
