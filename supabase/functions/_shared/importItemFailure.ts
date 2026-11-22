/** Item-local budgets survive sibling successes and orchestrator restarts. */
export const IMPORT_ITEM_ATTEMPTS = 3;
export function fatalImportFailure(status: number | undefined, message: string) {
  return [401, 403, 407].includes(status ?? 0) || /client_10020|account.*suspend|billing.*inactive|invalid.*(api.?key|zone)/i.test(message);
}

export function recordImportItemFailure(c: Record<string, any>, url: string, message: string, status?: number, now = Date.now()) {
  c.autoContinue = true;
  c.itemRetries ??= {};
  const attempt = Number(c.itemRetries[url] ?? 0) + 1;
  c.itemRetries[url] = attempt;
  c.lastError = { url, message: message.slice(0, 500), status: status ?? null, at: new Date(now).toISOString(), stage: c.phase };
  const retryable = status === undefined || status === 408 || status === 409 || status === 429 || status >= 500;
  return { attempt, retry: retryable && attempt < IMPORT_ITEM_ATTEMPTS };
}

export function finishFailedImportItem(c: Record<string, any>) {
  const url = c.lastError.url;
  const failure = { ...c.lastError, attempts: c.itemRetries[url] };
  c.failedSources = [...(c.failedSources ?? []), failure].slice(-500);
  c.lastFailedSource = failure;
  c.failedSourceVersion = Number(c.failedSourceVersion ?? 0) + 1;
  delete c.itemRetries[url];
  c.transientRetries = 0;
  c.rateRetries = 0;
  c.waitUntil = null;
  c.waitReason = null;
  c.waitScope = null;
}

/** Advance only a source that is actually pending; preserve saved identities and siblings. */
export function advanceExternalFailedSource(c: Record<string, any>, url: string) {
  if (c.activeBroker?.listing_urls?.includes(url)) {
    c.workerListingDoneUrls = [...new Set([...(c.workerListingDoneUrls ?? []), url])];
    return true;
  }
  if (c.workerDeveloper?.pendingUrls?.includes(url)) {
    c.workerDeveloper.pendingUrls = c.workerDeveloper.pendingUrls.filter((u: string) => u !== url);
    return true;
  }
  if (c.workerBrokerPageUrls?.includes(url)) {
    c.workerBrokerFailedPages = [...new Set([...(c.workerBrokerFailedPages ?? []), url])];
    return true;
  }
  if (c.workerFrontier?.includes(url)) {
    c.workerFrontier = c.workerFrontier.filter((u: string) => u !== url);
    return true;
  }
  const entity = c.workerEntities?.find((e: { url: string }) => e.url === url);
  if (!entity || c.workerProcessed?.includes(url)) return false;
  c.workerProcessed = [...(c.workerProcessed ?? []), url];
  if (entity.kind === 'developer') { c.workerDeveloper = null; c.workerDeveloperSaved = null; }
  return true;
}