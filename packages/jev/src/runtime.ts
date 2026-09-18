import type { Question, TypeSafeClientConfig } from '@typesafe-ai/sdk'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import type { DecisionOptions } from './tag'
import { resolveThreshold } from './tag'
import type { JsonValue } from './template'

export interface DeciderOptions extends TypeSafeClientConfig {
  threshold?: number
}

export type DecisionQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; options: readonly string[] }

export interface EvaluationRequest {
  state: Record<string, JsonValue>
  questions: Record<string, DecisionQuestion>
}

export class DecisionRuntime {
  private current?: {
    threshold: number
    sdkOptions: TypeSafeClientConfig
    client?: TypeSafeClient
  }

  constructor(options?: DeciderOptions) {
    if (options !== undefined) this.configure(options)
  }

  configure({ threshold, ...sdkOptions }: DeciderOptions) {
    this.current = {
      threshold: resolveThreshold(threshold),
      sdkOptions,
    }
  }

  async evaluate({ state, questions }: EvaluationRequest, options: DecisionOptions) {
    const current = this.current
    if (!current) {
      throw new Error('Call decide.configure(...) before evaluating a global decision')
    }

    current.client ??= new TypeSafeClient(current.sdkOptions)
    const compiled = Object.fromEntries(
      Object.entries(questions).map(([id, question]): [string, Question] => [
        id,
        question.type === 'noul'
          ? question
          : {
              type: 'choice',
              instructions: question.instructions,
              criteria: Object.fromEntries(question.options.map((option) => [option, null])),
            },
      ]),
    )
    const { answers } = await current.client.systemOne(
      { state, questions: compiled, model: options.model },
      { signal: options.signal },
    )
    return { answers, threshold: resolveThreshold(options.threshold ?? current.threshold) }
  }
}
