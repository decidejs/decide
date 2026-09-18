import type { Question, TypeSafeClientConfig } from '@typesafe-ai/sdk'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import type { JsonValue } from './template'

export type DecisionQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; options: readonly string[] }

export interface EvaluationRequest {
  state: Record<string, JsonValue>
  questions: Record<string, DecisionQuestion>
  model?: string
}

export interface DecideTransport {
  evaluate(request: EvaluationRequest, options?: { signal?: AbortSignal }): Promise<unknown>
}

export type TransportOptions = TypeSafeClientConfig

export function createTransport(options: TransportOptions): DecideTransport {
  const config = { ...options }
  let client: TypeSafeClient | undefined

  return {
    async evaluate({ state, questions, model }, options) {
      client ??= new TypeSafeClient(config)
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
      const response = await client.systemOne({ state, questions: compiled, model }, options)
      return response.answers
    },
  }
}
