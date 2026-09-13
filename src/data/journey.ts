export type JourneyCategory = "education" | "student-work" | "milestone";
export type JourneyStatus = "complete" | "current" | "future";
export type JourneyMapPoint = "dongguan" | "tongliang" | "chengdu" | "future";

export type JourneyStep = {
  title: string;
  note: string;
};

export type StudentRole = {
  id: string;
  organization: string;
  role: string;
  note: string;
};

export type JourneyChapter = {
  id: string;
  index: string;
  place: string;
  eyebrow: string;
  title: string;
  lines: readonly string[];
  filter: JourneyCategory;
  status: JourneyStatus;
  mapPoint: JourneyMapPoint;
  steps?: readonly JourneyStep[];
  studentWork?: boolean;
};

export const journeyFilters = [
  { value: "all", label: "全部路线" },
  { value: "education", label: "求学" },
  { value: "student-work", label: "学生工作" },
  { value: "milestone", label: "里程碑" },
] as const;

export const studentRoles: readonly StudentRole[] = [
  {
    id: "yilu",
    organization: "电子科技大学一路工作室",
    role: "副主席",
    note: "在课堂之外承担责任，也在协作中认识更多伙伴",
  },
  {
    id: "innovation-center",
    organization: "信息与软件工程学院创新创业中心",
    role: "助理",
    note: "从创新创业实践中继续拓宽软件工程之外的视野",
  },
  {
    id: "small-city-love",
    organization: "电子科技大学小城大爱实践队",
    role: "成员",
    note: "把校园里的学习带向真实的社会实践与共同经历",
  },
  {
    id: "software-voice",
    organization: "软件e声摄影部",
    role: "部长",
    note: "用影像记录校园，也训练观察与表达的另一种方式",
  },
];

export const journeyChapters: readonly JourneyChapter[] = [
  {
    id: "dongguan-origin",
    index: "01",
    place: "广东东莞",
    eyebrow: "最初的坐标",
    title: "故事从这里开始",
    lines: [
      "出生于广东东莞",
      "最初的坐标很轻，却成为此后每一次出发的起点",
    ],
    filter: "milestone",
    status: "complete",
    mapPoint: "dongguan",
  },
  {
    id: "tongliang-growth",
    index: "02",
    place: "重庆铜梁",
    eyebrow: "成长的三圈年轮",
    title: "在同一座城里，一次次出发",
    lines: [
      "在故乡山城龙乡长大",
      "学校在变化，认识世界的方式也在变化",
    ],
    filter: "education",
    status: "complete",
    mapPoint: "tongliang",
    steps: [
      { title: "水霖学校", note: "成长与求学的起点" },
      { title: "实验一小", note: "继续认识更大的世界" },
      { title: "巴川中学", note: "在中学阶段积蓄下一次出发" },
    ],
  },
  {
    id: "chengdu-university",
    index: "03",
    place: "四川成都",
    eyebrow: "2024.09 — 至今",
    title: "成为一名 UESTCer",
    lines: [
      "在电子科技大学学习软件工程",
      "从软件出发，逐渐走向 AI 与更具体的真实问题",
    ],
    filter: "education",
    status: "current",
    mapPoint: "chengdu",
    studentWork: true,
  },
  {
    id: "tencent-offer",
    index: "04",
    place: "腾讯 Offer",
    eyebrow: "尚未抵达的下一站",
    title: "下一站，已经发来邀请",
    lines: [
      "已获得腾讯 Offer",
      "尚未开始实习，新的故事仍在路上",
    ],
    filter: "milestone",
    status: "future",
    mapPoint: "future",
  },
  {
    id: "present-coordinate",
    index: "05",
    place: "当前坐标",
    eyebrow: "四川成都",
    title: "路线仍在生长",
    lines: [
      "广度探索 AI，深度求索多模态与缺失模态",
      "关注医学深度学习、Agent 与具身智能",
    ],
    filter: "milestone",
    status: "current",
    mapPoint: "chengdu",
  },
];
