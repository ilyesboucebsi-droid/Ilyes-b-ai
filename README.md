# ILYES.B AI

A bilingual Arabic/English AI assistant built with Next.js.

## Status

Project setup is in progress. Provider API keys must be stored as server-side environment variables and must never be exposed in browser code.

## Planned providers

- Google Gemini
- Groq
- Optional OpenAI and Anthropic Claude when API access is configured

## Deployment

Deploy with Vercel. Before enabling public access, configure a shared rate limiter (Upstash Redis) and the required provider API keys in Vercel Environment Variables.

## Local development

Install dependencies with `npm install`, then run `npm run dev`.
