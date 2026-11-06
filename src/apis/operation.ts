import { uniqBy } from "lodash-es";
import {
  BanCommentsStatusEnum,
  CopilotCUDRequest,
  CopilotInfoFromJSON,
  CopilotInfoStatusEnum,
  QueriesCopilotRequest,
  UpdateCopilotRequest,
  UploadCopilotOperationRequest,
} from "maa-copilot-client";
import useSWR, { SWRConfiguration } from "swr";
import useSWRInfinite from "swr/infinite";

import { isHiddenInHotSort } from "../constants/hot-sort-blocklist";
import { toCopilotOperation } from "models/converter";
import { OpRatingType, Operation, OperationMetadata } from "models/operation";
import { ShortCodeContent, parseShortCode } from "models/shortCode";
import { OperationApi, readRawApiResponse } from "utils/maa-copilot-client";
import { useSWRRefresh } from "utils/swr";
import { SearchTimeoutError } from "utils/error";
import { withSearchTimeout } from "utils/search-timeout";

export type OrderBy = "views" | "hot" | "id";

export interface OperatorFilterParams {
  included: string[];
  excluded: string[];
}

export interface UseOperationsParams {
  limit?: number;
  orderBy?: OrderBy;
  descending?: boolean;
  keyword?: string;
  levelKeyword?: string;
  // 新增：tags 多选 AND 筛选
  tags?: string[];
  operator?: OperatorFilterParams;
  operationIds?: number[];
  uploaderId?: string;

  disabled?: boolean;
  suspense?: boolean;
  revalidateFirstPage?: boolean;
}

export function useOperations({
  limit = 50,
  orderBy,
  descending = true,
  keyword,
  levelKeyword,
  tags,
  operator,
  operationIds,
  uploaderId,
  disabled,
  suspense,
  revalidateFirstPage,
}: UseOperationsParams) {
  const {
    error,
    data: pages,
    setSize,
    mutate,
    isValidating,
  } = useSWRInfinite(
    (pageIndex, previousPage: { hasNext: boolean }) => {
      if (disabled) {
        return null;
      }
      if (previousPage && !previousPage.hasNext) {
        return null; // reached the end
      }

      // 用户输入神秘代码时，只传这个 id，其他参数都不传
      if (keyword) {
        let content: ShortCodeContent | null = null;

        try {
          content = parseShortCode(keyword);
        } catch (e) {
          console.warn(e);
        }

        if (content) {
          return [
            "operations",
            {
              copilotIds: [content.id],
            } satisfies QueriesCopilotRequest,
          ];
        }
      }

      return [
        "operations",
        {
          limit,
          page: pageIndex + 1,
          document: keyword,
          levelKeyword,
          operator: operator
            ? [...operator.included, ...operator.excluded.map((o) => `~${o}`)].join(",") ||
              undefined
            : undefined,
          orderBy,
          desc: descending,
          copilotIds: operationIds,
          uploaderId,
          tags: tags?.map((tag) => tag.trim()).filter(Boolean),
        } satisfies QueriesCopilotRequest,
      ];
    },
    async ([, req]) => {
      // 如果指定了 id 列表，但是列表为空，就直接返回空数据。不然要是直接传空列表，就相当于没有这个参数，
      // 会导致后端返回所有数据
      if (req.copilotIds?.length === 0) {
        return { data: [], hasNext: false, total: 0 };
      }

      // 使用 Raw 接口拿到未加工 JSON，确保 metadata 不丢失
      const api = new OperationApi({ sendToken: "optional", requireData: true });
      const rawJson = await withSearchTimeout(async (signal) => {
        const rawResponse = await api.queriesCopilotRaw(req, { signal });
        return readRawApiResponse<{
          data?: { data?: any[]; has_next?: boolean; page?: number; total?: number };
        }>(rawResponse.raw);
      });
      const payload = rawJson.data!;

      let parsedOperations: Operation[] = (payload.data ?? []).map((item) => {
        const baseInfo = CopilotInfoFromJSON(item);
        // 后端返回的 tags 位于顶层（item.tags），需注入到 metadata 以便前端统一从 metadata.tags 读取
        const metadata = mapResponseMetadata(item?.metadata);
        if (Array.isArray(item?.tags)) {
          const cleaned = item.tags
            .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
            .filter((s: string) => s.length > 0);
          if (cleaned.length) metadata.tags = cleaned;
        }

        // 基于后端直出字段构造预关卡信息，避免从 content 解析
        const d: any = item;
        const stageId = d.stageId ?? d.stage_id;
        const levelId = d.levelId ?? d.level_id ?? stageId ?? "";
        const name = d.name ?? "";
        const catOne = d.catOne ?? d.cat_one ?? "";
        const catTwo = d.catTwo ?? d.cat_two ?? "";
        const catThree = d.catThree ?? d.cat_three ?? "";
        const preLevel =
          !stageId && !catOne && !catTwo && !catThree && !name
            ? undefined
            : {
                levelId,
                stageId: stageId ?? "",
                catOne,
                catTwo,
                catThree,
                name,
                width: 0,
                height: 0,
                endTime: d.endTime ?? d.end_time ?? undefined,
              };
        return {
          ...baseInfo,
          metadata,
          parsedContent: toCopilotOperation(baseInfo),
          preLevel,
        };
      });

      // 如果 revalidateFirstPage=false，从第二页开始可能会有重复数据，需要去重
      parsedOperations = uniqBy(parsedOperations, (o) => o.id);

      const requestPage = "page" in req ? req.page : undefined;

      return {
        hasNext: !!payload.has_next,
        page: payload.page ?? requestPage,
        total: payload.total ?? 0,
        data: parsedOperations,
      };
    },
    {
      suspense,
      shouldRetryOnError: (error) => !(error instanceof SearchTimeoutError),
      focusThrottleInterval: 1000 * 60 * 30,
      revalidateFirstPage,
    },
  );

  const isReachingEnd = !!pages?.some((page) => !page.hasNext);
  const total = pages?.[0]?.total ?? 0;

  const _operations = pages?.map((page) => page.data).flat() ?? [];

  // 按 operationIds 的顺序排序
  const operations = operationIds?.length
    ? operationIds?.map((id) => _operations?.find((v) => v.id === id)).filter((v) => !!v)
    : _operations;
  const enableHotBlocklist = orderBy === "hot" &&
    !keyword?.trim() && !levelKeyword?.trim() && !uploaderId &&
    !operationIds && !tags?.some((tag) => tag.trim()) &&
    !operator?.included.length && !operator?.excluded.length;
  const filteredOperations = enableHotBlocklist
    ? operations.filter((op) => !isHiddenInHotSort(op))
    : operations;
  const filteredTotal = enableHotBlocklist
    ? Math.max(0, total - (operations.length - filteredOperations.length))
    : total;

  return {
    error,
    retry: () => mutate(),
    operations: filteredOperations,
    total: filteredTotal,
    setSize,
    isValidating,
    isReachingEnd,
  };
}

export function useRefreshOperations() {
  const refresh = useSWRRefresh();
  return () => refresh((key) => key.includes("operations"));
}

interface UseOperationParams extends SWRConfiguration {
  id?: number;
}

export function useOperation({ id, ...config }: UseOperationParams) {
  return useSWR(id ? ["operation", id] : null, () => getOperation({ id: id! }), config);
}

export function useRefreshOperation() {
  const refresh = useSWRRefresh();
  return (id: number) => refresh((key) => key.includes("operation") && key.includes(String(id)));
}

export async function getOperation(req: { id: number }): Promise<Operation> {
  const api = new OperationApi({
    sendToken: "optional",
    requireData: true,
  });
  const rawResponse = await api.getCopilotByIdRaw(req);
  const rawJson = await readRawApiResponse<{ data?: any }>(rawResponse.raw);
  const payload = rawJson?.data ?? {};
  const baseInfo = CopilotInfoFromJSON(payload);
  // 基于后端返回的原始 metadata 构建前端使用的元数据
  const metadata = mapResponseMetadata(payload.metadata);
  // 补充：后端可能将标签以顶层字段 `tags: string[]` 返回
  // 为保持前端读取的一致性，将其注入到 metadata.tags 中
  if (Array.isArray((payload as any)?.tags)) {
    const cleaned = (payload as any).tags
      .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
      .filter((s: string) => s.length > 0);
    if (cleaned.length) {
      metadata.tags = cleaned;
    }
  }

  const d: any = payload;
  const preLevel = (() => {
    const stageId = d.stageId ?? d.stage_id;
    const levelId = d.levelId ?? d.level_id ?? stageId ?? "";
    const name = d.name ?? "";
    const catOne = d.catOne ?? d.cat_one ?? "";
    const catTwo = d.catTwo ?? d.cat_two ?? "";
    const catThree = d.catThree ?? d.cat_three ?? "";
    if (!stageId && !catOne && !catTwo && !catThree && !name) {
      return undefined;
    }
    return {
      levelId,
      stageId: stageId ?? "",
      catOne,
      catTwo,
      catThree,
      name,
      width: 0,
      height: 0,
      endTime: d.endTime ?? d.end_time ?? undefined,
    };
  })();

  return {
    ...baseInfo,
    metadata,
    parsedContent: toCopilotOperation(baseInfo),
    preLevel,
  };
}

export interface OperationMetadataPayload {
  sourceType: "original" | "repost";
  repostAuthor?: string;
  repostPlatform?: string;
  repostUrl?: string;
  // 新增：平台标签（多选 AND）
  tags?: string[];
}

type CopilotCUDRequestWithMetadata = CopilotCUDRequest & {
  metadata?: OperationMetadataPayload;
};

function buildCopilotCUDRequest({
  metadata,
  ...rest
}: {
  id?: number;
  content: string;
  status: CopilotInfoStatusEnum;
  metadata?: OperationMetadataPayload;
}): CopilotCUDRequestWithMetadata {
  const payload: CopilotCUDRequestWithMetadata = {
    type: "PRTS",
    ...rest,
  };
  if (!metadata) {
    return payload;
  }
  return { ...payload, metadata };
}

function prepareRequestBody(payload: CopilotCUDRequestWithMetadata) {
  const metadata = payload.metadata;
  if (!metadata) {
    const { metadata: _removed, ...rest } = payload;
    return rest;
  }
  const sanitized = {
    sourceType: metadata.sourceType ?? "original",
    repostAuthor: metadata.repostAuthor?.trim() || undefined,
    repostPlatform: metadata.repostPlatform?.trim() || undefined,
    repostUrl: metadata.repostUrl?.trim() || undefined,
    // 仅保留非空字符串的标签，去重
    tags: Array.isArray(metadata.tags)
      ? Array.from(new Set(metadata.tags.map((s) => (s ?? "").trim()).filter((s) => s.length > 0)))
      : undefined,
  };
  if (
    sanitized.sourceType === "original" &&
    !sanitized.repostAuthor &&
    !sanitized.repostPlatform &&
    !sanitized.repostUrl &&
    !sanitized.tags?.length
  ) {
    const { metadata: _removed, ...rest } = payload;
    return rest;
  }
  return {
    ...payload,
    metadata: sanitized,
  };
}

function mapResponseMetadata(raw: any | undefined): OperationMetadata {
  const clean = (value: unknown) => {
    if (typeof value !== "string") return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };

  // 当后端未提供 metadata（null/undefined）时，不推断来源类型，
  // 保持为空以避免前端为标题加上前缀（例如“【原创】”）。
  if (raw === null || raw === undefined) {
    return {
      // 故意不设置 sourceType，以便 UI 判空时不显示前缀
      repostAuthor: undefined,
      repostPlatform: undefined,
      repostUrl: undefined,
      tags: undefined,
    } as OperationMetadata;
  }

  const source =
    (typeof raw?.sourceType === "string" ? raw.sourceType : undefined) ??
    (typeof raw?.source_type === "string" ? raw.source_type : undefined);

  return {
    sourceType: source?.toLowerCase() === "repost" ? "repost" : "original",
    repostAuthor: clean(raw?.repostAuthor) ?? clean(raw?.repost_author) ?? undefined,
    repostPlatform: clean(raw?.repostPlatform) ?? clean(raw?.repost_platform) ?? undefined,
    repostUrl: clean(raw?.repostUrl) ?? clean(raw?.repost_url) ?? undefined,
    // 支持从后端读取 tags（数组字符串）
    tags: Array.isArray(raw?.tags)
      ? raw.tags
          .map((s: unknown) => (typeof s === "string" ? s.trim() : ""))
          .filter((s: string) => s.length > 0)
      : undefined,
  };
}
export async function createOperation(req: {
  content: string;
  status: CopilotInfoStatusEnum;
  metadata?: OperationMetadataPayload;
}) {
  const payload = buildCopilotCUDRequest(req);
  const api = new OperationApi();
  const response = await api.uploadCopilotRaw(
    {
      uploadCopilotRequest: payload,
    } satisfies UploadCopilotOperationRequest,
    async ({ init }) => {
      const bodyObject = prepareRequestBody(payload);
      return {
        ...init,
        body: bodyObject as unknown as BodyInit,
      };
    },
  );
  return (await response.value()).data;
}

export async function updateOperation(req: {
  id: number;
  content: string;
  status: CopilotInfoStatusEnum;
  metadata?: OperationMetadataPayload;
}) {
  const payload = buildCopilotCUDRequest(req);
  const api = new OperationApi();
  const response = await api.updateCopilotRaw(
    {
      uploadCopilotRequest: payload,
    } satisfies UpdateCopilotRequest,
    async ({ init }) => {
      const bodyObject = prepareRequestBody(payload);
      return {
        ...init,
        body: bodyObject as unknown as BodyInit,
      };
    },
  );
  await response.value();
}

export async function deleteOperation(req: { id: number }) {
  await new OperationApi().deleteCopilot({
    copilotDeleteRequest: req,
  });
}

export async function rateOperation(req: { id: number; rating: OpRatingType }) {
  const ratingTypeMapping: Record<OpRatingType, string> = {
    0: "None",
    1: "Like",
    2: "Dislike",
  };

  await new OperationApi().ratesCopilotOperation({
    copilotRatingReq: {
      ...req,
      rating: ratingTypeMapping[req.rating],
    },
  });
}

export async function banComments(req: { operationId: number; status: BanCommentsStatusEnum }) {
  await new OperationApi().banComments({
    copilotId: req.operationId,
    ...req,
  });
}
