import { expect, it } from 'vitest'
import { installPackage } from './package'

it('preserves public type inference for installed ESM and CommonJS consumers', async () => {
  const consumer = await installPackage()
  try {
    const result = await consumer.checkTypes()
    expect(result.stdout).toBe('')
  } finally {
    await consumer.dispose()
  }
})
