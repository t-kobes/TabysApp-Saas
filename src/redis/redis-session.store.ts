import type { Redis } from 'ioredis';

/**
 * Async session store для Telegraf поверх Redis.
 *
 * Реализует структурный интерфейс `AsyncSessionStore` из telegraf
 * (`get`/`set`/`delete`), поэтому подключается напрямую в `session({ store })`.
 *
 * Зачем: сессии в памяти живут в одном процессе и теряются при рестарте,
 * из-за чего нельзя поднять больше одной реплики. Redis выносит состояние
 * наружу — любой инстанс читает одну и ту же сессию.
 */
export class RedisSessionStore<T = unknown> {
  private readonly prefix: string;
  private readonly ttlSeconds: number;

  constructor(
    private readonly redis: Redis,
    options?: { prefix?: string; ttlSeconds?: number },
  ) {
    this.prefix = options?.prefix ?? 'tg:session:';
    // 24 часа: достаточно, чтобы юзер вернулся к расчёту и нажал «Да»,
    // но протухшие визард-сессии не копятся вечно (нативный TTL Redis).
    this.ttlSeconds = options?.ttlSeconds ?? 60 * 60 * 24;
  }

  private key(name: string): string {
    return this.prefix + name;
  }

  async get(name: string): Promise<T | undefined> {
    const raw = await this.redis.get(this.key(name));
    if (!raw) {
      return undefined;
    }
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Битое значение — ведём себя как «сессии нет», а не падаем.
      return undefined;
    }
  }

  async set(name: string, value: T): Promise<void> {
    await this.redis.set(
      this.key(name),
      JSON.stringify(value),
      'EX',
      this.ttlSeconds,
    );
  }

  async delete(name: string): Promise<void> {
    await this.redis.del(this.key(name));
  }
}
