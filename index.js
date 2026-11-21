/**
 * Host half of the OpenCode Go usage bundle.
 *
 * It polls the OpenCode Go inference gateway for the three allowance windows
 * (rolling 5-hour, weekly, monthly) behind the API key this profile already
 * uses for model requests, caches the last snapshot, and serves it to the Web
 * page from one read-only route. The browser half renders that snapshot in the
 * frame's bottom slot.
 *
 * The key never leaves this process: the route answers percentages and reset
 * instants only, and the plugin reads the key through the credential store's
 * `OPENCODE_GO_API_KEY` reference, so rotating the stored key applies to the
 * next poll without a restart.
 */

/** OpenCode's Go allowance endpoint (same key as inference, no workspace header needed). */
const DEFAULT_ENDPOINT = 'https://opencode.ai/zen/go/v1/usage';
/** Credential reference the profile's `opencode-go` model provider also resolves. */
const DEFAULT_CREDENTIAL_REF = 'OPENCODE_GO_API_KEY';
/** Read-only snapshot route consumed by the Client half. */
const ROUTE_PATH = '/opencode-go-usage/state';

/** Required service: the HTTP carrier that serves the snapshot route. */
export const inject = ['webServer'];

/**
 * Activate the poller and the snapshot route.
 * @param ctx - Host plugin context.
 * @param config - Resolved row config from the bundle patch.
 */
export function apply(ctx, config = {}) {
  const endpoint = typeof config.endpoint === 'string' && config.endpoint.trim() !== ''
    ? config.endpoint.trim()
    : DEFAULT_ENDPOINT;
  const credentialRef = typeof config.credentialRef === 'string' && config.credentialRef.trim() !== ''
    ? config.credentialRef.trim()
    : DEFAULT_CREDENTIAL_REF;
  const configuredKey = typeof config.apiKey === 'string' && config.apiKey.trim() !== ''
    ? config.apiKey.trim()
    : undefined;
  const refreshIntervalMs = clampNumber(config.refreshIntervalMs, 30_000, 10_000, 3_600_000);
  const minimumIntervalMs = clampNumber(config.minimumIntervalMs, 5_000, 1_000, 60_000);
  const timeoutMs = clampNumber(config.timeoutMs, 10_000, 1_000, 60_000);

  /** Latest snapshot shared with every page; replaced whole, never mutated. */
  let snapshot = Object.freeze({
    ok: false,
    fetchedAt: null,
    error: { code: 'pending', message: 'No usage fetched yet' },
  });
  /** One in-flight poll at a time, joined by every caller that arrives meanwhile. */
  let inFlight = null;
  /** When the last poll started, so a page's refresh cannot hammer the endpoint. */
  let lastAttempt = 0;
  /** How many times a page read the snapshot: a mounted pill keeps this moving. */
  let reads = 0;

  ctx.effect(() => {
    void refresh(true);
    const timer = setInterval(() => {
      void refresh(false);
    }, refreshIntervalMs);
    return () => {
      clearInterval(timer);
    };
  }, 'opencode-go-usage: poll');

  // A finished turn is the moment spend usually moves, so read again right
  // after an agent goes idle; the cool-down still keeps bursts to one request.
  ctx.effect(
    () =>
      ctx.on('agent/status', (payload) => {
        if (payload?.status === 'idle') void refresh(false);
      }),
    'opencode-go-usage: refresh after a turn',
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: ROUTE_PATH,
        resource: async (request) => {
          reads += 1;
          const force = new URL(request.url).searchParams.get('force') === '1';
          if (force) await refresh(true);
          return new Response(JSON.stringify({ ...snapshot, reads }), {
            status: 200,
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'no-store',
              'x-content-type-options': 'nosniff',
            },
          });
        },
      }),
    'opencode-go-usage: snapshot route',
  );

  /**
   * Poll now unless a poll is already running or the last one started too
   * recently, so a burst of page refreshes costs at most one request.
   * @param force - A page's explicit refresh skips the cool-down.
   * @returns the settled snapshot.
   */
  async function refresh(force) {
    const startedAt = Date.now();
    if (!force && startedAt - lastAttempt < minimumIntervalMs) return snapshot;
    if (inFlight !== null) return inFlight;
    lastAttempt = startedAt;
    inFlight = (async () => {
      try {
        snapshot = await poll();
      } catch (error) {
        snapshot = failure('network', error instanceof Error ? error.message : String(error));
      } finally {
        inFlight = null;
      }
      return snapshot;
    })();
    return inFlight;
  }

  /**
   * Resolve the key, ask the gateway, and normalize the three meters.
   * @returns a complete snapshot.
   */
  async function poll() {
    const resolved = await resolveKey();
    if (resolved === undefined) {
      return failure(
        'missing-credential',
        `No API key: set ${credentialRef} in the credential store, or the apiKey config field`,
      );
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetch(endpoint, {
        headers: { authorization: `Bearer ${resolved.value}`, accept: 'application/json' },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
    if (response.status === 401 || response.status === 403) {
      const body = await readJson(response);
      const code = response.status === 401 ? 'unauthorized' : 'not-subscribed';
      return failure(code, describeRefusal(body) ?? `OpenCode answered HTTP ${response.status}`);
    }
    if (!response.ok) {
      return failure('http', `OpenCode answered HTTP ${response.status}`);
    }
    const body = await readJson(response);
    const usage = body && typeof body === 'object' ? body.usage : undefined;
    const rolling = readMeter(usage?.rolling);
    const weekly = readMeter(usage?.weekly);
    const monthly = readMeter(usage?.monthly);
    if (rolling === undefined || weekly === undefined || monthly === undefined) {
      return failure('invalid-response', 'OpenCode Go usage response did not carry all three meters');
    }
    return Object.freeze({
      ok: true,
      fetchedAt: Date.now(),
      source: resolved.source,
      meters: Object.freeze({ rolling, weekly, monthly }),
    });
  }

  /**
   * Read the key from the explicit config override, then the profile's
   * credential store, then this process's environment.
   * @returns the key and where it came from, or undefined when none is set.
   */
  async function resolveKey() {
    if (configuredKey !== undefined) return { value: configuredKey, source: 'config' };
    const credentials = ctx.get('credentials');
    if (credentials !== undefined && typeof credentials.resolve === 'function') {
      const hit = await credentials.resolve(credentialRef).catch(() => undefined);
      if (hit !== undefined && typeof hit.value === 'string' && hit.value !== '') {
        return { value: hit.value, source: 'credential' };
      }
    }
    const fromEnvironment = process.env[credentialRef];
    if (typeof fromEnvironment === 'string' && fromEnvironment !== '') {
      return { value: fromEnvironment, source: 'environment' };
    }
    return undefined;
  }

  /**
   * Build a failed snapshot with the same shape as a successful one.
   * @param code - Stable machine code the Client turns into localized copy.
   * @param message - English detail kept for diagnosis and the tooltip.
   */
  function failure(code, message) {
    return Object.freeze({
      ok: false,
      fetchedAt: null,
      error: Object.freeze({ code, message }),
    });
  }
}

/**
 * Normalize one gateway meter.
 * @param raw - Gateway meter object.
 * @returns the meter with millisecond reset instant, or undefined when malformed.
 */
function readMeter(raw) {
  if (raw === null || typeof raw !== 'object') return undefined;
  const percent = Number(raw.percent);
  if (!Number.isFinite(percent)) return undefined;
  const resetsAt = typeof raw.resetsAt === 'string' ? Date.parse(raw.resetsAt) : Number.NaN;
  return Object.freeze({
    percent: Math.min(100, Math.max(0, percent)),
    limited: raw.status === 'rate-limited',
    resetsAt: Number.isFinite(resetsAt) ? resetsAt : null,
  });
}

/**
 * Read a JSON body without throwing on a non-JSON answer.
 * @param response - Fetch response.
 */
async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

/**
 * Extract the gateway's own error text when it sent one.
 * @param body - Parsed gateway body.
 */
function describeRefusal(body) {
  const message = body?.error?.message;
  return typeof message === 'string' && message !== '' ? message : undefined;
}

/**
 * Clamp a numeric config field, falling back on a non-number.
 * @param value - Raw config value.
 * @param fallback - Value used when the field is absent or malformed.
 * @param minimum - Smallest accepted value.
 * @param maximum - Largest accepted value.
 */
function clampNumber(value, fallback, minimum, maximum) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(numeric)));
}
