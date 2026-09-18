import { readProbability } from './answers'
import type { DecisionRuntime } from './runtime'
import type { DecisionOptions } from './tag'
import { createTag } from './tag'
import { compileTemplate } from './template'

export function createPredicates(runtime: DecisionRuntime) {
  async function probability(
    strings: TemplateStringsArray,
    values: unknown[],
    options: DecisionOptions,
  ) {
    const { state, instructions } = compileTemplate(strings, values)
    const { answers, threshold } = await runtime.evaluate(
      { state, questions: { decision: { type: 'noul', instructions } } },
      options,
    )
    return { p: readProbability(answers, 'decision'), threshold }
  }

  return {
    yes: createTag(async (strings, values, options) => {
      const { p, threshold } = await probability(strings, values, options)
      return p >= threshold
    }),
    no: createTag(async (strings, values, options) => {
      const { p, threshold } = await probability(strings, values, options)
      return threshold === 0.5 ? p < 0.5 : 1 - p >= threshold
    }),
  }
}
