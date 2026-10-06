/**
 * reading-process — turns one capture's raw notes into proposed lessons.
 *
 * The Reading area calls this right after saving a capture. It runs as the
 * caller, so RLS applies to every read and write, and only the owner's
 * account may use it (OWNER_EMAIL): sign-up is open and every call costs
 * real money.
 *
 * It answers at once and finishes in the background. Claude can take longer
 * than a browser should wait, and the capture's status tells the page when
 * the proposals are ready. Only the validated, structured result is stored,
 * never the raw request or response.
 *
 * Secrets: ANTHROPIC_API_KEY, OWNER_EMAIL. Optional: ANTHROPIC_MODEL
 * (default claude-opus-5-5) and ANTHROPIC_EFFORT (default medium).
 */
import { createClient } from 'npm:@supabase/supabase-js@2.117.2'
import Anthropic from 'npm:@anthropic-ai/sdk@0.131.0'
import {
  PROMPT_VERSION,
  RESULT_SCHEMA,
  SYSTEM_PROMPT,
  buildUserMessage,
  validateResult,
} from './lessons.ts'

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void }

const MODEL = Deno.env.get('ANTHROPIC_MODEL') || 'claude-opus-5-5'
const EFFORT = Deno.env.get('ANTHROPIC_EFFORT') || 'medium'
/** Models that take the server-side refusal fallback. */
const FALLBACK_MODELS = ['claude-opus-5-5', 'claude-opus-5', 'claude-fable-5-1', 'claude-sonnet-5-5']
/** A run still "processing" after this long died mid-way and may be retried. */
const STALE_MS = 3 * 60 * 1000

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const reply = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

function publishableKey(): string {
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}')
    if (keys.default) return keys.default
  } catch {
    // Fall through to the legacy key.
  }
  return Deno.env.get('SUPABASE_ANON_KEY') ?? ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return reply(405, { error: 'Use POST.' })

  const authorization = req.headers.get('Authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey(), {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: auth } = await supabase.auth.getUser(token)
  const user = auth?.user
  if (!user) return reply(401, { error: 'Sign in to process notes.' })

  const owner = Deno.env.get('OWNER_EMAIL')?.trim().toLowerCase()
  if (!owner || user.email?.toLowerCase() !== owner) {
    return reply(403, { error: 'Processing is limited to the owner of this tracker.' })
  }
  if (!Deno.env.get('ANTHROPIC_API_KEY')) {
    return reply(500, { error: 'Processing is not set up yet: the Anthropic API key is missing.' })
  }

  let captureId: string | undefined
  try {
    captureId = (await req.json())?.captureId
  } catch {
    // Handled below.
  }
  if (typeof captureId !== 'string') return reply(400, { error: 'Missing captureId.' })

  const { data: capture, error: loadError } = await supabase
    .from('captures')
    .select('id, status, status_changed_at, book_title, book_author, raw_notes, source_passage, location')
    .eq('id', captureId)
    .maybeSingle()
  if (loadError) return reply(500, { error: 'Could not load that capture.' })
  if (!capture) return reply(404, { error: 'That capture does not exist.' })

  const stale =
    capture.status === 'processing' && Date.now() - Date.parse(capture.status_changed_at) > STALE_MS
  if (capture.status !== 'queued' && capture.status !== 'failed' && !stale) {
    return reply(409, { error: 'That capture has already been processed.', status: capture.status })
  }

  // Claim it, so a double tap or a second device can't start a second run.
  const { data: claimed } = await supabase
    .from('captures')
    .update({ status: 'processing', error: null, status_changed_at: new Date().toISOString() })
    .eq('id', capture.id)
    .eq('status', capture.status)
    .select('id')
  if (!claimed?.length) return reply(409, { error: 'That capture is already being processed.' })

  EdgeRuntime.waitUntil(processCapture(supabase, capture))
  return reply(202, { status: 'processing' })
})

async function processCapture(
  supabase: ReturnType<typeof createClient>,
  capture: {
    id: string
    book_title: string
    book_author: string
    raw_notes: string
    source_passage: string | null
    location: string | null
  },
) {
  const fail = async (message: string) => {
    await supabase.from('captures').update({ status: 'failed', error: message }).eq('id', capture.id)
  }

  try {
    const anthropic = new Anthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY'),
      // The worker's own wall clock is 150 s; leave room to record the outcome.
      timeout: 120_000,
      maxRetries: 1,
    })

    // Haiku 4.5 and Sonnet 4.5 reject the effort setting; everything newer takes it.
    const effort = /haiku|sonnet-4-5/.test(MODEL) ? undefined : EFFORT
    const params = {
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user' as const, content: buildUserMessage(capture) }],
      output_config: {
        format: { type: 'json_schema' as const, schema: RESULT_SCHEMA },
        ...(effort ? { effort } : {}),
      },
    }

    // A safety decline is re-run on Anthropic's recommended model rather than
    // returned, on the models that support it.
    const response = FALLBACK_MODELS.includes(MODEL)
      ? // deno-lint-ignore no-explicit-any
        await anthropic.beta.messages.create({
          ...params,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        } as any)
      : // deno-lint-ignore no-explicit-any
        await anthropic.messages.create(params as any)

    if (response.stop_reason === 'refusal') {
      return await fail('Claude declined to process these notes.')
    }
    if (response.stop_reason === 'max_tokens') {
      return await fail('These notes were too long to process in one go. Try splitting them.')
    }

    const block = response.content.find((item: { type: string }) => item.type === 'text') as
      | { text: string }
      | undefined
    let parsed: unknown = null
    try {
      parsed = block ? JSON.parse(block.text) : null
    } catch {
      parsed = null
    }
    const result = validateResult(parsed)
    if (!result) return await fail('Claude returned something unusable. Try again.')

    const { error } = await supabase
      .from('captures')
      .update({
        status: 'needs_review',
        ai_result: result,
        ai_model: response.model,
        prompt_version: PROMPT_VERSION,
        error: null,
      })
      .eq('id', capture.id)
    if (error) console.error('reading-process: could not save the result', error.message)
  } catch (caught) {
    // Never log the notes themselves; the error type and status are enough.
    if (caught instanceof Anthropic.APIError) {
      console.error('reading-process: Anthropic API error', caught.status)
      const message =
        caught.status === 429 || (caught.status ?? 0) >= 500
          ? 'Claude is busy right now. Try again in a minute.'
          : caught.status === 401
            ? 'The Anthropic API key was rejected.'
            : 'Claude could not process these notes.'
      await fail(message)
    } else {
      console.error('reading-process: unexpected failure', caught instanceof Error ? caught.name : caught)
      await fail('Processing stopped unexpectedly. Try again.')
    }
  }
}
