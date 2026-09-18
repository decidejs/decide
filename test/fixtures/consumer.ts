import type { Decisions } from '@decide.js/jev'
import { createDecider, decide } from '@decide.js/jev'
import { z } from 'zod'

const instance: Decisions = createDecider({ apiKey: 'test-key', threshold: 0.8 })
decide.configure({ apiKey: 'test-key', retry: { maxRetries: 0 } })

const positive: Promise<boolean> = instance.yes`valid?`
const negative: Promise<boolean> = decide.no({ threshold: 0.8 })`valid?`
const choice: Promise<'a' | 'b'> = instance.match(z.enum(['a', 'b']))`classify`
const matcher = decide.matcher({ urgent: z.boolean(), category: z.enum(['a', 'b']) })
const result: Promise<{ urgent: boolean; category: 'a' | 'b' }> = matcher({
  threshold: 0.8,
})`ticket`

// @ts-expect-error Only the global instance supports configuration.
instance.configure({})
// @ts-expect-error A categorical decision requires a finite string enum.
instance.match(z.string())
// @ts-expect-error Unsupported numeric schemas cannot become implicit score rubrics.
instance.matcher({ score: z.number() })
// @ts-expect-error Enum results retain their literal union.
const invalid: Promise<'c'> = choice

void [positive, negative, choice, result, invalid]
