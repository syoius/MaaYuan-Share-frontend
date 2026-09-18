import react from '@vitejs/plugin-react'

import { defineConfig, loadEnv } from 'vite'
import viteTsconfigPath from 'vite-tsconfig-paths'

import { generateTranslations } from './scripts/generate-translations'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load env file based on `mode` in the current working directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [react(), viteTsconfigPath(), generateTranslations()],
    define: {
      // react-draggable reads this debug switch during drag/resize. Leaving it
      // untouched crashes browsers with "process is not defined".
      'process.env.DRAGGABLE_DEBUG': 'false',
    },
    optimizeDeps: {
      esbuildOptions: {
        define: {
          'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || mode),
          'process.env.DRAGGABLE_DEBUG': 'false',
        },
      },
    },
    server: {
      port: +env.PORT || undefined,
      server: '0.0.0.0',
      allowedHosts: true,
    },
    resolve: {
      alias: {
        src: require('path').resolve(__dirname, 'src'),
        // 明确指向 ESM 入口，避免某些环境下包入口解析失败
        'maa-copilot-client': 'maa-copilot-client/dist/esm/index.js',
      },
    },
    build: {
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('/node_modules/')) return undefined

            if (
              [
                '/react/',
                '/react-dom/',
                '/react-router/',
                '/react-router-dom/',
                '/scheduler/',
              ].some((dependency) => id.includes(`/node_modules${dependency}`))
            ) {
              return 'vendor-react'
            }

            if (id.includes('/node_modules/@blueprintjs/')) {
              return 'vendor-blueprint'
            }

            return undefined
          },
        },
      },
    },
  }
})
