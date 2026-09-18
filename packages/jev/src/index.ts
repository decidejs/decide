import type { output } from 'zod/v4/core'
import type { EnumSchema, MatcherResult, MatcherShape } from './matching'
import { createMatching } from './matching'
import { createPredicates } from './predicates'
import type { DeciderOptions } from './runtime'
import { DecisionRuntime } from './runtime'
import type { DecisionTag } from './tag'

export type { EnumSchema, MatcherResult, MatcherShape } from './matching'
export type { DeciderOptions } from './runtime'
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
  const runtime = new DecisionRuntime(options)
  return { ...createPredicates(runtime), ...createMatching(runtime) }
}

const globalRuntime = new DecisionRuntime()

export const decide: ConfigurableDecisions = {
  ...createPredicates(globalRuntime),
  ...createMatching(globalRuntime),
  configure: (options) => globalRuntime.configure(options),
}
