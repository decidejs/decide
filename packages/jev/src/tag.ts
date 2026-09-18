/**
 * Overrides for a reusable tag; configured decider defaults remain unchanged.
 */
export interface DecisionOptions {
  /**
   * Boolean threshold in [0, 1]; overrides the decider's default for this tag.
   */
  threshold?: number
  /** Overrides the client's default model for this tag's requests. */
  model?: string
  /** Cancels the request and any pending retries. */
  signal?: AbortSignal
}

/**
 * A tagged template evaluates the decision; a normal call returns a configured tag.
 * Interpolations must be JSON-compatible and are sent as structured state.
 *
 * @example
 * await decide.yes`is ${message} safe to publish?`
 * await decide.yes({ threshold: 0.8 })`is ${message} safe to publish?`
 */
export interface DecisionTag<T> {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<T>
  /** Returns a new tag with merged options, leaving this tag unchanged. */
  (options: DecisionOptions): DecisionTag<T>
}

export function resolveThreshold(threshold = 0.5) {
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
    throw new RangeError('threshold must be a finite number between 0 and 1')
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
