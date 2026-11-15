import {
  Building2,
  CalendarClock,
  Clock,
  Download,
  FileText,
  Newspaper,
  UserCheck,
} from 'lucide-react';
import type { CandidateProfile, ScheduleConfig } from '../shared/types';

export type ActiveTab = 'briefing' | 'milestones' | 'sources' | 'profile' | 'schedule' | 'export';

interface SidebarNavProps {
  activeTab: ActiveTab;
  onSelectTab: (tab: ActiveTab) => void;
  profile: CandidateProfile;
  schedule: ScheduleConfig;
  anomalyCount: number;
  sourceCount: number;
}

const NAV_ITEMS: Array<{
  id: ActiveTab;
  label: string;
  icon: typeof Newspaper;
}> = [
  { id: 'briefing', label: '每日简报', icon: Newspaper },
  { id: 'milestones', label: '关键节点', icon: CalendarClock },
  { id: 'sources', label: '官源目录', icon: Building2 },
  { id: 'profile', label: '个人画像', icon: UserCheck },
  { id: 'schedule', label: '调度设置', icon: Clock },
  { id: 'export', label: '导出工作台', icon: Download },
];

export function SidebarNav({
  activeTab,
  onSelectTab,
  profile,
  schedule,
  anomalyCount,
  sourceCount,
}: SidebarNavProps) {
  return (
    <aside className="w-full lg:w-[260px] lg:shrink-0 bg-white border-b lg:border-b-0 lg:border-r border-slate-200 flex flex-col justify-between">
      <div>
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap">
            本草职哨
          </div>
          <p className="mt-1 text-xs text-slate-500">
            官方一手招聘汇总与岗位匹配台
          </p>
        </div>

        <nav aria-label="主导航" className="p-3 flex lg:flex-col gap-1 overflow-x-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 ${
                  isActive
                    ? 'bg-teal-50 text-teal-900'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-teal-700' : 'text-slate-400'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                </span>
                {item.id === 'milestones' && anomalyCount > 0 && (
                  <span className="text-xs font-mono-tabular font-semibold text-amber-700">
                    {anomalyCount} 异动
                  </span>
                )}
                {item.id === 'sources' && (
                  <span className="text-xs font-mono-tabular text-slate-400">
                    {sourceCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="hidden lg:block p-5 border-t border-slate-200 space-y-3">
        <div>
          <div className="text-xs font-semibold text-slate-900">
            {profile.name} · {profile.degree}
          </div>
          <div className="mt-0.5 text-xs text-slate-500">
            {profile.major} · {profile.graduationTime}毕业
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
          <div className="flex items-center justify-between">
            <span>意向地区</span>
            <span className="font-medium text-slate-800">济南 / 青岛</span>
          </div>
          <div className="flex items-center justify-between">
            <span>自动执行</span>
            <span className="font-mono-tabular font-medium text-slate-800">
              {schedule.enabled ? `每日 ${schedule.triggerTime}` : '已暂停'}
            </span>
          </div>
        </div>

        <div className="pt-2 flex flex-col gap-1.5">
          {profile.tracks.map((track) => (
            <a
              key={track.id}
              href={track.pdfPath}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-teal-800 hover:text-teal-950 hover:underline truncate"
            >
              <FileText className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{track.pdfFileName}</span>
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}
