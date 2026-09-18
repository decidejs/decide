import { expect, it } from 'vitest'
import { readProbability } from './answers'

it.each([
  undefined,
  null,
  {},
  { decision: null },
  { decision: [] },
  { decision: { type: 'choice', noul: 0.8 } },
])('rejects missing and malformed answers: %s', (answers) => {
  expect(() => readProbability(answers, 'decision')).toThrow(TypeError)
})

it.each([Number.NaN, Infinity])('rejects non-finite probabilities: %s', (noul) => {
  expect(() => readProbability({ decision: { type: 'noul', noul } }, 'decision')).toThrow(TypeError)
})
