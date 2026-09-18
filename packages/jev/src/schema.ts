import type { $ZodBoolean, $ZodEnum, $ZodType, $ZodTypes, output } from 'zod/v4/core'
import { globalRegistry } from 'zod/v4/core'

export type EnumSchema = $ZodEnum<Record<string, string>>
export type MatcherShape = Record<string, EnumSchema | $ZodBoolean>
export type MatcherResult<Shape extends MatcherShape> = { [Key in keyof Shape]: output<Shape[Key]> }

export type DecisionQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; options: readonly string[] }

export function compileSchema(schema: $ZodType, name: string): DecisionQuestion {
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
