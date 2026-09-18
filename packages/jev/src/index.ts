import type { output } from 'zod/v4/core'
import type { DeciderOptions } from './runtime'
import { DecisionRuntime } from './runtime'
import type { EnumSchema, MatcherResult, MatcherShape } from './schema'
import type { DecisionTag } from './tag'

export type { DeciderOptions } from './runtime'
export type { EnumSchema, MatcherResult, MatcherShape } from './schema'
export type { DecisionOptions, DecisionTag } from './tag'

export interface Decisions {
  yes: DecisionTag<boolean>
  no: DecisionTag<boolean>
  match<Schema extends EnumSchema>(schema: Schema): DecisionTag<output<Schema>>
  matcher<Shape extends MatcherShape>(shape: Shape): DecisionTag<MatcherResult<Shape>>
}

export interface ConfigurableDecisions extends Decisions {
  configure(options: DeciderOptions): void
}

export function createDecider(options: DeciderOptions = {}): Decisions {
  const { yes, no, match, matcher } = new DecisionRuntime(options)
  return { yes, no, match, matcher }
}

const globalRuntime = new DecisionRuntime()

export const decide: ConfigurableDecisions = {
  yes: globalRuntime.yes,
  no: globalRuntime.no,
  match: globalRuntime.match,
  matcher: globalRuntime.matcher,
  configure: (options) => globalRuntime.configure(options),
}
