import { useState, type FormEvent } from 'react';
import { Check, Clock } from 'lucide-react';
import type { BriefingSnapshot, ScheduleConfig } from '../shared/types';

interface ScheduleViewProps {
  schedule: ScheduleConfig;
  briefings: BriefingSnapshot[];
  selectedBriefingId: string;
  onSelectBriefingId: (id: string) => void;
  onUpdateSchedule: (payload: { triggerTime?: string; enabled?: boolean }) => Promise<void>;
}

const PRESET_TIMES = ['07:30', '08:00', '08:30', '09:00', '12:00', '18:00'];

function formatIsoToShanghai(iso: string | null): string {
  if (!iso) return '尚未运行';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ScheduleView({
  schedule,
  briefings,
  selectedBriefingId,
  onSelectBriefingId,
  onUpdateSchedule,
}: ScheduleViewProps) {
  const [timeInput, setTimeInput] = useState(schedule.triggerTime);
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedMsg(null);
    setErrorMsg(null);
    try {
      await onUpdateSchedule({ triggerTime: timeInput, enabled });
      setSavedMsg(`每日自动执行时间已更新为 ${timeInput}（Asia/Shanghai）`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '保存调度设置失败');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Daily Schedule Config */}
      <section className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal-700" aria-hidden="true" />
              <span>每日自动汇总触发时间配置</span>
            </h2>
            <p className="text-xs text-slate-500">
              默认每天 08:00 自动执行官方渠道巡检，并以上次简报为基准生成增量对比简报，支持随时修改触发时刻。
            </p>
          </div>
          <span className="text-xs font-mono-tabular text-slate-600 shrink-0">
            时区：{schedule.timezone}
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div className="space-y-1.5">
              <label htmlFor="trigger-time" className="block text-xs font-medium text-slate-700">
                每日触发时间（24小时制）
              </label>
              <input
                id="trigger-time"
                type="time"
                value={timeInput}
                onChange={(e) => setTimeInput(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono-tabular bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
              />
            </div>

            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-700">自动任务开关</span>
              <label className="flex items-center gap-2.5 px-3 py-2 border border-slate-200 rounded-lg cursor-pointer select-none text-xs text-slate-800">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="w-4 h-4 accent-teal-700 rounded"
                />
                <span>{enabled ? '已开启每日定时自动汇总' : '已暂停定时任务（仅手动执行）'}</span>
              </label>
            </div>

            <div>
              <button
                type="submit"
                disabled={saving}
                className="w-full md:w-auto px-5 py-2.5 text-xs font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {saving ? '保存中...' : '保存调度设置'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">常用时段快捷选择：</span>
            {PRESET_TIMES.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setTimeInput(preset)}
                className={`px-2.5 py-1 rounded-md font-mono-tabular border transition-colors ${
                  timeInput === preset
                    ? 'border-teal-700 bg-teal-50 text-teal-900 font-medium'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </form>

        {savedMsg && (
          <div className="inline-flex items-center gap-1.5 text-xs text-teal-700">
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>{savedMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div role="alert" className="text-xs text-red-700">
            {errorMsg}
          </div>
        )}

        <div className="pt-4 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600">
          <div>
            最近一次执行：<span className="font-mono-tabular text-slate-900">{formatIsoToShanghai(schedule.lastRunAt)}</span>
          </div>
          <div>
            下次计划执行：<span className="font-mono-tabular text-slate-900">{schedule.enabled ? formatIsoToShanghai(schedule.nextRunAt) : '未启用'}</span>
          </div>
        </div>
      </section>

      {/* Historical Briefing Snapshots (Baseline Reference) */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              历史简报归档与增量对比基准
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              切换不同日期简报以回溯昨日基准职位表与历史异动记录
            </p>
          </div>
          <span className="text-xs font-mono-tabular text-slate-500">
            共 {briefings.length} 期
          </span>
        </div>

        <div className="divide-y divide-slate-200">
          {briefings.map((b) => {
            const isSelected = b.id === selectedBriefingId;
            return (
              <div
                key={b.id}
                className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 text-sm">
                    <span className="font-mono-tabular font-semibold text-slate-900">
                      {b.briefingDate}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-xs text-slate-600">
                      {b.triggerType === 'scheduled'
                        ? '定时自动执行'
                        : b.triggerType === 'manual'
                        ? '手动立即汇总'
                        : '初始对比基准'}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-xs font-mono-tabular text-slate-500">
                      {formatIsoToShanghai(b.generatedAt)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-600 font-mono-tabular">
                    有效 {b.stats.totalMatched} 条 · 新增 {b.stats.newCount} · 变更 {b.stats.updatedCount} · 延续 {b.stats.stillOpenCount}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectBriefingId(b.id)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'border-teal-700 bg-teal-50 text-teal-900'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {isSelected ? '当前正在查看' : '切换查看该期简报'}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
