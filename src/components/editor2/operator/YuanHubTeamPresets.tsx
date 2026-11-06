import {
  Button,
  Callout,
  DialogBody,
  HTMLSelect,
  InputGroup,
} from '@blueprintjs/core'

import { ReactNode, useEffect, useId, useRef, useState } from 'react'

import {
  readYuanHubTeamPresets,
  saveYuanHubTeamPreset,
} from '../../../apis/yuanhub-team-preset'
import { findOperatorById } from '../../../models/operator'
import {
  YuanHubTeamMember,
  YuanHubTeamPreset,
  teamMemberIssue,
} from '../../../models/yuanhubTeamPreset'
import type { YuanHubTrainingSnapshot } from '../../../models/yuanhubTraining'
import { formatError } from '../../../utils/error'
import { OperatorAvatar } from '../../OperatorAvatar'
import type { OperatorImportTarget } from './OperatorImportPreview'
import { YuanHubMemberCard } from './YuanHubMemberCard'
import {
  mergeImportedOperators,
  yuanHubImportCandidate,
} from './yuanhubImportModel'

export function YuanHubTeamPresets({
  snapshot,
  connectionContent,
  userId,
  onEditingChange,
  onBusyChange,
  onClose,
  currentOperators,
  groupCount,
  onApply,
}: OperatorImportTarget & {
  connectionContent: ReactNode
  snapshot: YuanHubTrainingSnapshot
  userId: string
  onEditingChange: (value: boolean) => void
  onBusyChange: (value: boolean) => void
  onClose: () => void
}) {
  const id = useId()
  const [presets, setPresets] = useState<YuanHubTeamPreset[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [picker, setPicker] = useState<string | null>(null)
  const [label, setLabel] = useState('')
  const [members, setMembers] = useState<YuanHubTeamMember[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const request = useRef<AbortController>()
  const selected = presets.find((p) => p.id === selectedId)
  const active = creating || !!selected
  const dirty =
    label !== (selected?.label ?? '') ||
    JSON.stringify(members) !== JSON.stringify(selected?.members ?? [])
  useEffect(() => onEditingChange(dirty), [dirty, onEditingChange])
  useEffect(() => {
    onBusyChange(saving)
    return () => onBusyChange(false)
  }, [saving, onBusyChange])
  useEffect(() => {
    if (picker !== null) document.getElementById(`${id}-search`)?.focus()
  }, [picker, id])
  const canDiscard = () =>
    !busy && (!dirty || window.confirm('放弃尚未保存的阵容修改？'))
  const resetDraft = (preset?: YuanHubTeamPreset) => {
    setSelectedId(preset?.id ?? '')
    setSelectedMemberId(preset?.members[0]?.operatorId ?? '')
    setLabel(preset?.label ?? '')
    setMembers(preset?.members.map((m) => ({ ...m })) ?? [])
    setCreating(!preset)
    setRenaming(false)
    setPicker(preset ? null : '')
    setQuery('')
    setError('')
    setNotice('')
  }

  const load = async () => {
    if (!canDiscard()) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const values = await readYuanHubTeamPresets(
        userId,
        snapshot,
        controller.signal,
      )
      if (controller.signal.aborted) return
      setPresets(values)
      const next = values.find((p) => p.id === selectedId) ?? values[0]
      resetDraft(next)
      setCreating(false)
      setPicker(null)
      setLoaded(true)
    } catch (caught) {
      if (!controller.signal.aborted) setError(formatError(caught))
    } finally {
      if (request.current === controller) setBusy(false)
    }
  }
  useEffect(() => {
    void load()
    return () => request.current?.abort()
    // 父组件按账号与档案版本重建，避免跨账号复用选择和请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const candidates = members.map((member) => {
    const entry = snapshot.operators.find((op) => op.id === member.operatorId)
    const issue = teamMemberIssue(member, snapshot)
    const candidate = entry
      ? yuanHubImportCandidate(entry, member.loadoutId ?? undefined)
      : undefined
    return {
      member,
      entry,
      candidate,
      missingAttributes:
        !!candidate?.operator &&
        [
          candidate.operator.requirements?.level,
          candidate.operator.requirements?.elite,
          candidate.operator.starLevel,
          candidate.operator.attack,
          candidate.operator.hp,
        ].some((value) => value === undefined),
      issue:
        issue ?? (!candidate?.operator ? '本站目录无法识别此密探' : undefined),
    }
  })
  const invalid = candidates.some((c) => c.issue)
  const missingAttributeCount = candidates.filter(
    (c) => c.missingAttributes,
  ).length
  const selectedMember =
    candidates.find((c) => c.member.operatorId === selectedMemberId) ??
    candidates[0]
  const save = async (asNew = false) => {
    if (members.length !== 5 || invalid || !label.trim() || busy) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setSaving(true)
    setNotice('')
    setError('')
    try {
      const preset = await saveYuanHubTeamPreset(
        userId,
        {
          connectionId: snapshot.connectionId,
          accountId: snapshot.accountId,
          game: snapshot.game,
          id: asNew ? undefined : selected?.id,
          version: asNew ? undefined : selected?.version,
          label: label.trim(),
          members,
        },
        controller.signal,
      )
      if (controller.signal.aborted) return
      setPresets((old) => [preset, ...old.filter((p) => p.id !== preset.id)])
      resetDraft(preset)
      setNotice('预设已保存到云端')
    } catch (caught) {
      if (!controller.signal.aborted) setError(formatError(caught))
    } finally {
      if (request.current === controller) {
        setBusy(false)
        setSaving(false)
      }
    }
  }
  let applyError = ''
  if (members.length === 5 && !invalid) {
    try {
      mergeImportedOperators(
        currentOperators,
        candidates.map((c) => c.candidate!.operator!),
        groupCount,
        'replace',
      )
    } catch (caught) {
      applyError = formatError(caught)
    }
  }
  const invalidMember = candidates.find((candidate) => candidate.issue)
  const applyDisabledReason = busy
    ? '正在同步云端预设，请稍候。'
    : members.length !== 5
      ? `还需添加 ${5 - members.length} 位密探才能应用。`
      : invalidMember
        ? `${invalidMember.candidate?.label ?? invalidMember.member.operatorId}：${invalidMember.issue}。请选择该成员修复。`
        : applyError
  const apply = () => {
    if (members.length !== 5 || invalid || busy) return
    try {
      const incoming = candidates.map((c) => c.candidate!.operator!)
      mergeImportedOperators(currentOperators, incoming, groupCount, 'replace')
      onApply(incoming, 'replace')
    } catch (caught) {
      setError(formatError(caught))
    }
  }
  const available = snapshot.operators
    .filter(
      (op) =>
        op.owned !== false && !members.some((m) => m.operatorId === op.id),
    )
    .filter((op) => {
      const info = findOperatorById(op.id)
      return info && info.name.includes(query.trim())
    })

  return (
    <>
      <DialogBody className="matcher-body yuanhub-team-body">
        {connectionContent}
        <div className="yuanhub-team-section">
          <div className="matcher-label-row">
            <label htmlFor={`${id}-preset`}>阵容预设</label>
            <div className="flex gap-2">
              <Button
                minimal
                icon="refresh"
                disabled={busy}
                onClick={() => void load()}
              >
                刷新预设
              </Button>
              <Button
                minimal
                icon="plus"
                disabled={busy || !loaded}
                onClick={() => {
                  if (canDiscard()) resetDraft()
                }}
              >
                新建预设
              </Button>
            </div>
          </div>
          <div className="yuanhub-account-controls">
            <HTMLSelect
              id={`${id}-preset`}
              fill
              value={selectedId}
              disabled={busy}
              onChange={(e) => {
                if (canDiscard())
                  resetDraft(
                    presets.find((p) => p.id === e.currentTarget.value),
                  )
              }}
            >
              <option value="" disabled>
                {creating ? '新建预设' : '请选择阵容预设'}
              </option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </HTMLSelect>
            <Button
              minimal
              icon="edit"
              aria-label="重命名预设"
              disabled={busy || !selected}
              onClick={() => setRenaming((value) => !value)}
            />
          </div>
          <p className="matcher-help">预设保存在本站，养成数据来自 YuanHub。</p>
          {(creating || renaming) && (
            <div className="yuanhub-preset-name">
              <label htmlFor={`${id}-name`}>预设名称</label>
              <InputGroup
                id={`${id}-name`}
                value={label}
                maxLength={32}
                placeholder="例如：日常推图"
                disabled={busy}
                onChange={(e) => setLabel(e.currentTarget.value)}
              />
            </div>
          )}
        </div>
        {busy && (
          <p role="status" className="matcher-help">
            正在同步云端预设…
          </p>
        )}
        {notice && !dirty && <p role="status">{notice}</p>}
        {error && (
          <Callout intent="danger" role="alert">
            {error}
            <Button minimal disabled={busy} onClick={() => void load()}>
              重试同步预设
            </Button>
            {dirty && (
              <p className="matcher-help">
                修改仍保留在此处；版本冲突时可另存为新预设，或放弃修改后刷新。
              </p>
            )}
          </Callout>
        )}
        {active && (
          <>
            <div className="matcher-label-row yuanhub-draft-actions">
              <div className="flex items-center gap-2">
                <span className="matcher-help" role="status">
                  {dirty
                    ? '预设有未保存修改'
                    : creating
                      ? '新建阵容预设'
                      : '预设已保存'}
                </span>
                {dirty && (
                  <Button
                    minimal
                    disabled={busy}
                    onClick={() => {
                      if (canDiscard()) resetDraft(selected)
                    }}
                  >
                    撤销修改
                  </Button>
                )}
              </div>
              <div className="matcher-actions">
                {selected && (
                  <Button
                    minimal
                    disabled={
                      busy || members.length !== 5 || invalid || !label.trim()
                    }
                    onClick={() => void save(true)}
                  >
                    另存为新预设
                  </Button>
                )}
                <Button
                  outlined
                  className="matcher-secondary"
                  loading={busy}
                  disabled={
                    !dirty || members.length !== 5 || invalid || !label.trim()
                  }
                  onClick={() => void save()}
                >
                  保存预设
                </Button>
              </div>
            </div>
            {missingAttributeCount > 0 && (
              <p className="yuanhub-missing-attributes" role="status">
                {missingAttributeCount}{' '}
                名成员属性未知或超出支持范围，应用后需补填。
              </p>
            )}
            <div className="yuanhub-member-workspace">
              <section className="yuanhub-member-roster" aria-label="阵容成员">
                <h3 className="yuanhub-members-heading">
                  阵容成员 <span aria-live="polite">{members.length} / 5</span>
                </h3>
                <ul className="yuanhub-team-members">
                  {candidates.map(
                    ({ member, candidate, issue, missingAttributes }) => {
                      const name = candidate?.label ?? member.operatorId
                      const operator = candidate?.operator
                      return (
                        <li key={member.operatorId}>
                          <button
                            type="button"
                            className="yuanhub-member-select"
                            aria-label={`查看${name}`}
                            aria-pressed={
                              selectedMember?.member.operatorId ===
                              member.operatorId
                            }
                            aria-controls={`${id}-member-detail`}
                            disabled={busy}
                            onClick={() => {
                              setSelectedMemberId(member.operatorId)
                              setPicker(null)
                            }}
                          >
                            <OperatorAvatar
                              id={member.operatorId}
                              size="large"
                            />
                            <span className="yuanhub-roster-identity">
                              <strong>{name}</strong>
                              <span>
                                等级 {operator?.requirements?.level ?? '未知'} ·
                                修为 {operator?.requirements?.elite ?? '未知'}
                              </span>
                            </span>
                            <span
                              className="yuanhub-roster-status"
                              data-state={
                                issue
                                  ? 'invalid'
                                  : missingAttributes
                                    ? 'missing'
                                    : 'ready'
                              }
                            >
                              {issue
                                ? '需修复'
                                : missingAttributes
                                  ? '待补填'
                                  : '已读取'}
                            </span>
                          </button>
                        </li>
                      )
                    },
                  )}
                </ul>
                {!members.length && (
                  <p className="matcher-help">暂无成员，请添加密探。</p>
                )}
                <div className="matcher-label-row yuanhub-members-toolbar">
                  <Button
                    outlined
                    icon="plus"
                    className="matcher-secondary"
                    disabled={busy || members.length >= 5}
                    onClick={() => {
                      setQuery('')
                      setPicker('')
                    }}
                  >
                    添加密探
                  </Button>
                  {members.length === 5 && (
                    <span className="matcher-help">已满员</span>
                  )}
                </div>
              </section>
              <section
                id={`${id}-member-detail`}
                className="yuanhub-member-detail"
                aria-label="当前成员详情"
              >
                {selectedMember && (
                  <YuanHubMemberCard
                    key={selectedMember.member.operatorId}
                    {...selectedMember}
                    busy={busy}
                    onSelect={(loadoutId) =>
                      setMembers((old) =>
                        old.map((m) =>
                          m.operatorId === selectedMember.member.operatorId
                            ? { ...m, loadoutId }
                            : m,
                        ),
                      )
                    }
                    onReplace={() => {
                      setQuery('')
                      setPicker(selectedMember.member.operatorId)
                    }}
                    onRemove={() => {
                      const index = members.findIndex(
                        (m) =>
                          m.operatorId === selectedMember.member.operatorId,
                      )
                      setSelectedMemberId(
                        members[index + 1]?.operatorId ??
                          members[index - 1]?.operatorId ??
                          '',
                      )
                      setMembers((old) =>
                        old.filter(
                          (m) =>
                            m.operatorId !== selectedMember.member.operatorId,
                        ),
                      )
                      setPicker(null)
                    }}
                  />
                )}
                {picker !== null && (
                  <section
                    className="yuanhub-picker-section"
                    aria-label="选择密探"
                  >
                    <div className="matcher-label-row">
                      <label htmlFor={`${id}-search`}>
                        {picker
                          ? `替换${findOperatorById(picker)?.name ?? picker}`
                          : '添加密探'}
                      </label>
                      <Button minimal onClick={() => setPicker(null)}>
                        取消选择
                      </Button>
                    </div>
                    <InputGroup
                      id={`${id}-search`}
                      leftIcon="search"
                      placeholder="搜索密探名称"
                      value={query}
                      disabled={busy}
                      onChange={(e) => setQuery(e.currentTarget.value)}
                    />
                    <ul className="yuanhub-team-picker">
                      {available.map((op) => (
                        <li key={op.id}>
                          <Button
                            outlined
                            className="matcher-secondary"
                            disabled={busy || (!picker && members.length >= 5)}
                            aria-label={`添加${findOperatorById(op.id)!.name}`}
                            onClick={() => {
                              const member = {
                                operatorId: op.id,
                                loadoutId: op.loadouts[0]?.id ?? null,
                              }
                              setMembers((old) =>
                                old.some((m) => m.operatorId === op.id)
                                  ? old
                                  : picker
                                    ? old.map((m) =>
                                        m.operatorId === picker ? member : m,
                                      )
                                    : old.length < 5
                                      ? [...old, member]
                                      : old,
                              )
                              setSelectedMemberId(op.id)
                              if (picker || members.length === 4)
                                setPicker(null)
                            }}
                          >
                            <span className="flex items-center gap-2">
                              <OperatorAvatar id={op.id} size="large" />
                              {findOperatorById(op.id)!.name}
                            </span>
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {!available.length && (
                      <p className="matcher-help">没有可添加的密探。</p>
                    )}
                  </section>
                )}
              </section>
            </div>
            {(!label.trim() || members.length !== 5) && (
              <p className="matcher-help" aria-live="polite">
                {!label.trim()
                  ? '保存预设前请填写名称；直接应用无需名称。'
                  : ''}
                {members.length !== 5
                  ? `还需添加 ${5 - members.length} 位密探。`
                  : ''}
              </p>
            )}
          </>
        )}
        {!active && !busy && loaded && !error && (
          <p className="matcher-help">暂无阵容预设，请点击「新建预设」。</p>
        )}
      </DialogBody>
      <div className="matcher-footer">
        {active && applyDisabledReason && (
          <p
            id={`${id}-apply-reason`}
            className="yuanhub-apply-reason"
            role="status"
          >
            {applyDisabledReason}
          </p>
        )}
        <span className="matcher-help">
          应用将替换当前固定阵容，可撤销。
          <br />
          未保存的修改也可应用；不改写 YuanHub。
        </span>
        <div className="matcher-actions">
          <Button
            outlined
            className="matcher-secondary"
            disabled={busy}
            onClick={onClose}
          >
            取消
          </Button>
          {active && (
            <Button
              intent="primary"
              disabled={!!applyDisabledReason}
              aria-describedby={
                applyDisabledReason ? `${id}-apply-reason` : undefined
              }
              onClick={apply}
            >
              应用到当前作业
            </Button>
          )}
        </div>
      </div>
    </>
  )
}
