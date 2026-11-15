import { useState, type FormEvent } from 'react';
import { ArrowUpRight, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import type { OfficialSource, SourceTier } from '../shared/types';

interface SourcesViewProps {
  sources: OfficialSource[];
  onAddSource: (payload: {
    name: string;
    url: string;
    tier: SourceTier;
    region: OfficialSource['region'];
    channelType: OfficialSource['channelType'];
  }) => Promise<void>;
  onToggleSource: (id: string, enabled: boolean) => Promise<void>;
  onDeleteSource: (id: string) => Promise<void>;
}

const TIER_ORDER: Array<{ tier: SourceTier; title: string; desc: string }> = [
  {
    tier: 'national_gov',
    title: '第一优先级 · 国家级官方门户',
    desc: '国家公务员局官网及中央机关公开遴选/招考统一渠道',
  },
  {
    tier: 'provincial_municipal_hrss',
    title: '第二优先级 · 省/市人事考试网与卫健人才网',
    desc: '山东省人社厅、济南卫生健康人才网（jnhhr.cn）、济南/青岛人社及卫健委官网',
  },
  {
    tier: 'hospital_official',
    title: '第三优先级 · 公立医院官方网站',
    desc: '广安门医院济南医院、济南市第一/四/五/七/机关医院、山东省中医院、青岛海慈医院等',
  },
  {
    tier: 'soe_medical_enterprise',
    title: '第四优先级 · 国企医疗单位及药企/CRO官网与公众号',
    desc: '服务临床/医学事务双赛道：国企医疗机构、外企及国企药企官方校招频道',
  },
];

export function SourcesView({
  sources,
  onAddSource,
  onToggleSource,
  onDeleteSource,
}: SourcesViewProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [tier, setTier] = useState<SourceTier>('hospital_official');
  const [region, setRegion] = useState<OfficialSource['region']>('济南');
  const [channelType, setChannelType] = useState<OfficialSource['channelType']>('官网');
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim() || !url.trim()) {
      setFormError('请填写完整的官方机构名称与官网网址');
      return;
    }
    setSubmitting(true);
    try {
      await onAddSource({
        name: name.trim(),
        url: url.trim(),
        tier,
        region,
        channelType,
      });
      setName('');
      setUrl('');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : '添加失败');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Strict Official-Only Rule Banner */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-teal-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-slate-900">
              官方一手渠道白名单机制（唯一依据）
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed">
              系统仅从下列官方站点抓取与核验招录信息，自动屏蔽第三方商业招聘网站及培训机构转链，确保每条简报均可追溯至官方原文标题、链接与发布日期。
            </p>
          </div>
        </div>
        <div className="text-xs font-mono-tabular text-slate-600 whitespace-nowrap shrink-0">
          已启用 {sources.filter((s) => s.enabled).length} / {sources.length} 个官方源
        </div>
      </section>

      {/* Add Custom Official Source Form */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">
          新增官方一手监控渠道
        </h3>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-3 space-y-1">
            <label htmlFor="source-name" className="block text-xs font-medium text-slate-700">
              官方机构名称
            </label>
            <input
              id="source-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如：青岛大学附属医院官网"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="md:col-span-4 space-y-1">
            <label htmlFor="source-url" className="block text-xs font-medium text-slate-700">
              官方网址（必须为 http/https 官网）
            </label>
            <input
              id="source-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.qdfy.cn/"
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 font-mono-tabular focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="md:col-span-2 space-y-1">
            <label htmlFor="source-tier" className="block text-xs font-medium text-slate-700">
              渠道层级
            </label>
            <select
              id="source-tier"
              value={tier}
              onChange={(e) => setTier(e.target.value as SourceTier)}
              className="w-full px-2.5 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-teal-700"
            >
              <option value="hospital_official">医院官网</option>
              <option value="provincial_municipal_hrss">人社/卫健人事网</option>
              <option value="soe_medical_enterprise">国企/外企官网及公众号</option>
              <option value="national_gov">国家级门户</option>
            </select>
          </div>

          <div className="md:col-span-1 space-y-1">
            <label htmlFor="source-region" className="block text-xs font-medium text-slate-700">
              地区
            </label>
            <select
              id="source-region"
              value={region}
              onChange={(e) => setRegion(e.target.value as OfficialSource['region'])}
              className="w-full px-2 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:border-teal-700"
            >
              <option value="济南">济南</option>
              <option value="青岛">青岛</option>
              <option value="山东省级">山东省级</option>
              <option value="国企/外企">企业</option>
              <option value="全国">全国</option>
            </select>
          </div>

          <div className="md:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{submitting ? '添加中...' : '添加到监控'}</span>
            </button>
          </div>
        </form>
        {formError && (
          <p role="alert" className="text-xs text-red-700">
            {formError}
          </p>
        )}
      </section>

      {/* Tiered Official Source Lists */}
      <div className="space-y-5">
        {TIER_ORDER.map((group) => {
          const groupSources = sources.filter((s) => s.tier === group.tier);
          return (
            <section
              key={group.tier}
              className="bg-white border border-slate-200 rounded-lg overflow-hidden"
            >
              <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{group.title}</h3>
                  <p className="text-xs text-slate-500">{group.desc}</p>
                </div>
                <span className="text-xs font-mono-tabular text-slate-500">
                  {groupSources.length} 个渠道
                </span>
              </div>

              <div className="divide-y divide-slate-200">
                {groupSources.map((src) => {
                  const isCustom = src.id.startsWith('src-custom-');
                  return (
                    <div
                      key={src.id}
                      className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className="text-sm font-medium text-slate-900">
                            {src.name}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="text-xs text-slate-500">{src.region}</span>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="text-xs text-slate-500">{src.channelType}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          <a
                            href={src.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-teal-700 hover:underline font-mono-tabular"
                          >
                            <span>{src.url}</span>
                            <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
                          </a>
                          {src.lastCheckNote && (
                            <span className="text-slate-500">
                              最近巡检：{src.lastCheckNote}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={src.enabled}
                            onChange={(e) => onToggleSource(src.id, e.target.checked)}
                            className="w-4 h-4 accent-teal-700 rounded"
                          />
                          <span>{src.enabled ? '监控中' : '已停用'}</span>
                        </label>

                        {isCustom && (
                          <button
                            type="button"
                            onClick={() => onDeleteSource(src.id)}
                            aria-label={`删除 ${src.name}`}
                            className="p-1.5 text-slate-400 hover:text-red-700 rounded transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
