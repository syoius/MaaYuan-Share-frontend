import { SetRequired, Simplify } from "type-fest";

import { CopilotDocV1 } from "../../models/copilot.schema";
import { PartialDeep } from "../../utils/partial-deep";
import { SimingActionDelays } from "./siming/constants";

export type WithId<T = {}> = T extends never ? never : T & { id: string };

export type WithPartialCoordinates<T> = T extends {
  location?: [number, number];
}
  ? Omit<T, "location"> & {
      location?: [number | undefined, number | undefined];
    }
  : T extends {
        distance?: [number, number];
      }
    ? Omit<T, "distance"> & {
        distance?: [number | undefined, number | undefined];
      }
    : T;

export type EditorOperationBase = Simplify<
  Omit<PartialDeep<CopilotDocV1.Operation>, "doc" | "opers" | "groups" | "actions"> & {
    minimumRequired: string;
    doc: PartialDeep<CopilotDocV1.Doc>;
    simingActionDelays?: SimingActionDelays;
    /**
     * 活动关卡可指定的司命识别关键字（会在导出 Siming 配置时使用）
     */
    levelRecognitionName?: string;
    /**
     * OCR 识别目标的点击偏移量：[x, y, w, h]
     */
    recTargetOffset?: [number, number, number, number];
    /**
     * 活动关卡自定义的难度描述，优先用于导出司命配置
     */
    activityDifficultyOverride?: string;
    /**
     * 快速编辑悬浮窗的持久化状态，序列化为顶层 recorder_meta。
     */
    recorderMeta?: CopilotDocV1.RecorderMeta;
  }
>;

// Editor-only 扩展容器（v1）：统一承载命盘/星石/辅星与基础数值
export interface EditorOperatorExtensionsV1 {
  version: 1;
  importedTraining?: boolean;
  discs?: {
    // 固定最多 3 槽；允许未满 3 长度；读写时请自行填充
    slots: Array<{
      // 0-based 槽位索引
      index: number;
      // 与旧字段 discsSelected 语义一致：0=协议层任意/未选，绝对值为命盘序号，负值表示禁用
      disc: number;
      // 仅编辑器使用：区分明确选择“任意”(disc=0) 与尚未选择
      discConfirmed?: boolean;
      // 星石/辅星名称，可空
      starStone?: string;
      assistStar?: string;
    }>;
  };
  stats?: {
    // 基础数值（仅编辑器使用，不导出到协议）
    starLevel?: number; // [1..6]
    attack?: number; // >= 0
    hp?: number; // >= 0
  };
}

export type EditorOperator = Simplify<
  WithId<
    SetRequired<PartialDeep<CopilotDocV1.Operator>, "name"> & {
      // UI 扩展：每个密探可选择最多 3 个命盘（索引从 1 开始；0 或缺省表示未选）
      discsSelected?: number[];
      // UI 扩展：对应每个命盘的星石选择（名称字符串），长度与 discsSelected 对齐
      discStarStones?: string[];
      // UI 扩展：对应每个命盘的辅星选择（名称字符串），长度与 discsSelected 对齐
      discAssistStars?: string[];
      // 基础数值（原方案直挂根上；用于 Viewer 回退与导出 toMaaOperation 的 snake_case）
      starLevel?: number;
      attack?: number;
      hp?: number;
      /**
       * 该密探不限制练度/命盘/星石。
       * 用于原创作业校验豁免，并让分享图/查看器知道不应展示具体练度要求。
       */
      unrestricted?: boolean;
      // 统一扩展容器（v1）：承载命盘/星石/辅星与基础数值，Editor-only
      extensions?: EditorOperatorExtensionsV1;
    }
  >
>;
export type EditorGroup = Simplify<
  WithId<
    PartialDeep<Omit<CopilotDocV1.Group, "opers">> & {
      name: string;
      opers: EditorOperator[];
    }
  >
>;

type GenerateEditorAction<T extends CopilotDocV1.Action> = T extends never
  ? never
  : Simplify<
      WithPartialCoordinates<
        Omit<SetRequired<PartialDeep<T>, "type">, "preDelay" | "postDelay" | "rearDelay">
      > &
        WithId<{
          intermediatePreDelay?: number;
          intermediatePostDelay?: number;
          /**
           * 快速录制悬浮窗使用的目标位标记（仅编辑器内部使用，不导出）。
           */
          recorderTargetIndex?: number;
          /**
           * 标记该左右切换动作是由快速录制自动生成的。
           */
          recorderAutomaticTargetSwitch?: boolean;
          /**
           * 该动作完成后死亡的敌人目标位（仅编辑器内部使用，不导出）。
           */
          recorderDeadTargetIndices?: number[];
          /**
           * 敌人死亡后游戏自动切换到的主位（仅编辑器内部使用，不导出）。
           */
          recorderDeadTargetFallbacks?: Array<{
            deadTargetIndex: number;
            fallbackTargetIndex: number;
          }>;
          /**
           * 该动作完成后出现的敌人目标位（仅编辑器内部使用，不导出）。
           */
          recorderSpawnedTargetIndices?: number[];
        }>
    >;

export type EditorAction = GenerateEditorAction<CopilotDocV1.Action>;

export interface EditorOperation extends EditorOperationBase {
  opers: EditorOperator[];
  groups: EditorGroup[];
  actions: EditorAction[];
}

export type EditorSourceType = "original" | "repost";

export interface EditorMetadata {
  visibility: "public" | "private";
  sourceType: EditorSourceType;
  repostAuthor?: string;
  repostPlatform?: string;
  repostUrl?: string;
  // 新增：平台标签（与首页筛选一致）
  tags?: string[];
}

export interface EditorState {
  operation: EditorOperation;
  metadata: EditorMetadata;
}
