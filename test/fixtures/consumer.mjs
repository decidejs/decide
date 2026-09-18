import assert from 'node:assert/strict'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { decide, createDecider } =
  process.argv[2] === 'cjs' ? require('@decide.js/jev') : await import('@decide.js/jev')
const { z } = require('zod')

await assert.rejects(decide.yes`valid?`, /decide.configure/)
const requests = []
const server = createServer(async (request, response) => {
  const chunks = []
  for await (const chunk of request) chunks.push(chunk)
  const body = JSON.parse(Buffer.concat(chunks).toString())
  requests.push({ url: request.url, key: request.headers.authorization, body })
  const answers = Object.fromEntries(
    Object.entries(body.questions).map(([id, question]) => [
      id,
      question.type === 'noul'
        ? { type: 'noul', noul: 0.5 }
        : {
            type: 'choice',
            choice: 'billing',
            confidence: 0.9,
            probabilities: { billing: 0.9, technical: 0.1 },
          },
    ]),
  )
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(
    JSON.stringify({ answers, model: body.model, usage: { input_tokens: 0, output_tokens: 0 } }),
  )
})
server.listen(0, '127.0.0.1')
await once(server, 'listening')

try {
  const baseURL = `http://127.0.0.1:${server.address().port}`
  decide.configure({ apiKey: 'fixture-key', baseURL, defaultModel: 'fixture-model' })
  const state = { title: 'Charged twice', charges: [25, 25] }
  assert.equal(await decide.yes`is ${state} valid?`, true)
  assert.equal(await decide.no`is ${state} valid?`, false)
  assert.equal(await decide.yes({ threshold: 0.8 })`is ${state} valid?`, false)
  assert.equal(await decide.match(z.enum(['billing', 'technical']))`classify ${state}`, 'billing')

  const instance = createDecider({ apiKey: 'fixture-key', baseURL, threshold: 0.8 })
  assert.equal('configure' in instance, false)
  const classify = instance.matcher({
    category: z.enum(['billing', 'technical']).describe('Which team should handle this?'),
    urgent: z.boolean().describe('Does this require immediate attention?'),
  })
  assert.deepEqual(await classify`classify ${state}`, { category: 'billing', urgent: false })
  assert.deepEqual(await classify({ threshold: 0.5 })`classify ${state}`, {
    category: 'billing',
    urgent: true,
  })
  assert.equal(requests.length, 6)
  assert.deepEqual(requests[0], {
    url: '/v1/systemone',
    key: 'Bearer fixture-key',
    body: {
      model: 'fixture-model',
      state: { arg0: state },
      questions: { decision: { type: 'noul', instructions: 'is `arg0` valid?' } },
    },
  })
  assert.deepEqual(requests[4].body.questions, {
    category: {
      type: 'choice',
      instructions: 'classify `arg0`\n\nWhich team should handle this?',
      criteria: { billing: null, technical: null },
    },
    urgent: {
      type: 'noul',
      instructions: 'classify `arg0`\n\nDoes this require immediate attention?',
    },
  })
  console.log('ok')
} finally {
  server.closeAllConnections()
  await new Promise((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
}
