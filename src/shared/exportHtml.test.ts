import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialSeedState } from './seedData';
import {
  escapeHtml,
  generateBriefingMarkdown,
  generateStandaloneWorkbenchHtml,
} from './exportHtml';

test('escapeHtml safely escapes special HTML characters', () => {
  assert.equal(escapeHtml('<script>"a&b"</script>'), '&lt;script&gt;&quot;a&amp;b&quot;&lt;/script&gt;');
});

test('generateStandaloneWorkbenchHtml outputs a complete self-contained HTML workbench', () => {
  const state = createInitialSeedState();
  const html = generateStandaloneWorkbenchHtml(state);
  assert.ok(html.startsWith('<!doctype html>'));
  assert.ok(html.includes('周梦梦'));
  assert.ok(html.includes('https://www.jnszhyy.cn/'));
  assert.ok(html.includes('https://www.jnsjgyy.com/'));
  assert.ok(html.includes('id="searchInput"'));
  assert.ok(html.includes('id="view-milestones"'));
  assert.ok(html.includes('id="view-sources"'));
  assert.ok(html.includes('id="view-profile"'));

  const liveHtml = generateStandaloneWorkbenchHtml(state, undefined, {
    apiBaseUrl: 'https://example.run.app/',
  });
  assert.ok(liveHtml.includes('id="manualRefreshBtn"'));
  assert.ok(liveHtml.includes('https://example.run.app'));
});

test('generateBriefingMarkdown includes required official link, original title, and publish date', () => {
  const state = createInitialSeedState();
  state.briefings[0].items = [
    {
      id: 'test-item-1',
      canonicalKey: '测试医院::2027届校招',
      title: '测试医院2027届校园招聘公告',
      sourceName: '测试医院官网',
      sourceUrl: 'https://www.jndsyy.cn/notice/1',
      sourceTier: 'hospital_official',
      publishDate: '2026-11-15',
      announcementType: 'new_announcement',
      region: '济南',
      employerName: '测试医院',
      employerCategory: '公立医院',
      matchedTrack: 'tcm_physician',
      matchReasons: ['专业匹配：针灸推拿学硕士'],
      matchedPositions: [
        {
          positionName: '针灸推拿医师',
          department: '针灸科',
          headcount: 1,
          degreeReq: '硕士研究生',
          majorReq: '针灸推拿学',
          freshGradOnly: true,
          examFormat: '笔试+面试',
          track: 'tcm_physician',
        },
      ],
      milestones: [
        {
          id: 'm1',
          type: 'registration',
          label: '网上报名',
          dateRange: '2026-11-15 ~ 2026-11-25',
          status: 'active',
        },
      ],
      deadlineDate: '2026-11-25',
      hasAnomaly: false,
      diffStatus: 'new',
      isLiveGrounded: true,
    },
  ];
  const md = generateBriefingMarkdown(state);
  assert.ok(md.includes('原文标题'));
  assert.ok(md.includes('官方来源'));
  assert.ok(md.includes('发布日期'));
  assert.ok(md.includes('https://www.jndsyy.cn/notice/1'));
});
