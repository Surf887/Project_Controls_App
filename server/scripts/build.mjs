import * as esbuild from 'esbuild'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync } from 'node:fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sharedSrc = path.resolve(root, '..', 'src')

mkdirSync(path.join(root, 'dist'), { recursive: true })

const aliasPlugin = {
  name: 'pc-alias',
  setup(build) {
    build.onResolve({ filter: /^@pc\// }, (args) => {
      let subpath = args.path.slice('@pc/'.length)
      if (subpath.endsWith('.js')) {
        subpath = `${subpath.slice(0, -3)}.ts`
      }
      return { path: path.join(sharedSrc, subpath) }
    })
  },
}

await esbuild.build({
  entryPoints: [path.join(root, 'src/index.ts'), path.join(root, 'src/smoke.ts')],
  outdir: path.join(root, 'dist'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  packages: 'external',
  plugins: [aliasPlugin],
  logLevel: 'info',
})

console.log('[build] server bundle written to dist/')
