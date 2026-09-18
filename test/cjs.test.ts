import { expect, it } from 'vitest'
import { installPackage } from './package'

it('installs dependencies and evaluates decisions through the CommonJS export', async () => {
  const consumer = await installPackage()
  try {
    const result = await consumer.run('cjs')
    expect(result.stdout.trim()).toBe('ok')
  } finally {
    await consumer.dispose()
  }
})
