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
  assert.ok(html.includes('https://www.qdzyy.cn/'));
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
  const md = generateBriefingMarkdown(state);
  assert.ok(md.includes('原文标题'));
  assert.ok(md.includes('官方来源'));
  assert.ok(md.includes('发布日期'));
  assert.ok(md.includes('https://www.jndsyy.cn/'));
});
