/**
 * Rate Limiter - Prevent DOS via rapid requests
 * Debounce + cooldown mechanism for user actions
 */

interface RateLimitConfig {
  delayMs: number;        // Debounce delay
  cooldownMs: number;     // Cooldown between requests
  maxAttempts?: number;   // Max attempts per window
}

class RateLimiter {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private lastCallTime: Map<string, number> = new Map();
  private attemptCounts: Map<string, number> = new Map();
  private windows: Map<string, NodeJS.Timeout> = new Map();

  /**
   * Debounce and rate limit a function
   * @param key Unique identifier for this rate limit
   * @param fn Function to execute
   * @param config Rate limit configuration
   * @returns Promise that resolves when function can be called
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    config: RateLimitConfig = { delayMs: 300, cooldownMs: 5000 }
  ): Promise<T | null> {
    // Clear existing debounce timer
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
    }

    // Check cooldown
    const now = Date.now();
    const lastCall = this.lastCallTime.get(key) || 0;
    
    if (now - lastCall < config.cooldownMs) {
      const remainingMs = config.cooldownMs - (now - lastCall);
      console.warn(
        `⏱️ Rate limited: ${key} (${Math.ceil(remainingMs / 1000)}s remaining)`
      );
      return null;
    }

    // Check attempt count
    if (config.maxAttempts) {
      const attempts = this.attemptCounts.get(key) || 0;
      if (attempts >= config.maxAttempts) {
        console.error(
          `❌ Too many attempts: ${key} (${attempts}/${config.maxAttempts})`
        );
        return null;
      }

      this.attemptCounts.set(key, attempts + 1);

      // Reset attempt count after window
      if (!this.windows.has(key)) {
        const window = setTimeout(() => {
          this.attemptCounts.delete(key);
          this.windows.delete(key);
        }, 60000); // 1 minute window

        this.windows.set(key, window);
      }
    }

    // Set debounce timer
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        try {
          this.lastCallTime.set(key, Date.now());
          this.timers.delete(key);
          const result = await fn();
          resolve(result);
        } catch (error) {
          console.error(`Error executing ${key}:`, error);
          resolve(null);
        }
      }, config.delayMs);

      this.timers.set(key, timer);
    });
  }

  /**
   * Get remaining cooldown time in milliseconds
   */
  getRemainingCooldown(key: string, cooldownMs: number = 5000): number {
    const lastCall = this.lastCallTime.get(key) || 0;
    const elapsed = Date.now() - lastCall;
    return Math.max(0, cooldownMs - elapsed);
  }

  /**
   * Check if action is currently rate limited
   */
  isRateLimited(key: string, cooldownMs: number = 5000): boolean {
    return this.getRemainingCooldown(key, cooldownMs) > 0;
  }

  /**
   * Manually reset rate limiter for a key
   */
  reset(key: string): void {
    if (this.timers.has(key)) {
      clearTimeout(this.timers.get(key)!);
      this.timers.delete(key);
    }
    this.lastCallTime.delete(key);
    this.attemptCounts.delete(key);

    if (this.windows.has(key)) {
      clearTimeout(this.windows.get(key)!);
      this.windows.delete(key);
    }
  }

  /**
   * Reset all rate limiters
   */
  resetAll(): void {
    this.timers.forEach(timer => clearTimeout(timer));
    this.windows.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.lastCallTime.clear();
    this.attemptCounts.clear();
    this.windows.clear();
  }
}

// Singleton instance
export const rateLimiter = new RateLimiter();

export default rateLimiter;
