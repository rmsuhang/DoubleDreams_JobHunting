import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeIncrementalDiff,
  computeNextTriggerIso,
  evaluateProfileMatch,
  isOfficialSourceUrl,
  isValidTriggerTime,
} from './diffEngine';
import type { BriefingSnapshot, CandidateProfile, OfficialSource, RecruitmentItem } from './types';

const sampleSources: OfficialSource[] = [
  {
    id: 'src-jnhhr',
    name: '济南卫生健康人才网',
    tier: 'provincial_municipal_hrss',
    tierLabel: '本市卫健人事网',
    region: '济南',
    url: 'https://www.jnhhr.cn/',
    domain: 'jnhhr.cn',
    channelType: '官网',
    enabled: true,
  },
  {
    id: 'src-jnszhyy',
    name: '广安门医院济南医院（济南市中医医院）',
    tier: 'hospital_official',
    tierLabel: '医院官网',
    region: '济南',
    url: 'https://www.jnszhyy.cn/',
    domain: 'jnszhyy.cn',
    channelType: '官网',
    enabled: true,
  },
];

const sampleProfile: CandidateProfile = {
  name: '周梦梦',
  gender: '女',
  age: 26,
  hometown: '山东省烟台市',
  currentCity: '济南',
  phone: '17358637393',
  email: '1586472128@qq.com',
  graduationTime: '2027年6月',
  degree: '硕士研究生',
  major: '针灸推拿学',
  bachelorSchool: '成都中医药大学',
  masterSchool: '山东中医药大学',
  isFreshGraduate: true,
  examTypes: ['校招为主', '面试', '笔试'],
  targetCities: ['山东省青岛市', '山东省济南市'],
  expectedSalary: '8k-15k',
  certificates: ['执业医师资格证', 'GCP证书', '中医经典三级证书', 'CET-4', '普通话二甲'],
  clinicalSummary: '山东省中医院规范化培训轮转',
  researchSummary: 'Meta分析、网络药理学、SPSS、R语言',
  tracks: [],
};

function makeItem(overrides: Partial<RecruitmentItem>): RecruitmentItem {
  return {
    id: 'item-1',
    canonicalKey: '济南市中医医院::2027届校园招聘公告',
    title: '广安门医院济南医院2027届校园招聘公告',
    sourceName: '广安门医院济南医院网站',
    sourceUrl: 'https://www.jnszhyy.cn/zhaopin/20261114.html',
    sourceTier: 'hospital_official',
    publishDate: '2026-11-14',
    announcementType: 'new_announcement',
    region: '济南',
    employerName: '广安门医院济南医院',
    employerCategory: '公立医院',
    matchedTrack: 'tcm_physician',
    matchReasons: [],
    matchedPositions: [
      {
        positionName: '针灸推拿科医师',
        department: '针灸推拿科',
        headcount: 2,
        degreeReq: '硕士研究生及以上',
        majorReq: '针灸推拿学',
        freshGradOnly: true,
        examFormat: '笔试+面试',
        track: 'tcm_physician',
      },
    ],
    milestones: [
      {
        id: 'm1',
        type: 'registration',
        label: '网上报名',
        dateRange: '2026-11-14 ~ 2026-11-25',
        status: 'active',
      },
    ],
    deadlineDate: '2026-11-25',
    hasAnomaly: false,
    diffStatus: 'new',
    ...overrides,
  };
}

test('isOfficialSourceUrl allows .gov.cn and registered hospital domains, blocks aggregators', () => {
  assert.equal(isOfficialSourceUrl('http://hrss.qingdao.gov.cn/notice/1', sampleSources).isOfficial, true);
  assert.equal(isOfficialSourceUrl('https://www.jnhhr.cn/news/123', sampleSources).isOfficial, true);
  assert.equal(isOfficialSourceUrl('https://www.zhipin.com/job_detail/abc', sampleSources).isOfficial, false);
  assert.equal(isOfficialSourceUrl('https://www.offcn.com/jinan/123', sampleSources).isOfficial, false);
});

test('computeIncrementalDiff detects new, updated, still_open, and carries forward unexpired baseline items', () => {
  const baselineItemKeep = makeItem({
    id: 'b-keep',
    canonicalKey: '医院A::公告A',
    title: '医院A校招公告',
    employerName: '医院A',
    sourceUrl: 'https://www.jnszhyy.cn/zhaopin/a.html',
    deadlineDate: '2026-11-28',
  });
  const baselineItemUpdate = makeItem({
    id: 'b-upd',
    canonicalKey: '医院B::公告B',
    title: '医院B招聘公告',
    employerName: '医院B',
    sourceUrl: 'https://www.jnszhyy.cn/zhaopin/b.html',
    deadlineDate: '2026-11-20',
  });
  const baselineItemCarry = makeItem({
    id: 'b-carry',
    canonicalKey: '医院C::公告C',
    title: '医院C未截止公告',
    employerName: '医院C',
    sourceUrl: 'https://www.jnszhyy.cn/zhaopin/c.html',
    deadlineDate: '2026-11-30',
  });

  const baseline: BriefingSnapshot = {
    id: 'brief-prev',
    briefingDate: '2026-11-14',
    generatedAt: '2026-11-14T00:00:00.000Z',
    triggerType: 'baseline',
    baselineBriefingId: null,
    baselineDate: null,
    sourcesCheckedCount: 10,
    liveScanUsed: false,
    scanStatusMessage: 'baseline',
    stats: {
      totalMatched: 3,
      newCount: 3,
      updatedCount: 0,
      stillOpenCount: 0,
      anomalyCount: 0,
      tcmPhysicianCount: 3,
      medicalCraCount: 0,
    },
    items: [baselineItemKeep, baselineItemUpdate, baselineItemCarry],
    groundingLinks: [],
  };

  const incoming: RecruitmentItem[] = [
    baselineItemKeep,
    makeItem({
      id: 'b-upd-now',
      canonicalKey: '医院B::公告B',
      title: '医院B招聘延长报名补充公告',
      employerName: '医院B',
      sourceUrl: 'https://www.jnszhyy.cn/zhaopin/b.html',
      publishDate: '2026-11-15',
      announcementType: 'supplement_correction',
      deadlineDate: '2026-11-26',
      hasAnomaly: true,
      anomalyDetail: '报名截止延期至 2026-11-26',
    }),
    makeItem({
      id: 'new-d',
      canonicalKey: '医院D::公告D',
      title: '青岛市中医医院2027届针灸推拿硕士校招',
      employerName: '青岛市中医医院',
      sourceUrl: 'http://wsjkw.qingdao.gov.cn/zhaopin/d.html',
      region: '青岛',
      deadlineDate: '2026-11-29',
    }),
  ];

  const { items, stats } = computeIncrementalDiff(incoming, baseline, '2026-11-15');
  assert.equal(stats.totalMatched, 4);
  assert.equal(stats.newCount, 1);
  assert.equal(stats.updatedCount, 1);
  assert.equal(stats.stillOpenCount, 2);
  assert.equal(stats.anomalyCount, 1);
  assert.equal(items[0].diffStatus, 'updated');
  assert.equal(items[1].diffStatus, 'new');
  assert.ok(items.some((i) => i.employerName === '医院C' && i.diffStatus === 'still_open'));
});

test('computeIncrementalDiff never accumulates duplicate items across repeated scans', () => {
  const item1 = makeItem({
    id: 'run-1',
    canonicalKey: '济南市第一人民医院::2027届',
    title: '济南市第一人民医院公开招聘公告（2027届）',
    employerName: '济南市第一人民医院',
    sourceUrl: 'http://www.jnslyy.com/contents/51/56396.html',
    deadlineDate: '以官方原文为准',
  });
  const duplicateCopy = { ...item1, id: 'run-2' };

  const baselineWithLegacyDups: BriefingSnapshot = {
    id: 'brief-dup',
    briefingDate: '2026-11-15',
    generatedAt: '2026-11-15T00:00:00.000Z',
    triggerType: 'manual',
    baselineBriefingId: null,
    baselineDate: null,
    sourcesCheckedCount: 17,
    liveScanUsed: true,
    scanStatusMessage: 'ok',
    stats: {
      totalMatched: 2,
      newCount: 2,
      updatedCount: 0,
      stillOpenCount: 0,
      anomalyCount: 0,
      tcmPhysicianCount: 2,
      medicalCraCount: 0,
    },
    items: [item1, duplicateCopy],
    groundingLinks: [],
  };

  const { items, stats } = computeIncrementalDiff(
    [item1, duplicateCopy, { ...item1, id: 'run-3', sourceUrl: 'https://www.jnslyy.com/contents/51/56396.html/' }],
    baselineWithLegacyDups,
    '2026-11-15'
  );
  assert.equal(items.length, 1);
  assert.equal(stats.totalMatched, 1);
  assert.equal(stats.stillOpenCount, 1);
});

test('evaluateProfileMatch matches both clinical TCM and Medical/CRA tracks accurately', () => {
  const tcmResult = evaluateProfileMatch(makeItem({}), sampleProfile);
  assert.equal(tcmResult.isMatch, true);
  assert.equal(tcmResult.matchedTrack, 'tcm_physician');
  assert.ok(tcmResult.reasons.some((r) => r.includes('济南')));

  const craResult = evaluateProfileMatch(
    makeItem({
      title: '齐鲁制药2027届校园招聘医学事务专员 / 临床研究CRA',
      region: '济南',
      matchedPositions: [
        {
          positionName: '临床研究监查员 (CRA)',
          department: '临床医学研发中心',
          headcount: 4,
          degreeReq: '硕士研究生及以上',
          majorReq: '中医学/临床医学/药学（持GCP证书优先）',
          freshGradOnly: true,
          examFormat: '初试+复试',
          track: 'medical_cra',
        },
      ],
    }),
    sampleProfile
  );
  assert.equal(craResult.isMatch, true);
  assert.equal(craResult.matchedTrack, 'medical_cra');
});

test('computeNextTriggerIso schedules next Asia/Shanghai HH:mm trigger', () => {
  assert.equal(isValidTriggerTime('08:00'), true);
  assert.equal(isValidTriggerTime('25:99'), false);

  // 2026-11-15 07:30 Asia/Shanghai = 2026-11-14T23:30:00.000Z
  const beforeEight = new Date('2026-11-14T23:30:00.000Z');
  const nextSameDay = computeNextTriggerIso('08:00', beforeEight);
  assert.equal(nextSameDay, '2026-11-15T00:00:00.000Z');

  // 2026-11-15 09:00 Asia/Shanghai = 2026-11-15T01:00:00.000Z
  const afterEight = new Date('2026-11-15T01:00:00.000Z');
  const nextTomorrow = computeNextTriggerIso('08:00', afterEight);
  assert.equal(nextTomorrow, '2026-11-16T00:00:00.000Z');
});
