import { useMemo, useState } from 'react';
import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import type {
  BriefingSnapshot,
  MilestoneNode,
  MilestoneStatus,
  RecruitmentItem,
} from '../shared/types';

interface MilestonesViewProps {
  briefing: BriefingSnapshot;
  onSelectItem: (item: RecruitmentItem) => void;
}

type NodeFilter = 'all' | 'anomaly' | 'active_urgent' | 'exam_interview';

interface FlattenedMilestone {
  key: string;
  item: RecruitmentItem;
  milestone: MilestoneNode;
}

const STATUS_DISPLAY: Record<MilestoneStatus, { label: string; className: string }> = {
  delayed: { label: '延期/时间变更', className: 'text-red-700 font-semibold' },
  cancelled: { label: '已取消', className: 'text-red-700 font-semibold' },
  urgent: { label: '临近提醒', className: 'text-amber-700 font-semibold' },
  active: { label: '正在进行', className: 'text-teal-700 font-semibold' },
  upcoming: { label: '待开始', className: 'text-slate-600' },
  completed: { label: '已结束', className: 'text-slate-400' },
};

const NODE_TYPE_LABEL: Record<MilestoneNode['type'], string> = {
  campus_talk: '校招日程/双选',
  registration: '网上报名',
  qualification_review: '资格审查',
  payment: '考务缴费',
  admit_card: '准考证打印',
  written_exam: '笔试',
  interview: '面试/实操',
  supplement: '补充/更正公告',
};

export function MilestonesView({ briefing, onSelectItem }: MilestonesViewProps) {
  const [filter, setFilter] = useState<NodeFilter>('all');

  const allNodes = useMemo<FlattenedMilestone[]>(() => {
    const rows: FlattenedMilestone[] = [];
    for (const item of briefing.items) {
      if (item.diffStatus === 'closed') continue;
      for (const ms of item.milestones) {
        rows.push({
          key: `${item.id}-${ms.id}`,
          item,
          milestone: ms,
        });
      }
    }
    return rows;
  }, [briefing.items]);

  const filteredNodes = useMemo(() => {
    return allNodes.filter(({ item, milestone }) => {
      if (filter === 'anomaly') {
        return (
          item.hasAnomaly ||
          milestone.status === 'delayed' ||
          milestone.status === 'cancelled' ||
          milestone.type === 'supplement'
        );
      }
      if (filter === 'active_urgent') {
        return milestone.status === 'active' || milestone.status === 'urgent';
      }
      if (filter === 'exam_interview') {
        return (
          milestone.type === 'admit_card' ||
          milestone.type === 'written_exam' ||
          milestone.type === 'interview'
        );
      }
      return true;
    });
  }, [allNodes, filter]);

  const anomalyItems = briefing.items.filter(
    (item) => item.diffStatus !== 'closed' && item.hasAnomaly
  );

  return (
    <div className="space-y-6">
      {/* Anomaly Alert Summary if any */}
      {anomalyItems.length > 0 && (
        <section className="bg-amber-50/70 border border-amber-200 rounded-lg p-5 space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-950">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
            <span>时间变更 / 延期 / 取消异动监测（{anomalyItems.length} 项）</span>
          </div>
          <div className="divide-y divide-amber-200/70">
            {anomalyItems.map((item) => (
              <div
                key={item.id}
                className="py-2.5 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-slate-900">{item.title}</div>
                  <div className="text-xs text-amber-900">{item.anomalyDetail}</div>
                  <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
                    <span>{item.sourceName}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-tabular">发布日期 {item.publishDate}</span>
                    <span aria-hidden="true">·</span>
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-teal-700 hover:underline inline-flex items-center gap-0.5"
                    >
                      <span>官方原文</span>
                      <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                    </a>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectItem(item)}
                  className="px-3 py-1.5 text-xs font-medium text-amber-950 bg-white border border-amber-300 rounded-md hover:bg-amber-50 transition-colors whitespace-nowrap shrink-0 self-start sm:self-center"
                >
                  查看调整后日程
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Segmented Node Filter */}
      <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div
          role="group"
          aria-label="关键节点类型筛选"
          className="inline-flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg w-fit"
        >
          {(
            [
              { id: 'all', label: `全部节点 (${allNodes.length})` },
              { id: 'active_urgent', label: '当前进行/临近' },
              { id: 'anomaly', label: '延期与变更异动' },
              { id: 'exam_interview', label: '准考证/笔试/面试' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                filter === tab.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-500">
          涵盖：校招日程、报名、资格审查、缴费、准考证打印、笔试、面试及异动
        </div>
      </div>

      {/* High-density Milestone Data Grid */}
      <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm min-w-[780px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
            <tr>
              <th className="py-3 px-4 font-medium">节点类型</th>
              <th className="py-3 px-4 font-medium">节点事项与说明</th>
              <th className="py-3 px-4 font-medium">时间窗口</th>
              <th className="py-3 px-4 font-medium">状态</th>
              <th className="py-3 px-4 font-medium">所属招录公告（含官方链接/日期）</th>
              <th className="py-3 px-4 font-medium text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {filteredNodes.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 px-4 text-center text-xs text-slate-500">
                  当前暂无真实招聘节点数据（已禁用示例假数据）。运行官源检索并命中公告后，将在此集中展示报名、资格审查、准考证、笔试与面试时间轴。
                </td>
              </tr>
            ) : (
              filteredNodes.map(({ key, item, milestone }) => {
                const st = STATUS_DISPLAY[milestone.status];
                return (
                  <tr key={key} className="hover:bg-slate-50/70 transition-colors align-top">
                    <td className="py-3.5 px-4 text-xs text-slate-600 whitespace-nowrap">
                      {NODE_TYPE_LABEL[milestone.type]}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-medium text-slate-900">{milestone.label}</div>
                      {milestone.note && (
                        <div className="text-xs text-slate-500 mt-0.5">{milestone.note}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 font-mono-tabular text-xs text-slate-800 whitespace-nowrap">
                      {milestone.dateRange}
                    </td>
                    <td className={`py-3.5 px-4 text-xs whitespace-nowrap ${st.className}`}>
                      {st.label}
                    </td>
                    <td className="py-3.5 px-4 text-xs space-y-1">
                      <div className="font-medium text-slate-900">{item.employerName}</div>
                      <div className="text-slate-600 line-clamp-1">{item.title}</div>
                      <div className="text-slate-500 flex items-center gap-2">
                        <span className="font-mono-tabular">发布 {item.publishDate}</span>
                        <span aria-hidden="true">·</span>
                        <a
                          href={item.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-teal-700 hover:underline inline-flex items-center gap-0.5"
                        >
                          <span>官方入口</span>
                          <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                        </a>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onSelectItem(item)}
                        className="text-xs font-medium text-teal-700 hover:text-teal-900 hover:underline"
                      >
                        详情
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
