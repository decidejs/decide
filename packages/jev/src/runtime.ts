import type { Question, TypeSafeClientConfig } from '@typesafe-ai/sdk'
import { TypeSafeClient } from '@typesafe-ai/sdk'
import type { output } from 'zod/v4/core'
import { parseAsync } from 'zod/v4/core'
import { readChoice, readProbability } from './answers'
import type { DecisionQuestion, EnumSchema, MatcherResult, MatcherShape } from './schema'
import { compileSchema } from './schema'
import type { DecisionOptions } from './tag'
import { createTag, resolveThreshold } from './tag'
import { compileTemplate } from './template'

export interface DeciderOptions {
  /** SDK client or construction options. Omit to use SDK defaults, including `TYPESAFE_API_KEY`. */
  client?: TypeSafeClient | TypeSafeClientConfig
  /** Default boolean threshold in [0.5, 1]. Defaults to 0.5; higher values allow both yes and no to be false. */
  threshold?: number
}

export class DecisionRuntime {
  private current?: {
    threshold: number
    client: TypeSafeClient
  }

  readonly yes = createTag(async (strings, values, options) => {
    const { p, threshold } = await this.probability(strings, values, options)
    return p >= threshold
  })

  readonly no = createTag(async (strings, values, options) => {
    const { p, threshold } = await this.probability(strings, values, options)
    return threshold === 0.5 ? p < 0.5 : 1 - p >= threshold
  })

  readonly match = <Schema extends EnumSchema>(schema: Schema) => {
    const question = compileSchema(schema, 'option')
    if (question.type !== 'choice') throw new TypeError('match requires a Zod 4 string enum')

    return createTag<output<Schema>>(async (strings, values, options) => {
      const { answers } = await this.evaluate(strings, values, { decision: question }, options)
      return parseAsync(schema, readChoice(answers, 'decision', question.options))
    })
  }

  readonly matcher = <Shape extends MatcherShape>(shape: Shape) => {
    const fields = Object.entries(shape).map(([name, schema]) => ({
      name,
      schema,
      question: compileSchema(schema, name),
    }))
    if (fields.length === 0) throw new TypeError('matcher requires at least one field')
    const questions = Object.fromEntries(fields.map(({ name, question }) => [name, question]))

    return createTag<MatcherResult<Shape>>(async (strings, values, options) => {
      const { answers, threshold } = await this.evaluate(strings, values, questions, options)
      const entries = await Promise.all(
        fields.map(async ({ name, schema, question }) => {
          const value =
            question.type === 'noul'
              ? readProbability(answers, name) >= threshold
              : readChoice(answers, name, question.options)
          return [name, await parseAsync(schema, value)] as const
        }),
      )
      return Object.fromEntries(entries) as MatcherResult<Shape>
    })
  }

  constructor(options?: DeciderOptions) {
    if (options !== undefined) this.configure(options)
  }

  configure({ threshold, client }: DeciderOptions) {
    this.current = {
      threshold: resolveThreshold(threshold),
      client: client instanceof TypeSafeClient ? client : new TypeSafeClient(client),
    }
  }

  private async probability(
    strings: TemplateStringsArray,
    values: unknown[],
    options: DecisionOptions,
  ) {
    const { answers, threshold } = await this.evaluate(
      strings,
      values,
      { decision: { type: 'noul', instructions: '' } },
      options,
    )
    return { p: readProbability(answers, 'decision'), threshold }
  }

  private async evaluate(
    strings: TemplateStringsArray,
    values: unknown[],
    questions: Record<string, DecisionQuestion>,
    options: DecisionOptions,
  ) {
    const { state, instructions } = compileTemplate(strings, values)
    const current = this.current
    if (!current) {
      throw new Error('Call decide.configure(...) before evaluating a global decision')
    }

    const threshold = resolveThreshold(options.threshold ?? current.threshold)
    const compiled = Object.fromEntries(
      Object.entries(questions).map(([id, question]): [string, Question] => {
        const framed = [instructions, question.instructions].filter(Boolean).join('\n\n')
        return [
          id,
          question.type === 'noul'
            ? { type: 'noul', instructions: framed }
            : {
                type: 'choice',
                instructions: framed,
                criteria: Object.fromEntries(question.options.map((option) => [option, null])),
              },
        ]
      }),
    )
    const { answers } = await current.client.systemOne(
      { state, questions: compiled, model: options.model },
      { signal: options.signal },
    )
    return { answers, threshold }
  }
}
