import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractLinksFromHtml,
  isRecruitmentColumnLink,
  isRelevantRecruitmentLink,
  isTrustedPortalArticleUrl,
  normalizeChineseDate,
  parseBeisenCampusJobToItem,
  parseOfficialArticleToItem,
  parseRunjobPositionToItem,
} from './portalScraper';
import { INITIAL_OFFICIAL_SOURCES, INITIAL_PROFILE } from '../src/shared/seedData';

test('normalizeChineseDate parses standard and spaced Chinese date formats', () => {
  assert.equal(normalizeChineseDate('2026-11-11'), '2026-11-11');
  assert.equal(normalizeChineseDate('2026年11月5日'), '2026-11-05');
  assert.equal(normalizeChineseDate('2026 年 6 月 4 日'), '2026-06-04');
  assert.equal(normalizeChineseDate('2020.06.24'), '2020-06-24');
  assert.equal(normalizeChineseDate('2026/1/9'), '2026-01-09');
  assert.equal(normalizeChineseDate('无日期'), null);
});

test('extractLinksFromHtml discovers recruitment links and skips procurement links', () => {
  const html = `
    <ul>
      <li><a href="/list-110-1.html">人事招聘</a></li>
      <li><a href="/content-110-3976-1.html">济南市机关医院公开招聘急需优秀高校毕业生公告（2027届） 2026-11-11 30</a></li>
      <li><a href="/content-111-3972-1.html">济南市机关医院2026年复印纸采购项目询价公告 2026-11-02</a></li>
    </ul>
  `;
  const links = extractLinksFromHtml(html, 'https://www.jnsjgyy.com/');
  assert.equal(links.length, 3);
  assert.equal(links[1].url, 'https://www.jnsjgyy.com/content-110-3976-1.html');
  assert.equal(links[1].dateHint, '2026-11-11');

  assert.equal(isRecruitmentColumnLink(links[0].title, links[0].url, 'jnsjgyy.com'), true);
  assert.equal(isRelevantRecruitmentLink(links[1].title, links[1].url), true);
  assert.equal(isRelevantRecruitmentLink(links[2].title, links[2].url), false);
});

test('parseOfficialArticleToItem extracts real article metadata and multi-session milestones', () => {
  const source = INITIAL_OFFICIAL_SOURCES.find((s) => s.domain === 'jnsjgyy.com')!;
  const articleHtml = `
    <html>
      <head><title>济南市机关医院公开招聘急需优秀高校毕业生公告（北京站·2027届）</title></head>
      <body>
        <h1>济南市机关医院公开招聘急需优秀高校毕业生公告（北京站·2027届）</h1>
        <div>来源：济南市机关医院 时间：2026-11-12 18:48:17</div>
        <article>
          一、第一场 报名地点：北京中医药大学和平街校区 报名时间：2026年11月20日14:00-16:00
          二、第二场 报名地点：北京大学医学部 报名时间：2026年11月21日9:00-11:00
          欢迎2027年应届硕士毕业生（含针灸推拿学、中医学）现场报名参加。
        </article>
      </body>
    </html>
  `;

  const item = parseOfficialArticleToItem({
    source,
    articleUrl: 'https://www.jnsjgyy.com/content-110-3977-1.html',
    linkTitle: '济南市机关医院公开招聘急需优秀高校毕业生公告（北京站·2027届）',
    html: articleHtml,
    todayStr: '2026-11-15',
    dateHint: '2026-11-12',
    profile: INITIAL_PROFILE,
  });

  assert.ok(item);
  assert.equal(item.publishDate, '2026-11-12');
  assert.equal(item.deadlineDate, '2026-11-21');
  assert.equal(item.milestones.length, 2);
  assert.ok(item.milestones[0].label.includes('北京中医药大学'));
  assert.ok(item.milestones[1].label.includes('北京大学医学部'));
});

test('parseOfficialArticleToItem avoids fake +14d deadlines and filters expired June notices', () => {
  const source = INITIAL_OFFICIAL_SOURCES.find((s) => s.domain === 'jnslyy.com')!;

  const pendingHtml = `
    <html><body>
      <h1>济南市第一人民医院公开招聘急需优秀高校毕业生公告（2027届）</h1>
      <article>
        本次招聘对象为2027年应届硕士研究生，采取宣讲会现场报名方式，现场报名的具体时间和地点确定后在官网公布。
        济南市第一人民医院 2026年11月11日
      </article>
    </body></html>
  `;
  const pendingItem = parseOfficialArticleToItem({
    source,
    articleUrl: 'http://www.jnslyy.com/contents/51/56396.html',
    linkTitle: '济南市第一人民医院公开招聘急需优秀高校毕业生公告（2027届）',
    html: pendingHtml,
    todayStr: '2026-11-15',
    profile: INITIAL_PROFILE,
  });
  assert.ok(pendingItem);
  assert.equal(pendingItem.publishDate, '2026-11-11');
  assert.equal(pendingItem.deadlineDate, '以官方原文为准');

  const staleJuneHtml = `
    <html><body>
      <h1>济南市第一人民医院公开招聘人员面试有关事宜的公告</h1>
      <article>
        面试时间定于 2026 年 6 月 25 日 -26日。请保持通讯畅通，应届硕士考生按时参加。
        济南市第一人民医院 2026 年 6 月 4 日
      </article>
    </body></html>
  `;
  const staleItem = parseOfficialArticleToItem({
    source,
    articleUrl: 'http://www.jnslyy.com/contents/38/55776.html',
    linkTitle: '济南市第一人民医院公开招聘人员面试有关事宜的公告',
    html: staleJuneHtml,
    todayStr: '2026-11-15',
    profile: INITIAL_PROFILE,
  });
  assert.equal(staleItem, null);
});

test('filters historical 2020 summaries, news URLs, and parses cross-month deadline ranges', () => {
  const sdzydfy = INITIAL_OFFICIAL_SOURCES.find((s) => s.domain === 'sdzydfy.com')!;
  assert.equal(isTrustedPortalArticleUrl('https://m.chinanews.com/wap/detail/chs/zw/463185.shtml', 'sdzydfy.com'), false);
  assert.equal(isTrustedPortalArticleUrl('https://www.sdzydfy.com/notice_notice/123.html', 'sdzydfy.com'), true);

  const old2020Html = `
    <html><body>
      <h1>医院完成2020年度校园招聘工作</h1>
      <div>2020.06.24 来源部门：人事处</div>
      <article>近日我院面向2020年应届毕业生完成了针灸推拿等专业笔试面试工作。</article>
    </body></html>
  `;
  const oldItem = parseOfficialArticleToItem({
    source: sdzydfy,
    articleUrl: 'https://www.sdzydfy.com/renshizongheguanli/010006500008617.html',
    linkTitle: '医院完成2020年度校园招聘工作',
    html: old2020Html,
    todayStr: '2026-11-15',
    profile: INITIAL_PROFILE,
  });
  assert.equal(oldItem, null);

  const rangeHtml = `
    <html><body>
      <h1>山东省中医院2027年公开招聘急需紧缺人才公告</h1>
      <div>发布时间：2026-11-14</div>
      <article>
        网上报名时间：2026年11月15日9:00至11月22日17:00。招聘针灸推拿学硕士研究生。
      </article>
    </body></html>
  `;
  const rangeItem = parseOfficialArticleToItem({
    source: sdzydfy,
    articleUrl: 'https://www.sdzydfy.com/rencaizhaoping/2027.html',
    linkTitle: '山东省中医院2027年公开招聘急需紧缺人才公告',
    html: rangeHtml,
    todayStr: '2026-11-15',
    profile: INITIAL_PROFILE,
  });
  assert.ok(rangeItem);
  assert.equal(rangeItem.publishDate, '2026-11-14');
  assert.equal(rangeItem.deadlineDate, '2026-11-22');
});

test('parseBeisenCampusJobToItem matches Qilu Pharma Master CRA roles and filters PhD-only roles', () => {
  const qiluSource = INITIAL_OFFICIAL_SOURCES.find((s) => s.domain === 'qilu-pharma.com')!;

  const craJob = parseBeisenCampusJobToItem(
    {
      Id: '03e276df-ae78-4d8b-a6d1-56fd202a7365',
      JobAdId: 230934981,
      JobAdName: '临床监查员（药物研究院）(J11106)',
      Org: '药物研究院',
      CategoryId: '2',
      LocNames: ['山东省·济南市'],
      Degree: '硕士研究生',
      Duty: '1、协助临床试验的启动、监查和关闭工作，确保试验按GCP执行；',
      Require: '1、硕士学历，临床医学、药学、护理学、公共卫生、生物统计学等相关专业；2、了解GCP及相关法规，英语CET-4及以上；',
      PostDate: '2026-08-31T09:55:47',
      EndTime: '2222-02-02T00:00:00',
      Status: 1,
    },
    {
      source: qiluSource,
      zhiyeOrigin: 'https://qilu-pharma.zhiye.com',
      categoryId: '2',
      todayStr: '2026-11-15',
      profile: INITIAL_PROFILE,
    }
  );
  assert.ok(craJob);
  assert.equal(craJob.region, '济南');
  assert.equal(craJob.matchedTrack, 'medical_cra');
  assert.equal(craJob.deadlineDate, '以官方原文为准');
  assert.equal(
    craJob.sourceUrl,
    'https://qilu-pharma.zhiye.com/campus/detail?jobAdId=03e276df-ae78-4d8b-a6d1-56fd202a7365'
  );

  const phdOnlyJob = parseBeisenCampusJobToItem(
    {
      Id: '45a4fbbf-4106-4fa2-861e-89028381b764',
      JobAdId: 230935011,
      JobAdName: '医学助理经理(J11109)',
      Org: '临床研发中心',
      CategoryId: '2',
      LocNames: ['山东省·济南市'],
      Degree: '博士研究生',
      Duty: '负责临床试验医学支持。',
      Require: '1、临床医学专业博士；2、有临床试验医学实习经验者优先；',
      PostDate: '2026-08-31T10:30:00',
      EndTime: '2222-02-02T00:00:00',
      Status: 1,
    },
    {
      source: qiluSource,
      zhiyeOrigin: 'https://qilu-pharma.zhiye.com',
      categoryId: '2',
      todayStr: '2026-11-15',
      profile: INITIAL_PROFILE,
    }
  );
  assert.equal(phdOnlyJob, null);
});

test('parseBeisenCampusJobToItem handles Tigermed target city CRA/CRC Intern roles, CET-6 gate, and non-target cities', () => {
  const tigermedSource = INITIAL_OFFICIAL_SOURCES.find((s) => s.id === 'src-tigermed')!;

  const jinanCra = parseBeisenCampusJobToItem(
    {
      Id: '83fa38ca-34ab-4e5f-8eae-4875e09b04bd',
      JobAdId: 231000001,
      JobAdName: 'CRA Intern-济南（2027校招）',
      Org: 'Ⅴ(1)部',
      CategoryId: '2',
      LocNames: ['山东省·济南市'],
      Degree: '本科',
      Duty: '协助CRA开展临床试验监查支持工作。',
      Require: '1、药学、临床药学、临床医学等医药相关专业本科及以上学历；2、CET4，具有良好的英文读写能力；',
      PostDate: '2026-06-17T00:00:00',
      EndTime: '2222-02-02T00:00:00',
      Status: 1,
    },
    {
      source: tigermedSource,
      zhiyeOrigin: 'https://tigermed.zhiye.com',
      categoryId: '2',
      todayStr: '2026-11-16',
      profile: INITIAL_PROFILE,
    }
  );
  assert.ok(jinanCra);
  assert.equal(jinanCra.region, '济南');
  assert.equal(jinanCra.matchedTrack, 'medical_cra');
  assert.equal(jinanCra.matchedPositions[0].degreeReq, '本科及以上');

  const mwStrictCet6 = parseBeisenCampusJobToItem(
    {
      Id: '73db49fd-4eaf-480f-b195-f8b76cdd6763',
      JobAdId: 231000002,
      JobAdName: '医学编辑实习生（MW Intern）-全国（2027校招）',
      Org: '科学事务部',
      CategoryId: '2',
      LocNames: ['全国'],
      Degree: '硕士研究生',
      Duty: '医学撰写与翻译支持。',
      Require: '1、临床医学专业硕士在读；5、CET6，英语读写能力良好；',
      PostDate: '2026-06-17T00:00:00',
      EndTime: '2222-02-02T00:00:00',
      Status: 1,
    },
    {
      source: tigermedSource,
      zhiyeOrigin: 'https://tigermed.zhiye.com',
      categoryId: '2',
      todayStr: '2026-11-16',
      profile: INITIAL_PROFILE,
    }
  );
  assert.equal(mwStrictCet6, null);

  const nonTargetCity = parseBeisenCampusJobToItem(
    {
      Id: '71104f3e-2ec6-4a22-b2ba-07a3e33534df',
      JobAdId: 231000003,
      JobAdName: 'CRC Intern-锦州（2027校招）',
      Org: '北Ⅲ区',
      CategoryId: '2',
      LocNames: ['辽宁省·锦州市'],
      Degree: '本科',
      Duty: '临床研究协调员支持。',
      Require: '1、药学、临床医学等医药相关专业本科及以上学历；2、英语CET4及以上；',
      PostDate: '2026-06-17T00:00:00',
      EndTime: '2222-02-02T00:00:00',
      Status: 1,
    },
    {
      source: tigermedSource,
      zhiyeOrigin: 'https://tigermed.zhiye.com',
      categoryId: '2',
      todayStr: '2026-11-16',
      profile: INITIAL_PROFILE,
    }
  );
  assert.equal(nonTargetCity, null);

  const emptyLocDongguan = parseBeisenCampusJobToItem(
    {
      Id: 'c6f22a6b-74e1-44ab-8db2-ea76be202306',
      JobAdId: 231000004,
      JobAdName: 'CRC Intern-东莞（2027校招）',
      Org: '南区',
      CategoryId: '2',
      LocNames: [],
      Degree: '本科',
      Duty: '临床研究协调员支持。',
      Require: '1、药学、临床医学等医药相关专业本科及以上学历；2、英语CET4及以上；',
      PostDate: '2026-06-17T00:00:00',
      EndTime: '2222-02-02T00:00:00',
      Status: 1,
    },
    {
      source: tigermedSource,
      zhiyeOrigin: 'https://tigermed.zhiye.com',
      categoryId: '2',
      todayStr: '2026-11-16',
      profile: INITIAL_PROFILE,
    }
  );
  assert.equal(emptyLocDongguan, null);
});

test('parseRunjobPositionToItem matches CR Dong-E-E-Jiao 2027 TCM physician role and filters stale/sales roles', () => {
  const crSource = INITIAL_OFFICIAL_SOURCES.find((s) => s.id === 'src-crcare')!;

  const tcmJob = parseRunjobPositionToItem(
    {
      pubPositionId: '2112842208825417731',
      pubPositionName: '2027届校园招聘（滋补生活事业部中医师）',
      brandName: '香港校园招聘',
      companyDescr: '东阿阿胶股份有限公司',
      locationDescr: '中国,山东,济南市',
      publishDate: '2026-10-21',
      typeId: 'A02',
      typeIdDescr: '校园招聘',
      rmEducationalRqmtDescr: '本科及以上',
      rmWorkYearsRqmtDescr: '',
      rmJobDuty: '主责中医诊疗及理疗工作。',
      rmJobRqmt: '1、熟练掌握中医四诊；4、掌握针灸、推拿、拔罐等中医适宜技术者优先；',
    },
    {
      source: crSource,
      todayStr: '2026-11-16',
      profile: INITIAL_PROFILE,
    }
  );
  assert.ok(tcmJob);
  assert.equal(tcmJob.region, '济南');
  assert.equal(tcmJob.matchedTrack, 'tcm_physician');
  assert.equal(
    tcmJob.sourceUrl,
    'https://runjob.crc.com.cn/#/complex/RecruitDetail?id=2112842208825417731&comId=1769554545615040514&typeId=A02'
  );

  const stale2024Job = parseRunjobPositionToItem(
    {
      pubPositionId: '1858717591055564801',
      pubPositionName: '北城医院中医科病区医师',
      brandName: '华润健康',
      companyDescr: '济南北城医院有限公司',
      locationDescr: '中国,山东,济南市',
      publishDate: '2024-11-19',
      typeId: 'A02',
      typeIdDescr: '校园招聘',
      rmJobRqmt: '1、本科及以上学历；',
    },
    {
      source: crSource,
      todayStr: '2026-11-16',
      profile: INITIAL_PROFILE,
    }
  );
  assert.equal(stale2024Job, null);

  const salesJob = parseRunjobPositionToItem(
    {
      pubPositionId: '2101586199887282178',
      pubPositionName: 'OTC代表-山东',
      brandName: '华润三九',
      companyDescr: '天士力医药集团股份有限公司',
      locationDescr: '中国,山东,济南市',
      publishDate: '2026-09-20',
      typeId: 'A02',
      typeIdDescr: '校园招聘',
      rmEducationalRqmtDescr: '本科及以上',
      rmJobRqmt: '1、2027年应届毕业生；',
    },
    {
      source: crSource,
      todayStr: '2026-11-16',
      profile: INITIAL_PROFILE,
    }
  );
  assert.equal(salesJob, null);
});



