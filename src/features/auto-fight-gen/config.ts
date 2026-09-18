export type LevelType = "主线" | "白鹄" | "洞窟" | "活动有分级" | "其他";
export type CaveType = "左" | "右";

export interface AutoFightConfig {
  useHeader: boolean;
  jsonName: string;
  levelType: LevelType;
  caveType: CaveType;
  levelRecognitionName: string;
  difficulty: string;
  roundPostDelay: number;
  useColor: boolean;
  colorList: string[];
  colorType: "fill" | "text";
  // 默认“无色/透明/无填充”等价颜色（可由外部配置 import.defaultColor 覆盖）
  defaultColorHex?: string;
  // 当前指向的敌人索引（用于首回合首动切换计算），未提供时默认 1
  currentEnemyIndex?: number;
  // 新增：用于“色块→内部令牌”的映射（保持顺序一致）
  paletteHexList?: string[];
  colorTokenList?: string[];
}

export const defaultAutoFightConfig: AutoFightConfig = {
  useHeader: false,
  jsonName: "actions",
  levelType: "其他",
  caveType: "左",
  levelRecognitionName: "其他",
  difficulty: "",
  roundPostDelay: 2000,
  useColor: false,
  colorList: ["白", "蓝"],
  colorType: "fill",
  defaultColorHex: "#FFFFFF",
  currentEnemyIndex: 1,
  paletteHexList: [],
  colorTokenList: [],
};

export const actionMap: Record<string, string> = {
  "↑": "大",
  个: "大",
  W: "大",
  w: "大",
  大: "大",
  "↓": "下",
  S: "下",
  s: "下",
  防: "下",
  a: "普",
  A: "普",
  普: "普",
  o: "O",
  O: "O",
  圈: "O",
};

export const operationMap: Record<string, string> = {
  Q: "左侧目标",
  E: "右侧目标",
  C: "检测橙星",
};

export interface FightAction {
  action: string;
  begin?: [number, number, number, number];
  end?: [number, number, number, number];
  target?: [number, number, number, number];
  post_delay?: number;
  duration?: number;
  recognition?: string;
  roi?: [number, number, number, number];
  text_doc?: string;
}

export const fightActionTemplates: Record<string, FightAction> = {
  "1号位上拉": {
    action: "Swipe",
    begin: [77, 991, 10, 1],
    end: [77, 670, 10, 1],
    post_delay: 5000,
    duration: 800,
  },
  "1号位下拉": {
    action: "Swipe",
    begin: [73, 985, 1, 1],
    end: [73, 1258, 1, 1],
    post_delay: 3000,
    duration: 800,
  },
  "1号位普攻": {
    action: "Click",
    target: [56, 960, 58, 62],
    post_delay: 3000,
  },
  "1号位O": {
    action: "Click",
    target: [76, 1114, 17, 18],
    post_delay: 5000,
  },
  切换敌人: {
    action: "Swipe",
    begin: [77, 991, 10, 10],
    end: [77, 670, 10, 10],
    post_delay: 3000,
  },
  "2号位上拉": {
    action: "Swipe",
    begin: [220, 996, 1, 1],
    end: [225, 668, 1, 1],
    post_delay: 5000,
    duration: 800,
  },
  "2号位下拉": {
    action: "Swipe",
    begin: [221, 975, 1, 1],
    end: [221, 1251, 1, 1],
    post_delay: 3000,
    duration: 800,
  },
  "2号位普攻": {
    action: "Click",
    target: [180, 959, 76, 83],
    post_delay: 3000,
  },
  "2号位O": {
    action: "Click",
    target: [214, 1116, 23, 13],
    post_delay: 5000,
  },
  "3号位上拉": {
    action: "Swipe",
    begin: [357, 975, 1, 1],
    end: [357, 714, 1, 1],
    post_delay: 5000,
    duration: 800,
  },
  "3号位下拉": {
    action: "Swipe",
    begin: [357, 975, 1, 1],
    end: [357, 1237, 1, 1],
    post_delay: 3000,
    duration: 800,
  },
  "3号位普攻": {
    action: "Click",
    target: [357, 975, 10, 10],
    post_delay: 3000,
  },
  "3号位O": {
    action: "Click",
    target: [355, 1118, 17, 10],
    post_delay: 5000,
  },
  "4号位上拉": {
    action: "Swipe",
    begin: [496, 980, 1, 1],
    end: [496, 679, 1, 1],
    post_delay: 5000,
    duration: 800,
  },
  "4号位下拉": {
    action: "Swipe",
    begin: [496, 985, 1, 1],
    end: [496, 1258, 1, 1],
    post_delay: 3000,
    duration: 800,
  },
  "4号位普攻": {
    action: "Click",
    target: [496, 980, 10, 10],
    post_delay: 3000,
  },
  "4号位O": {
    action: "Click",
    target: [498, 1115, 13, 16],
    post_delay: 5000,
  },
  "5号位上拉": {
    action: "Swipe",
    begin: [646, 987, 1, 1],
    end: [642, 700, 1, 1],
    post_delay: 5000,
    duration: 800,
  },
  "5号位下拉": {
    action: "Swipe",
    begin: [646, 985, 1, 1],
    end: [646, 1258, 1, 1],
    post_delay: 3000,
    duration: 800,
  },
  "5号位普攻": {
    action: "Click",
    target: [646, 987, 10, 10],
    post_delay: 3000,
  },
  "5号位O": {
    action: "Click",
    target: [634, 1118, 16, 11],
    post_delay: 5000,
  },
};
