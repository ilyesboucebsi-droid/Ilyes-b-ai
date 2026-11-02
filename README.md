# ILYES.B AI

A bilingual Arabic/English AI assistant built with Next.js 15 and deployed on Vercel.

## AI engine orchestration

- Auto mode runs OpenAI and Claude in parallel when both server-side keys are configured, then asks OpenAI to synthesize one answer from both drafts.
- If only one of OpenAI or Claude is configured, Auto uses the available one.
- Gemini and Groq are fallback engines when the primary engines are unavailable or fail.
- A user can select a configured engine explicitly from the interface.
- The interface displays which engine actually produced each answer. A hybrid label is shown only when both drafts were successfully combined.

Hybrid mode makes multiple provider requests and therefore uses more tokens and may cost more than a single-engine answer. It is not an independent fact-checking guarantee.

## Academic research and Consensus

Consensus is called only by the dedicated academic-search endpoint when the user submits a search. Normal chat requests do not call Consensus and must not claim that they do. Search results should be checked against the original paper before academic citation.

## Trust and answer quality

The shared server-side instructions require calibrated confidence, prohibit invented sources and legal provisions, distinguish knowledge from live verification, and include specific safeguards for Algerian-law questions and academic rewriting. These safeguards reduce avoidable errors but cannot guarantee that every model response is correct. Verify high-impact legal, medical, financial, and academic claims with primary sources.

## Environment variables

Configure provider keys in Vercel Project Settings → Environment Variables. Keep all keys server-side; never use a NEXT_PUBLIC_ prefix for secrets.

| Variable | Purpose |
| --- | --- |
| OPENAI_API_KEY | OpenAI Responses API |
| OPENAI_MODEL | Optional OpenAI model override (default gpt-5.5) |
| ANTHROPIC_API_KEY | Claude Messages API |
| CLAUDE_MODEL | Optional Claude model override (default claude-sonnet-5-5) |
| GEMINI_API_KEY | Gemini API |
| GEMINI_MODEL | Optional Gemini model override |
| GROQ_API_KEY | Groq API |
| GROQ_MODEL | Optional Groq model override |
| CONSENSUS_API_KEY | Dedicated academic search only |
| KV_REST_API_URL, KV_REST_API_TOKEN | Shared rate limiting |

The /api/status endpoint exposes only boolean configuration status, never secret values.

## Deployment

Vercel deploys commits pushed to the main branch. Wait for the new deployment to show Ready before testing the production domain. Environment-variable changes require a new deployment.

## Local development

Install dependencies with npm install, then run npm run dev. Use npm run build before deployment.
