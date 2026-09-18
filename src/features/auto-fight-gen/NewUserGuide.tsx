import {
  Button,
  Dialog,
  DialogBody,
  DialogFooter,
  Divider,
  H4,
} from '@blueprintjs/core'

import { FC } from 'react'

import { useTranslation } from '../../i18n/i18n'

export interface NewUserGuideProps {
  isOpen: boolean
  onAcknowledge: () => void
  onClose: () => void
}

export const NewUserGuide: FC<NewUserGuideProps> = ({
  isOpen,
  onAcknowledge,
  onClose,
}) => {
  const t = useTranslation()
  const guide = t.components.editor.source.XlsxImporter.newUserGuide

  const symbolRows = [
    guide.symbol_table.ultimate,
    guide.symbol_table.down,
    guide.symbol_table.normal,
    guide.symbol_table.special,
  ]

  return (
    <Dialog
      isOpen={isOpen}
      onClose={onClose}
      title={guide.title}
      icon="th"
      portalClassName="z-[3110]"
      className="w-[92vw] max-w-[720px] !bg-white dark:!bg-[#383e47]"
      style={{ maxHeight: '90vh' }}
    >
      <DialogBody className="max-h-[70vh] overflow-y-auto text-slate-700 dark:text-slate-100">
        <section>
          <H4 className="mb-2">{guide.symbol_table.title}</H4>
          <div className="overflow-hidden rounded-md border border-slate-300 dark:border-slate-600">
            <table className="w-full border-collapse text-sm text-slate-700 dark:text-slate-100">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-left dark:border-slate-600 dark:bg-slate-700/50">
                  <th className="py-2 pr-3 font-semibold">
                    {guide.symbol_table.header_action}
                  </th>
                  <th className="py-2 pr-3 font-semibold">
                    {guide.symbol_table.header_symbols}
                  </th>
                  <th className="py-2 font-semibold">
                    {guide.symbol_table.header_recommended}
                  </th>
                </tr>
              </thead>
              <tbody>
                {symbolRows.map((row, index) => (
                  <tr
                    key={index}
                    className="border-b border-slate-200 bg-white last:border-b-0 dark:border-slate-600 dark:bg-slate-800/60"
                  >
                    <td className="py-2 pr-3">{row.action}</td>
                    <td className="py-2 pr-3 font-mono">{row.symbols}</td>
                    <td className="py-2">
                      <code className="rounded bg-slate-200 px-1.5 py-0.5 text-slate-700 dark:bg-slate-700 dark:text-slate-100">
                        {row.recommended}
                      </code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <Divider className="my-4" />

        <section>
          <H4 className="mb-2">{guide.cell_restrictions.title}</H4>
          <p className="mb-0 text-sm text-slate-700 dark:text-slate-100">
            {guide.cell_restrictions.description}
          </p>
        </section>

        <Divider className="my-4" />

        <section>
          <H4 className="mb-2">{guide.enemy_color.title}</H4>
          <p className="mb-0 text-sm text-slate-700 dark:text-slate-100">
            {guide.enemy_color.description}
          </p>
        </section>
      </DialogBody>
      <DialogFooter
        actions={
          <Button intent="primary" onClick={onAcknowledge}>
            {guide.acknowledge_button}
          </Button>
        }
      />
    </Dialog>
  )
}
