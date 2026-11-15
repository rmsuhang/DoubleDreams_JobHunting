import { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  FileText,
  RefreshCw,
} from 'lucide-react';
import { generateBriefingMarkdown } from '../shared/exportHtml';
import type { AppDataState, BriefingSnapshot } from '../shared/types';

interface ExportViewProps {
  appState: AppDataState;
  currentBriefing: BriefingSnapshot;
}

export function ExportView({ appState, currentBriefing }: ExportViewProps) {
  const [copiedMd, setCopiedMd] = useState(false);
  const [copiedCron, setCopiedCron] = useState(false);
  const [apiBaseUrl, setApiBaseUrl] = useState(() =>
    typeof window !== 'undefined' ? window.location.origin : ''
  );

  const markdownPreview = useMemo(
    () => generateBriefingMarkdown(appState, currentBriefing.id),
    [appState, currentBriefing.id]
  );

  const apiParam = apiBaseUrl.trim()
    ? `&apiBaseUrl=${encodeURIComponent(apiBaseUrl.trim())}`
    : '';
  const htmlPreviewUrl = `/api/export/html?briefingId=${encodeURIComponent(currentBriefing.id)}${apiParam}`;
  const htmlDownloadUrl = `${htmlPreviewUrl}&download=1`;
  const mdDownloadUrl = `/api/export/markdown?briefingId=${encodeURIComponent(currentBriefing.id)}&download=1`;
  const jsonDownloadUrl = `/api/export/json`;
  const cronUrl = `${apiBaseUrl.trim().replace(/\/+$/, '') || 'https://你的域名'}/api/cron/run`;

  async function copyText(text: string, onSuccess: () => void) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    onSuccess();
  }

  return (
    <div className="space-y-6">
      {/* Live Sync Config Banner */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-teal-700" aria-hidden="true" />
              <span>独立个人网页实时同步配置（支持打开自动同步 + 手动点按钮刷新）</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              填写后端服务地址后，导出的独立 `.html` 网页内将内置「手动刷新最新数据」按钮，并在打开网页时自动拉取最新简报。
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="export-api-base" className="block text-xs font-medium text-slate-700">
              后端同步地址（默认当前服务地址，部署后自动指向您的公网域名）
            </label>
            <input
              id="export-api-base"
              type="url"
              value={apiBaseUrl}
              onChange={(e) => setApiBaseUrl(e.target.value)}
              placeholder="https://your-app.run.app"
              className="w-full px-3 py-2 text-xs font-mono-tabular bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
            />
            {apiBaseUrl.includes('ais-dev-') && (
              <p className="text-xs text-amber-700">
                提示：当前为 AI Studio 内部预览域名（ais-dev），受 Google 登录保护，导出后在手机本地打开时无法跨域直连刷新。请先部署为公开服务地址并填入公开域名，或直接使用 GitHub Pages 方案。
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="text-xs font-medium text-slate-700">
              每日 08:00 自动刷新触发接口（可用于 Cloud Scheduler / cron-job.org 定时唤醒）
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={cronUrl}
                aria-label="每日定时触发接口地址"
                className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 border border-slate-200 rounded-lg text-slate-700"
              />
              <button
                type="button"
                onClick={() =>
                  void copyText(cronUrl, () => {
                    setCopiedCron(true);
                    setTimeout(() => setCopiedCron(false), 2000);
                  })
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                {copiedCron ? <Check className="w-3.5 h-3.5 text-teal-700" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCron ? '已复制' : '复制接口'}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Three Export Formats */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* 1. Standalone Personal HTML Workbench */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                独立个人网页工作台（.html）
              </h3>
              <FileCode2 className="w-5 h-5 text-teal-700 shrink-0" aria-hidden="true" />
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              单个自包含 HTML 文件，内置筛选、搜索、职位表与「手动刷新最新数据」按钮；本地双击打开或托管到 GitHub Pages 均可直接运行。
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <a
              href={htmlDownloadUrl}
              download={`周梦梦_个人招聘工作台_${currentBriefing.briefingDate}.html`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>下载个人网页 (.html)</span>
            </a>
            <a
              href={htmlPreviewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <span>新标签页打开</span>
              <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            </a>
          </div>
        </div>

        {/* 2. Markdown Daily Briefing */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                每日简报文档（.md）
              </h3>
              <FileText className="w-5 h-5 text-teal-700 shrink-0" aria-hidden="true" />
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              输出结构化 Markdown 简报，完整包含每条公告的原文标题、官方来源链接、发布日期、增量变更状态及匹配原因，适合复制发送至微信、飞书或 Notion。
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <a
              href={mdDownloadUrl}
              download={`周梦梦_每日招聘简报_${currentBriefing.briefingDate}.md`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>下载 Markdown</span>
            </a>
            <button
              type="button"
              onClick={() =>
                void copyText(markdownPreview, () => {
                  setCopiedMd(true);
                  setTimeout(() => setCopiedMd(false), 2500);
                })
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-teal-800 border border-teal-200 bg-teal-50/50 rounded-lg hover:bg-teal-50 transition-colors whitespace-nowrap"
            >
              {copiedMd ? (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>已复制简报全文</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>一键复制正文</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3. Full JSON Backup */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                工作台数据快照（.json）
              </h3>
              <FileJson className="w-5 h-5 text-teal-700 shrink-0" aria-hidden="true" />
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              导出包含周梦梦双简历画像、18+ 官方渠道白名单、定时调度设置以及全部历史简报基线的完整 JSON 数据包，方便本地归档或迁移。
            </p>
          </div>
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2">
            <a
              href={jsonDownloadUrl}
              download={`周梦梦_招聘工作台数据备份_${currentBriefing.briefingDate}.json`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-800 border border-slate-200 bg-white rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" aria-hidden="true" />
              <span>下载数据备份 (.json)</span>
            </a>
          </div>
        </div>
      </section>

      {/* Zero-Server GitHub Pages Automation Guide */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">
          零服务器免费托管方案：GitHub Pages + 每天 08:00 自动更新
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          项目已内置自动更新脚本（<span className="font-mono-tabular">scripts/daily-update.ts</span>）与定时工作流（<span className="font-mono-tabular">.github/workflows/daily-briefing.yml</span>）。将本项目推送到您的 GitHub 仓库并在 Settings → Pages 中开启 GitHub Actions 部署后，系统将在每天北京时间 08:00 自动抓取官方渠道并更新您的独立网页；您也可以随时在 GitHub Actions 点击「Run workflow」手动刷新。
        </p>
      </section>

      {/* Live Embedded Preview of the Exported Standalone Personal Webpage */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              导出独立个人网页 · 实时预览（期次 {currentBriefing.briefingDate}）
            </h3>
            <p className="text-xs text-slate-500">
              右上角已集成「手动刷新最新数据」按钮，打开独立网页即可同步最新官源结果
            </p>
          </div>
          <a
            href={htmlPreviewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 hover:underline whitespace-nowrap shrink-0"
          >
            <span>全屏打开独立网页</span>
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        </div>
        <iframe
          title="导出的独立个人招聘工作台网页预览"
          src={htmlPreviewUrl}
          className="w-full h-[560px] border-0 bg-slate-50"
        />
      </section>
    </div>
  );
}
