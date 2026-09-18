import type { $ZodBoolean, $ZodEnum, $ZodType, $ZodTypes, output } from 'zod/v4/core'
import { globalRegistry, parseAsync } from 'zod/v4/core'
import { readChoice, readProbability } from './answers'
import type { DecisionRuntime } from './runtime'
import { createTag } from './tag'
import { compileTemplate } from './template'
import type { DecisionQuestion } from './transport'

export type EnumSchema = $ZodEnum<Record<string, string>>
export type MatcherShape = Record<string, EnumSchema | $ZodBoolean>
export type MatcherResult<Shape extends MatcherShape> = { [Key in keyof Shape]: output<Shape[Key]> }

function compileSchema(schema: $ZodType, name: string): DecisionQuestion {
  const def = (schema as $ZodTypes)?._zod?.def
  const description = globalRegistry.get(schema)?.description
  if (def?.type === 'boolean') {
    return { type: 'noul', instructions: description ?? `Is ${name} true?` }
  }
  if (def?.type === 'enum') {
    const options = [...new Set(Object.values(def.entries))]
    if (options.length === 0 || options.some((value) => typeof value !== 'string')) {
      throw new TypeError(`"${name}" requires a nonempty string enum`)
    }
    return {
      type: 'choice',
      instructions: description ?? `Which ${name} best matches?`,
      options: options as string[],
    }
  }
  throw new TypeError(`Unsupported schema for "${name}": expected a Zod 4 boolean or string enum`)
}

function frame(context: string, instructions: string) {
  return [context, instructions].filter(Boolean).join('\n\n')
}

export function createMatching(runtime: DecisionRuntime) {
  return {
    match<Schema extends EnumSchema>(schema: Schema) {
      const question = compileSchema(schema, 'option')
      if (question.type !== 'choice') throw new TypeError('match requires a Zod 4 string enum')

      return createTag<output<Schema>>(async (strings, values, options) => {
        const { state, instructions } = compileTemplate(strings, values)
        const { answers } = await runtime.evaluate(
          {
            state,
            questions: {
              decision: { ...question, instructions: frame(instructions, question.instructions) },
            },
          },
          options,
        )
        return parseAsync(schema, readChoice(answers, 'decision', question.options))
      })
    },

    matcher<Shape extends MatcherShape>(shape: Shape) {
      const fields = Object.entries(shape).map(([name, schema]) => ({
        name,
        schema,
        question: compileSchema(schema, name),
      }))
      if (fields.length === 0) throw new TypeError('matcher requires at least one field')

      return createTag<MatcherResult<Shape>>(async (strings, values, options) => {
        const { state, instructions } = compileTemplate(strings, values)
        const questions = Object.fromEntries(
          fields.map(({ name, question }) => [
            name,
            { ...question, instructions: frame(instructions, question.instructions) },
          ]),
        )
        const { answers, threshold } = await runtime.evaluate({ state, questions }, options)
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
    },
  }
}
