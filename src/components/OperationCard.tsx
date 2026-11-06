import { Button, Card, Elevation, H4, H5, Icon, Tag } from '@blueprintjs/core'
import { Tooltip2 } from '@blueprintjs/popover2'

import clsx from 'clsx'
import { useAtomValue } from 'jotai'
import { CopilotInfoStatusEnum } from 'maa-copilot-client'
import { copyShortCode, handleLazyDownloadJSON } from 'services/operation'

import { RelativeTime } from 'components/RelativeTime'
import { AddToOperationSetButton } from 'components/operation-set/AddToOperationSet'
import { OpDifficulty, Operation } from 'models/operation'
import { downloadJsonEnabledAtom, readEnabledAtom } from 'store/operationPrefs'
import { readOperationIdsAtom } from 'store/readOperations'

import { useLevels } from '../apis/level'
import { languageAtom, useTranslation } from '../i18n/i18n'
import { createCustomLevel, findLevelByStageName } from '../models/level'
import { getLocalizedOperatorName } from '../models/operator'
import { OperationMatchResult } from '../models/operatorMatcher'
import { readOperatorStats } from '../utils/operatorStats'
import { OperatorAvatar } from './OperatorAvatar'
import { OperatorMatchSummary } from './OperatorMatcher'
import { Paragraphs } from './Paragraphs'
import { ReLinkRenderer } from './ReLink'
import { UserName } from './UserName'
import { EDifficulty } from './entity/EDifficulty'
import { EDifficultyLevel, NeoELevel } from './entity/ELevel'

const RarityDiamond = ({ className }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    className={className}
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M12 0 Q14.8 9.2 24 12 Q14.8 14.8 12 24 Q9.2 14.8 0 12 Q9.2 9.2 12 0Z" />
  </svg>
)

const ReadOperationTag = ({ operationId }: { operationId: number }) => {
  const t = useTranslation()
  const readEnabled = useAtomValue(readEnabledAtom)
  const readOperationIds = useAtomValue(readOperationIdsAtom)

  if (!readEnabled) {
    return null
  }

  return readOperationIds.includes(operationId) ? (
    <Tag minimal intent="success" className="ml-2 shrink-0 font-normal">
      {t.components.OperationCard.read}
    </Tag>
  ) : null
}

export const NeoOperationCard = ({
  operation,
  selected,
  selectable,
  showReadStatus,
  onSelect,
  matchResult,
}: {
  operation: Operation
  selectable?: boolean
  selected?: boolean
  showReadStatus?: boolean
  onSelect?: (operation: Operation, selected: boolean) => void
  matchResult?: OperationMatchResult
}) => {
  const t = useTranslation()
  const { data: levels } = useLevels()
  const itemTags: string[] = Array.isArray(operation.metadata?.tags)
    ? (operation.metadata?.tags as string[])
    : []
  const hasTag = (name: string) => itemTags.includes(name)
  const sourceType =
    operation.metadata?.sourceType ??
    // 兼容后端 snake_case 字段
    (operation.metadata as any)?.source_type
  const sourceLabel =
    sourceType === 'original'
      ? '【原创】'
      : sourceType === 'repost'
        ? '【搬运】'
        : ''
  const sourceTag =
    sourceType === 'original'
      ? { label: '原创', color: '#0ca678', marquee: true }
      : sourceType === 'repost'
        ? { label: '搬运', color: '#0ca678' }
        : null

  try {
    // 诊断：输出元数据形态与映射结果
    // 注意：临时日志，确认首页列表数据结构
    // eslint-disable-next-line no-console
    console.debug('[NeoOperationCard]', {
      id: operation.id,
      metadata: operation.metadata,
      sourceType,
      sourceLabel,
    })
  } catch (error) {
    void error
  }

  return (
    <li className="relative">
      <ReLinkRenderer
        search={{ op: operation.id }}
        render={({ onClick, onKeyDown }) => (
          <Card
            interactive
            className="h-full flex flex-col gap-2"
            elevation={Elevation.TWO}
            tabIndex={0}
            onClick={onClick}
            onKeyDown={onKeyDown}
          >
            <Tooltip2
              content={operation.parsedContent.doc.title}
              className="whitespace-nowrap overflow-hidden text-ellipsis"
            >
              <H4 className="p-0 m-0 mr-20 flex items-center overflow-hidden">
                <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                  {operation.parsedContent.doc.title}
                </span>
                {operation.status === CopilotInfoStatusEnum.Private && (
                  <Tag minimal className="ml-2 shrink-0 font-normal opacity-75">
                    {t.components.OperationCard.private}
                  </Tag>
                )}
                {showReadStatus && (
                  <ReadOperationTag operationId={operation.id} />
                )}
              </H4>
            </Tooltip2>

            <OperatorMatchSummary result={matchResult} />

            <div className="flex items-center text-slate-900">
              {(() => {
                // 优先使用后端直出字段（data.cat_one / data.name / ...）
                const levelFromBackend =
                  operation.preLevel ||
                  findLevelByStageName(
                    levels,
                    operation.parsedContent.stageName,
                  ) ||
                  createCustomLevel(operation.parsedContent.stageName)
                // 标签显示规则：{catOne} | {name}
                const displayLevel = {
                  ...levelFromBackend,
                  // 将原先显示的 catTwo 改为使用 name 字段渲染
                  catTwo: levelFromBackend.name,
                }
                return <NeoELevel level={displayLevel} />
              })()}

              <EDifficulty
                difficulty={
                  operation.parsedContent.difficulty ?? OpDifficulty.UNKNOWN
                }
              />
              {/* 平台标签：仅在拥有对应标签时显示；复用现有标签结构/类名，仅覆盖颜色 */}
              <span className="ml-1 inline-flex items-center gap-1 operation-card-tags">
                {hasTag('代号鸢') && (
                  <Tag
                    className="transition border border-solid !text-xs tracking-tight !px-2 !py-1 !my-1 leading-none !min-h-0 bg-slate-200 border-slate-300 text-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    style={{ backgroundColor: '#d20f39', color: '#fff' }}
                  >
                    <div className="flex items-center">
                      <div className="flex whitespace-pre">
                        <span className="text-xs">代号鸢</span>
                      </div>
                    </div>
                  </Tag>
                )}
                {hasTag('如鸢') && (
                  <Tag
                    className="transition border border-solid !text-xs tracking-tight !px-2 !py-1 !my-1 leading-none !min-h-0 bg-slate-200 border-slate-300 text-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    style={{ backgroundColor: '#1e66f5', color: '#fff' }}
                  >
                    <div className="flex items-center">
                      <div className="flex whitespace-pre">
                        <span className="text-xs">如鸢</span>
                      </div>
                    </div>
                  </Tag>
                )}
                {sourceTag && (
                  <Tag
                    className={clsx(
                      'transition border border-solid !text-xs tracking-tight !px-2 !py-1 !my-1 leading-none !min-h-0 bg-slate-200 border-slate-300 text-slate-700 dark:bg-slate-900 dark:text-slate-100',
                      sourceTag.marquee && 'operation-tag-gold-marquee',
                    )}
                    style={
                      sourceTag.marquee
                        ? { color: '#fff' }
                        : { backgroundColor: sourceTag.color, color: '#fff' }
                    }
                  >
                    <div className="flex items-center">
                      <div className="flex whitespace-pre">
                        <span className="text-xs">{sourceTag.label}</span>
                      </div>
                    </div>
                  </Tag>
                )}
              </span>
            </div>

            <div className="grow text-gray-700 leading-normal max-h-48 overflow-hidden">
              <Paragraphs
                content={operation.parsedContent.doc.details}
                limitHeight={21 * 8} // clamp to ~8 lines
              />
            </div>

            <div className="text-sm text-zinc-600 dark:text-slate-100 font-bold">
              {t.components.OperationCard.operators_and_groups}
            </div>
            <OperatorTags operation={operation} />
            <div className="flex">
              <div className="flex items-center gap-1.5">
                <Icon icon="thumbs-up" />
                <span className="text-sm tabular-nums">{operation.like}</span>
              </div>
              <div className="flex-1" />

              <Tooltip2
                placement="top"
                content={t.components.OperationCard.views_count({
                  count: operation.views,
                })}
              >
                <div>
                  <Icon icon="eye-open" className="mr-1.5" />
                  <span>{operation.views}</span>
                </div>
              </Tooltip2>
            </div>

            <div className="flex">
              <div>
                <Icon icon="time" className="mr-1.5" />
                <RelativeTime
                  Tooltip2Props={{ placement: 'top' }}
                  moment={operation.uploadTime}
                />
              </div>
              <div className="flex-1" />
              <div className="text-zinc-500">
                <Icon icon="user" className="mr-1.5" />
                <UserName userId={operation.uploaderId}>
                  {operation.uploader}
                </UserName>
              </div>
            </div>
          </Card>
        )}
      />

      <CardActions
        className="absolute top-4 right-4"
        operation={operation}
        selectable={selectable}
        selected={selected}
        onSelect={onSelect}
      />
    </li>
  )
}

export const OperationCard = ({
  operation,
  showReadStatus,
  matchResult,
}: {
  operation: Operation
  showReadStatus?: boolean
  matchResult?: OperationMatchResult
}) => {
  const t = useTranslation()
  const { data: levels } = useLevels()
  const itemTags: string[] = Array.isArray(operation.metadata?.tags)
    ? (operation.metadata?.tags as string[])
    : []
  const hasTag = (name: string) => itemTags.includes(name)
  const sourceType =
    operation.metadata?.sourceType ??
    // 兼容后端 snake_case 字段
    (operation.metadata as any)?.source_type
  const sourceLabel =
    sourceType === 'original'
      ? '【原创】'
      : sourceType === 'repost'
        ? '【搬运】'
        : ''
  const sourceTag =
    sourceType === 'original'
      ? { label: '原创', color: '#0ca678', marquee: true }
      : sourceType === 'repost'
        ? { label: '搬运', color: '#0ca678' }
        : null

  try {
    // 诊断：输出元数据形态与映射结果
    // eslint-disable-next-line no-console
    console.debug('[OperationCard]', {
      id: operation.id,
      metadata: operation.metadata,
      sourceType,
      sourceLabel,
    })
  } catch (error) {
    void error
  }

  return (
    <li className="mb-4 sm:mb-2 last:mb-0 relative h-full">
      <ReLinkRenderer
        search={{ op: operation.id }}
        render={({ onClick, onKeyDown }) => (
          <Card
            interactive
            elevation={Elevation.TWO}
            tabIndex={0}
            onClick={onClick}
            onKeyDown={onKeyDown}
            className="flex flex-col h-full"
          >
            <OperatorMatchSummary result={matchResult} />
            <div className="flex flex-wrap mb-4 sm:mb-2">
              {/* title */}
              <div className="flex flex-col gap-3">
                <div className="flex gap-2">
                  <H4 className="inline-block pb-1 border-b-2 border-zinc-200 border-solid mb-2">
                    {operation.parsedContent.doc.title}
                    {operation.status === CopilotInfoStatusEnum.Private && (
                      <Tag minimal className="ml-2 font-normal opacity-75">
                        {t.components.OperationCard.private}
                      </Tag>
                    )}
                    {showReadStatus && (
                      <ReadOperationTag operationId={operation.id} />
                    )}
                  </H4>
                </div>
                <H5 className="flex items-center text-slate-900 -mt-3">
                  {(() => {
                    // 优先使用后端直出字段
                    const levelFromBackend =
                      operation.preLevel ||
                      findLevelByStageName(
                        levels,
                        operation.parsedContent.stageName,
                      ) ||
                      createCustomLevel(operation.parsedContent.stageName)
                    // 标签显示规则：{catOne} | {name}
                    const displayLevel = {
                      ...levelFromBackend,
                      catTwo: levelFromBackend.name,
                    }
                    return (
                      <EDifficultyLevel
                        level={displayLevel}
                        difficulty={operation.parsedContent.difficulty}
                      />
                    )
                  })()}
                  {/* 平台标签：仅在拥有对应标签时显示；复用现有标签结构/类名，仅覆盖颜色 */}
                  <span className="ml-1 inline-flex items-center gap-2 operation-card-tags">
                    {hasTag('代号鸢') && (
                      <Tag
                        className="transition border border-solid !text-xs tracking-tight !p-1 leading-none !min-h-0 dark:bg-slate-900 dark:text-slate-100"
                        style={{ backgroundColor: '#d20f39', color: '#fff' }}
                      >
                        <div className="flex items-center">
                          <div className="flex whitespace-pre">
                            <span className="text-xs">代号鸢</span>
                          </div>
                        </div>
                      </Tag>
                    )}
                    {hasTag('如鸢') && (
                      <Tag
                        className="transition border border-solid !text-xs tracking-tight !p-1 leading-none !min-h-0 dark:bg-slate-900 dark:text-slate-100"
                        style={{ backgroundColor: '#1e66f5', color: '#fff' }}
                      >
                        <div className="flex items-center">
                          <div className="flex whitespace-pre">
                            <span className="text-xs">如鸢</span>
                          </div>
                        </div>
                      </Tag>
                    )}
                    {sourceTag && (
                      <Tag
                        className={clsx(
                          'transition border border-solid !text-xs tracking-tight !p-1 leading-none !min-h-0 dark:bg-slate-900 dark:text-slate-100',
                          sourceTag.marquee && 'operation-tag-gold-marquee',
                        )}
                        style={
                          sourceTag.marquee
                            ? { color: '#fff' }
                            : {
                                backgroundColor: sourceTag.color,
                                color: '#fff',
                              }
                        }
                      >
                        <div className="flex items-center">
                          <div className="flex whitespace-pre">
                            <span className="text-xs">{sourceTag.label}</span>
                          </div>
                        </div>
                      </Tag>
                    )}
                  </span>
                </H5>
              </div>

              <div className="grow basis-full xl:basis-0" />

              {/* meta */}
              <div className="flex flex-wrap items-start gap-x-4 gap-y-1 text-zinc-500">
                <div className="flex items-center gap-1.5">
                  <Icon icon="thumbs-up" />
                  <span className="text-sm tabular-nums">{operation.like}</span>
                </div>

                <Tooltip2
                  placement="top"
                  content={t.components.OperationCard.views_count({
                    count: operation.views,
                  })}
                >
                  <div>
                    <Icon icon="eye-open" className="mr-1.5" />
                    <span>{operation.views}</span>
                  </div>
                </Tooltip2>

                <div>
                  <Icon icon="time" className="mr-1.5" />
                  <RelativeTime
                    Tooltip2Props={{ placement: 'top' }}
                    moment={operation.uploadTime}
                  />
                </div>

                <div>
                  <Icon icon="user" className="mr-1.5" />
                  <UserName userId={operation.uploaderId}>
                    {operation.uploader}
                  </UserName>
                </div>
              </div>
            </div>
            <div className="flex md:flex-row flex-col gap-4 flex-1">
              <div className="text-gray-700 leading-normal md:w-1/2 max-h-48 overflow-hidden">
                <Paragraphs
                  content={operation.parsedContent.doc.details}
                  limitHeight={21 * 8} // clamp to ~8 lines
                />
              </div>
              <div className="md:w-1/2">
                <div className="text-sm text-zinc-600 dark:text-slate-100 mb-2 font-bold">
                  {t.components.OperationCard.operators_and_groups}
                </div>
                <OperatorTags operation={operation} />
              </div>
            </div>
          </Card>
        )}
      />
      <CardActions
        className="absolute top-4 xl:top-12 right-[18px]"
        operation={operation}
      />
    </li>
  )
}

const OperatorTags = ({ operation }: { operation: Operation }) => {
  const t = useTranslation()
  const language = useAtomValue(languageAtom)
  const { opers, groups } = operation.parsedContent

  if (!(opers?.length || groups?.length)) {
    return (
      <div className="text-gray-500">
        {t.components.OperationCard.no_records}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-start overflow-x-auto">
      {opers?.map((operator, index) => {
        const operatorName = operator.name
        const displayName = getLocalizedOperatorName(operatorName, language)
        const stats = readOperatorStats(operator)
        const starLevel = Math.min(5, Math.max(0, stats.starLevel))
        const showStar = stats.hasStar
        const baseStatTexts = [
          stats.hasHp ? `血: ${Math.max(0, stats.hp)}` : null,
          stats.hasAttack ? `攻: ${Math.max(0, stats.attack)}` : null,
        ].filter((text): text is string => Boolean(text))

        return (
          <Tag
            key={`${operatorName}-${index}`}
            minimal
            className="op-avatar-tag mr-2 last:mr-0 mb-1.5 last:mb-0 inline-flex shrink-0 flex-col items-center gap-1 py-2 px-2"
          >
            <OperatorAvatar
              name={operatorName}
              size="verylarge"
              className="shrink-0"
            />
            {showStar && (
              <div className="flex items-center justify-center gap-0.5 mb-1.5">
                {Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
                  <RarityDiamond
                    key={n}
                    className={clsx(
                      'h-3 w-3',
                      n <= starLevel
                        ? 'text-yellow-500 opacity-100'
                        : 'text-gray-500 opacity-40 dark:opacity-30',
                    )}
                  />
                ))}
              </div>
            )}
            <span className="text-sm font-medium leading-tight text-slate-900 dark:text-slate-100">
              {displayName}
            </span>
            {baseStatTexts.length > 0 && (
              <div className="text-center text-xs leading-tight text-zinc-600 dark:text-slate-200">
                {baseStatTexts.map((text) => (
                  <span key={text} className="block whitespace-nowrap">
                    {text}
                  </span>
                ))}
              </div>
            )}
          </Tag>
        )
      })}
      {groups?.map(({ name: groupName, opers: groupOpers }, index) => (
        <Tooltip2
          key={`group-${groupName}-${index}`}
          className="mr-2 last:mr-0 mb-1 last:mb-0"
          placement="top"
          content={
            groupOpers
              ?.map(({ name: operatorName }) =>
                getLocalizedOperatorName(operatorName, language),
              )
              .join(', ') || t.components.OperationCard.no_operators
          }
        >
          <Tag minimal className="shrink-0">
            [{groupName}]
          </Tag>
        </Tooltip2>
      ))}
    </div>
  )
}

const CardActions = ({
  className,
  operation,
  selected,
  selectable,
  onSelect,
}: {
  className?: string
  operation: Operation
  selectable?: boolean
  selected?: boolean
  onSelect?: (operation: Operation, selected: boolean) => void
}) => {
  const t = useTranslation()
  const downloadJsonEnabled = useAtomValue(downloadJsonEnabledAtom)
  return selectable ? (
    <Button
      small
      minimal={!selected}
      outlined={!selected}
      intent="primary"
      className="absolute top-4 right-4"
      icon={selected ? 'tick' : 'blank'}
      onClick={() => onSelect?.(operation, !selected)}
    />
  ) : (
    <div className={clsx('flex gap-1', className)}>
      {downloadJsonEnabled && (
        <Tooltip2
          placement="bottom"
          content={
            <div className="max-w-sm dark:text-slate-900">
              {t.components.OperationCard.download_json}
            </div>
          }
        >
          <Button
            small
            icon="download"
            aria-label={t.components.OperationCard.download_json}
            onClick={() =>
              handleLazyDownloadJSON(
                operation.id,
                operation.parsedContent.doc.title,
                Array.isArray(operation.metadata?.tags)
                  ? (operation.metadata?.tags as string[])
                  : undefined,
              )
            }
          />
        </Tooltip2>
      )}
      {/* <Tooltip2
        placement="bottom"
        content={
          <div className="max-w-sm dark:text-slate-900">
            {t.components.OperationCard.download_siming_json}
          </div>
        }
      >
        <Button
          small
          icon="download"
          onClick={() =>
            handleLazyDownloadSimingJSON(
              operation.id,
              operation.parsedContent.doc.title,
            )
          }
        />
      </Tooltip2> */}
      <Tooltip2
        placement="bottom"
        content={
          <div className="max-w-sm dark:text-slate-900">
            {t.components.OperationCard.copy_secret_code}
          </div>
        }
      >
        <Button
          small
          icon="clipboard"
          aria-label={t.components.OperationCard.copy_secret_code}
          onClick={() => copyShortCode(operation)}
        />
      </Tooltip2>
      <Tooltip2
        placement="bottom"
        content={
          <div className="max-w-sm dark:text-slate-900">
            {t.components.OperationCard.add_to_job_set}
          </div>
        }
      >
        <AddToOperationSetButton
          small
          icon="plus"
          aria-label={t.components.OperationCard.add_to_job_set}
          operationIds={[operation.id]}
        />
      </Tooltip2>
    </div>
  )
}
