import { Button, Icon, Navbar, Tag } from '@blueprintjs/core'

import clsx from 'clsx'
import { useLinks } from 'hooks/useLinks'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { FCC } from 'types'

import { AccountManager } from 'components/AccountManager'
import { BackToTop } from 'components/BackToTop'
import { LanguageSwitcher } from 'components/LanguageSwitcher'
import { NavExpandButton } from 'components/NavExpandButton'
import { OnboardingDialog } from 'components/OnboardingDialog'
import { SiteRetireDialog } from 'components/SiteRetireDialog'
import { ThemeSwitchButton } from 'components/ThemeSwitchButton'
import { NavAside } from 'components/drawer/NavAside'

export const AppLayout: FCC = ({ children }) => {
  const { NAV_LINKS } = useLinks()
  const location = useLocation()
  const isHomePage = location.pathname === '/'

  return (
    <div className="flex flex-col h-full w-full bg-zinc-50 dark:bg-[#2f343c]">
      <Navbar className="flex w-full px-4 md:px-8 py-2 items-center bg-zinc-100 shadow fixed h-14 z-20 whitespace-nowrap overflow-x-hidden overflow-y-hidden">
        <Link to="/" className="flex items-center hover:no-underline ">
          <div className="select-none text-base sm:text-lg font-bold leading-none">
            MaaYuan Share
          </div>

          <Tag minimal className="ml-1 hidden sm:inline-flex" intent="warning">
            Beta
          </Tag>
        </Link>

        <div className="w-[1px] bg-gray-200 ml-4 mr-2 my-0.5 hidden sm:flex self-stretch" />

        <div className="md:flex items-center hidden">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className="text-sm text-zinc-600 dark:text-slate-100 !no-underline ml-2"
            >
              {({ isActive }) => (
                <Button minimal icon={link.icon} active={isActive}>
                  {link.label}
                </Button>
              )}
            </NavLink>
          ))}
        </div>

        <div className="flex-1" />

        <div className="flex gap-1 sm:gap-3 md:gap-4 shrink-0">
          <NavExpandButton />
          <LanguageSwitcher />
          <ThemeSwitchButton />
          <div className="ml-auto">
            <AccountManager />
          </div>
        </div>
      </Navbar>
      <NavAside />
      <SiteRetireDialog />
      <OnboardingDialog />

      {isHomePage && (
        <div className="hidden md:block px-4 pt-3 pb-0 mt-14 mb-[-12px]">
          <div className="max-w-[96rem] mx-auto">
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
              <div className="px-4 py-3 flex items-center gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0 animate-pulse">
                  <Icon
                    icon="warning-sign"
                    className="text-amber-600 dark:text-amber-400"
                    size={14}
                  />
                </div>
                <p className="text-sm text-gray-700 dark:text-gray-300 flex-1 leading-relaxed">
                  <span className="font-medium text-gray-900 dark:text-gray-100">
                    2026年8月3日 系统更新通知：
                  </span>
                  请更新到 MaaYuan v2.2.0-beta.3 及以上版本以使用以下功能
                  <br />
                  1. X号位 【退场重开】 / 【未被复制重开】（庞统鹦鹉） /
                  【不足2龙气重开】（诸葛亮）
                  <br />
                  2. 自定义【点击偏移量】：如需赌泰山府重开，请在填写关卡OCR
                  识别关键字（如 三 / 七 / 十）后，直接点击右侧的
                  “（点击偏移量）预设”
                  -“泰山府（关卡名偏右）”或“泰山府（关卡名偏左）”
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={clsx(
          'docs-content-wrapper',
          'mt-14',
          isHomePage && 'md:mt-0',
        )}
      >
        {children}
      </div>

      <BackToTop />
    </div>
  )
}
