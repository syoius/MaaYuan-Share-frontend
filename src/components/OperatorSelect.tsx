import { Classes, MenuItem } from '@blueprintjs/core'
import { MenuItem2 } from '@blueprintjs/popover2'
import { MultiSelect2 } from '@blueprintjs/select'

import clsx from 'clsx'
import Fuse from 'fuse.js'
import { useAtomValue } from 'jotai'
import { compact } from 'lodash-es'
import { FC, useMemo, useRef } from 'react'

import { languageAtom, useTranslation } from '../i18n/i18n'
import { OPERATORS } from '../models/operator'
import { useDebouncedQuery } from '../utils/useDebouncedQuery'
import { OperatorAvatar } from './OperatorAvatar'

interface OperatorSelectProps {
  className?: string
  id?: string
  disabled?: boolean
  availableOperators?: OperatorInfo[]
  placeholder?: string
  browseOnFocus?: boolean
  operators: string[]
  onChange: (operators: string[]) => void
}

type OperatorInfo = (typeof OPERATORS)[number]

export const OperatorSelect: FC<OperatorSelectProps> = ({
  className,
  id,
  disabled,
  availableOperators = OPERATORS,
  placeholder = '',
  browseOnFocus = false,
  operators,
  onChange,
}) => {
  const t = useTranslation()
  const language = useAtomValue(languageAtom)
  const escapeTarget = useRef<HTMLElement>()
  const { query, trimmedDebouncedQuery, updateQuery, onOptionMouseDown } =
    useDebouncedQuery()

  const fuse = useMemo(
    () =>
      new Fuse(availableOperators, {
        keys: ['name', 'name_en', 'alias', 'alt_name'],
        threshold: 0.3,
      }),
    [availableOperators],
  )

  const selectedItems = useMemo(
    () =>
      compact(
        operators.map((name) => OPERATORS.find((item) => item.name === name)),
      ),
    [operators],
  )

  const select = (operator: OperatorInfo) => {
    if (browseOnFocus && operators.includes(operator.name)) {
      onChange(operators.filter((name) => name !== operator.name))
    } else if (!operators.includes(operator.name)) {
      onChange([...operators, operator.name])
    }
  }

  const remove = (operator: OperatorInfo) => {
    onChange(operators.filter((name) => name !== operator.name))
  }

  const clear = () => {
    onChange([])
  }

  return (
    <MultiSelect2<OperatorInfo>
      className={clsx('', className)}
      disabled={disabled}
      popoverTargetProps={{
        tabIndex: browseOnFocus ? -1 : undefined,
        onKeyDown: (event) => {
          if (
            browseOnFocus &&
            event.key === 'Escape' &&
            event.currentTarget.getAttribute('aria-expanded') === 'true'
          ) {
            event.stopPropagation()
            escapeTarget.current = event.currentTarget
          }
        },
      }}
      query={query}
      onQueryChange={(query) => updateQuery(query, false)}
      items={availableOperators}
      itemRenderer={(item, { handleClick, handleFocus, modifiers }) => (
        <MenuItem2
          roleStructure="listoption"
          className={clsx(
            'py-0 items-center',
            modifiers.active && Classes.ACTIVE,
            selectedItems.includes(item) && Classes.SELECTED,
          )}
          key={item.id}
          text={
            <div
              className={clsx(
                'flex items-center gap-2',
                browseOnFocus && 'flex-col gap-1 max-w-full',
              )}
            >
              <OperatorAvatar
                className={browseOnFocus ? 'w-12 h-12' : 'w-8 h-8'}
                id={item.id}
                rarity={item.rarity}
              />
              <span
                className={browseOnFocus ? 'max-w-full truncate' : undefined}
              >
                {language === 'zh_tw' ? item.name_en : item.name}
              </span>
            </div>
          }
          onClick={handleClick}
          onFocus={handleFocus}
          onMouseDown={onOptionMouseDown}
          selected={selectedItems.includes(item)}
          disabled={modifiers.disabled}
        />
      )}
      itemListPredicate={() => {
        if (!trimmedDebouncedQuery) {
          return browseOnFocus ? availableOperators : []
        }
        return fuse.search(trimmedDebouncedQuery).map((el) => el.item)
      }}
      selectedItems={selectedItems}
      placeholder={placeholder}
      noResults={
        trimmedDebouncedQuery || browseOnFocus ? (
          <MenuItem
            roleStructure="listoption"
            disabled
            text={t.components.OperatorSelect.no_matching_operators}
          />
        ) : undefined
      }
      tagInputProps={{
        className: '!flex !p-0 !pl-[5px]',
        large: true,
        tagProps: {
          minimal: true,
          className: '!py-0 !pl-0',
          onClick: (event) => {
            if (
              browseOnFocus &&
              event.target instanceof Element &&
              event.target.closest('.bp4-tag-remove')
            )
              event.stopPropagation()
          },
        },
        inputProps: {
          id,
          className: '!leading-8',
        },
      }}
      resetOnSelect={true}
      tagRenderer={(item) => (
        <div className="flex items-center gap-2">
          <OperatorAvatar
            className="w-8 h-8"
            id={item.id}
            rarity={item.rarity}
          />
          {language === 'zh_tw' ? item.name_en : item.name}
        </div>
      )}
      popoverProps={{
        popoverClassName: browseOnFocus
          ? 'matcher-operator-picker'
          : trimmedDebouncedQuery
            ? undefined
            : '[&_.bp4-popover2-content]:!p-0',
        placement: browseOnFocus ? 'top-start' : 'bottom-start',
        minimal: true,
        matchTargetWidth: true,
        positioningStrategy: browseOnFocus ? 'fixed' : undefined,
        modifiers: browseOnFocus
          ? {
              preventOverflow: { options: { padding: 16, altAxis: true } },
              flip: { options: { padding: 16 } },
            }
          : undefined,
        onClosed: () => {
          escapeTarget.current?.focus()
          escapeTarget.current = undefined
        },
        // 对齐 LevelSelect 的做法：使用 Portal 并提升层级，避免在 Dialog 内被遮挡，保证可点击
        usePortal: true,
        portalClassName: 'z-[3100]',
      }}
      onItemSelect={select}
      onRemove={remove}
      onClear={browseOnFocus ? undefined : clear}
    />
  )
}
