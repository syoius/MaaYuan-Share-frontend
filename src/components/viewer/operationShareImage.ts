import { calculateSharePixelRatio } from './operationShareModel'

const RESOURCE_TIMEOUT_MS = 5000

function delay(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms))
}

export async function waitForOperationShareCardResources(node: HTMLElement) {
  const fontsReady = document.fonts?.ready ?? Promise.resolve()
  const imagesReady = Promise.all(
    Array.from(node.querySelectorAll('img')).map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve) => {
          image.addEventListener('load', () => resolve(), { once: true })
          image.addEventListener('error', () => resolve(), { once: true })
        })
      }
      try {
        await image.decode()
      } catch {
        // A fallback image can still be captured when decoding fails.
      }
    }),
  )

  await Promise.race([
    Promise.all([fontsReady, imagesReady]),
    delay(RESOURCE_TIMEOUT_MS),
  ])
}

export async function createOperationShareQrDataUrl(targetUrl: string) {
  const { toDataURL } = await import('qrcode')
  return toDataURL(targetUrl, {
    color: { dark: '#24312f', light: '#fffdf8' },
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 224,
  })
}

export async function renderOperationShareCardBlob(
  node: HTMLElement,
  pixelRatio = calculateSharePixelRatio(node.scrollHeight),
) {
  await waitForOperationShareCardResources(node)
  const { toBlob } = await import('html-to-image')
  const backgroundColor =
    window.getComputedStyle(node).backgroundColor || '#ffffff'
  const blob = await toBlob(node, {
    backgroundColor,
    cacheBust: true,
    pixelRatio,
    skipFonts: false,
    // 与 shareCardComponents.tsx 的 shareCardStyle.width:1080 固定定宽保持一致
    width: 1080,
  })
  if (!blob) throw new Error('图片转换未返回有效内容')
  return blob
}
