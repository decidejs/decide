export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue }

function assertJson(
  value: unknown,
  path: string,
  ancestors = new Set<object>(),
): asserts value is JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return

  if (typeof value !== 'object' || value === null) {
    throw new TypeError(`${path} must be JSON-compatible`)
  }
  if (ancestors.has(value)) throw new TypeError(`${path} contains a circular reference`)
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  ) {
    throw new TypeError(`${path} must be a plain JSON object or array`)
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new TypeError(`${path} contains symbol keys`)
  }

  ancestors.add(value)
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      assertJson(value[index], `${path}[${index}]`, ancestors)
    }
  } else {
    for (const [key, entry] of Object.entries(value)) {
      assertJson(entry, `${path}.${key}`, ancestors)
    }
  }
  ancestors.delete(value)
}

export function compileTemplate(strings: TemplateStringsArray, values: readonly unknown[]) {
  const state: Record<string, JsonValue> = {}
  let instructions = strings[0]

  for (const [index, value] of values.entries()) {
    const key = `arg${index}`
    assertJson(value, key)
    state[key] = value
    instructions += `\`${key}\`${strings[index + 1]}`
  }

  return { state, instructions: instructions.trim() }
}
