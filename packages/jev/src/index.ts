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

export class Decider implements Decisions {
  readonly yes: DecisionTag<boolean>
  readonly no: DecisionTag<boolean>

  constructor(options: DeciderOptions = {}) {
    const predicates = createPredicates(createRuntime(options))
    this.yes = predicates.yes
    this.no = predicates.no
  }
}

export const decide: ConfigurableDecisions = {
  ...createPredicates(globalRuntime),
  configure: globalRuntime.configure,
}
