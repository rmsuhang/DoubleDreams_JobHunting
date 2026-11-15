import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  ChevronRight,
  Search,
} from 'lucide-react';
import type {
  BriefingSnapshot,
  DiffStatus,
  RecruitmentItem,
  ResumeTrack,
} from '../shared/types';

interface BriefingViewProps {
  briefing: BriefingSnapshot;
  onSelectItem: (item: RecruitmentItem) => void;
  isScanning: boolean;
}

type DiffFilter = 'all' | 'new' | 'updated' | 'still_open';
type RegionFilter = 'all' | '济南' | '青岛' | '山东省级/国家';
type TrackFilter = 'all' | 'tcm_physician' | 'medical_cra';

const DIFF_STATUS_META: Record<DiffStatus, { label: string; textClass: string }> = {
  updated: { label: '变更/异动', textClass: 'text-amber-700 font-semibold' },
  new: { label: '今日新增', textClass: 'text-teal-700 font-semibold' },
  still_open: { label: '未截止延续', textClass: 'text-slate-600 font-medium' },
  closed: { label: '已截止', textClass: 'text-slate-400' },
};

const ANNOUNCEMENT_TYPE_LABEL: Record<RecruitmentItem['announcementType'], string> = {
  new_announcement: '新发布招录公告',
  position_table: '职位表公告',
  supplement_correction: '补充 / 更正公告',
};

const TRACK_LABEL: Record<ResumeTrack, string> = {
  tcm_physician: '针灸推拿医师',
  medical_cra: '医学事务 / CRA',
  both: '双赛道均匹配',
};

export function BriefingView({
  briefing,
  onSelectItem,
  isScanning,
}: BriefingViewProps) {
  const [diffFilter, setDiffFilter] = useState<DiffFilter>('all');
  const [trackFilter, setTrackFilter] = useState<TrackFilter>('all');
  const [regionFilter, setRegionFilter] = useState<RegionFilter>('all');
  const [keyword, setKeyword] = useState('');

  const filteredItems = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return briefing.items.filter((item) => {
      if (item.diffStatus === 'closed') return false;
      if (diffFilter !== 'all' && item.diffStatus !== diffFilter) return false;
      if (
        trackFilter !== 'all' &&
        item.matchedTrack !== trackFilter &&
        item.matchedTrack !== 'both'
      ) {
        return false;
      }
      if (regionFilter !== 'all' && item.region !== regionFilter) return false;
      if (q) {
        const hay = [
          item.title,
          item.employerName,
          item.sourceName,
          ...item.matchReasons,
          ...item.matchedPositions.map((p) => `${p.positionName} ${p.department} ${p.majorReq}`),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [briefing.items, diffFilter, trackFilter, regionFilter, keyword]);

  return (
    <div className="space-y-6">
      {/* KPI Strip (Full-width structured strip with subtle dividers, single elevation) */}
      <section
        aria-label="简报增量概览"
        className="bg-white border border-slate-200 rounded-lg grid grid-cols-2 lg:grid-cols-4"
      >
        <div className="p-5 border-b border-r border-slate-200 lg:border-b-0">
          <div className="text-xs text-slate-500">当前有效匹配公告</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-tabular text-slate-900">
            {briefing.stats.totalMatched}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            针灸推拿 {briefing.stats.tcmPhysicianCount} · 医学CRA {briefing.stats.medicalCraCount}
          </div>
        </div>

        <div className="p-5 border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="text-xs text-slate-500">较上次基准新增</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-tabular text-teal-700">
            +{briefing.stats.newCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            基准日期 {briefing.baselineDate ?? '首次基线'}
          </div>
        </div>

        <div className="p-5 border-r border-slate-200">
          <div className="text-xs text-slate-500">变更 / 异动 / 补充公告</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-tabular text-amber-700">
            {briefing.stats.updatedCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            含延期或节点调整 {briefing.stats.anomalyCount} 项
          </div>
        </div>

        <div className="p-5">
          <div className="text-xs text-slate-500">未截止延续岗位</div>
          <div className="mt-1.5 text-2xl font-bold font-mono-tabular text-slate-900">
            {briefing.stats.stillOpenCount}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            巡检官源 {briefing.sourcesCheckedCount} 个
          </div>
        </div>
      </section>

      {/* Official Source Policy & Daily Checklist Summary */}
      <section className="bg-white border border-slate-200 rounded-lg px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div className="text-sm text-slate-700 space-y-1">
          <div className="font-medium text-slate-900">
            每日检查清单执行状态 · {briefing.briefingDate}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {briefing.scanStatusMessage}
          </p>
        </div>
        <div className="text-xs text-slate-500 whitespace-nowrap shrink-0 font-mono-tabular">
          官方一手直采 · 拒绝聚合站转链
        </div>
      </section>

      {/* Filters & Controls */}
      <section
        aria-label="简报筛选控制栏"
        className="bg-white border border-slate-200 rounded-lg p-4 space-y-3"
      >
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          {/* Incremental Segmented Tabs */}
          <div
            role="group"
            aria-label="增量状态筛选"
            className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-lg max-w-full overflow-x-auto"
          >
            {(
              [
                { id: 'all', label: `全部有效 (${briefing.stats.totalMatched})` },
                { id: 'new', label: `今日新增 (${briefing.stats.newCount})` },
                { id: 'updated', label: `变更与异动 (${briefing.stats.updatedCount})` },
                { id: 'still_open', label: `未截止延续 (${briefing.stats.stillOpenCount})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setDiffFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                  diffFilter === tab.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search + Track + Region */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-[220px] flex-1 sm:flex-initial">
              <Search
                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                aria-label="按单位、岗位或关键词检索"
                placeholder="检索医院、岗位或关键字..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-700"
              />
            </div>

            <select
              aria-label="按简历赛道筛选"
              value={trackFilter}
              onChange={(e) => setTrackFilter(e.target.value as TrackFilter)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-teal-700"
            >
              <option value="all">全部简历赛道</option>
              <option value="tcm_physician">方向一：针灸推拿医师</option>
              <option value="medical_cra">方向二：医学事务 / CRA</option>
            </select>

            <select
              aria-label="按重点地区筛选"
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value as RegionFilter)}
              className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-teal-700"
            >
              <option value="all">全部重点地区</option>
              <option value="济南">山东省济南市</option>
              <option value="青岛">山东省青岛市</option>
              <option value="山东省级/国家">山东省级 / 国家统招</option>
            </select>
          </div>
        </div>
      </section>

      {/* Loading Skeleton when live scan is running */}
      {isScanning && (
        <div
          aria-live="polite"
          className="bg-white border border-teal-200 rounded-lg p-5 space-y-2"
        >
          <div className="text-sm font-medium text-teal-900">
            正在核验官方一手渠道（人社/卫健网、济南青岛医院官网、国企药企校招）并执行增量比对...
          </div>
          <div className="text-xs text-slate-500">
            系统正依次检测官方站点连通性，过滤非官方聚合站并比对上期简报基准。
          </div>
        </div>
      )}

      {/* Briefing List */}
      {filteredItems.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-3">
          <div className="text-sm font-medium text-slate-900">
            当前筛选条件下暂无匹配的招聘公告
          </div>
          <p className="text-xs text-slate-500">
            可尝试重置筛选条件，或点击右上角“立即汇总今日公告”发起新一轮官方渠道检索。
          </p>
          <button
            type="button"
            onClick={() => {
              setDiffFilter('all');
              setTrackFilter('all');
              setRegionFilter('all');
              setKeyword('');
            }}
            className="px-4 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            重置全部筛选
          </button>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-200">
          {filteredItems.map((item) => {
            const diffMeta = DIFF_STATUS_META[item.diffStatus];
            return (
              <article key={item.id} className="p-5 hover:bg-slate-50/60 transition-colors">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                  <div className="space-y-2.5 min-w-0 flex-1">
                    {/* Clean unboxed metadata row */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                      <span className={diffMeta.textClass}>{diffMeta.label}</span>
                      <span aria-hidden="true">·</span>
                      <span>{ANNOUNCEMENT_TYPE_LABEL[item.announcementType]}</span>
                      <span aria-hidden="true">·</span>
                      <span>{item.region}</span>
                      <span aria-hidden="true">·</span>
                      <span className="text-slate-700 font-medium">
                        {TRACK_LABEL[item.matchedTrack]}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular">发布日期 {item.publishDate}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono-tabular text-slate-800 font-medium">
                        报名截止 {item.deadlineDate}
                      </span>
                    </div>

                    {/* Original Title */}
                    <h3 className="text-base font-semibold text-slate-900 leading-snug">
                      {item.title}
                    </h3>

                    {/* Mandatory Official Source Link */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-slate-500">官方来源：</span>
                      <span className="text-slate-700">{item.sourceName}</span>
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 hover:underline font-mono-tabular"
                      >
                        <span>{item.sourceUrl}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      </a>
                    </div>

                    {/* Anomaly or Incremental Diff Notice */}
                    {(item.hasAnomaly || item.diffStatus === 'updated') && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
                        <AlertTriangle
                          className="w-4 h-4 text-amber-700 shrink-0 mt-0.5"
                          aria-hidden="true"
                        />
                        <span>{item.anomalyDetail || item.diffNote}</span>
                      </div>
                    )}

                    {/* Match Reasons & Positions Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-slate-700">画像匹配原因</div>
                        <ul className="space-y-1 text-xs text-slate-600">
                          {item.matchReasons.slice(0, 3).map((reason, idx) => (
                            <li key={idx} className="leading-relaxed">
                              • {reason}
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="space-y-1">
                        <div className="text-xs font-medium text-slate-700">
                          匹配岗位与关键节点
                        </div>
                        <div className="space-y-1 text-xs text-slate-600">
                          {item.matchedPositions.map((pos, idx) => (
                            <div key={idx}>
                              <span className="font-medium text-slate-800">
                                {pos.positionName}
                              </span>
                              <span className="mx-1.5 text-slate-300">|</span>
                              <span className="font-mono-tabular">{pos.headcount}名</span>
                              <span className="mx-1.5 text-slate-300">|</span>
                              <span>{pos.examFormat}</span>
                            </div>
                          ))}
                          {item.milestones[0] && (
                            <div className="text-slate-500 pt-0.5 font-mono-tabular">
                              当前节点：{item.milestones[0].label}（{item.milestones[0].dateRange}）
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Action */}
                  <div className="flex lg:flex-col items-center lg:items-end justify-between gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectItem(item)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
                    >
                      <span>查看职位表与节点</span>
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Grounding Links if live Gemini Search returned verified official references */}
      {briefing.groundingLinks.length > 0 && (
        <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-2.5">
          <h3 className="text-sm font-semibold text-slate-900">
            本次实时检索核验的官方网页索引
          </h3>
          <ul className="space-y-1.5 text-xs">
            {briefing.groundingLinks.map((link, idx) => (
              <li key={idx}>
                <a
                  href={link.uri}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-teal-700 hover:underline"
                >
                  <span>{link.title}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
