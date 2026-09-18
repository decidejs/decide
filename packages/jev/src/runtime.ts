import type { DecisionOptions } from './tag'
import { resolveThreshold } from './tag'
import type { DecideTransport, EvaluationRequest, TransportOptions } from './transport'
import { createTransport } from './transport'

export interface DeciderOptions extends TransportOptions {
  threshold?: number
}

export class DecisionRuntime {
  private current?: { threshold: number; transport: DecideTransport }

  constructor(options?: DeciderOptions) {
    if (options !== undefined) this.configure(options)
  }

  configure({ threshold, ...sdkOptions }: DeciderOptions) {
    this.current = {
      threshold: resolveThreshold(threshold),
      transport: createTransport(sdkOptions),
    }
  }

  async evaluate(request: EvaluationRequest, options: DecisionOptions) {
    if (!this.current) {
      throw new Error('Call decide.configure(...) before evaluating a global decision')
    }
    const { threshold, transport } = this.current
    const answers = await transport.evaluate(
      { ...request, model: options.model },
      { signal: options.signal },
    )
    return { answers, threshold: resolveThreshold(options.threshold ?? threshold) }
  }
}
