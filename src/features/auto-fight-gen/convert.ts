import { type CellObject, read, utils } from "xlsx";

import {
  AutoFightConfig,
  actionMap,
  defaultAutoFightConfig,
  fightActionTemplates,
  operationMap,
} from "./config.ts";

const COLUMNS = ["1", "2", "3", "4", "5"] as const;

type ActionOrder = Record<number, { action: string }>;

type AutoFightNode = Record<string, unknown>;

type AutoFightGraph = Record<string, AutoFightNode>;

const ACTION_REGEX = /([^\d]*?)(\d+)(\D)/g;

// 动作符号归一化：把各种别名统一成标准符号
const canonicalActionMap: Record<string, string> = {
  "↑": "↑",
  个: "↑",
  W: "↑",
  大: "↑",
  "↓": "↓",
  S: "↓",
  防: "↓",
  a: "A",
  A: "A",
  普: "A",
  O: "O",
  M: "O",
  圈: "O",
};

const NAMED_COLORS = {
  黑: "黑",
  白: "白",
  灰: "灰",
  红: "红",
  橙: "橙",
  黄: "黄",
  绿: "绿",
  蓝: "蓝",
  紫: "紫",
} as const;

const themeColorHexMap: Record<number, string> = {
  0: "#FFFFFF",
  1: "#000000",
  2: "#FFFFFF",
  3: "#4F81BD",
  4: "#4F81BD",
  5: "#C0504D",
  6: "#9BBB59",
  7: "#8064A2",
  8: "#4F81BD",
  9: "#ED7D31",
};

const slideOperationToAction: Record<string, AutoFightNode> = {
  左侧目标: {
    text_doc: "左侧目标",
    action: "Click",
    target: [154, 648, 1, 1],
    post_delay: 2000,
    duration: 800,
  },
  右侧目标: {
    text_doc: "右侧目标",
    action: "Click",
    target: [603, 413, 18, 21],
    post_delay: 2000,
    duration: 800,
  },
  检测橙星: {
    text_doc: "检测橙星",
    recognition: "ColorMatch",
    roi: [77, 167, 70, 70],
    method: 4,
    upper: [255, 255, 205],
    lower: [166, 140, 85],
    count: 1,
    order_by: "Score",
    connected: true,
    action: "Click",
    pre_delay: 2000,
  },
};

const restartNodeTemplate: AutoFightNode = {
  recognition: "TemplateMatch",
  template: "back.png",
  green_mask: true,
  threshold: 0.5,
  roi: [6, 8, 123, 112],
  action: "Click",
  pre_delay: 2000,
  post_delay: 2000,
  next: ["抄作业确定左上角重开"],
  timeout: 20000,
};

const levelTypeToNextNode: Record<AutoFightConfig["levelType"], string> = {
  主线: "抄作业找到关卡-主线",
  洞窟: "抄作业进入关卡-洞窟",
  活动有分级: "抄作业找到关卡-活动分级",
  白鹄: "抄作业进入关卡-白鹄",
  其他: "抄作业找到关卡-OCR",
};

const cloneDeep = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const normalizeConfig = (overrides?: Partial<AutoFightConfig>): AutoFightConfig => ({
  ...defaultAutoFightConfig,
  ...overrides,
});

const getDefaultColorHex = (config: AutoFightConfig): string =>
  (config.defaultColorHex || "#FFFFFF").toUpperCase();

export const rgbToNamedColor = (r: number, g: number, b: number): string => {
  const rf = r / 255;
  const gf = g / 255;
  const bf = b / 255;
  const max = Math.max(rf, gf, bf);
  const min = Math.min(rf, gf, bf);
  const delta = max - min;

  let h = 0;
  if (delta === 0) {
    h = 0;
  } else if (max === rf) {
    h = 60 * (((gf - bf) / delta) % 6);
  } else if (max === gf) {
    h = 60 * ((bf - rf) / delta + 2);
  } else {
    h = 60 * ((rf - gf) / delta + 4);
  }
  if (h < 0) h += 360;

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  const sat = s * 255;
  const val = v * 255;

  if (sat <= 43 && val <= 46) return NAMED_COLORS.黑;
  if (sat <= 30 && val >= 221) return NAMED_COLORS.白;
  if (sat <= 43 && val > 46 && val < 221) return NAMED_COLORS.灰;

  if (h <= 20 || h > 345) return NAMED_COLORS.红;
  if (h <= 46) return NAMED_COLORS.橙;
  if (h <= 68) return NAMED_COLORS.黄;
  if (h <= 164) return NAMED_COLORS.绿;
  if (h <= 248) return NAMED_COLORS.蓝;
  return NAMED_COLORS.紫;
};

const argbToRgb = (argb: string): [number, number, number] => {
  const hex = parseInt(argb, 16);
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return [r, g, b];
};

export const hexToNamedColor = (hex: string): string => {
  const noHash = hex.startsWith("#") ? hex.slice(1) : hex;
  if (noHash.length !== 6) return "白";
  const r = parseInt(noHash.slice(0, 2), 16);
  const g = parseInt(noHash.slice(2, 4), 16);
  const b = parseInt(noHash.slice(4, 6), 16);
  return rgbToNamedColor(r, g, b);
};

const rgbTupleToHex = (rgb: [number, number, number]): string =>
  `#${rgb[0].toString(16).padStart(2, "0")}${rgb[1]
    .toString(16)
    .padStart(2, "0")}${rgb[2].toString(16).padStart(2, "0")}`.toUpperCase();

const getCellFillRgbHex = (cell: CellObject): string | null => {
  const anyCell = cell as unknown as {
    s?: {
      fgColor?: { rgb?: string; theme?: number };
      fill?: {
        patternType?: string;
        fgColor?: { rgb?: string; theme?: number };
        bgColor?: { rgb?: string; theme?: number };
      };
    };
  };
  const s = anyCell?.s;
  const tryColors = [s?.fgColor?.rgb, s?.fill?.fgColor?.rgb, s?.fill?.bgColor?.rgb].filter(
    Boolean,
  ) as string[];
  if (tryColors.length > 0) {
    const [r, g, b] = argbToRgb(tryColors[0]!);
    return rgbTupleToHex([r, g, b]);
  }
  const theme = s?.fgColor?.theme ?? s?.fill?.fgColor?.theme ?? s?.fill?.bgColor?.theme;
  if (typeof theme === "number") {
    return themeColorHexMap[theme] ?? null;
  }
  return null;
};

const pickCellColor = (cell: CellObject, config: AutoFightConfig): string => {
  if (!config.useColor) {
    return "";
  }

  if (config.colorType === "text") {
    const raw = typeof cell.v === "string" ? cell.v.trim() : "";
    if (!raw) return "";
    const matched = config.colorList.find((token) => raw.startsWith(token));
    return matched ?? "";
  }

  const rawFillHex = getCellFillRgbHex(cell);
  const defaultHex = getDefaultColorHex(config);
  const normalizedHex = (() => {
    if (!rawFillHex) return defaultHex;
    const upper = rawFillHex.toUpperCase();
    if (upper === "#FFFFFF") return defaultHex;
    return upper;
  })();

  const palette = (config.paletteHexList ?? []).map((h) => h.toUpperCase());
  const tokens =
    config.colorTokenList && config.colorTokenList.length > 0
      ? config.colorTokenList
      : config.colorList;
  let idx = palette.indexOf(normalizedHex);
  if (idx >= 0 && tokens[idx]) {
    return tokens[idx];
  }
  const fallbackIdx = palette.indexOf(defaultHex);
  if (fallbackIdx >= 0 && tokens[fallbackIdx]) {
    console.warn("[XlsxImporter] 未识别的颜色，回退到默认色", rawFillHex, "→", defaultHex);
    return tokens[fallbackIdx];
  }
  if (tokens.length > 0) {
    console.warn("[XlsxImporter] 默认色未在调色板中，使用第一个令牌作为回退", {
      defaultHex,
      palette,
    });
    return tokens[0]!;
  }
  return "";
};

const readSheetRows = (
  arrayBuffer: ArrayBuffer,
  config: AutoFightConfig,
  sheetIndex = 0,
): string[][] => {
  const workbook = read(arrayBuffer, { type: "array", cellStyles: true });
  const sheetName = workbook.SheetNames[sheetIndex];
  if (!sheetName) {
    throw new Error("xlsx_no_sheet");
  }
  const sheet = workbook.Sheets[sheetName];
  const rangeRef = sheet["!ref"];
  if (!rangeRef) {
    throw new Error("xlsx_empty");
  }
  const range = utils.decode_range(rangeRef);
  const rows: string[][] = [];

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    if (config.useHeader && r === range.s.r) {
      continue;
    }
    const rowValues: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cellAddress = utils.encode_cell({ r, c });
      const cell = sheet[cellAddress] as CellObject | undefined;
      if (!cell || cell.v === undefined || cell.v === null) {
        rowValues.push("");
        continue;
      }
      const rawText = String(cell.v).trim();
      if (!rawText) {
        rowValues.push("");
        continue;
      }
      if (config.useColor) {
        const color = pickCellColor(cell, config);
        rowValues.push(`${color}${rawText}`);
      } else {
        rowValues.push(rawText);
      }
    }
    if (rowValues.some((value) => value !== "")) {
      rows.push(rowValues);
    }
  }

  return rows;
};

export const detectXlsxColors = (
  arrayBuffer: ArrayBuffer,
  overrides?: Partial<AutoFightConfig>,
): string[] => {
  const config = normalizeConfig({ useColor: true, ...overrides });
  const workbook = read(arrayBuffer, { type: "array", cellStyles: true });
  const [sheetName] = workbook.SheetNames;
  if (!sheetName) {
    return [];
  }
  const sheet = workbook.Sheets[sheetName];
  const rangeRef = sheet["!ref"];
  if (!rangeRef) {
    return [];
  }
  const range = utils.decode_range(rangeRef);
  const set = new Set<string>();

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    if (config.useHeader && r === range.s.r) continue;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cellAddress = utils.encode_cell({ r, c });
      const cell = sheet[cellAddress] as CellObject | undefined;
      if (!cell) continue;
      const rawText = cell.v === undefined || cell.v === null ? "" : String(cell.v).trim();
      const fillHex = getCellFillRgbHex(cell);
      if (fillHex) {
        const hexNoHash = fillHex.replace("#", "");
        const r = parseInt(hexNoHash.slice(0, 2), 16);
        const g = parseInt(hexNoHash.slice(2, 4), 16);
        const b = parseInt(hexNoHash.slice(4, 6), 16);
        const colorName = rgbToNamedColor(r, g, b);
        if (colorName) set.add(colorName);
        continue;
      }
      if (rawText) {
        const color = pickCellColor(cell, config);
        if (color) set.add(color);
      }
    }
  }

  return Array.from(set);
};

export interface DetectedColor {
  label: string;
  rgb: string;
}

export const detectXlsxPalette = (
  arrayBuffer: ArrayBuffer,
  overrides?: Partial<AutoFightConfig>,
): DetectedColor[] => {
  const config = normalizeConfig({ useColor: true, ...overrides });
  const workbook = read(arrayBuffer, { type: "array", cellStyles: true });
  const [sheetName] = workbook.SheetNames;
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const rangeRef = sheet["!ref"];
  if (!rangeRef) return [];
  const range = utils.decode_range(rangeRef);

  const map = new Map<string, DetectedColor>();
  const defaultHex = getDefaultColorHex(config);
  let hasNoFillOrDefault = false;

  for (let r = range.s.r; r <= range.e.r; r += 1) {
    if (config.useHeader && r === range.s.r) continue;
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const cellAddress = utils.encode_cell({ r, c });
      const cell = sheet[cellAddress] as CellObject | undefined;
      if (!cell) continue;
      const rawFillHex = getCellFillRgbHex(cell);
      if (!rawFillHex) {
        hasNoFillOrDefault = true;
        continue;
      }
      const fillHex = rawFillHex.toUpperCase() === "#FFFFFF" ? defaultHex : rawFillHex;
      const hexNoHash = fillHex.replace("#", "");
      const r8 = parseInt(hexNoHash.slice(0, 2), 16);
      const g8 = parseInt(hexNoHash.slice(2, 4), 16);
      const b8 = parseInt(hexNoHash.slice(4, 6), 16);
      const label = rgbToNamedColor(r8, g8, b8);
      if (!map.has(fillHex)) {
        map.set(fillHex, { label, rgb: fillHex });
      }
    }
  }

  if (hasNoFillOrDefault && !map.has(defaultHex)) {
    map.set(defaultHex, { label: hexToNamedColor(defaultHex), rgb: defaultHex });
  }

  return Array.from(map.values());
};

const getActionTemplate = (actionCode: string) => {
  const position = actionCode[0];
  const actionType = actionCode[1];
  const key = `${position}号位${
    actionType === "普" ? "普攻" : actionType === "大" ? "上拉" : actionType === "下" ? "下拉" : "O"
  }`;
  return fightActionTemplates[key];
};

const getSlideOperations = (
  previousColor: string,
  targetColor: string,
  config: AutoFightConfig,
): string[] => {
  const colors = config.colorList;
  const previousIndex = colors.indexOf(previousColor);
  const targetIndex = colors.indexOf(targetColor);
  if (previousIndex === -1 || targetIndex === -1) {
    return [];
  }
  const clockwiseDistance = (targetIndex - previousIndex + colors.length) % colors.length;
  const counterDistance = (previousIndex - targetIndex + colors.length) % colors.length;
  if (clockwiseDistance <= counterDistance) {
    return new Array(clockwiseDistance).fill("右侧目标");
  }
  return new Array(counterDistance).fill("左侧目标");
};

// --- 预处理辅助 ---

const isDirtyPrefix = (ch: string) => ch === "a" || ch === "A";

// 预处理：给整行补全序号。
// 规则：
// 1. 每行独立编号；
// 2. 带数字的动作视为锚点，数字仅用于排序；
// 3. 同一单元格里，锚点之前的连续无序号动作，作为一个“无锚点组”，
//    从 1 开始找第一个未被锚点主位置占用的空闲数字，作为这一组的主位置，
//    组内动作按顺序给 secondary = 0, 1, 2, ...，整体连续占位；
// 4. 同一单元格里，锚点之后的连续无序号动作，挂在最近锚点后面：
//    主位置 = 该锚点号，secondary = 挂载顺序；
// 5. 合并后从 1 开始重新连续编号，再按原单元格写回。
const preprocessRow = (row: string[], config: AutoFightConfig): string[] => {
  const colorTokens = new Set<string>([
    ...(config.colorTokenList ?? []),
    ...(config.colorList ?? []),
  ]);

  const splitPrefix = (cell: string): { prefix: string; rest: string } => {
    if (config.useColor) {
      const first = cell[0] ?? "";
      if (first && colorTokens.has(first)) {
        return { prefix: first, rest: cell.slice(1) };
      }
      return { prefix: "", rest: cell };
    }
    let i = 0;
    while (i < cell.length && (!actionMap[cell[i]] || isDirtyPrefix(cell[i]))) {
      if (isDirtyPrefix(cell[i]) && i + 1 >= cell.length) break;
      i++;
    }
    return { prefix: "", rest: cell.slice(i) };
  };

  type Parsed = {
    cellIdx: number;
    posInCell: number;
    anchor: number | null;
    symbol: string;
    prefix: string;
  };

  // 1) 解析每格动作
  const actionsByCell: Parsed[][] = row.map(() => []);
  row.forEach((cell, cellIdx) => {
    if (!cell || !cell.trim()) return;
    const { prefix, rest } = splitPrefix(cell);
    if (!rest) return;
    const re = /(\d*)([^\d])/g;
    let m: RegExpExecArray | null;
    let posInCell = 0;
    while ((m = re.exec(rest)) !== null) {
      const rawSymbol = m[2];
      const symbol = canonicalActionMap[rawSymbol] ?? rawSymbol;
      if (!actionMap[symbol] || actionMap[symbol] === "未知") continue;
      const numStr = m[1];
      actionsByCell[cellIdx].push({
        cellIdx,
        posInCell: posInCell++,
        anchor: numStr ? Number(numStr) : null,
        symbol,
        prefix,
      });
    }
  });

  // 2) 收集锚点主位置
  const anchorNums = new Set<number>();
  let totalActions = 0;
  actionsByCell.forEach((cellActions) => {
    totalActions += cellActions.length;
    cellActions.forEach((a) => {
      if (a.anchor !== null) anchorNums.add(a.anchor);
    });
  });

  // 3) 算空闲数字列表（从 1 开始，跳过锚点主位置）
  const maxAnchor = anchorNums.size > 0 ? Math.max(...anchorNums) : 0;
  const limit = Math.max(totalActions, maxAnchor) + totalActions;
  const freeNums: number[] = [];
  for (let n = 1; n <= limit; n++) {
    if (!anchorNums.has(n)) freeNums.push(n);
  }
  let freeIdx = 0;

  // 4) 算排序键
  type Keyed = Parsed & { primary: number; secondary: number };
  const keyed: Keyed[] = [];

  actionsByCell.forEach((cellActions) => {
    if (cellActions.length === 0) return;

    const firstAnchorIdx = cellActions.findIndex((a) => a.anchor !== null);

    // 全部无锚点：整格作为一组
    if (firstAnchorIdx === -1) {
      const primary = freeNums[freeIdx++] ?? Number.MAX_SAFE_INTEGER;
      cellActions.forEach((a, i) => {
        keyed.push({ ...a, primary, secondary: i });
      });
      return;
    }

    // 锚点之前的连续无锚点：作为一组
    if (firstAnchorIdx > 0) {
      const leading = cellActions.slice(0, firstAnchorIdx);
      const primary = freeNums[freeIdx++] ?? Number.MAX_SAFE_INTEGER;
      leading.forEach((a, i) => {
        keyed.push({ ...a, primary, secondary: i });
      });
    }

    // 锚点及其后面挂载的无序号动作
    let anchorPrimary: number | null = null;
    let anchorCount = 0;
    for (let i = firstAnchorIdx; i < cellActions.length; i++) {
      const a = cellActions[i];
      if (a.anchor !== null) {
        anchorPrimary = a.anchor;
        anchorCount = 0;
        keyed.push({ ...a, primary: anchorPrimary, secondary: 0 });
      } else {
        anchorCount++;
        keyed.push({ ...a, primary: anchorPrimary!, secondary: anchorCount });
      }
    }
  });

  // 5) 排序
  keyed.sort((a, b) => {
    if (a.primary !== b.primary) return a.primary - b.primary;
    if (a.secondary !== b.secondary) return a.secondary - b.secondary;
    if (a.cellIdx !== b.cellIdx) return a.cellIdx - b.cellIdx;
    return a.posInCell - b.posInCell;
  });

  // 6) 重新编号 + 按原格写回
  const cellOutputs: string[] = row.map(() => "");
  keyed.forEach((a, idx) => {
    const newNum = idx + 1;
    cellOutputs[a.cellIdx] += `${a.prefix}${newNum}${a.symbol}`;
  });

  return row.map((orig, i) => {
    if (!orig || !orig.trim()) return orig ?? "";
    return cellOutputs[i] || orig;
  });
};

export const __debugPreprocessRow = preprocessRow;

const parseActionsForRow = (row: string[], config: AutoFightConfig): ActionOrder => {
  const actionOrder: ActionOrder = {};
  const processed = preprocessRow(row, config);

  processed.forEach((seq, idx) => {
    if (typeof seq !== "string" || seq.trim() === "") {
      return;
    }

    const normalized = seq
      .replace(/普攻/g, "普")
      .replace(/技能/g, "大")
      .replace(/防御/g, "防");

    const columnIndex = COLUMNS[idx] ?? String(idx + 1);
    const matches = Array.from(normalized.matchAll(ACTION_REGEX));

    matches.forEach((match) => {
      let operations = match[1];
      if (config.useColor && config.colorList.length > 0) {
        const expectedColor = matches[0]?.[1]?.[0];
        if (!operations || !config.colorList.includes(operations[0] ?? "")) {
          operations = (expectedColor ?? "") + operations;
        }
      }
      const number = Number(match[2]);
      const symbol = match[3];
      const actionType = actionMap[symbol] ?? "未知";
      if (actionType === "未知") {
        console.warn("未知的动作符号", symbol);
        return;
      }

      actionOrder[number] = {
        action: `${operations}${columnIndex}${actionType}`,
      };
    });
  });

  const sorted = Object.entries(actionOrder).sort(([a], [b]) => Number(a) - Number(b));
  const renumbered: ActionOrder = {};
  sorted.forEach(([, action], i) => {
    renumbered[i + 1] = action;
  });
  return renumbered;
};

const setOperationAction = (
  actionOp: string,
  roundIndex: number,
  actionIndex: number,
  graph: AutoFightGraph,
  currentActionKey: string | null,
): { actionIndex: number; currentActionKey: string | null } => {
  if (actionOp === "未知") {
    console.warn("未知的操作符", actionOp);
    return { actionIndex, currentActionKey };
  }

  const actionKey = `回合${roundIndex}行动${actionIndex + 1}`;
  const template = slideOperationToAction[actionOp];
  if (!template) {
    return { actionIndex, currentActionKey };
  }

  graph[actionKey] = cloneDeep(template);
  if (actionOp === "检测橙星") {
    if (currentActionKey && graph[currentActionKey]) {
      graph[currentActionKey].on_error = ["抄作业点左上角重开"];
      graph[currentActionKey].timeout = 200;
    } else {
      const detectorKey = `检测回合${roundIndex}`;
      if (graph[detectorKey]) {
        graph[detectorKey].on_error = ["抄作业点左上角重开"];
        graph[detectorKey].timeout = 200;
      }
    }
  }

  if (currentActionKey && graph[currentActionKey]) {
    graph[currentActionKey].next = [actionKey];
  }

  return { actionIndex: actionIndex + 1, currentActionKey: actionKey };
};

const addRestartInfo = (graph: AutoFightGraph, config: AutoFightConfig) => {
  const nextNode = levelTypeToNextNode[config.levelType];
  graph["抄作业点左上角重开"] = {
    ...cloneDeep(restartNodeTemplate),
    next: ["抄作业确定左上角重开", nextNode],
  };

  if (config.levelType === "洞窟") {
    graph["抄作业进入关卡-洞窟"] =
      config.caveType === "左"
        ? {
            text_doc: "左",
            recognition: "OCR",
            expected: "前往",
            roi: [237, 810, 82, 89],
            action: "Click",
            target: [258, 833, 42, 39],
            pre_delay: 1500,
            next: ["抄作业战斗开始"],
            timeout: 20000,
          }
        : {
            text_doc: "右",
            recognition: "OCR",
            expected: "前往",
            roi: [558, 804, 79, 89],
            action: "Click",
            target: [581, 832, 41, 41],
            pre_delay: 1500,
            next: ["抄作业战斗开始"],
            timeout: 20000,
          };
  } else if (config.levelType === "活动有分级") {
    graph["抄作业找到关卡-活动分级"] = {
      recognition: "OCR",
      expected: config.levelRecognitionName,
      roi: [0, 249, 720, 1030],
      action: "Click",
      pre_delay: 1500,
      next: ["抄作业选择活动分级"],
      timeout: 20000,
    };
    graph["抄作业选择活动分级"] = {
      recognition: "OCR",
      expected: config.difficulty,
      roi: [37, 351, 647, 491],
      pre_delay: 1500,
      action: "Click",
      next: ["抄作业进入关卡"],
      timeout: 20000,
    };
  } else if (config.levelType !== "主线" && config.levelType !== "白鹄") {
    graph["抄作业找到关卡-OCR"] = {
      recognition: "OCR",
      expected: config.levelRecognitionName,
      roi: [0, 249, 720, 1030],
      action: "Click",
      pre_delay: 2000,
      next: ["抄作业战斗开始"],
      timeout: 20000,
    };
  }
};

export interface ConvertOptions extends Partial<AutoFightConfig> {}

type ConvertProbeOptions = ConvertOptions & { __sheetIndex?: number };

export const convertXlsxToAutoFightJson = (
  arrayBuffer: ArrayBuffer,
  overrides?: ConvertProbeOptions,
) => {
  const config = normalizeConfig(overrides);
  const rows = readSheetRows(arrayBuffer, config, overrides?.__sheetIndex ?? 0);
  if (!rows.length) {
    throw new Error("xlsx_no_content");
  }

  const graph: AutoFightGraph = {};
  let previousColor = "";
  if (config.useColor && (config.colorList?.length ?? 0) > 0) {
    const idx = Math.max(1, config.currentEnemyIndex ?? 1) - 1;
    previousColor = config.colorList[idx % config.colorList.length];
  }

  rows.forEach((row, roundIdx) => {
    const round = roundIdx + 1;
    const detectionKey = `检测回合${round}`;
    graph[detectionKey] = {
      recognition: "OCR",
      expected: `回合${round}`,
      roi: [585, 28, 90, 65],
      next: [`回合${round}行动1`],
      post_delay: config.roundPostDelay,
    };

    const actionOrder = parseActionsForRow(row, config);
    const sortedEntries = Object.entries(actionOrder).sort(([a], [b]) => Number(a) - Number(b));

    const totalActions = sortedEntries.reduce(
      (acc, [, action]) => acc + Math.max(action.action.length - 1, 0),
      0,
    );

    let actionIndex = 0;
    let currentActionKey: string | null = null;
    let progression = 0;

    sortedEntries.forEach(([, action]) => {
      const directionsMatch = action.action.match(/^[^\d]+/);
      const directions = directionsMatch ? directionsMatch[0].split("") : [];
      directions.forEach((direction) => {
        progression += 1;
        const mapped = operationMap[direction] ?? "未知";
        if (config.useColor && config.colorList.includes(direction)) {
          if (!previousColor) {
            previousColor = direction;
            return;
          }
          if (previousColor === direction) {
            return;
          }
          const slideOps = getSlideOperations(previousColor, direction, config);
          previousColor = direction;
          slideOps.forEach((slideOp) => {
            const result = setOperationAction(slideOp, round, actionIndex, graph, currentActionKey);
            actionIndex = result.actionIndex;
            currentActionKey = result.currentActionKey;
          });
        } else {
          const result = setOperationAction(mapped, round, actionIndex, graph, currentActionKey);
          actionIndex = result.actionIndex;
          currentActionKey = result.currentActionKey;
        }
      });

      actionIndex += 1;
      progression += 1;

      const actionTemplate = getActionTemplate(action.action.slice(-2));
      if (!actionTemplate) {
        console.warn("未找到动作模板", action.action);
        return;
      }

      const actionKey = `回合${round}行动${actionIndex}`;
      const rawDoc = action.action.slice(-2);
      graph[actionKey] = {
        ...cloneDeep(actionTemplate),
        text_doc: rawDoc.endsWith("O") ? rawDoc.slice(0, -1) + "sp" : rawDoc,
      };

      if (currentActionKey && graph[currentActionKey]) {
        graph[currentActionKey].next = [actionKey];
      }

      currentActionKey = actionKey;

      const isRoundLastAction = progression === totalActions && round < rows.length;
      if (isRoundLastAction) {
        graph[actionKey].next = ["抄作业战斗胜利", `检测回合${round + 1}`];
      }
    });
  });

  addRestartInfo(graph, config);

  return JSON.stringify(graph, null, 2);
};
