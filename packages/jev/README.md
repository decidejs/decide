# @decide.js/jev

A semantic decision library powered by Jev.

## Installation

```shell
$ npm install @decide.js/jev zod
# or pnpm
$ pnpm add @decide.js/jev zod
```

## Configuration

Configure `decide` once before evaluating decisions. Pass your
[TypeSafe API key](https://docs.typesafe.ai/introduction/quickstart) through `client.apiKey`:

```ts
import { decide } from '@decide.js/jev'

decide.configure({
  client: { apiKey: 'your-api-key' },
})
```

Alternatively, set `TYPESAFE_API_KEY` in your environment and call `decide.configure({})`.

Use `createDecider` for independent configuration. Its methods are safe to destructure, as are `decide`'s.

```ts
import { createDecider } from '@decide.js/jev'

const { yes } = createDecider({
  client: { apiKey: process.env.TYPESAFE_API_KEY },
  threshold: 0.8,
})
```

Both `decide.configure` and `createDecider` accept `client` and `threshold`.
`client` accepts an existing `TypeSafeClient` or its construction options. Omit it to use SDK defaults.
See the [SDK README](https://github.com/typesafe-ai/typesafe-sdk-js#readme) for client options.

## Examples

These examples use the configuration above and share the imports and ticket below.

```ts
import { z } from 'zod'

const ticket = { message: 'I was charged twice and need a refund today.' }

if (await decide.yes`does ${ticket} require immediate attention?`) {
  console.log('Prioritize this ticket')
}

if (await decide.no`is ${ticket} spam?`) {
  console.log('Keep this ticket')
}

const category = await decide.match(
  z.enum(['billing', 'technical', 'account']),
)`which team should handle ${ticket}?`
```

The functions before the backticks are template tags. Call a tag with options to customize or reuse it:

```ts
await decide.yes({ threshold: 0.8 })`does ${ticket} require immediate attention?`

const confidentYes = decide.yes({ threshold: 0.8 })
await confidentYes`does ${ticket} require a refund?`
```

Options create a new tag without changing the original or the decider's defaults.

| Option | Effect |
| --- | --- |
| `threshold` | Overrides the boolean threshold for this tag. |
| `model` | Overrides the client's default model. |
| `signal` | An `AbortSignal` to cancel the request. |

Reuse a match with its question defined on the schema. Pass request options to the returned tag.

```ts
const categoryOf = decide.match(
  z.enum(['billing', 'technical', 'account']).describe('Which team should handle this?'),
)

await categoryOf`for ${ticket}`
await categoryOf({ signal: AbortSignal.timeout(5000) })`for ${ticket}`
```

Evaluate several questions in one request. Descriptions define the questions; the template supplies shared context.

```ts
const classify = decide.matcher({
  category: z.enum(['billing', 'technical', 'account']).describe('Which team should handle this?'),
  urgent: z.boolean().describe('Does this require immediate attention?'),
})

const result = await classify`for ${ticket}`
// { category: 'billing' | 'technical' | 'account'; urgent: boolean }

await classify({ threshold: 0.8 })`for ${ticket}`
```

Use an array matcher to review a draft against a checklist. Results follow the order of the questions.
**Every array entry must have a nonempty description.** Missing or blank descriptions throw when creating the matcher.

```ts
const questions = [
  'Does the announcement explain what changed?',
  'Does it say when the change takes effect?',
  'Does it explain whether users need to take action?',
]

const review = decide.matcher(
  questions.map((question) => z.boolean().describe(question)),
)

const draft = {
  title: 'New dashboard',
  body: 'Our redesigned dashboard launches on Monday.',
}

const results = await review`review this announcement: ${draft}`
const unmetChecks = questions.filter((_, index) => !results[index])

await review({ threshold: 0.8 })`review this announcement: ${draft}`
```

Inline arrays infer tuple results. Arrays built dynamically also work. Object matchers use field names
as fallback questions when descriptions are absent. Both forms require at least one schema and support
booleans and nonempty string enums.

## License

MIT
