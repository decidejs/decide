import { execFile } from 'node:child_process'
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execute = promisify(execFile)
const packageDirectory = fileURLToPath(new URL('../packages/jev', import.meta.url))
const compiler = fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url))

export async function installPackage() {
  const directory = await mkdtemp(join(tmpdir(), 'decide-consumer-'))
  const dispose = () => rm(directory, { recursive: true, force: true })

  try {
    await execute('pnpm', ['pack', '--pack-destination', directory], {
      cwd: packageDirectory,
    })
    const tarball = (await readdir(directory)).find((name) => name.endsWith('.tgz'))
    if (!tarball) throw new Error('pnpm pack did not produce a tarball')
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ private: true, type: 'module' }),
    )
    await execute(
      'npm',
      ['install', '--ignore-scripts', '--no-audit', '--no-fund', `./${tarball}`],
      {
        cwd: directory,
        timeout: 60_000,
      },
    )

    return {
      directory,
      dispose,
      async run(format: 'esm' | 'cjs') {
        await copyFile(
          new URL('./fixtures/consumer.mjs', import.meta.url),
          join(directory, 'consumer.mjs'),
        )
        return execute(process.execPath, ['consumer.mjs', format], {
          cwd: directory,
          timeout: 15_000,
        })
      },
      async checkTypes() {
        for (const extension of ['mts', 'cts']) {
          await copyFile(
            new URL('./fixtures/consumer.ts', import.meta.url),
            join(directory, `consumer.${extension}`),
          )
        }
        return execute(
          process.execPath,
          [
            compiler,
            '--noEmit',
            '--strict',
            '--module',
            'NodeNext',
            '--target',
            'ES2022',
            'consumer.mts',
            'consumer.cts',
          ],
          { cwd: directory, timeout: 30_000 },
        )
      },
    }
  } catch (error) {
    await dispose()
    throw error
  }
}
