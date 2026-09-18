import { createPredicates } from './predicates'
import type { DeciderOptions } from './runtime'
import { createRuntime, globalRuntime } from './runtime'
import type { DecisionTag } from './tag'

export type { DeciderOptions } from './runtime'
export type { DecisionOptions, DecisionTag } from './tag'

export interface Decisions {
  yes: DecisionTag<boolean>
  no: DecisionTag<boolean>
}

export interface ConfigurableDecisions extends Decisions {
  configure(options: DeciderOptions): void
}

export function createDecider(options: DeciderOptions = {}): Decisions {
  return createPredicates(createRuntime(options))
}

export const decide: ConfigurableDecisions = {
  ...createPredicates(globalRuntime),
  configure: globalRuntime.configure,
}
