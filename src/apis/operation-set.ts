import { useAtomValue } from "jotai";
import { noop } from "lodash-es";
import {
  PagedDTOCopilotSetListRes,
  CopilotSetQuery,
  CopilotSetStatus,
  CopilotSetUpdateReq,
} from "maa-copilot-client";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";

import { OperationSetApi } from "utils/maa-copilot-client";
import { useSWRRefresh } from "utils/swr";
import { SearchTimeoutError } from "utils/error";
import { withSearchTimeout } from "utils/search-timeout";

import { parseShortCode } from "../models/shortCode";
import { authAtom } from "../store/auth";

export type OrderBy = "views" | "hot" | "id";

export interface UseOperationSetsParams {
  keyword?: string;
  creatorId?: string;

  disabled?: boolean;
  suspense?: boolean;
}

export function useOperationSets({
  keyword,
  creatorId,
  disabled,
  suspense,
}: UseOperationSetsParams) {
  const auth = useAtomValue(authAtom);
  const {
    data: pages,
    error,
    setSize,
    mutate,
    isValidating,
  } = useSWRInfinite(
    (pageIndex, previousPage: PagedDTOCopilotSetListRes) => {
      if (disabled) {
        return null;
      }
      if (previousPage && !previousPage.hasNext) {
        return null; // reached the end
      }

      return [
        "operationSets",
        {
          limit: 50,
          page: pageIndex + 1,
          keyword,
          onlyFollowing: false,
          desc: true,
          creatorId: creatorId === "me" ? auth.userId : creatorId,
        } satisfies CopilotSetQuery,
      ];
    },
    async ([, req]) => withSearchTimeout(async (signal) => {
      const res = await new OperationSetApi({
        sendToken: "optional", // 如果有 token 即可获取到私有的作业集
        requireData: true,
      }).querySets({ copilotSetQuery: req }, { signal });
      return res.data!;
    }),
    {
      suspense,
      shouldRetryOnError: (error) => !(error instanceof SearchTimeoutError),
      focusThrottleInterval: 1000 * 60 * 30,
    },
  );

  const isReachingEnd = !!pages?.some((page) => !page.hasNext);
  const total = pages?.[0]?.total ?? 0;
  const operationSets = pages?.map((page) => page.data).flat() ?? [];

  return {
    operationSets,
    total,
    retry: () => mutate(),
    error,
    setSize,
    isValidating,
    isReachingEnd,
  };
}

export function useRefreshOperationSets() {
  const refresh = useSWRRefresh();
  return () =>
    refresh(
      (key) =>
        key.includes("operationSets") || (key.includes("operationSet") && key.includes("fromList")),
    );
}

export function useOperationSetSearch({
  keyword,
  suspense,
  disabled,
  ...params
}: UseOperationSetsParams) {
  if (disabled) {
    throw new Error("useOperationSetSearch cannot be disabled");
  }

  let id: number | undefined;

  if (keyword) {
    const shortCodeContent = parseShortCode(keyword);

    if (shortCodeContent) {
      id = shortCodeContent.id;
    }
  }

  const detailResponse = useOperationSet({ id, suspense });
  const operationSet = detailResponse.data;

  const listResponse = useOperationSets({
    keyword,
    suspense,
    ...params,

    // disable the list query if we are fetching a single operation set
    disabled: !!id,
  });

  if (id) {
    return {
      operationSets: operationSet ? [operationSet] : [],
      total: operationSet ? 1 : 0,
      isReachingEnd: !!operationSet,
      setSize: noop,
      retry: () => detailResponse.mutate(),
      error: detailResponse.error,
      isValidating: detailResponse.isValidating,
    };
  }

  return listResponse;
}

interface UseOperationSetParams {
  id?: number;
  suspense?: boolean;
}

export function useOperationSet({ id, suspense }: UseOperationSetParams) {
  return useSWR(id ? ["operationSet", id] : null, () => getOperationSet({ id: id! }), {
    suspense,
    shouldRetryOnError: (error) => !(error instanceof SearchTimeoutError),
  });
}

export function useRefreshOperationSet() {
  const refresh = useSWRRefresh();
  return (id: number) => refresh((key) => key.includes("operationSet") && key.includes(String(id)));
}

export async function getOperationSet(req: { id: number }) {
  return withSearchTimeout(async (signal) => {
    const res = await new OperationSetApi({
      sendToken: "optional",
      requireData: true,
    }).getSet(req, { signal });
    return res.data!;
  });
}

export async function createOperationSet(req: {
  name: string;
  description: string;
  operationIds: number[];
  status: CopilotSetStatus;
}) {
  await new OperationSetApi().createSet({
    copilotSetCreateReq: {
      name: req.name,
      description: req.description,
      copilotIds: req.operationIds,
      status: req.status,
    },
  });
}

export async function updateOperationSet(req: CopilotSetUpdateReq) {
  await new OperationSetApi().updateCopilotSet({ copilotSetUpdateReq: req });
}

export async function deleteOperationSet(req: { id: number }) {
  await new OperationSetApi().deleteCopilotSet({ commonIdReqLong: req });
}

export async function addToOperationSet(req: { operationSetId: number; operationIds: number[] }) {
  await new OperationSetApi().addCopilotIds({
    copilotSetModCopilotsReq: {
      id: req.operationSetId,
      copilotIds: req.operationIds,
    },
  });
}

export async function removeFromOperationSet(req: {
  operationSetId: number;
  operationIds: number[];
}) {
  await new OperationSetApi().removeCopilotIds({
    copilotSetModCopilotsReq: {
      id: req.operationSetId,
      copilotIds: req.operationIds,
    },
  });
}
