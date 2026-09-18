function readAnswer(answers: unknown, id: string): Record<string, unknown> {
  if (typeof answers !== 'object' || answers === null || !Object.hasOwn(answers, id)) {
    throw new TypeError(`Missing answer for "${id}"`)
  }
  const answer = (answers as Record<string, unknown>)[id]
  if (typeof answer !== 'object' || answer === null || Array.isArray(answer)) {
    throw new TypeError(`Invalid answer for "${id}"`)
  }
  return answer as Record<string, unknown>
}

export function readProbability(answers: unknown, id: string) {
  const answer = readAnswer(answers, id)
  const probability = answer.noul
  if (
    answer.type !== 'noul' ||
    typeof probability !== 'number' ||
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1
  ) {
    throw new TypeError(`Invalid Noul probability for "${id}"`)
  }
  return probability
}
