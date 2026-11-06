import { mkdir, readdir, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = join(projectRoot, 'assets-src')
const publicRoot = join(projectRoot, 'public')

const bannerSources = [
  ['mumu-560x320.jpg', 'mumu.webp'],
  ['biubiu.png', 'biubiu.webp'],
  ['mirror.png', 'mirror.webp'],
  ['wiki.png', 'wiki.webp'],
]

const optimizeBanners = async () => {
  for (const [sourceName, outputName] of bannerSources) {
    const outputPath = join(publicRoot, outputName)
    await sharp(join(sourceRoot, 'banners', sourceName))
      .resize(560, 320, { fit: 'cover' })
      .webp({ quality: 82, alphaQuality: 90, effort: 6 })
      .toFile(outputPath)
  }
}

const optimizeAvatars = async () => {
  const avatarRoot = join(publicRoot, 'assets', 'operator-avatars')
  const sourceDir = join(sourceRoot, 'operator-avatars', 'original')
  const output32Dir = join(avatarRoot, 'webp32')
  const output96Dir = join(avatarRoot, 'webp96')
  const output192Dir = join(avatarRoot, 'webp192')
  const names = (await readdir(sourceDir)).filter((name) =>
    name.endsWith('.webp'),
  )

  await Promise.all(
    [output32Dir, output96Dir, output192Dir].map((directory) =>
      mkdir(directory, { recursive: true }),
    ),
  )

  for (const name of names) {
    const sourcePath = join(sourceDir, name)
    const output96 = await sharp(sourcePath)
      .resize(96, 96, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80, alphaQuality: 90, effort: 6 })
      .toBuffer()
    const output32 = await sharp(output96)
      .resize(32, 32)
      .webp({ quality: 78, alphaQuality: 88, effort: 6 })
      .toBuffer()

    await Promise.all([
      writeFile(join(output32Dir, name), output32),
      writeFile(join(output96Dir, name), output96),
      sharp(sourcePath)
        .resize(192, 192, { fit: 'cover', position: 'centre' })
        .webp({ quality: 84, alphaQuality: 92, effort: 6 })
        .toFile(join(output192Dir, name)),
    ])
  }

  await sharp(join(sourceRoot, 'operator-avatars', '404.webp'))
    .resize(192, 192, { fit: 'cover', position: 'centre' })
    .webp({ quality: 84, alphaQuality: 92, effort: 6 })
    .toFile(join(avatarRoot, '404.webp'))
}

await Promise.all([optimizeBanners(), optimizeAvatars()])

console.log('Optimized public banners and operator avatars.')
