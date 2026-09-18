import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import * as mini from 'zod/mini'
import { compileArrayItemSchema, compileFieldSchema } from './schema'

describe('array item schema compilation', () => {
  it('uses descriptions as questions for Classic and Mini schemas', () => {
    for (const schema of [
      z.boolean().describe('Does this need attention?'),
      mini.boolean().register(z.globalRegistry, { description: 'Does this need attention?' }),
    ]) {
      expect(compileArrayItemSchema(schema, 0)).toEqual({
        type: 'noul',
        instructions: 'Does this need attention?',
      })
    }
    expect(
      compileArrayItemSchema(
        z.enum(['billing', 'technical']).describe('Which team should handle this?'),
        1,
      ),
    ).toEqual({
      type: 'choice',
      instructions: 'Which team should handle this?',
      options: ['billing', 'technical'],
    })
  })

  it.each([z.boolean(), z.boolean().describe(''), z.boolean().describe(' \n\t ')])(
    'rejects missing or blank descriptions with the array index',
    (schema) => {
      expect(() => compileArrayItemSchema(schema, 2)).toThrow(
        'Array schema at index 2 requires a nonempty description',
      )
    },
  )

  it('rejects unsupported schemas with the array index', () => {
    expect(() => compileArrayItemSchema(z.string().describe('What is this?'), 3)).toThrow(
      'Unsupported schema at index 3',
    )
  })

  it('rejects empty and numeric enums with the array index', () => {
    for (const schema of [z.enum([]), z.enum({ A: 0, B: 1 })]) {
      expect(() => compileArrayItemSchema(schema.describe('Which category?'), 4)).toThrow(
        'Array schema at index 4 requires a nonempty string enum',
      )
    }
  })
})

describe('field schema compilation', () => {
  it('uses descriptions as field questions', () => {
    expect(compileFieldSchema(z.boolean().describe('Does this need attention?'), 'urgent')).toEqual(
      {
        type: 'noul',
        instructions: 'Does this need attention?',
      },
    )
    expect(
      compileFieldSchema(
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
      expect(compileFieldSchema(schema, 'urgent')).toEqual({
        type: 'noul',
        instructions: 'Is urgent true?',
      })
    }
    for (const schema of [z.enum(['a', 'b']), mini.enum(['a', 'b'])]) {
      expect(compileFieldSchema(schema, 'category')).toEqual({
        type: 'choice',
        instructions: 'Which category best matches?',
        options: ['a', 'b'],
      })
    }
  })

  it.each([z.string(), z.number(), z.boolean().optional(), z.object({})])(
    'rejects unsupported schemas with the field name',
    (schema) => {
      expect(() => compileFieldSchema(schema, 'field')).toThrow('Unsupported schema for "field"')
    },
  )

  it('rejects empty and numeric enums', () => {
    expect(() => compileFieldSchema(z.enum([]), 'category')).toThrow('nonempty string enum')
    expect(() => compileFieldSchema(z.enum({ A: 0, B: 1 }), 'category')).toThrow(
      'nonempty string enum',
    )
  })
})
