import {
  Global,
  Inject,
  Logger,
  Module,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis, { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

/**
 * Глобально предоставляет общий клиент Redis по токену `REDIS_CLIENT`.
 *
 * Если `REDIS_URL` не задан — провайдер возвращает `null`, и потребители
 * (например, session store) откатываются на in-memory поведение. Это держит
 * локальную разработку zero-config, а в проде включает Redis одной переменной.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis | null => {
        const url = config.get<string>('REDIS_URL');
        const logger = new Logger('RedisModule');

        if (!url) {
          logger.warn(
            'REDIS_URL не задан — сессии будут in-memory (только один инстанс).',
          );
          return null;
        }

        const client = new IORedis(url, { maxRetriesPerRequest: 3 });
        client.on('connect', () =>
          logger.log('Подключение к Redis установлено.'),
        );
        client.on('error', (err) =>
          logger.error(`Ошибка Redis: ${err.message}`),
        );
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly client: Redis | null) {}

  async onApplicationShutdown(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }
}
