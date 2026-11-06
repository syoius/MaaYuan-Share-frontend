import { find } from 'linkifyjs'

const isXiaohongshuUrl = (url: string) =>
  /^https?:\/\/(?:[a-z0-9-]+\.)*(?:xiaohongshu\.com|xhslink\.com)(?:[/:?#]|$)/i.test(
    url,
  )

export function getOperationCardExcerpt(
  details: string,
  sourceLinkLabel: string,
): string {
  const shareTitles: string[] = []
  // shortcut: 仅清理已知小红书分享包装，出现其他平台样本时补充规则。
  const withoutTitles = details.replace(
    /(?:^[ \t]*\d+[ \t]+)?【([^【】\r\n]+?)\s*[-|｜]\s*小红书\s*[-|｜]\s*你的生活兴趣社区】/gm,
    (_, title: string) => {
      shareTitles.push(title.trim())
      return ''
    },
  )
  const isShare =
    shareTitles.length > 0 ||
    find(details, 'url').some((link) => isXiaohongshuUrl(link.href))
  let body = find(withoutTitles, 'url').reduceRight(
    (text, link) =>
      text.slice(0, link.start) +
      (isXiaohongshuUrl(link.href) ? '' : sourceLinkLabel) +
      text.slice(link.end),
    withoutTitles,
  )
  if (isShare) {
    body = body.replace(
      /([😝😜😆😃😺💰$￥¥])\s*(?=[A-Za-z0-9]*[A-Za-z])(?=[A-Za-z0-9]*\d)[A-Za-z0-9]{8,}\s*\1/gu,
      '',
    )
  }
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false
      if (!isShare) return true
      return (
        !/^(?:小红书(?:链接|原文)?|原文(?:链接)?|来源(?:链接)?|链接|出处)\s*[:：]?\s*$/.test(
          line,
        ) &&
        !/^(?:复制(?:本条|这条|此条)信息[，,]?\s*)?打开[【「]?小红书[】」]?\s*(?:APP)?(?:查看|观看|搜索)[^\r\n]*$/i.test(
          line,
        )
      )
    })
  return [...lines, ...shareTitles].join('\n')
}
