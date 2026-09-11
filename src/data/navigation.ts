export type NavigationItem = {
  label: string;
  href: string;
  description: string;
};

export const navigation: NavigationItem[] = [
  {
    label: "首页",
    href: "/",
    description: "认识我，以及这座个人档案的主要入口。",
  },
  {
    label: "人生轨迹",
    href: "/journey",
    description: "在地图与时间轴中查看求学和实习经历。",
  },
  {
    label: "科研",
    href: "/research",
    description: "研究方向、成果与持续进行的学术探索。",
  },
  {
    label: "项目",
    href: "/projects",
    description: "以完整案例记录问题、过程与结果。",
  },
  {
    label: "笔记",
    href: "/notes",
    description: "按主题和系列组织的长期学习知识库。",
  },
  {
    label: "珍宝库",
    href: "/treasure",
    description: "经过共同确认后保存的地点、物件与故事。",
  },
];
