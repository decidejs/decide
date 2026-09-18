import type { output } from 'zod/v4/core'
import type { DeciderOptions } from './runtime'
import { DecisionRuntime } from './runtime'
import type { EnumSchema, MatcherResult, MatcherShape } from './schema'
import type { DecisionTag } from './tag'

export type { DeciderOptions } from './runtime'
export type { EnumSchema, MatcherResult, MatcherShape } from './schema'
export type { DecisionOptions, DecisionTag } from './tag'

/**
 * Decision functions are safe to destructure and retain their decider's configuration.
 * Use a tag directly, or call it with options to create a configured tag.
 * `match` and `matcher` return tags after receiving a schema or collection of schemas.
 */
export interface Decisions {
  /**
   * True when the probability of yes reaches the threshold.
   *
   * @example
   * await decide.yes`is ${message} acceptable?`
   * await decide.yes({ threshold: 0.8 })`is ${message} acceptable?`
   */
  yes: DecisionTag<boolean>
  /**
   * True when the probability of yes is below the threshold.
   * Complements `yes` for the same probability and threshold.
   *
   * @example
   * await decide.no`is ${message} acceptable?`
   * await decide.no({ threshold: 0.8 })`is ${message} acceptable?`
   */
  no: DecisionTag<boolean>
  /**
   * Creates a reusable tag that selects one enum value.
   * Pass request options to the returned tag.
   *
   * @example
   * import { z } from 'zod'
   *
   * const kind = decide.match(z.enum(['bug', 'feature', 'question']))
   * await kind`what kind of issue is ${issue}?`
   * const controller = new AbortController()
   * await kind({ signal: controller.signal })`what kind of issue is ${issue}?`
   */
  match<Schema extends EnumSchema>(schema: Schema): DecisionTag<output<Schema>>
  /**
   * Creates a reusable tag that evaluates a nonempty object or array in one request.
   * Objects return named results; arrays return results in input order.
   * Inline arrays infer tuple results with a separate type for each position.
   * Every array entry must have a nonempty `description`, set with `.describe(...)`.
   * Missing or blank array descriptions throw when creating the matcher.
   * Descriptions are the questions; the template supplies shared context.
   * Object fields fall back to their names when descriptions are absent.
   * Pass options to the returned tag; threshold applies to boolean fields.
   *
   * @example
   * import { z } from 'zod'
   *
   * const classify = decide.matcher({
   *   category: z.enum(['billing', 'technical']).describe('Which team should handle this?'),
   *   urgent: z.boolean().describe('Does this require immediate attention?'),
   * })
   * const { category, urgent } = await classify`classify ${ticket}`
   * await classify({ threshold: 0.8 })`classify ${ticket}`
   *
   * @example
   * import { z } from 'zod'
   *
   * const classify = decide.matcher([
   *   z.enum(['billing', 'technical']).describe('Which team should handle this?'),
   *   z.boolean().describe('Does this require immediate attention?'),
   * ])
   * const [category, urgent] = await classify`classify ${ticket}`
   * await classify({ threshold: 0.8 })`classify ${ticket}`
   */
  matcher<const Shape extends MatcherShape>(shape: Shape): DecisionTag<MatcherResult<Shape>>
}

export interface ConfigurableDecisions extends Decisions {
  /**
   * Replaces global configuration for subsequent calls, including existing tags.
   */
  configure(options: DeciderOptions): void
}

/**
 * Creates an independent decider, resolving client options during creation.
 */
export function createDecider(options: DeciderOptions = {}): Decisions {
  const { yes, no, match, matcher } = new DecisionRuntime(options)
  return { yes, no, match, matcher }
}

const runtime = new DecisionRuntime()

/** Global decider. Call `decide.configure(...)` before its first evaluation. */
export const decide: ConfigurableDecisions = {
  yes: runtime.yes,
  no: runtime.no,
  match: runtime.match,
  matcher: runtime.matcher,
  configure: (options) => runtime.configure(options),
}
