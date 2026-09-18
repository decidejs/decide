export interface DecisionOptions {
  threshold?: number
  model?: string
  signal?: AbortSignal
}

export interface DecisionTag<T> {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<T>
  (options: DecisionOptions): DecisionTag<T>
}

export function resolveThreshold(threshold = 0.5) {
  if (!Number.isFinite(threshold) || threshold < 0.5 || threshold > 1) {
    throw new RangeError('threshold must be a finite number between 0.5 and 1')
  }
  return threshold
}

export function createTag<T>(
  evaluate: (
    strings: TemplateStringsArray,
    values: unknown[],
    options: DecisionOptions,
  ) => Promise<T>,
  options: DecisionOptions = {},
): DecisionTag<T> {
  resolveThreshold(options.threshold)

  function tag(strings: TemplateStringsArray, ...values: unknown[]): Promise<T>
  function tag(options: DecisionOptions): DecisionTag<T>
  function tag(input: TemplateStringsArray | DecisionOptions, ...values: unknown[]) {
    if (Array.isArray(input) && Object.hasOwn(input, 'raw')) {
      return evaluate(input as unknown as TemplateStringsArray, values, options)
    }
    if (typeof input !== 'object' || input === null || Array.isArray(input) || values.length > 0) {
      throw new TypeError('Expected a tagged template or an options object')
    }
    return createTag(evaluate, { ...options, ...input })
  }

  return tag
}
