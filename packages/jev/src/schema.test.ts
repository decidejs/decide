import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as mini from 'zod/mini'
import { compileSchema } from './schema'

describe('schema compilation', () => {
  it('uses descriptions as field questions', () => {
    expect(compileSchema(z.boolean().describe('Does this need attention?'), 'urgent')).toEqual({
      type: 'noul',
      instructions: 'Does this need attention?',
    })
    expect(
      compileSchema(
        z.enum(['billing', 'technical']).describe('Which team should handle this?'),
        'category',
      ),
    ).toEqual({
      type: 'choice',
      instructions: 'Which team should handle this?',
      options: ['billing', 'technical'],
    })
  })

  it('derives questions from field names for Classic and Mini schemas', () => {
    for (const schema of [z.boolean(), mini.boolean()]) {
      expect(compileSchema(schema, 'urgent')).toEqual({
        type: 'noul',
        instructions: 'Is urgent true?',
      })
    }
    for (const schema of [z.enum(['a', 'b']), mini.enum(['a', 'b'])]) {
      expect(compileSchema(schema, 'category')).toEqual({
        type: 'choice',
        instructions: 'Which category best matches?',
        options: ['a', 'b'],
      })
    }
  })

  it.each([z.string(), z.number(), z.boolean().optional(), z.object({})])(
    'rejects unsupported schemas with the field name',
    (schema) => {
      expect(() => compileSchema(schema, 'field')).toThrow('Unsupported schema for "field"')
    },
  )

  it('rejects empty and numeric enums', () => {
    expect(() => compileSchema(z.enum([]), 'category')).toThrow('nonempty string enum')
    expect(() => compileSchema(z.enum({ A: 0, B: 1 }), 'category')).toThrow('nonempty string enum')
  })
})
