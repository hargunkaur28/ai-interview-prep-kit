export interface TokenReservation {
  id: string;
  stage: string;
  reservedTokens: number;
  dispatchedAt: number;
  actualTokens?: number;
}

export interface SchedulerMetrics {
  totalDispatched: number;
  totalQueueWaitMs: number;
  queuedRequestsCount: number;
  totalRetries: number;
  fallbackCount: number;
  currentWindowReserved: number;
}

/**
 * GroqTokenScheduler
 * Enforces an 850-token safe budget across any rolling 60-second window
 * (leaving a 150-token safety buffer under the org's 1,000 OTPM limit).
 * 
 * In accordance with user requirements:
 * 1. Maintains conservative max_tokens reservations for OTPM scheduling.
 * 2. Does not release unused reserved tokens early in a way that allows the rolling reservation to exceed 850 tokens.
 * 3. Enforces single-flight serialization so concurrent requests do not burst.
 * 4. Ensures retries acquire fresh reservations.
 * 5. Records actual usage and queue wait times separately from API failures.
 */
export class GroqTokenScheduler {
  private static instance: GroqTokenScheduler;
  private reservations: TokenReservation[] = [];
  private windowDurationMs = 60_000;
  private safeTokenCeiling = 850; // 850 tokens per rolling 60s window (under 1,000 OTPM)
  private maxIndividualRequest = 900;
  private queue: Array<() => Promise<void>> = [];
  private processing = false;

  // Tracked metrics
  public totalDispatched = 0;
  public totalQueueWaitMs = 0;
  public queuedRequestsCount = 0;
  public totalRetries = 0;
  public fallbackCount = 0;

  private constructor() {}

  public static getInstance(): GroqTokenScheduler {
    if (!GroqTokenScheduler.instance) {
      GroqTokenScheduler.instance = new GroqTokenScheduler();
    }
    return GroqTokenScheduler.instance;
  }

  /**
   * Removes reservations older than 60 seconds.
   */
  private pruneOldReservations(now: number = Date.now()): void {
    const cutoff = now - this.windowDurationMs;
    this.reservations = this.reservations.filter(r => r.dispatchedAt > cutoff);
  }

  /**
   * Returns the current sum of reserved tokens in the active 60s sliding window.
   */
  public getActiveReservedTokens(now: number = Date.now()): number {
    this.pruneOldReservations(now);
    return this.reservations.reduce((sum, r) => sum + r.reservedTokens, 0);
  }

  /**
   * Serializes requests and ensures sufficient budget exists in the rolling 60s window.
   * If capacity is insufficient, safely pauses until older reservations expire.
   */
  public async acquireReservation(
    stage: string,
    requestedTokens: number
  ): Promise<{ reservationId: string; queueWaitMs: number; grantedTokens: number }> {
    const cappedTokens = Math.min(requestedTokens, this.safeTokenCeiling, this.maxIndividualRequest);
    const startTime = Date.now();

    return new Promise<{ reservationId: string; queueWaitMs: number; grantedTokens: number }>((resolve, reject) => {
      const task = async () => {
        try {
          while (true) {
            const now = Date.now();
            const currentUsage = this.getActiveReservedTokens(now);

            if (currentUsage + cappedTokens <= this.safeTokenCeiling) {
              // Granted!
              const reservationId = `res_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
              this.reservations.push({
                id: reservationId,
                stage,
                reservedTokens: cappedTokens,
                dispatchedAt: Date.now(),
              });

              this.totalDispatched++;
              const queueWaitMs = Date.now() - startTime;
              if (queueWaitMs > 100) {
                this.queuedRequestsCount++;
                this.totalQueueWaitMs += queueWaitMs;
              }

              resolve({
                reservationId,
                queueWaitMs,
                grantedTokens: cappedTokens,
              });
              break;
            }

            // Need to wait until the oldest reservation in the window expires
            this.pruneOldReservations(now);
            const oldest = this.reservations[0];
            const timeToWait = oldest
              ? Math.max(500, oldest.dispatchedAt + this.windowDurationMs - now + 300)
              : 1000;

            console.log(
              `[TokenScheduler] [${stage}] OTPM budget check: ${currentUsage}/${this.safeTokenCeiling} reserved (need +${cappedTokens}). ` +
              `Pausing ${Math.round(timeToWait / 1000)}s for capacity to clear...`
            );

            await new Promise(r => setTimeout(r, timeToWait));
          }
        } catch (err) {
          reject(err);
        }
      };

      this.enqueue(task);
    });
  }

  private async enqueue(fn: () => Promise<void>) {
    this.queue.push(fn);
    if (!this.processing) {
      this.processing = true;
      while (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) {
          await next();
        }
      }
      this.processing = false;
    }
  }

  /**
   * Records actual completion tokens for telemetry/metrics without compromising
   * the conservative reservation window.
   */
  public recordActualUsage(reservationId: string, actualTokens: number): void {
    const res = this.reservations.find(r => r.id === reservationId);
    if (res) {
      res.actualTokens = actualTokens;
    }
  }

  public getMetrics(): SchedulerMetrics {
    return {
      totalDispatched: this.totalDispatched,
      totalQueueWaitMs: this.totalQueueWaitMs,
      queuedRequestsCount: this.queuedRequestsCount,
      totalRetries: this.totalRetries,
      fallbackCount: this.fallbackCount,
      currentWindowReserved: this.getActiveReservedTokens(),
    };
  }

  public resetForTesting(): void {
    this.reservations = [];
    this.queue = [];
    this.processing = false;
    this.totalDispatched = 0;
    this.totalQueueWaitMs = 0;
    this.queuedRequestsCount = 0;
    this.totalRetries = 0;
    this.fallbackCount = 0;
  }
}
