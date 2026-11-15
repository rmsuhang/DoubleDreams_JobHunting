import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { BriefingView } from './components/BriefingView';
import { DetailDrawer } from './components/DetailDrawer';
import { ExportView } from './components/ExportView';
import { MilestonesView } from './components/MilestonesView';
import { ProfileView } from './components/ProfileView';
import { ScheduleView } from './components/ScheduleView';
import { SidebarNav, type ActiveTab } from './components/SidebarNav';
import { SourcesView } from './components/SourcesView';
import type {
  AppDataState,
  CandidateProfile,
  OfficialSource,
  RecruitmentItem,
  SourceTier,
} from './shared/types';

const TAB_TITLES: Record<ActiveTab, string> = {
  briefing: '每日招聘汇总简报',
  milestones: '关键招聘节点与异动看板',
  sources: '官方一手渠道目录',
  profile: '求职者双简历画像',
  schedule: '定时执行调度与历史归档',
  export: '导出个人网页与工作台',
};

export default function App() {
  const [appState, setAppState] = useState<AppDataState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>('briefing');
  const [selectedBriefingId, setSelectedBriefingId] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<RecruitmentItem | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  async function fetchInitialState() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/state');
      if (!res.ok) throw new Error('无法读取本地简报服务状态');
      const data = (await res.json()) as AppDataState;
      setAppState(data);
      if (data.briefings[0]) {
        setSelectedBriefingId(data.briefings[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchInitialState();
  }, []);

  const currentBriefing = useMemo(() => {
    if (!appState || appState.briefings.length === 0) return null;
    return (
      appState.briefings.find((b) => b.id === selectedBriefingId) ??
      appState.briefings[0]
    );
  }, [appState, selectedBriefingId]);

  async function handleRunBriefingNow() {
    setIsScanning(true);
    setError(null);
    try {
      const res = await fetch('/api/briefings/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '执行汇总失败');
      const updated = data as AppDataState;
      setAppState(updated);
      if (updated.briefings[0]) {
        setSelectedBriefingId(updated.briefings[0].id);
      }
      setActiveTab('briefing');
    } catch (err) {
      setError(err instanceof Error ? err.message : '执行汇总失败');
    } finally {
      setIsScanning(false);
    }
  }

  async function handleAddSource(payload: {
    name: string;
    url: string;
    tier: SourceTier;
    region: OfficialSource['region'];
    channelType: OfficialSource['channelType'];
  }) {
    const res = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '添加官方渠道失败');
    }
    setAppState((prev) => (prev ? { ...prev, sources: data as OfficialSource[] } : prev));
  }

  async function handleToggleSource(id: string, enabled: boolean) {
    const res = await fetch(`/api/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) throw new Error('更新官方源状态失败');
    const updatedSources = (await res.json()) as OfficialSource[];
    setAppState((prev) => (prev ? { ...prev, sources: updatedSources } : prev));
  }

  async function handleDeleteSource(id: string) {
    const res = await fetch(`/api/sources/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('删除官方源失败');
    const updatedSources = (await res.json()) as OfficialSource[];
    setAppState((prev) => (prev ? { ...prev, sources: updatedSources } : prev));
  }

  async function handleUpdateProfile(patch: Partial<CandidateProfile>) {
    const res = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error('更新个人画像失败');
    const updatedProfile = (await res.json()) as CandidateProfile;
    setAppState((prev) => (prev ? { ...prev, profile: updatedProfile } : prev));
  }

  async function handleUpdateSchedule(payload: { triggerTime?: string; enabled?: boolean }) {
    const res = await fetch('/api/schedule', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '保存调度配置失败');
    setAppState((prev) => (prev ? { ...prev, schedule: data } : prev));
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-sm text-slate-600">正在加载每日招聘汇总工作台...</div>
      </div>
    );
  }

  if (!appState || !currentBriefing) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-lg p-6 max-w-md w-full space-y-3 text-center">
          <div className="text-sm font-semibold text-slate-900">工作台初始化失败</div>
          <p className="text-xs text-red-700">{error || '未读取到简报数据'}</p>
          <button
            type="button"
            onClick={() => void fetchInitialState()}
            className="px-4 py-2 text-xs font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        profile={appState.profile}
        schedule={appState.schedule}
        anomalyCount={currentBriefing.stats.anomalyCount}
        sourceCount={appState.sources.filter((s) => s.enabled).length}
      />

      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Zone 1 (Breadcrumb/Title) — Zone 2 (Clean Text Metadata) — Zone 3 (1 Primary CTA) */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex flex-wrap items-center justify-between gap-8">
          <h1 className="text-base font-semibold text-slate-900 whitespace-nowrap shrink-0">
            {TAB_TITLES[activeTab]}
          </h1>

          <div className="hidden md:flex items-center gap-2 text-xs text-slate-500 whitespace-nowrap">
            <span className="font-mono-tabular">简报期次 {currentBriefing.briefingDate}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-tabular">
              每日自动执行 {appState.schedule.enabled ? appState.schedule.triggerTime : '已暂停'}
            </span>
            <span aria-hidden="true">·</span>
            <span>仅采信官方一手渠道</span>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={() => void handleRunBriefingNow()}
              disabled={isScanning}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{isScanning ? '正在巡检官源...' : '立即汇总今日公告'}</span>
            </button>
          </div>
        </header>

        <main className="flex-1 p-6 max-w-[1280px] w-full mx-auto space-y-6">
          {error && (
            <div
              role="alert"
              className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-xs text-red-800"
            >
              {error}
            </div>
          )}

          {activeTab === 'briefing' && (
            <BriefingView
              briefing={currentBriefing}
              onSelectItem={setSelectedItem}
              isScanning={isScanning}
            />
          )}

          {activeTab === 'milestones' && (
            <MilestonesView
              briefing={currentBriefing}
              onSelectItem={setSelectedItem}
            />
          )}

          {activeTab === 'sources' && (
            <SourcesView
              sources={appState.sources}
              onAddSource={handleAddSource}
              onToggleSource={handleToggleSource}
              onDeleteSource={handleDeleteSource}
            />
          )}

          {activeTab === 'profile' && (
            <ProfileView
              profile={appState.profile}
              onUpdateProfile={handleUpdateProfile}
            />
          )}

          {activeTab === 'schedule' && (
            <ScheduleView
              schedule={appState.schedule}
              briefings={appState.briefings}
              selectedBriefingId={currentBriefing.id}
              onSelectBriefingId={(id) => {
                setSelectedBriefingId(id);
                setActiveTab('briefing');
              }}
              onUpdateSchedule={handleUpdateSchedule}
            />
          )}

          {activeTab === 'export' && (
            <ExportView
              appState={appState}
              currentBriefing={currentBriefing}
            />
          )}
        </main>
      </div>

      <DetailDrawer item={selectedItem} onClose={() => setSelectedItem(null)} />
    </div>
  );
}
