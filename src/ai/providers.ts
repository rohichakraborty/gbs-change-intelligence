// LLM providers. Credentials never reach the browser:
//  - "claude-artifact": inside claude.ai, the page asks Claude through the
//    platform's `sample` capability (runs as the viewer; no API key).
//  - "server": the bundled Node server (server/index.mjs) calls the Anthropic
//    API with ANTHROPIC_API_KEY from its own environment.
// If neither is available, generation reports "not configured" — it never
// substitutes canned or keyword-matched results.

export interface LLMRequest { purpose: string; system: string; user: string; maxTokens: number }
export interface LLMResult { text: string; model: string; truncated: boolean }
export interface LLMProvider { id: 'claude-artifact' | 'server' | 'test'; label: string; complete(r: LLMRequest, signal?: AbortSignal): Promise<LLMResult> }

export type AIErrorCode = 'not_configured' | 'auth' | 'rate_limited' | 'upstream' | 'invalid_output' | 'cancelled' | 'refused' | 'too_large' | 'not_granted' | 'bad_input';
export class AIError extends Error {
  constructor(public code: AIErrorCode, message: string, public retryable = false) { super(message); }
}

export interface ProviderStatus { provider: LLMProvider | null; state: 'ready' | 'not_configured' | 'checking'; label: string; detail: string }

type SampleFn = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string; truncated: boolean; modelTierApplied?: string; modelApplied?: string }>);

function artifactProvider(sample: SampleFn): LLMProvider {
  return {
    id: 'claude-artifact', label: 'Claude via claude.ai',
    async complete(r, signal) {
      try {
        const res = await sample(`${r.system}\n\n${r.user}`, { modelTier: 'complex', cache: false, signal });
        return { text: res.text, model: res.modelApplied ?? `claude.ai (${res.modelTierApplied ?? 'complex'} tier)`, truncated: res.truncated };
      } catch (e) {
        const code = (e as { code?: string }).code ?? 'upstream_error';
        const msg = (e as { message?: string }).message ?? 'Claude request failed';
        if (code === 'cancelled') throw new AIError('cancelled', 'Generation cancelled.');
        if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared') throw new AIError('not_granted', 'Claude access was not granted for this page. Allow it when prompted, or use the standalone server with an API key.');
        if (code === 'rate_limited') throw new AIError('rate_limited', 'Claude usage limit reached. Try again later.', true);
        if (code === 'refused') throw new AIError('refused', 'Claude declined this request. Rephrase the function description.');
        if (code === 'prompt_too_large') throw new AIError('too_large', 'The request was too large. Shorten the document excerpt.');
        throw new AIError('upstream', `Claude request failed (${code}): ${msg}`, true);
      }
    },
  };
}

function serverProvider(model: string): LLMProvider {
  return {
    id: 'server', label: `Anthropic API via app server (${model})`,
    async complete(r, signal) {
      let res: Response;
      try {
        res = await fetch('/api/ai/complete', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(r), signal });
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw new AIError('cancelled', 'Generation cancelled.');
        throw new AIError('upstream', 'Could not reach the app server.', true);
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const code = (body?.error?.code ?? 'upstream') as AIErrorCode;
        throw new AIError(code, body?.error?.message ?? `AI server error ${res.status}`, code === 'rate_limited' || code === 'upstream');
      }
      return { text: String(body.text ?? ''), model: String(body.model ?? model), truncated: !!body.truncated };
    },
  };
}

let override: LLMProvider | null = null;
/** Tests inject a provider here. Not used by the running app. */
export function setProviderOverride(p: LLMProvider | null) { override = p; }

export async function detectProvider(): Promise<ProviderStatus> {
  if (override) return { provider: override, state: 'ready', label: override.label, detail: 'Test provider' };
  const w = window as unknown as { claude?: { use(n: string): Promise<unknown> } };
  if (w.claude?.use) {
    const sample = (await w.claude.use('sample').catch(() => null)) as SampleFn | null;
    if (sample) return { provider: artifactProvider(sample), state: 'ready', label: 'Claude via claude.ai', detail: 'Requests run through claude.ai as you; no API key is stored in the app. You may be asked to allow access the first time.' };
    return { provider: null, state: 'not_configured', label: 'AI not available in this view', detail: 'This view cannot reach Claude (signed out, or the capability is not available). Open the app in claude.ai while signed in, or run the standalone server with an API key.' };
  }
  try {
    const r = await fetch('/api/ai/status');
    if (r.ok) {
      const j = await r.json();
      if (j.configured) return { provider: serverProvider(j.model), state: 'ready', label: `Anthropic API (${j.model})`, detail: 'Requests go to the app server, which holds the API key in its environment.' };
      return { provider: null, state: 'not_configured', label: 'AI not configured', detail: 'The app server is running but ANTHROPIC_API_KEY is not set. Set it and restart the server (see README).' };
    }
  } catch { /* no server */ }
  return { provider: null, state: 'not_configured', label: 'AI not configured', detail: 'No AI provider is available. Open the app in claude.ai, or start the standalone server with ANTHROPIC_API_KEY set (npm run serve).' };
}
