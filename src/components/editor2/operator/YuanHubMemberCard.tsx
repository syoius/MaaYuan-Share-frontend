import { Button } from '@blueprintjs/core'

import { useId } from 'react'

import { YuanHubTeamMember } from '../../../models/yuanhubTeamPreset'
import { YuanHubTrainingEntry } from '../../../models/yuanhubTraining'
import { OperatorAvatar } from '../../OperatorAvatar'
import { OperatorImportCandidate } from './yuanhubImportModel'

export function YuanHubMemberCard({
  member,
  entry,
  candidate,
  issue,
  editing,
  busy,
  onSelect,
  onRemove,
}: {
  member: YuanHubTeamMember
  entry?: YuanHubTrainingEntry
  candidate?: OperatorImportCandidate
  issue?: string
  editing: boolean
  busy: boolean
  onSelect: (loadoutId: string | null) => void
  onRemove: () => void
}) {
  const id = useId()
  const name = candidate?.label ?? member.operatorId
  const operator = candidate?.operator
  const selectedLoadout = entry?.loadouts.find(
    (loadout) => loadout.id === member.loadoutId,
  )
  const stars = operator?.starLevel
  return (
    <li className="yuanhub-member-card" aria-label={name}>
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
        {editing && (
          <Button
            minimal
            icon="cross"
            aria-label={`移除${name}`}
            disabled={busy}
            onClick={onRemove}
          />
        )}
      </div>
      <dl className="yuanhub-member-stats">
        <div>
          <dt>等级</dt>
          <dd>{operator?.requirements?.level ?? '未知'}</dd>
        </div>
        <div>
          <dt>攻击</dt>
          <dd>{operator?.attack ?? '未知'}</dd>
        </div>
        <div>
          <dt>修为</dt>
          <dd>{operator?.requirements?.elite ?? '未知'}</dd>
        </div>
        <div>
          <dt>生命</dt>
          <dd>{operator?.hp ?? '未知'}</dd>
        </div>
      </dl>
      {editing ? (
        <fieldset
          className="yuanhub-member-loadouts"
          disabled={!editing || busy}
        >
          <legend>命盘方案</legend>
          {[0, 1].map((index) => {
            const loadout = entry?.loadouts[index]
            return (
              <label key={index} className="yuanhub-loadout-option">
                <input
                  type="radio"
                  name={`${id}-loadout`}
                  aria-label={`${name}的命盘${index + 1}`}
                  checked={!!loadout && member.loadoutId === loadout.id}
                  disabled={!loadout}
                  onChange={() => loadout && onSelect(loadout.id)}
                />
                <span>命盘{index + 1}</span>
                <span className="yuanhub-loadout-effects">
                  {loadout?.discs.length ? (
                    loadout.discs.map((disc, i) => (
                      <span className="yuanhub-disc-effect" key={i}>
                        {disc}
                      </span>
                    ))
                  ) : (
                    <span className="matcher-help">
                      {loadout ? '未配置词条' : '暂无方案'}
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </fieldset>
      ) : (
        <div className="yuanhub-selected-loadout">
          <strong>
            已选命盘：
            {selectedLoadout?.name ??
              (member.loadoutId === null ? '未选择' : '方案已失效')}
          </strong>
          {selectedLoadout && (
            <p>{selectedLoadout.discs.join('、') || '未配置词条'}</p>
          )}
        </div>
      )}
      {editing && member.loadoutId !== null && (
        <Button
          minimal
          small
          className="yuanhub-clear-loadout"
          disabled={busy}
          onClick={() => onSelect(null)}
        >
          清除命盘选择
        </Button>
      )}
      {issue && (
        <p className="yuanhub-member-issue" role="alert">
          {issue}
        </p>
      )}
      <details className="yuanhub-member-details">
        <summary>查看导入详情</summary>
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
    </li>
  )
}
