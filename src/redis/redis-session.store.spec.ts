import type { Redis } from 'ioredis';
import { RedisSessionStore } from './redis-session.store';

/** Минимальный фейк Redis: реализует только то, что использует store. */
class FakeRedis {
  readonly map = new Map<string, string>();
  readonly setCalls: Array<[string, string, string, number]> = [];

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.map.get(key) ?? null);
  }

  set(key: string, value: string, mode: string, ttl: number): Promise<'OK'> {
    this.setCalls.push([key, value, mode, ttl]);
    this.map.set(key, value);
    return Promise.resolve('OK');
  }

  del(key: string): Promise<number> {
    const existed = this.map.delete(key);
    return Promise.resolve(existed ? 1 : 0);
  }
}

describe('RedisSessionStore', () => {
  let redis: FakeRedis;
  let store: RedisSessionStore<{ step: number }>;

  beforeEach(() => {
    redis = new FakeRedis();
    store = new RedisSessionStore(redis as unknown as Redis);
  });

  it('сериализует значение в JSON с префиксом и TTL по умолчанию (24ч)', async () => {
    await store.set('42:42', { step: 3 });

    expect(redis.setCalls).toHaveLength(1);
    const [key, value, mode, ttl] = redis.setCalls[0];
    expect(key).toBe('tg:session:42:42');
    expect(value).toBe(JSON.stringify({ step: 3 }));
    expect(mode).toBe('EX');
    expect(ttl).toBe(60 * 60 * 24);
  });

  it('возвращает распарсенный объект из get', async () => {
    await store.set('42:42', { step: 5 });
    await expect(store.get('42:42')).resolves.toEqual({ step: 5 });
  });

  it('возвращает undefined, если сессии нет', async () => {
    await expect(store.get('missing')).resolves.toBeUndefined();
  });

  it('возвращает undefined при битом JSON, а не падает', async () => {
    redis.map.set('tg:session:broken', '{not json');
    await expect(store.get('broken')).resolves.toBeUndefined();
  });

  it('удаляет ключ', async () => {
    await store.set('42:42', { step: 1 });
    await store.delete('42:42');
    await expect(store.get('42:42')).resolves.toBeUndefined();
  });

  it('уважает кастомные prefix и ttlSeconds', async () => {
    const custom = new RedisSessionStore(redis as unknown as Redis, {
      prefix: 'sess:',
      ttlSeconds: 100,
    });
    await custom.set('x', { step: 0 });

    const [key, , , ttl] = redis.setCalls[0];
    expect(key).toBe('sess:x');
    expect(ttl).toBe(100);
  });
});
