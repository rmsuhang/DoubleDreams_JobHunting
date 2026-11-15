import type { AppDataState, BriefingSnapshot, RecruitmentItem } from './types.ts';

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getTargetBriefing(state: AppDataState, briefingId?: string): BriefingSnapshot {
  if (briefingId) {
    const found = state.briefings.find((b) => b.id === briefingId);
    if (found) return found;
  }
  return state.briefings[0];
}

function diffLabel(status: RecruitmentItem['diffStatus']): string {
  switch (status) {
    case 'updated':
      return '变更/异动';
    case 'new':
      return '今日新增';
    case 'still_open':
      return '未截止延续';
    default:
      return '已截止';
  }
}

function trackLabel(track: RecruitmentItem['matchedTrack']): string {
  switch (track) {
    case 'tcm_physician':
      return '针灸推拿医师';
    case 'medical_cra':
      return '医学事务 / CRA';
    default:
      return '双赛道均匹配';
  }
}

export function generateBriefingMarkdown(state: AppDataState, briefingId?: string): string {
  const briefing = getTargetBriefing(state, briefingId);
  const { profile, sources, schedule } = state;
  const activeItems = briefing.items.filter((i) => i.diffStatus !== 'closed');

  const lines: string[] = [];
  lines.push(`# ${profile.name} · 每日官方招聘汇总简报（${briefing.briefingDate}）`);
  lines.push('');
  lines.push(`- **求职画像**：${profile.degree}（${profile.major}）｜ ${profile.masterSchool} ｜ 2027届应届毕业生`);
  lines.push(`- **双赛道方向**：针灸推拿医师（校招） / 医学事务·临床研究（CRA）`);
  lines.push(`- **重点地区**：${profile.targetCities.join('、')}`);
  lines.push(`- **调度配置**：每日 ${schedule.triggerTime}（${schedule.timezone}）自动汇总 · 对比基准 ${briefing.baselineDate ?? '首次基线'}`);
  lines.push(`- **统计概览**：有效匹配 ${briefing.stats.totalMatched} 条（今日新增 ${briefing.stats.newCount} ｜ 变更/异动 ${briefing.stats.updatedCount} ｜ 未截止延续 ${briefing.stats.stillOpenCount}）`);
  lines.push('');
  lines.push('---');
  lines.push('');

  for (const item of activeItems) {
    lines.push(`## [${diffLabel(item.diffStatus)}] ${item.title}`);
    lines.push('');
    lines.push(`- **原文标题**：${item.title}`);
    lines.push(`- **官方来源**：${item.sourceName} — ${item.sourceUrl}`);
    lines.push(`- **发布日期**：${item.publishDate} ｜ **报名截止**：${item.deadlineDate} ｜ **地区**：${item.region} ｜ **赛道**：${trackLabel(item.matchedTrack)}`);
    if (item.hasAnomaly && item.anomalyDetail) {
      lines.push(`- **异动提醒**：${item.anomalyDetail}`);
    }
    if (item.diffNote) {
      lines.push(`- **增量说明**：${item.diffNote}`);
    }
    lines.push(`- **画像匹配原因**：`);
    for (const r of item.matchReasons) {
      lines.push(`  - ${r}`);
    }
    lines.push(`- **匹配岗位**：`);
    for (const p of item.matchedPositions) {
      lines.push(`  - ${p.positionName}（${p.department}，招 ${p.headcount} 人，${p.degreeReq}，${p.majorReq}，考核：${p.examFormat}）`);
    }
    lines.push(`- **关键节点**：`);
    for (const m of item.milestones) {
      lines.push(`  - ${m.label}：${m.dateRange}${m.note ? `（${m.note}）` : ''}`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push(`## 已监控官方一手渠道（${sources.filter((s) => s.enabled).length} 个启用）`);
  lines.push('');
  for (const s of sources.filter((src) => src.enabled)) {
    lines.push(`- [${s.name}](${s.url})（${s.tierLabel} · ${s.region}）`);
  }

  return lines.join('\n');
}

export interface StandaloneExportOptions {
  apiBaseUrl?: string;
}

export function generateStandaloneWorkbenchHtml(
  state: AppDataState,
  briefingId?: string,
  options?: StandaloneExportOptions
): string {
  const briefing = getTargetBriefing(state, briefingId);
  const { profile, sources, schedule } = state;
  const activeItems = briefing.items.filter((i) => i.diffStatus !== 'closed');
  const enabledSources = sources.filter((s) => s.enabled);
  const safeApiBase = (options?.apiBaseUrl || '').trim().replace(/\/+$/, '');

  const itemsHtml =
    activeItems.length > 0
      ? activeItems
          .map((item) => {
            const positionsRows = item.matchedPositions
              .map(
                (p) => `
          <tr>
            <td><strong>${escapeHtml(p.positionName)}</strong><div class="muted">${escapeHtml(p.department)}</div></td>
            <td class="mono num">${p.headcount}</td>
            <td>${escapeHtml(p.degreeReq)}<div class="muted">${escapeHtml(p.majorReq)}</div></td>
            <td>${escapeHtml(p.examFormat)}</td>
          </tr>`
              )
              .join('');

            const milestonesRows = item.milestones
              .map(
                (m) => `
          <li>
            <span class="ms-label">${escapeHtml(m.label)}</span>
            <span class="mono">${escapeHtml(m.dateRange)}</span>
            ${m.note ? `<span class="muted"> · ${escapeHtml(m.note)}</span>` : ''}
          </li>`
              )
              .join('');

            const reasonsList = item.matchReasons
              .map((r) => `<li>${escapeHtml(r)}</li>`)
              .join('');

            const searchText = escapeHtml(
              [
                item.title,
                item.employerName,
                item.sourceName,
                item.region,
                ...item.matchReasons,
                ...item.matchedPositions.map((p) => `${p.positionName} ${p.department}`),
              ]
                .join(' ')
                .toLowerCase()
            );

            const statusClass =
              item.diffStatus === 'updated'
                ? 'status-warn'
                : item.diffStatus === 'new'
                ? 'status-teal'
                : 'status-muted';

            return `
      <article class="card item-card" data-diff="${escapeHtml(item.diffStatus)}" data-track="${escapeHtml(item.matchedTrack)}" data-region="${escapeHtml(item.region)}" data-search="${searchText}">
        <div class="meta-line">
          <span class="${statusClass}">${escapeHtml(diffLabel(item.diffStatus))}</span>
          <span>·</span>
          <span>${escapeHtml(item.region)}</span>
          <span>·</span>
          <span>${escapeHtml(trackLabel(item.matchedTrack))}</span>
          <span>·</span>
          <span class="mono">发布日期 ${escapeHtml(item.publishDate)}</span>
          <span>·</span>
          <span class="mono strong">报名截止 ${escapeHtml(item.deadlineDate)}</span>
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <div class="source-line">
          <span class="muted">官方来源：</span>
          <span>${escapeHtml(item.sourceName)}</span>
          <a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer" class="mono">${escapeHtml(item.sourceUrl)} ↗</a>
        </div>
        ${
          item.hasAnomaly || item.diffStatus === 'updated'
            ? `<div class="alert-box">${escapeHtml(item.anomalyDetail || item.diffNote || '')}</div>`
            : ''
        }
        <div class="two-col">
          <div>
            <div class="subhead">画像匹配原因</div>
            <ul class="bullet-list">${reasonsList}</ul>
          </div>
          <div>
            <div class="subhead">关键节点摘要</div>
            <ul class="bullet-list">${milestonesRows}</ul>
          </div>
        </div>
        <details class="pos-details">
          <summary>展开匹配职位表明细（${item.matchedPositions.length} 个岗位）</summary>
          <table>
            <thead>
              <tr>
                <th>岗位 / 科室</th>
                <th class="num">人数</th>
                <th>学历与专业</th>
                <th>考核形式</th>
              </tr>
            </thead>
            <tbody>${positionsRows}</tbody>
          </table>
        </details>
      </article>`;
          })
          .join('\n')
      : `<div class="card"><h3>当前暂无新增/未截止的真实官方匹配公告</h3><p class="muted">${escapeHtml(briefing.scanStatusMessage)}</p></div>`;

  const sourcesHtml = enabledSources
    .map(
      (s) => `
      <tr>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td>${escapeHtml(s.tierLabel)}</td>
        <td>${escapeHtml(s.region)}</td>
        <td><a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="mono">${escapeHtml(s.url)} ↗</a></td>
      </tr>`
    )
    .join('');

  const milestonesFlatHtml = activeItems
    .flatMap((item) =>
      item.milestones.map(
        (m) => `
      <tr>
        <td>${escapeHtml(m.label)}</td>
        <td class="mono">${escapeHtml(m.dateRange)}</td>
        <td>${escapeHtml(item.employerName)}</td>
        <td><a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">官方原文（${escapeHtml(item.publishDate)}）↗</a></td>
      </tr>`
      )
    )
    .join('');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(profile.name)} · 个人官方招聘工作台（${escapeHtml(briefing.briefingDate)}）</title>
  <style>
    :root {
      --bg: #f8fafc;
      --surface: #ffffff;
      --border: #e2e8f0;
      --ink: #0f172a;
      --muted: #64748b;
      --accent: #0f766e;
      --accent-soft: #f0fdfa;
      --warn: #b45309;
      --warn-bg: #fffbeb;
      --warn-border: #fde68a;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: "PingFang SC", "Microsoft YaHei", -apple-system, BlinkMacSystemFont, sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.55;
    }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-variant-numeric: tabular-nums; }
    .strong { font-weight: 600; color: var(--ink); }
    .muted { color: var(--muted); font-size: 12px; }
    .topbar {
      background: var(--surface);
      border-bottom: 1px solid var(--border);
      padding: 16px 24px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
    }
    .brand { font-size: 18px; font-weight: 700; }
    .nav-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
    .tab-btn {
      border: 1px solid transparent;
      background: transparent;
      color: var(--muted);
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
    }
    .tab-btn.active { background: var(--accent-soft); color: var(--accent); border-color: #ccfbf1; }
    .refresh-btn {
      border: none;
      background: var(--accent);
      color: #ffffff;
      padding: 7px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      white-space: nowrap;
    }
    .refresh-btn:disabled { opacity: 0.6; cursor: wait; }
    .sync-note { font-size: 12px; color: var(--accent); margin-bottom: 12px; }
    .container { max-width: 1120px; margin: 0 auto; padding: 24px 20px 48px; }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      margin-bottom: 20px;
    }
    .kpi-cell { padding: 18px 20px; border-right: 1px solid var(--border); }
    .kpi-cell:last-child { border-right: none; }
    .kpi-val { font-size: 24px; font-weight: 700; margin-top: 4px; }
    .toolbar {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 18px;
    }
    .seg-group { display: inline-flex; gap: 4px; background: #f1f5f9; padding: 4px; border-radius: 8px; }
    .seg-btn {
      border: none;
      background: transparent;
      padding: 6px 12px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      color: #475569;
      cursor: pointer;
    }
    .seg-btn.active { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
    .filters { display: flex; flex-wrap: wrap; gap: 8px; }
    input, select {
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 12px;
      background: var(--surface);
      color: var(--ink);
    }
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 14px;
    }
    .meta-line { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; color: var(--muted); margin-bottom: 6px; }
    .status-warn { color: var(--warn); font-weight: 600; }
    .status-teal { color: var(--accent); font-weight: 600; }
    .status-muted { color: #475569; font-weight: 500; }
    h3 { margin: 0 0 8px; font-size: 16px; line-height: 1.4; }
    .source-line { font-size: 12px; margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .alert-box {
      background: var(--warn-bg);
      border: 1px solid var(--warn-border);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 12px;
      color: #78350f;
      margin-bottom: 12px;
    }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 8px; }
    .subhead { font-size: 12px; font-weight: 600; color: #334155; margin-bottom: 6px; }
    .bullet-list { margin: 0; padding-left: 16px; font-size: 12px; color: #475569; }
    .bullet-list li { margin-bottom: 4px; }
    .pos-details { margin-top: 14px; border-top: 1px solid #f1f5f9; padding-top: 10px; }
    .pos-details summary { font-size: 12px; font-weight: 600; color: var(--accent); cursor: pointer; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
    th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { background: #f8fafc; color: #475569; font-weight: 600; }
    .num { text-align: right; }
    .panel { display: none; }
    .panel.active { display: block; }
    @media (max-width: 768px) {
      .kpi-grid { grid-template-columns: repeat(2, 1fr); }
      .two-col { grid-template-columns: 1fr; }
    }
    @media print {
      .toolbar, .nav-tabs { display: none !important; }
      .panel { display: block !important; margin-bottom: 24px; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div>
      <div class="brand">本草职哨 · ${escapeHtml(profile.name)}个人招聘工作台</div>
      <div id="headerMeta" class="muted">简报日期 ${escapeHtml(briefing.briefingDate)} · 基准 ${escapeHtml(briefing.baselineDate ?? '首次')} · 每日设定 ${escapeHtml(schedule.triggerTime)} · 仅采信官方一手渠道</div>
    </div>
    <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;">
      <nav class="nav-tabs" aria-label="工作台视图">
        <button type="button" class="tab-btn active" data-view="briefing">每日简报 (${activeItems.length})</button>
        <button type="button" class="tab-btn" data-view="milestones">关键节点</button>
        <button type="button" class="tab-btn" data-view="sources">官源目录 (${enabledSources.length})</button>
        <button type="button" class="tab-btn" data-view="profile">个人画像</button>
      </nav>
      ${
        safeApiBase
          ? `<button type="button" id="manualRefreshBtn" class="refresh-btn">手动刷新最新数据</button>`
          : ''
      }
    </div>
  </header>

  <main class="container">
    <div id="syncStatusBar" class="sync-note">${escapeHtml(briefing.scanStatusMessage)}</div>
    <section id="view-briefing" class="panel active">
      <div class="kpi-grid">
        <div class="kpi-cell"><div class="muted">当前有效匹配</div><div id="kpiTotal" class="kpi-val mono">${briefing.stats.totalMatched}</div></div>
        <div class="kpi-cell"><div class="muted">较上次基准新增</div><div id="kpiNew" class="kpi-val mono" style="color:var(--accent)">+${briefing.stats.newCount}</div></div>
        <div class="kpi-cell"><div class="muted">变更与异动</div><div id="kpiUpdated" class="kpi-val mono" style="color:var(--warn)">${briefing.stats.updatedCount}</div></div>
        <div class="kpi-cell"><div class="muted">未截止延续</div><div id="kpiOpen" class="kpi-val mono">${briefing.stats.stillOpenCount}</div></div>
      </div>

      <div class="toolbar">
        <div class="seg-group" role="group" aria-label="增量筛选">
          <button type="button" class="seg-btn active" data-diff="all">全部 (${activeItems.length})</button>
          <button type="button" class="seg-btn" data-diff="new">今日新增 (${briefing.stats.newCount})</button>
          <button type="button" class="seg-btn" data-diff="updated">变更与异动 (${briefing.stats.updatedCount})</button>
          <button type="button" class="seg-btn" data-diff="still_open">未截止延续 (${briefing.stats.stillOpenCount})</button>
        </div>
        <div class="filters">
          <input type="search" id="searchInput" placeholder="检索单位、岗位或关键字..." aria-label="关键词检索" />
          <select id="trackSelect" aria-label="赛道筛选">
            <option value="all">全部赛道</option>
            <option value="tcm_physician">针灸推拿医师</option>
            <option value="medical_cra">医学事务 / CRA</option>
          </select>
          <select id="regionSelect" aria-label="地区筛选">
            <option value="all">全部地区</option>
            <option value="济南">山东省济南市</option>
            <option value="青岛">山东省青岛市</option>
            <option value="山东省级/国家">山东省级 / 国家</option>
          </select>
        </div>
      </div>

      <div id="itemsContainer">${itemsHtml}</div>
    </section>

    <section id="view-milestones" class="panel">
      <div class="card">
        <h3>关键招聘节点一览表</h3>
        <table>
          <thead>
            <tr><th>节点事项</th><th>时间窗口</th><th>招录单位</th><th>官方来源与发布日期</th></tr>
          </thead>
          <tbody>${milestonesFlatHtml}</tbody>
        </table>
      </div>
    </section>

    <section id="view-sources" class="panel">
      <div class="card">
        <h3>官方一手渠道白名单（${enabledSources.length} 个已启用）</h3>
        <table>
          <thead>
            <tr><th>官方机构名称</th><th>渠道层级</th><th>地域</th><th>官方网站链接</th></tr>
          </thead>
          <tbody>${sourcesHtml}</tbody>
        </table>
      </div>
    </section>

    <section id="view-profile" class="panel">
      <div class="card">
        <h3>${escapeHtml(profile.name)} · 双简历求职画像</h3>
        <p>${escapeHtml(profile.degree)}（${escapeHtml(profile.major)}） · ${escapeHtml(profile.masterSchool)} · 2027年6月应届毕业</p>
        <p class="muted">意向城市：${escapeHtml(profile.targetCities.join('、'))} ｜ 期望月薪：${escapeHtml(profile.expectedSalary)} ｜ 考试类型：${escapeHtml(profile.examTypes.join('、'))}</p>
        <div class="two-col" style="margin-top:16px">
          <div>
            <div class="subhead">临床与规培经历</div>
            <p style="font-size:13px;color:#334155">${escapeHtml(profile.clinicalSummary)}</p>
          </div>
          <div>
            <div class="subhead">科研方法与核心证书</div>
            <p style="font-size:13px;color:#334155">${escapeHtml(profile.researchSummary)}</p>
            <p class="muted">证书：${escapeHtml(profile.certificates.join(' · '))}</p>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script>
    (function () {
      var tabBtns = document.querySelectorAll('.tab-btn');
      var panels = document.querySelectorAll('.panel');
      tabBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var target = btn.getAttribute('data-view');
          tabBtns.forEach(function (b) { b.classList.remove('active'); });
          panels.forEach(function (p) { p.classList.remove('active'); });
          btn.classList.add('active');
          var el = document.getElementById('view-' + target);
          if (el) el.classList.add('active');
        });
      });

      var activeDiff = 'all';
      var segBtns = document.querySelectorAll('.seg-btn');
      var searchInput = document.getElementById('searchInput');
      var trackSelect = document.getElementById('trackSelect');
      var regionSelect = document.getElementById('regionSelect');
      var cards = document.querySelectorAll('.item-card');

      function applyFilters() {
        var q = (searchInput.value || '').trim().toLowerCase();
        var tr = trackSelect.value;
        var rg = regionSelect.value;
        cards.forEach(function (card) {
          var cDiff = card.getAttribute('data-diff');
          var cTrack = card.getAttribute('data-track');
          var cRegion = card.getAttribute('data-region');
          var cSearch = card.getAttribute('data-search') || '';
          var ok = true;
          if (activeDiff !== 'all' && cDiff !== activeDiff) ok = false;
          if (tr !== 'all' && cTrack !== tr && cTrack !== 'both') ok = false;
          if (rg !== 'all' && cRegion !== rg) ok = false;
          if (q && cSearch.indexOf(q) === -1) ok = false;
          card.style.display = ok ? '' : 'none';
        });
      }

      segBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          activeDiff = btn.getAttribute('data-diff') || 'all';
          segBtns.forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          applyFilters();
        });
      });
      searchInput.addEventListener('input', applyFilters);
      trackSelect.addEventListener('change', applyFilters);
      regionSelect.addEventListener('change', applyFilters);

      var apiBase = ${JSON.stringify(safeApiBase)};
      function esc(str) {
        return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
      }
      function diffText(st) {
        if (st === 'updated') return '变更/异动';
        if (st === 'new') return '今日新增';
        if (st === 'still_open') return '未截止延续';
        return '已截止';
      }
      function trackText(tr) {
        if (tr === 'tcm_physician') return '针灸推拿医师';
        if (tr === 'medical_cra') return '医学事务 / CRA';
        return '双赛道均匹配';
      }
      function renderLiveState(state) {
        if (!state || !state.briefings || !state.briefings.length) return;
        var b = state.briefings[0];
        var active = (b.items || []).filter(function (i) { return i.diffStatus !== 'closed'; });
        document.getElementById('kpiTotal').textContent = String(b.stats.totalMatched);
        document.getElementById('kpiNew').textContent = '+' + String(b.stats.newCount);
        document.getElementById('kpiUpdated').textContent = String(b.stats.updatedCount);
        document.getElementById('kpiOpen').textContent = String(b.stats.stillOpenCount);
        document.getElementById('headerMeta').textContent =
          '简报日期 ' + b.briefingDate + ' · 基准 ' + (b.baselineDate || '首次') + ' · 每日设定 ' + state.schedule.triggerTime + ' · 仅采信官方一手渠道';
        var html = active.map(function (item) {
          var cls = item.diffStatus === 'updated' ? 'status-warn' : (item.diffStatus === 'new' ? 'status-teal' : 'status-muted');
          var alertHtml = (item.hasAnomaly || item.diffStatus === 'updated')
            ? '<div class="alert-box">' + esc(item.anomalyDetail || item.diffNote || '') + '</div>'
            : '';
          var reasons = (item.matchReasons || []).map(function (r) { return '<li>' + esc(r) + '</li>'; }).join('');
          var msList = (item.milestones || []).map(function (m) {
            return '<li><span class="ms-label">' + esc(m.label) + '</span> <span class="mono">' + esc(m.dateRange) + '</span></li>';
          }).join('');
          var posRows = (item.matchedPositions || []).map(function (p) {
            return '<tr><td><strong>' + esc(p.positionName) + '</strong><div class="muted">' + esc(p.department) + '</div></td><td class="mono num">' + p.headcount + '</td><td>' + esc(p.degreeReq) + '<div class="muted">' + esc(p.majorReq) + '</div></td><td>' + esc(p.examFormat) + '</td></tr>';
          }).join('');
          var searchBlob = [item.title, item.employerName, item.sourceName, item.region].concat(item.matchReasons || []).join(' ').toLowerCase();
          return '<article class="card item-card" data-diff="' + esc(item.diffStatus) + '" data-track="' + esc(item.matchedTrack) + '" data-region="' + esc(item.region) + '" data-search="' + esc(searchBlob) + '">' +
            '<div class="meta-line"><span class="' + cls + '">' + diffText(item.diffStatus) + '</span><span>·</span><span>' + esc(item.region) + '</span><span>·</span><span>' + trackText(item.matchedTrack) + '</span><span>·</span><span class="mono">发布日期 ' + esc(item.publishDate) + '</span><span>·</span><span class="mono strong">报名截止 ' + esc(item.deadlineDate) + '</span></div>' +
            '<h3>' + esc(item.title) + '</h3>' +
            '<div class="source-line"><span class="muted">官方来源：</span><span>' + esc(item.sourceName) + '</span><a href="' + esc(item.sourceUrl) + '" target="_blank" rel="noopener noreferrer" class="mono">' + esc(item.sourceUrl) + ' ↗</a></div>' +
            alertHtml +
            '<div class="two-col"><div><div class="subhead">画像匹配原因</div><ul class="bullet-list">' + reasons + '</ul></div><div><div class="subhead">关键节点摘要</div><ul class="bullet-list">' + msList + '</ul></div></div>' +
            '<details class="pos-details"><summary>展开匹配职位表明细（' + (item.matchedPositions || []).length + ' 个岗位）</summary><table><thead><tr><th>岗位 / 科室</th><th class="num">人数</th><th>学历与专业</th><th>考核形式</th></tr></thead><tbody>' + posRows + '</tbody></table></details>' +
            '</article>';
        }).join('');
        document.getElementById('itemsContainer').innerHTML = html;
        cards = document.querySelectorAll('.item-card');
        applyFilters();
        var statusBar = document.getElementById('syncStatusBar');
        if (statusBar) {
          statusBar.style.display = 'block';
          statusBar.textContent = '已同步最新简报（' + b.briefingDate + '）：' + (b.scanStatusMessage || '数据已是最新');
        }
      }

      if (apiBase) {
        fetch(apiBase + '/api/state')
          .then(function (r) { return r.ok ? r.json() : null; })
          .then(function (st) { if (st) renderLiveState(st); })
          .catch(function () {});

        var refreshBtn = document.getElementById('manualRefreshBtn');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', function () {
            refreshBtn.disabled = true;
            refreshBtn.textContent = '正在巡检官源...';
            fetch(apiBase + '/api/briefings/run', { method: 'POST' })
              .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
              .then(function (st) { renderLiveState(st); })
              .catch(function (err) {
                var statusBar = document.getElementById('syncStatusBar');
                if (statusBar) {
                  statusBar.style.display = 'block';
                  statusBar.textContent =
                    '同步失败（' +
                    err.message +
                    '）：后端地址（' +
                    apiBase +
                    '）可能处于休眠、未公开部署或受 AI Studio 登录保护拦截，本地离线网页无法跳过登录校验。请先完成公开部署并填入公开域名，或直接在手机浏览器打开已部署的在线工作台链接。';
                }
              })
              .finally(function () {
                refreshBtn.disabled = false;
                refreshBtn.textContent = '手动刷新最新数据';
              });
          });
        }
      }
    })();
  </script>
</body>
</html>`;
}
