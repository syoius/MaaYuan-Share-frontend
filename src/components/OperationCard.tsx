import { Button, Card, Elevation, H4, H5, Icon, Tag } from '@blueprintjs/core'
import { Tooltip2 } from '@blueprintjs/popover2'

import clsx from 'clsx'
import { useAtomValue } from 'jotai'
import { find } from 'linkifyjs'
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
import { getOperationCardExcerpt } from '../utils/operationCardExcerpt'
import { readOperatorStats } from '../utils/operatorStats'
import { OperatorAvatar } from './OperatorAvatar'
import { OperatorMatchSummary } from './OperatorMatcher'
import { Paragraphs } from './Paragraphs'
import { ReLink, ReLinkRenderer } from './ReLink'
import { UserName } from './UserName'
import { EDifficulty } from './entity/EDifficulty'
import { EDifficultyLevel, NeoELevel } from './entity/ELevel'

import './OperationCard.css'

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
  const sourceType =
    operation.metadata?.sourceType ??
    // 兼容后端 snake_case 字段
    (operation.metadata as any)?.source_type
  const level =
    operation.preLevel ||
    findLevelByStageName(levels, operation.parsedContent.stageName) ||
    createCustomLevel(operation.parsedContent.stageName)

  return (
    <li className="relative min-w-0">
      <ReLinkRenderer
        search={{ op: operation.id }}
        render={({ onClick }) => (
          <Card
            interactive
            className={clsx('operation-card', selectable && 'is-selectable')}
            elevation={Elevation.ONE}
            onClick={(event) => {
              if (
                !(event.target instanceof Element) ||
                !event.currentTarget.contains(event.target) ||
                event.target.closest(
                  'a, button, summary, input, select, textarea',
                )
              )
                return
              onClick(event)
            }}
          >
            <H4 className="operation-card-title">
              <ReLink search={{ op: operation.id }}>
                {operation.parsedContent.doc.title}
              </ReLink>
              {operation.status === CopilotInfoStatusEnum.Private && (
                <Tag minimal className="ml-2 shrink-0 font-normal opacity-75">
                  {t.components.OperationCard.private}
                </Tag>
              )}
              {showReadStatus && (
                <ReadOperationTag operationId={operation.id} />
              )}
            </H4>

            <div className="operation-card-labels">
              <NeoELevel level={{ ...level, catTwo: level.name }} />

              <EDifficulty
                difficulty={
                  operation.parsedContent.difficulty ?? OpDifficulty.UNKNOWN
                }
              />
              {['代号鸢', '如鸢']
                .filter((tag) => itemTags.includes(tag))
                .map((tag) => (
                  <Tag
                    key={tag}
                    className={
                      tag === '如鸢'
                        ? 'operation-label-blue'
                        : 'operation-label-red'
                    }
                  >
                    {tag}
                  </Tag>
                ))}
              {(sourceType === 'original' || sourceType === 'repost') && (
                <Tag
                  className={
                    sourceType === 'original'
                      ? 'operation-label-gold'
                      : 'operation-label-green'
                  }
                >
                  {sourceType === 'original'
                    ? t.components.OperationCard.original
                    : t.components.OperationCard.repost}
                </Tag>
              )}
            </div>

            <div className="operation-card-roster-heading">
              <span>{t.components.OperationCard.required_operators}</span>
              {matchResult && (
                <div
                  className={clsx(
                    'operation-card-match',
                    matchResult.mode === 'ready' && 'is-ready',
                  )}
                >
                  {matchResult.mode === 'ready' && (
                    <Icon icon="tick-circle" size={14} />
                  )}
                  <OperatorMatchSummary result={matchResult} />
                </div>
              )}
            </div>
            <OperatorTags operation={operation} cardLayout />

            <OperationCardDescription operation={operation} />

            <div className="operation-card-meta">
              <div className="operation-card-author">
                <Icon icon="user" size={14} />
                <UserName userId={operation.uploaderId}>
                  {operation.uploader}
                </UserName>
                <span aria-hidden="true">·</span>
                <RelativeTime
                  Tooltip2Props={{ placement: 'top' }}
                  moment={operation.uploadTime}
                />
              </div>
              <span
                className="operation-card-stat"
                aria-label={t.components.OperationCard.likes_count({
                  count: operation.like,
                })}
              >
                <Icon icon="thumbs-up" size={14} />
                {operation.like}
              </span>
              <Tooltip2
                placement="top"
                content={t.components.OperationCard.views_count({
                  count: operation.views,
                })}
              >
                <span
                  className="operation-card-stat"
                  aria-label={t.components.OperationCard.views_count({
                    count: operation.views,
                  })}
                >
                  <Icon icon="eye-open" size={14} />
                  {operation.views}
                </span>
              </Tooltip2>
            </div>

            <CardActions
              operation={operation}
              selectable={selectable}
              selected={selected}
              onSelect={onSelect}
              expanded
            />
          </Card>
        )}
      />
    </li>
  )
}

const OperationCardDescription = ({ operation }: { operation: Operation }) => {
  const t = useTranslation().components.OperationCard
  const details = operation.parsedContent.doc.details ?? ''
  const links = find(details, 'url')
  const excerpt = getOperationCardExcerpt(details, t.source_link)
  const source = [
    operation.metadata?.repostUrl,
    ...links.map((link) => link.href),
  ].find(
    (url): url is string =>
      typeof url === 'string' && /^https?:\/\//i.test(url),
  )

  return (
    <div className="operation-card-description">
      {excerpt && <p className="operation-card-excerpt">{excerpt}</p>}
      <div className="operation-card-description-links">
        <ReLink search={{ op: operation.id }}>
          {t.view_full_description} <Icon icon="chevron-right" size={12} />
        </ReLink>
        {source && (
          <a href={source} target="_blank" rel="noopener noreferrer">
            <Icon icon="share" size={12} /> {t.source_link}
          </a>
        )}
      </div>
    </div>
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

const OperatorTags = ({
  operation,
  cardLayout = false,
}: {
  operation: Operation
  cardLayout?: boolean
}) => {
  const t = useTranslation()
  const language = useAtomValue(languageAtom)
  const { opers, groups } = operation.parsedContent
  const showTraining =
    !cardLayout ||
    [
      ...(opers ?? []),
      ...(groups ?? []).flatMap((group) => group.opers ?? []),
    ].some((operator) => {
      const stats = readOperatorStats(operator)
      return stats.hasStar || stats.hasHp || stats.hasAttack
    })

  if (!(opers?.length || groups?.length)) {
    return (
      <div className="text-gray-500">
        {t.components.OperationCard.no_records}
      </div>
    )
  }

  return (
    <div
      className={
        cardLayout
          ? 'operation-card-operators'
          : 'flex flex-wrap items-start overflow-x-auto'
      }
    >
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
            className={clsx(
              'op-avatar-tag',
              cardLayout
                ? 'operation-card-operator'
                : 'mr-2 last:mr-0 mb-1.5 last:mb-0 inline-flex shrink-0 flex-col items-center gap-1 py-2 px-2',
            )}
          >
            <OperatorAvatar
              name={operatorName}
              size="verylarge"
              className="shrink-0"
            />
            {cardLayout && (
              <span
                className="operation-card-operator-name"
                title={displayName}
              >
                {displayName}
              </span>
            )}
            {(showStar || (cardLayout && showTraining)) && (
              <div
                className={
                  cardLayout
                    ? 'operation-card-stars'
                    : 'flex items-center justify-center gap-0.5 mb-1.5'
                }
                role="img"
                aria-label={
                  showStar
                    ? t.components.OperationCard.star_level({
                        count: starLevel,
                      })
                    : t.components.OperationCard.stats_not_provided
                }
              >
                {showStar &&
                  Array.from({ length: 5 }, (_, i) => i + 1).map((n) => (
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
            {!cardLayout && (
              <span className="text-sm font-medium leading-tight text-slate-900 dark:text-slate-100">
                {displayName}
              </span>
            )}
            {cardLayout
              ? showTraining && (
                  <div className="operation-card-operator-stats">
                    <span>
                      {t.components.OperationCard.hp}:{' '}
                      <span>{stats.hasHp ? Math.max(0, stats.hp) : '—'}</span>
                    </span>
                    <span>
                      {t.components.OperationCard.attack}:{' '}
                      <span>
                        {stats.hasAttack ? Math.max(0, stats.attack) : '—'}
                      </span>
                    </span>
                  </div>
                )
              : baseStatTexts.length > 0 && (
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
      {groups?.map(({ name: groupName, opers: groupOpers }, index) =>
        cardLayout ? (
          <div
            key={`group-${groupName}-${index}`}
            className="operation-card-group"
          >
            <Tag minimal>{groupName}</Tag>
            <span>
              {groupOpers
                ?.map(({ name }) => getLocalizedOperatorName(name, language))
                .join(' / ') || t.components.OperationCard.no_operators}
            </span>
          </div>
        ) : (
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
        ),
      )}
      {cardLayout && !showTraining && (
        <span className="operation-card-training-note">
          {t.components.OperationCard.training_not_provided}
        </span>
      )}
    </div>
  )
}

const CardActions = ({
  className,
  operation,
  selected,
  selectable,
  onSelect,
  expanded = false,
}: {
  className?: string
  operation: Operation
  selectable?: boolean
  selected?: boolean
  onSelect?: (operation: Operation, selected: boolean) => void
  expanded?: boolean
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
      aria-label={t.components.OperationCard.select_job}
      aria-pressed={!!selected}
      onClick={() => onSelect?.(operation, !selected)}
    />
  ) : (
    <div
      className={clsx(
        expanded ? 'operation-card-actions' : 'flex gap-1',
        className,
      )}
    >
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
            small={!expanded}
            minimal={expanded}
            className={expanded ? 'operation-card-download' : undefined}
            icon="download"
            text={expanded ? t.components.OperationCard.download : undefined}
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
      <Tooltip2
        placement="bottom"
        content={
          <div className="max-w-sm dark:text-slate-900">
            {t.components.OperationCard.add_to_job_set}
          </div>
        }
      >
        <AddToOperationSetButton
          small={!expanded}
          outlined={expanded}
          className={expanded ? 'operation-card-add' : undefined}
          icon="plus"
          text={expanded ? t.components.OperationCard.add_to_set : undefined}
          aria-label={t.components.OperationCard.add_to_job_set}
          operationIds={[operation.id]}
        />
      </Tooltip2>
      <Tooltip2
        placement="bottom"
        content={
          <div className="max-w-sm dark:text-slate-900">
            {t.components.OperationCard.copy_secret_code}
          </div>
        }
      >
        <Button
          small={!expanded}
          icon="clipboard"
          intent={expanded ? 'primary' : undefined}
          className={expanded ? 'operation-card-copy' : undefined}
          text={expanded ? t.components.OperationCard.copy_code : undefined}
          aria-label={t.components.OperationCard.copy_secret_code}
          onClick={() => copyShortCode(operation)}
        />
      </Tooltip2>
    </div>
  )
}
