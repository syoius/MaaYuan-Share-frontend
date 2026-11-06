import { describe, expect, it } from 'vitest'

import { getOperationCardExcerpt } from './operationCardExcerpt'

const source =
  'https://www.xiaohongshu.com/discovery/item/123?source=web&xsec_token=original'
const share = `81 【如鸢12月洞窟，无张闿 - ayo | 小红书 - 你的生活兴趣社区】 😝 KRDMYUfz4OfRT96 😝 ${source}`

describe('作业卡片摘要', () => {
  it('puts tactical notes before a shared title and removes the known share wrapper', () => {
    const details = `${share}\n诸葛亮:建木 飞龙\n黄月英:羽化`
    expect(getOperationCardExcerpt(details, '原文链接')).toBe(
      '诸葛亮:建木 飞龙\n黄月英:羽化\n如鸢12月洞窟，无张闿 - ayo',
    )
    expect(details).toContain(source)
    expect(details).toContain('KRDMYUfz4OfRT96')
  })

  it('keeps a useful title when a description consists only of a share', () => {
    expect(getOperationCardExcerpt(share, '原文链接')).toBe(
      '如鸢12月洞窟，无张闿 - ayo',
    )
  })

  it('removes a standalone source label and app-opening boilerplate', () => {
    const details = `安期只能独走\n小红书链接：\n${source}\n复制本条信息，打开【小红书】App查看精彩内容！\n不可取予动而等`
    expect(getOperationCardExcerpt(details, '原文链接')).toBe(
      '安期只能独走\n不可取予动而等',
    )
  })

  it('preserves original tactics, numbers, emoji, and unknown tokens without a known share context', () => {
    const details =
      '81次尝试\n安期只能独走，攻击8543，血量21640\n😝 KRDMYUfz4OfRT96 😝\n打开命盘后再释放大招\n费用不能低于10'
    expect(getOperationCardExcerpt(details, '原文链接')).toBe(details)
  })

  it('does not treat a similar third-party host as Xiaohongshu', () => {
    expect(
      getOperationCardExcerpt(
        '查看 https://xiaohongshu.com.example.org/path 😝 KRDMYUfz4OfRT96 😝',
        '原文链接',
      ),
    ).toBe('查看 原文链接 😝 KRDMYUfz4OfRT96 😝')
  })

  it('retains ordinary links as a short label and supports Xiaohongshu short links', () => {
    expect(
      getOperationCardExcerpt(
        '命盘说明 https://example.com/docs\nhttp://xhslink.com/a/123',
        '原文链接',
      ),
    ).toBe('命盘说明 原文链接')
    expect(getOperationCardExcerpt('', '原文链接')).toBe('')
    expect(getOperationCardExcerpt(source, '原文链接')).toBe('')
  })
})
