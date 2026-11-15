import { AlertTriangle, Calendar, ExternalLink, X } from 'lucide-react';
import type { MilestoneStatus, RecruitmentItem } from '../shared/types';

interface DetailDrawerProps {
  item: RecruitmentItem | null;
  onClose: () => void;
}

const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, { text: string; className: string }> = {
  active: { text: '进行中', className: 'text-teal-700' },
  urgent: { text: '临近/急迫', className: 'text-amber-700 font-semibold' },
  delayed: { text: '时间延期/变更', className: 'text-red-700 font-semibold' },
  cancelled: { text: '已取消', className: 'text-red-700 font-semibold' },
  upcoming: { text: '待开始', className: 'text-slate-600' },
  completed: { text: '已结束', className: 'text-slate-400' },
};

export function DetailDrawer({ item, onClose }: DetailDrawerProps) {
  if (!item) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/35"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drawer-title"
    >
      <div className="fixed inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-2xl bg-white h-full overflow-y-auto border-l border-slate-200 flex flex-col">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs text-slate-500 flex flex-wrap items-center gap-2">
              <span>{item.employerName}</span>
              <span aria-hidden="true">·</span>
              <span>{item.region}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono-tabular">发布于 {item.publishDate}</span>
            </div>
            <h2
              id="drawer-title"
              className="mt-1 text-lg font-semibold text-slate-900 leading-snug"
            >
              {item.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭公告详情"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Official Source Citation */}
          <section className="border border-slate-200 rounded-lg p-4 bg-slate-50/70 space-y-2">
            <div className="text-xs font-semibold text-slate-700">官方一手来源依据</div>
            <div className="text-sm text-slate-800 space-y-1">
              <div>
                <span className="text-slate-500">原文标题：</span>
                <span>{item.title}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-slate-500">官方来源：</span>
                <span>{item.sourceName}</span>
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-teal-700 hover:text-teal-900 hover:underline font-mono-tabular break-all"
                >
                  <span>{item.sourceUrl}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                </a>
              </div>
              <div>
                <span className="text-slate-500">发布日期：</span>
                <span className="font-mono-tabular">{item.publishDate}</span>
                <span className="mx-2 text-slate-300">|</span>
                <span className="text-slate-500">报名截止：</span>
                <span className="font-mono-tabular font-medium text-slate-900">
                  {item.deadlineDate}
                </span>
              </div>
            </div>
          </section>

          {/* Anomaly / Diff Note */}
          {(item.hasAnomaly || item.diffNote) && (
            <section className="border border-amber-300 bg-amber-50/60 rounded-lg p-4 space-y-1.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                <span>增量对比与异动提示</span>
              </div>
              {item.anomalyDetail && (
                <p className="text-sm text-amber-900">{item.anomalyDetail}</p>
              )}
              {item.diffNote && (
                <p className="text-xs text-amber-800">{item.diffNote}</p>
              )}
            </section>
          )}

          {/* Profile Match Reasons */}
          <section className="space-y-2.5">
            <h3 className="text-sm font-semibold text-slate-900">
              与个人画像匹配原因
            </h3>
            <ul className="space-y-1.5 text-sm text-slate-700 list-disc pl-5">
              {item.matchReasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </section>

          {/* Matched Positions Table */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              匹配职位表明细（共 {item.matchedPositions.length} 个岗位）
            </h3>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left border-collapse text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="py-2.5 px-3 font-medium">岗位名称 / 科室</th>
                    <th className="py-2.5 px-3 font-medium text-right">人数</th>
                    <th className="py-2.5 px-3 font-medium">学历与专业要求</th>
                    <th className="py-2.5 px-3 font-medium">考核形式</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {item.matchedPositions.map((pos, idx) => (
                    <tr key={idx} className="align-top">
                      <td className="py-3 px-3">
                        <div className="font-medium text-slate-900">{pos.positionName}</div>
                        <div className="text-xs text-slate-500 mt-0.5">{pos.department}</div>
                        {pos.notes && (
                          <div className="text-xs text-teal-800 mt-1">{pos.notes}</div>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono-tabular text-slate-900">
                        {pos.headcount}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-700 space-y-0.5">
                        <div>{pos.degreeReq}</div>
                        <div className="text-slate-500">{pos.majorReq}</div>
                        <div className="text-slate-500">
                          {pos.freshGradOnly ? '限应届毕业生' : '应届/往届均可'}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-700">{pos.examFormat}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Key Milestones */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <Calendar className="w-4 h-4 text-slate-500" aria-hidden="true" />
              <span>关键招聘节点全流程</span>
            </h3>
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
              {item.milestones.map((ms) => {
                const statusInfo = MILESTONE_STATUS_LABEL[ms.status];
                return (
                  <div
                    key={ms.id}
                    className="px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                  >
                    <div>
                      <div className="text-sm font-medium text-slate-900">{ms.label}</div>
                      {ms.note && <div className="text-xs text-slate-500 mt-0.5">{ms.note}</div>}
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="font-mono-tabular text-slate-700">{ms.dateRange}</span>
                      <span aria-hidden="true" className="text-slate-300">
                        ·
                      </span>
                      <span className={statusInfo.className}>{statusInfo.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
