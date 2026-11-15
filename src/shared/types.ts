export type SourceTier =
  | 'national_gov'
  | 'provincial_municipal_hrss'
  | 'hospital_official'
  | 'soe_medical_enterprise';

export type ResumeTrack = 'tcm_physician' | 'medical_cra' | 'both';

export type AnnouncementType =
  | 'new_announcement'
  | 'position_table'
  | 'supplement_correction';

export type DiffStatus = 'new' | 'updated' | 'still_open' | 'closed';

export type MilestoneType =
  | 'campus_talk'
  | 'registration'
  | 'qualification_review'
  | 'payment'
  | 'admit_card'
  | 'written_exam'
  | 'interview'
  | 'supplement';

export type MilestoneStatus =
  | 'upcoming'
  | 'active'
  | 'urgent'
  | 'delayed'
  | 'cancelled'
  | 'completed';

export interface OfficialSource {
  id: string;
  name: string;
  tier: SourceTier;
  tierLabel: string;
  region: '全国' | '山东省级' | '济南' | '青岛' | '国企/外企';
  url: string;
  domain: string;
  channelType: '官网' | '官网及公众号';
  enabled: boolean;
  lastCheckedAt?: string;
  lastHttpStatus?: number | null;
  lastCheckNote?: string;
}

export interface MatchedPosition {
  positionName: string;
  department: string;
  headcount: number;
  degreeReq: string;
  majorReq: string;
  freshGradOnly: boolean;
  examFormat: string;
  track: 'tcm_physician' | 'medical_cra';
  notes?: string;
}

export interface MilestoneNode {
  id: string;
  type: MilestoneType;
  label: string;
  dateRange: string;
  status: MilestoneStatus;
  note?: string;
}

export interface RecruitmentItem {
  id: string;
  canonicalKey: string;
  /** 原文标题 */
  title: string;
  /** 官方发布机构名称 */
  sourceName: string;
  /** 官方来源链接 */
  sourceUrl: string;
  sourceTier: SourceTier;
  /** 发布日期 YYYY-MM-DD */
  publishDate: string;
  announcementType: AnnouncementType;
  region: '济南' | '青岛' | '山东省级/国家';
  employerName: string;
  employerCategory: '公立医院' | '人社/卫健委' | '国企医疗' | '外企/国企药企';
  matchedTrack: ResumeTrack;
  /** 与个人画像匹配原因 */
  matchReasons: string[];
  matchedPositions: MatchedPosition[];
  milestones: MilestoneNode[];
  /** 报名截止日期 YYYY-MM-DD */
  deadlineDate: string;
  hasAnomaly: boolean;
  anomalyDetail?: string;
  diffStatus: DiffStatus;
  diffNote?: string;
  isLiveGrounded?: boolean;
}

export interface GroundingLink {
  title: string;
  uri: string;
}

export interface BriefingSummaryStats {
  totalMatched: number;
  newCount: number;
  updatedCount: number;
  stillOpenCount: number;
  anomalyCount: number;
  tcmPhysicianCount: number;
  medicalCraCount: number;
}

export interface BriefingSnapshot {
  id: string;
  briefingDate: string;
  generatedAt: string;
  triggerType: 'scheduled' | 'manual' | 'baseline';
  baselineBriefingId: string | null;
  baselineDate: string | null;
  sourcesCheckedCount: number;
  liveScanUsed: boolean;
  scanStatusMessage: string;
  stats: BriefingSummaryStats;
  items: RecruitmentItem[];
  groundingLinks: GroundingLink[];
}

export interface ResumeTrackSummary {
  id: 'tcm_physician' | 'medical_cra';
  label: string;
  targetRole: string;
  pdfPath: string;
  pdfFileName: string;
  highlights: string[];
}

export interface CandidateProfile {
  name: string;
  gender: string;
  age: number;
  hometown: string;
  currentCity: string;
  phone: string;
  email: string;
  graduationTime: string;
  degree: string;
  major: string;
  bachelorSchool: string;
  masterSchool: string;
  isFreshGraduate: boolean;
  examTypes: string[];
  targetCities: string[];
  expectedSalary: string;
  certificates: string[];
  clinicalSummary: string;
  researchSummary: string;
  tracks: ResumeTrackSummary[];
}

export interface ScheduleConfig {
  enabled: boolean;
  /** HH:mm in 24h format */
  triggerTime: string;
  timezone: string;
  lastRunAt: string | null;
  nextRunAt: string;
}

export interface AppDataState {
  profile: CandidateProfile;
  sources: OfficialSource[];
  schedule: ScheduleConfig;
  briefings: BriefingSnapshot[];
}
