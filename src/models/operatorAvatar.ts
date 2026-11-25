import manifest from '../../tools/yuanhub-avatar-manifest.json'

export const operatorAvatarFallback = '/assets/operator-avatars/404.webp'
const avatarDigests: Record<string, string | undefined> = manifest

export function operatorAvatarUrl(id: string | undefined, size: 32 | 96 | 192) {
  if (!id) return operatorAvatarFallback
  const path = `/assets/operator-avatars/webp${size}/${id}.webp`
  const digest = avatarDigests[id]
  return typeof digest === 'string' && /^[a-f0-9]{64}$/.test(digest)
    ? `${path}?v=${digest.slice(0, 16)}`
    : path
}
