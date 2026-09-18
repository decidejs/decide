import type { DecisionOptions } from './tag'
import { resolveThreshold } from './tag'
import type { DecideTransport, EvaluationRequest, TransportOptions } from './transport'
import { createTransport } from './transport'

export interface DeciderOptions extends TransportOptions {
  threshold?: number
}

export function createRuntime(options?: DeciderOptions) {
  let current: { threshold: number; transport: DecideTransport } | undefined

  function configure({ threshold, ...sdkOptions }: DeciderOptions) {
    current = {
      threshold: resolveThreshold(threshold),
      transport: createTransport(sdkOptions),
    }
  }

  if (options !== undefined) configure(options)

  return {
    configure,
    async evaluate(request: EvaluationRequest, options: DecisionOptions) {
      if (!current) {
        throw new Error('Call decide.configure(...) before evaluating a global decision')
      }
      const { threshold, transport } = current
      const answers = await transport.evaluate(
        { ...request, model: options.model },
        { signal: options.signal },
      )
      return { answers, threshold: resolveThreshold(options.threshold ?? threshold) }
    },
  }
}

export type DecisionRuntime = ReturnType<typeof createRuntime>
export const globalRuntime = createRuntime()
