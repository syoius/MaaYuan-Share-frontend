import {
  Button,
  Callout,
  DialogBody,
  HTMLSelect,
  InputGroup,
} from '@blueprintjs/core'

import { useEffect, useId, useRef, useState } from 'react'

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
import { YuanHubDirectImport } from './YuanHubDirectImport'
import { YuanHubMemberCard } from './YuanHubMemberCard'
import {
  OperatorImportMode,
  mergeImportedOperators,
  yuanHubImportCandidate,
} from './yuanhubImportModel'

export function YuanHubTeamPresets({
  snapshot,
  userId,
  onEditingChange,
  onClose,
  currentOperators,
  groupCount,
  onApply,
}: OperatorImportTarget & {
  snapshot: YuanHubTrainingSnapshot
  userId: string
  onEditingChange: (value: boolean) => void
  onClose: () => void
}) {
  const id = useId()
  const [presets, setPresets] = useState<YuanHubTeamPreset[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState('')
  const [members, setMembers] = useState<YuanHubTeamMember[]>([])
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<OperatorImportMode>('append')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const request = useRef<AbortController>()
  const selected = presets.find((p) => p.id === selectedId)
  const visibleMembers = editing ? members : (selected?.members ?? [])
  const changeEditing = (value: boolean) => {
    setEditing(value)
    onEditingChange(value)
  }

  const load = async () => {
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
      setSelectedId((current) =>
        values.some((p) => p.id === current) ? current : (values[0]?.id ?? ''),
      )
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

  const startEditing = (preset?: YuanHubTeamPreset) => {
    setSelectedId(preset?.id ?? '')
    setLabel(preset?.label ?? '')
    setMembers(preset?.members.map((m) => ({ ...m })) ?? [])
    setQuery('')
    setError('')
    setNotice('')
    changeEditing(true)
  }
  const candidates = visibleMembers.map((member) => {
    const entry = snapshot.operators.find((op) => op.id === member.operatorId)
    const issue = teamMemberIssue(member, snapshot)
    const candidate = entry
      ? yuanHubImportCandidate(entry, member.loadoutId ?? undefined)
      : undefined
    return {
      member,
      entry,
      candidate,
      issue:
        issue ?? (!candidate?.operator ? '本站目录无法识别此密探' : undefined),
    }
  })
  const invalid = candidates.some((c) => c.issue)
  const save = async () => {
    if (members.length !== 5 || invalid || !label.trim() || busy) return
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    try {
      const preset = await saveYuanHubTeamPreset(
        userId,
        {
          connectionId: snapshot.connectionId,
          accountId: snapshot.accountId,
          game: snapshot.game,
          id: selected?.id,
          version: selected?.version,
          label: label.trim(),
          members,
        },
        controller.signal,
      )
      if (controller.signal.aborted) return
      setPresets((old) => [preset, ...old.filter((p) => p.id !== preset.id)])
      setSelectedId(preset.id)
      changeEditing(false)
      setNotice('预设已保存到云端')
    } catch (caught) {
      if (!controller.signal.aborted) setError(formatError(caught))
    } finally {
      if (request.current === controller) setBusy(false)
    }
  }
  let applyError = ''
  if (selected && !invalid) {
    try {
      mergeImportedOperators(
        currentOperators,
        candidates.map((c) => c.candidate!.operator!),
        groupCount,
        mode,
      )
    } catch (caught) {
      applyError = formatError(caught)
    }
  }
  const apply = () => {
    if (!selected || invalid || busy) return
    try {
      const incoming = candidates.map((c) => c.candidate!.operator!)
      mergeImportedOperators(currentOperators, incoming, groupCount, mode)
      onApply(incoming, mode)
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
        {editing ? (
          <>
            <div className="matcher-label-row">
              <Button
                minimal
                icon="chevron-left"
                disabled={busy}
                onClick={() => {
                  changeEditing(false)
                  setError('')
                }}
              >
                返回预设列表
              </Button>
              <span>
                游戏账号：{snapshot.accountName} · {snapshot.game}
              </span>
            </div>
            <label htmlFor={`${id}-name`}>预设名称</label>
            <InputGroup
              id={`${id}-name`}
              value={label}
              maxLength={32}
              placeholder="例如：日常推图"
              disabled={busy}
              onChange={(e) => setLabel(e.currentTarget.value)}
            />
          </>
        ) : (
          <div className="yuanhub-team-section">
            <div className="matcher-label-row">
              <label htmlFor={`${id}-preset`}>阵容预设</label>
              <div className="flex gap-2">
                <Button minimal disabled={busy} onClick={() => void load()}>
                  刷新预设
                </Button>
                <Button
                  minimal
                  disabled={busy || !loaded}
                  onClick={() => startEditing()}
                >
                  新建预设
                </Button>
              </div>
            </div>
            <HTMLSelect
              id={`${id}-preset`}
              fill
              value={selectedId}
              disabled={busy}
              onChange={(e) => {
                setSelectedId(e.currentTarget.value)
                setError('')
                setNotice('')
              }}
            >
              <option value="">手动选择（不使用预设）</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </HTMLSelect>
            <p className="matcher-help">
              预设随本站账号云同步，按 YuanHub 游戏账号独立保存。
            </p>
          </div>
        )}
        {busy && (
          <p role="status" className="matcher-help">
            {editing ? '正在保存到云端…' : '正在同步云端预设…'}
          </p>
        )}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <Callout intent="danger" role="alert">
            {error}
            {!editing && (
              <Button minimal onClick={() => void load()}>
                重试同步预设
              </Button>
            )}
            {editing && (
              <p className="matcher-help">
                修改仍保留在此处；版本冲突时请返回并刷新预设后重新编辑。
              </p>
            )}
          </Callout>
        )}
        {(editing || selected) && (
          <>
            <div className="matcher-label-row">
              <strong>
                阵容成员{' '}
                <span aria-live="polite">{visibleMembers.length} / 5</span>
              </strong>
              {editing && (
                <Button
                  outlined
                  icon="plus"
                  className="matcher-secondary"
                  disabled={busy || members.length >= 5}
                  onClick={() =>
                    document.getElementById(`${id}-search`)?.focus()
                  }
                >
                  添加密探
                </Button>
              )}
            </div>
            {editing && (
              <p className="matcher-help">
                每位密探可选择命盘1或命盘2；养成与星石导入作业后可编辑。
              </p>
            )}
            <ul className="yuanhub-team-members">
              {candidates.map(({ member, entry, candidate, issue }) => (
                <YuanHubMemberCard
                  key={member.operatorId}
                  member={member}
                  entry={entry}
                  candidate={candidate}
                  issue={issue}
                  editing={editing}
                  busy={busy}
                  onSelect={(loadoutId) =>
                    setMembers((old) =>
                      old.map((m) =>
                        m.operatorId === member.operatorId
                          ? { ...m, loadoutId }
                          : m,
                      ),
                    )
                  }
                  onRemove={() =>
                    setMembers((old) =>
                      old.filter((m) => m.operatorId !== member.operatorId),
                    )
                  }
                />
              ))}
            </ul>
            {!editing && (
              <Button
                outlined
                className="matcher-secondary"
                disabled={busy}
                onClick={() => startEditing(selected)}
              >
                编辑阵容与命盘
              </Button>
            )}
          </>
        )}
        {editing && (
          <>
            <label htmlFor={`${id}-search`}>添加密探</label>
            <InputGroup
              id={`${id}-search`}
              leftIcon="search"
              placeholder="搜索密探名称"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
            />
            {members.length === 5 && (
              <p className="matcher-help">已满 5 位，移除一位后可添加。</p>
            )}
            <ul className="yuanhub-team-picker">
              {available.map((op) => (
                <li key={op.id}>
                  <Button
                    outlined
                    className="matcher-secondary"
                    disabled={busy || members.length >= 5}
                    aria-label={`添加${findOperatorById(op.id)!.name}`}
                    onClick={() =>
                      setMembers((old) =>
                        old.length < 5 &&
                        !old.some((m) => m.operatorId === op.id)
                          ? [
                              ...old,
                              {
                                operatorId: op.id,
                                loadoutId: op.loadouts[0]?.id ?? null,
                              },
                            ]
                          : old,
                      )
                    }
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
            <p className="matcher-help" aria-live="polite">
              {!label.trim() ? '请填写预设名称。' : ''}
              {members.length !== 5
                ? `还需添加 ${5 - members.length} 位密探才能保存。`
                : '已选满 5 位密探。'}
              {invalid ? '请修复卡片中提示的失效成员或命盘。' : ''}
            </p>
          </>
        )}
        {!editing && selected && (
          <div className="yuanhub-team-section">
            <label htmlFor={`${id}-mode`}>导入方式</label>
            <HTMLSelect
              id={`${id}-mode`}
              fill
              value={mode}
              onChange={(e) => {
                setMode(e.currentTarget.value as OperatorImportMode)
                setError('')
              }}
            >
              <option value="append">追加密探（保留当前阵容）</option>
              <option value="replace">
                替换当前固定阵容（保留候选分组，可撤销）
              </option>
            </HTMLSelect>
            <p className="matcher-help">
              候选分组占 {groupCount} 个位置；固定密探与候选分组合计最多 5 位。
            </p>
            {mode === 'replace' && (
              <p className="matcher-help">
                将替换当前作业的固定阵容；候选分组保留。
              </p>
            )}
            {applyError && <p role="alert">{applyError}</p>}
            <p className="matcher-help">
              导入后请按作业要求调整；星级不包含完整化极与觉醒信息。
            </p>
          </div>
        )}
        {!editing && !selected && !busy && (
          <>
            <p className="matcher-help">
              可直接导入 1 至 5 位密探；保存五人组合请点击「新建预设」。
            </p>
            <YuanHubDirectImport
              snapshot={snapshot}
              currentOperators={currentOperators}
              groupCount={groupCount}
              onApply={onApply}
            />
          </>
        )}
      </DialogBody>
      <div className="matcher-footer">
        <span className="matcher-help">
          {editing
            ? '仅保存到本站云端，不改写 YuanHub。'
            : '仅复制到当前作业，不改写 YuanHub。'}
        </span>
        <div className="matcher-actions">
          <Button
            outlined
            className="matcher-secondary"
            disabled={busy}
            onClick={() => {
              if (editing) {
                changeEditing(false)
                setError('')
              } else onClose()
            }}
          >
            取消
          </Button>
          {editing ? (
            <Button
              intent="primary"
              loading={busy}
              disabled={members.length !== 5 || invalid || !label.trim()}
              onClick={() => void save()}
            >
              保存预设
            </Button>
          ) : selected ? (
            <Button
              intent="primary"
              disabled={busy || invalid || !!applyError}
              onClick={apply}
            >
              应用预设到当前作业
            </Button>
          ) : null}
        </div>
      </div>
    </>
  )
}
