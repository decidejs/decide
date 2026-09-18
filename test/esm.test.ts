import { expect, it } from 'vitest'
import { installPackage } from './package'

it('installs dependencies and evaluates decisions through the ESM export', async () => {
  const consumer = await installPackage()
  try {
    const result = await consumer.run('esm')
    expect(result.stdout.trim()).toBe('ok')
  } finally {
    await consumer.dispose()
  }
})
