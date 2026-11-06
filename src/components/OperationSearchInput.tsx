import { Button, InputGroup } from '@blueprintjs/core'

import { useTranslation } from '../i18n/i18n'

const shortCodeCandidatePattern = /^\d{5,6}$/

interface OperationSearchInputProps {
  value: string
  size: number
  onChange: (value: string) => void
  onBlur: () => void
  onSubmit: () => void
  onShortCodeSelect: (shortCode: string) => void
}

export const OperationSearchInput = ({
  value,
  size,
  onChange,
  onBlur,
  onSubmit,
  onShortCodeSelect,
}: OperationSearchInputProps) => {
  const t = useTranslation()
  const shortCodeCandidate = shortCodeCandidatePattern.test(value)
    ? `maay://${value}`
    : null

  return (
    <>
      <InputGroup
        className="w-full sm:max-w-md [&>input]:!rounded-md"
        placeholder={t.components.Operations.search_placeholder}
        leftIcon="search"
        size={size}
        large
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (
            event.key === 'Enter' &&
            !event.nativeEvent.isComposing &&
            event.keyCode !== 229
          ) {
            event.preventDefault()
            onSubmit()
          }
        }}
      />
      {shortCodeCandidate ? (
        <Button
          minimal
          small
          icon="search"
          className="!text-xs !font-normal !px-2"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onShortCodeSelect(shortCodeCandidate)}
        >
          {t.components.Operations.short_code_search_suggestion({
            shortCode: shortCodeCandidate,
          })}
        </Button>
      ) : null}
    </>
  )
}
