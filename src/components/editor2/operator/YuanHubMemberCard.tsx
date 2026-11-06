import { Button } from '@blueprintjs/core'

import { useId } from 'react'

import { findOperatorById } from '../../../models/operator'
import { YuanHubTeamMember } from '../../../models/yuanhubTeamPreset'
import { YuanHubTrainingEntry } from '../../../models/yuanhubTraining'
import { OperatorAvatar } from '../../OperatorAvatar'
import { OperatorImportCandidate } from './yuanhubImportModel'

export function YuanHubMemberCard({
  member,
  entry,
  candidate,
  issue,
  busy,
  onSelect,
  onRemove,
  onReplace,
}: {
  member: YuanHubTeamMember
  entry?: YuanHubTrainingEntry
  candidate?: OperatorImportCandidate
  issue?: string
  busy: boolean
  onSelect: (loadoutId: string | null) => void
  onRemove: () => void
  onReplace: () => void
}) {
  const id = useId()
  const name = candidate?.label ?? member.operatorId
  const operator = candidate?.operator
  const discCatalog = findOperatorById(member.operatorId)?.discs
  const effects = (discs: string[]) =>
    discs.map((disc, i) => {
      const color = discCatalog?.find((item) => item.ot_name === disc)?.color
      return (
        <span
          className="yuanhub-disc-effect"
          data-color={color}
          key={i}
          aria-label={color ? `${disc}（${color}色命盘）` : disc}
        >
          {disc}
        </span>
      )
    })
  const stars = operator?.starLevel
  return (
    <article className="yuanhub-member-card" aria-label={name}>
      <div className="yuanhub-member-header">
        <OperatorAvatar id={member.operatorId} size="verylarge" />
        <div className="yuanhub-member-identity">
          <strong>{name}</strong>
          <span
            className="yuanhub-member-stars"
            aria-label={`星级 ${stars ?? '未知'}`}
          >
            {stars ? '★'.repeat(stars) : '星级未知'}
          </span>
        </div>
        <div className="yuanhub-member-actions">
          <Button
            outlined
            className="matcher-secondary"
            disabled={busy}
            aria-label={`替换${name}`}
            onClick={onReplace}
          >
            替换成员
          </Button>
          <Button
            minimal
            aria-label={`移除${name}`}
            disabled={busy}
            onClick={onRemove}
          >
            移出阵容
          </Button>
        </div>
      </div>
      <div className="yuanhub-member-stats">
        <dl className="yuanhub-member-training">
          <div>
            <dt>等级</dt>
            <dd>{operator?.requirements?.level ?? '未知'}</dd>
          </div>
          <div>
            <dt>修为</dt>
            <dd>{operator?.requirements?.elite ?? '未知'}</dd>
          </div>
        </dl>
        <dl className="yuanhub-member-panel">
          <div>
            <dt>攻击</dt>
            <dd data-missing={operator?.attack === undefined}>
              {operator?.attack ?? '待补填'}
            </dd>
          </div>
          <div>
            <dt>生命</dt>
            <dd data-missing={operator?.hp === undefined}>
              {operator?.hp ?? '待补填'}
            </dd>
          </div>
        </dl>
      </div>
      <div className="yuanhub-loadout-heading">
        <h3 id={`${id}-loadouts`}>命盘方案</h3>
        {member.loadoutId !== null ? (
          <Button
            minimal
            small
            className="yuanhub-clear-loadout"
            disabled={busy}
            onClick={() => onSelect(null)}
          >
            清除命盘选择
          </Button>
        ) : (
          <span className="matcher-help">未选择命盘</span>
        )}
      </div>
      <fieldset
        className="yuanhub-member-loadouts"
        disabled={busy}
        aria-labelledby={`${id}-loadouts`}
      >
        {[0, 1].map((index) => {
          const loadout = entry?.loadouts[index]
          const selected = !!loadout && member.loadoutId === loadout.id
          return (
            <label
              key={index}
              className="yuanhub-loadout-option"
              data-selected={selected}
            >
              <input
                type="radio"
                name={`${id}-loadout`}
                aria-label={`${name}的命盘${index + 1}`}
                checked={selected}
                disabled={!loadout}
                onChange={() => loadout && onSelect(loadout.id)}
              />
              <span>命盘 {index + 1}</span>
              {selected && (
                <span className="yuanhub-loadout-selected">已选</span>
              )}
              <span className="yuanhub-loadout-effects">
                {loadout?.discs.length ? (
                  effects(loadout.discs)
                ) : (
                  <span className="yuanhub-loadout-empty">
                    {loadout ? '未配置词条' : '暂无方案'}
                  </span>
                )}
              </span>
            </label>
          )
        })}
      </fieldset>
      {issue && (
        <p className="yuanhub-member-issue" role="alert">
          {issue}
        </p>
      )}
      <details className="yuanhub-member-details">
        <summary>星石与导入详情</summary>
        <section
          className="yuanhub-member-stones"
          aria-label={`${name}的星石配置`}
        >
          <div className="matcher-label-row">
            <strong>星石配置</strong>
            <span className="matcher-help">
              {entry?.starSlots ? '档案槽位' : '待补充'}
            </span>
          </div>
          <div className="yuanhub-star-slots">
            {[
              'main1',
              'main2',
              'main3',
              'support1',
              'support2',
              'support3',
            ].map((key, index) => (
              <div className="yuanhub-star-slot" key={key}>
                <span>
                  {index < 3 ? '主星' : '辅星'}
                  {(index % 3) + 1}
                </span>
                <strong>
                  {entry?.starSlots ? entry.starSlots[key] || '空槽' : '未知'}
                </strong>
              </div>
            ))}
          </div>
        </section>
        <p>
          此处为只读预览，未知数值需在导入作业后补填；养成与星石来自 YuanHub
          档案。
        </p>
        {candidate?.warnings.map((warning) => (
          <p key={warning}>
            {warning.replace('；旧接口名称列表不用于猜测槽位', '')}
          </p>
        ))}
      </details>
    </article>
  )
}
