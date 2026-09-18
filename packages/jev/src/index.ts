import type { output } from 'zod/v4/core'
import type { DeciderOptions } from './runtime'
import { DecisionRuntime } from './runtime'
import type { EnumSchema, MatcherResult, MatcherShape } from './schema'
import type { DecisionTag } from './tag'

export type { DeciderOptions } from './runtime'
export type { EnumSchema, MatcherResult, MatcherShape } from './schema'
export type { DecisionOptions, DecisionTag } from './tag'

/** Decision functions are safe to destructure and retain their decider's configuration. */
export interface Decisions {
  /** True when the probability of yes reaches the threshold. */
  yes: DecisionTag<boolean>
  /** True when the probability of no reaches the threshold; an exact 0.5 tie is false. */
  no: DecisionTag<boolean>
  /** Creates a reusable tag that selects one enum value. */
  match<Schema extends EnumSchema>(schema: Schema): DecisionTag<output<Schema>>
  /** Creates a reusable tag that evaluates all fields in one request. */
  matcher<Shape extends MatcherShape>(shape: Shape): DecisionTag<MatcherResult<Shape>>
}

export interface ConfigurableDecisions extends Decisions {
  /** Replaces global configuration for subsequent calls, including existing tags. */
  configure(options: DeciderOptions): void
}

/** Creates an independent decider, resolving client options during creation. */
export function createDecider(options: DeciderOptions = {}): Decisions {
  const { yes, no, match, matcher } = new DecisionRuntime(options)
  return { yes, no, match, matcher }
}

const globalRuntime = new DecisionRuntime()

/** Global decider. Call `decide.configure(...)` before its first evaluation. */
export const decide: ConfigurableDecisions = {
  yes: globalRuntime.yes,
  no: globalRuntime.no,
  match: globalRuntime.match,
  matcher: globalRuntime.matcher,
  configure: (options) => globalRuntime.configure(options),
}
