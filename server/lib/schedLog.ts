/**
 * Gate for periodic scheduler bookkeeping. In dev we mostly don't want to see
 * the 15-min heartbeat lines; keep errors + boot-start loud.
 *
 * Enable verbose with VERBOSE_SCHEDULER=true.
 */
const verbose = (process.env.VERBOSE_SCHEDULER || "").toLowerCase() === "true";

export function schedInfo(payload: Record<string, unknown>) {
  if (!verbose) return;
  console.info(
    JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
  );
}

export function schedError(payload: Record<string, unknown>) {
  console.error(
    JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
  );
}

/** Always-logged boot-time event (scheduler started, next run scheduled). */
export function schedBoot(payload: Record<string, unknown>) {
  console.info(
    JSON.stringify({ ...payload, timestamp: new Date().toISOString() }),
  );
}
