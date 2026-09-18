import type { $ZodBoolean, $ZodEnum, $ZodType, $ZodTypes, output } from 'zod/v4/core'
import { globalRegistry } from 'zod/v4/core'

/** A nonempty Zod string enum. */
export type EnumSchema = $ZodEnum<Record<string, string>>
/**
 * A nonempty object or array of decision schemas.
 * Every array entry requires a nonempty `.describe(...)` question.
 * Object fields use their names as fallbacks when descriptions are absent.
 */
export type MatcherShape =
  | Record<string, EnumSchema | $ZodBoolean>
  | readonly (EnumSchema | $ZodBoolean)[]
export type MatcherResult<Shape extends MatcherShape> = {
  -readonly [Key in keyof Shape]: output<Shape[Key]>
}

export type DecisionQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; options: readonly string[] }

export function compileFieldSchema(schema: $ZodType, name: string): DecisionQuestion {
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
  throw new TypeError(`Unsupported schema for "${name}": expected a Zod boolean or string enum`)
}

export function compileArrayItemSchema(schema: $ZodType, index: number): DecisionQuestion {
  const def = (schema as $ZodTypes)?._zod?.def
  const description = globalRegistry.get(schema)?.description
  if (typeof description !== 'string' || !description.trim()) {
    throw new TypeError(`Array schema at index ${index} requires a nonempty description`)
  }
  if (def?.type === 'boolean') {
    return { type: 'noul', instructions: description }
  }
  if (def?.type === 'enum') {
    const options = [...new Set(Object.values(def.entries))]
    if (options.length === 0 || options.some((value) => typeof value !== 'string')) {
      throw new TypeError(`Array schema at index ${index} requires a nonempty string enum`)
    }
    return { type: 'choice', instructions: description, options: options as string[] }
  }
  throw new TypeError(`Unsupported schema at index ${index}: expected a Zod boolean or string enum`)
}
