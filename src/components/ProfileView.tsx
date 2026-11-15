import { useState, type FormEvent } from 'react';
import { Check, ExternalLink, FileText } from 'lucide-react';
import type { CandidateProfile } from '../shared/types';

interface ProfileViewProps {
  profile: CandidateProfile;
  onUpdateProfile: (patch: Partial<CandidateProfile>) => Promise<void>;
}

export function ProfileView({ profile, onUpdateProfile }: ProfileViewProps) {
  const [citiesInput, setCitiesInput] = useState(profile.targetCities.join('；'));
  const [salaryInput, setSalaryInput] = useState(profile.expectedSalary);
  const [examInput, setExamInput] = useState(profile.examTypes.join('、'));
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSavedNotice(false);
    try {
      const targetCities = citiesInput
        .split(/[；;,，、]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const examTypes = examInput
        .split(/[；;,，、]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      await onUpdateProfile({
        targetCities: targetCities.length > 0 ? targetCities : profile.targetCities,
        expectedSalary: salaryInput.trim() || profile.expectedSalary,
        examTypes: examTypes.length > 0 ? examTypes : profile.examTypes,
      });
      setSavedNotice(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Core Identity Header */}
      <section className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <h2 className="text-xl font-bold text-slate-900">{profile.name}</h2>
              <span className="text-sm text-slate-500">
                {profile.gender} · {profile.age}岁 · 现居{profile.currentCity} · 户籍{profile.hometown}
              </span>
            </div>
            <div className="text-sm text-slate-700">
              {profile.degree}（{profile.major}） · {profile.masterSchool}
            </div>
            <div className="text-xs text-slate-500 font-mono-tabular">
              电话 {profile.phone} · 邮箱 {profile.email} · 应届身份：{profile.isFreshGraduate ? '是（2027年6月毕业）' : '否'}
            </div>
          </div>
          <div className="text-xs text-slate-600 md:text-right space-y-1">
            <div>本科：{profile.bachelorSchool}</div>
            <div>期望月薪：{profile.expectedSalary}</div>
          </div>
        </div>

        <div className="mt-5 pt-5 border-t border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700 leading-relaxed">
          <div className="space-y-1.5">
            <div className="font-semibold text-slate-900">临床与规范化培训经历</div>
            <p>{profile.clinicalSummary}</p>
          </div>
          <div className="space-y-1.5">
            <div className="font-semibold text-slate-900">科研方法与项目成果</div>
            <p>{profile.researchSummary}</p>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-slate-200">
          <div className="text-xs font-semibold text-slate-900 mb-2">已持有核心证书与资质</div>
          <div className="text-xs text-slate-700 flex flex-wrap gap-x-3 gap-y-1">
            {profile.certificates.map((cert, idx) => (
              <span key={idx}>
                {idx > 0 && <span className="mr-3 text-slate-300">·</span>}
                {cert}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Dual Resume PDFs Attached */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {profile.tracks.map((track) => (
          <div
            key={track.id}
            className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between gap-4"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{track.label}</h3>
                  <div className="text-xs text-slate-500 mt-0.5">{track.targetRole}</div>
                </div>
                <FileText className="w-5 h-5 text-teal-700 shrink-0" aria-hidden="true" />
              </div>

              <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                {track.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-xs font-mono-tabular text-slate-500 truncate">
                {track.pdfFileName}
              </span>
              <a
                href={track.pdfPath}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-teal-800 border border-teal-200 bg-teal-50/50 rounded-md hover:bg-teal-50 transition-colors whitespace-nowrap shrink-0"
              >
                <span>查看原版简历 PDF</span>
                <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
              </a>
            </div>
          </div>
        ))}
      </section>

      {/* Editable Matching Preferences */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900">
          岗位匹配条件微调
        </h3>
        <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1">
            <label htmlFor="target-cities" className="block text-xs font-medium text-slate-700">
              重点地区（分号分隔）
            </label>
            <input
              id="target-cities"
              type="text"
              value={citiesInput}
              onChange={(e) => setCitiesInput(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="exam-types" className="block text-xs font-medium text-slate-700">
              考试与招录类型
            </label>
            <input
              id="exam-types"
              type="text"
              value={examInput}
              onChange={(e) => setExamInput(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="expected-salary" className="block text-xs font-medium text-slate-700">
              期望月薪范围
            </label>
            <div className="flex items-center gap-2">
              <input
                id="expected-salary"
                type="text"
                value={salaryInput}
                onChange={(e) => setSalaryInput(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:border-teal-700"
              />
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-800 rounded-lg hover:bg-teal-900 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
              >
                {saving ? '保存中...' : '保存画像'}
              </button>
            </div>
          </div>
        </form>
        {savedNotice && (
          <div className="inline-flex items-center gap-1.5 text-xs text-teal-700">
            <Check className="w-4 h-4" aria-hidden="true" />
            <span>个人画像偏好已保存，将在下次每日简报筛选中生效。</span>
          </div>
        )}
      </section>
    </div>
  );
}
