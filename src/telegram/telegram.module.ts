import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { session } from 'telegraf';
import type { Redis } from 'ioredis';
import { TelegramUpdate } from './telegram.update';
import { UsersModule } from '../users/users.module';
import { CalculatorModule } from '../calculator/calculator.module';
import { CalculateWizard } from './scenes/calculate.wizard';
import { AiModule } from '../ai/ai.module';
import { REDIS_CLIENT } from '../redis/redis.constants';
import { RedisSessionStore } from '../redis/redis-session.store';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      inject: [ConfigService, REDIS_CLIENT],
      useFactory: (config: ConfigService, redis: Redis | null) => {
        const token = config.get<string>('TELEGRAM_BOT_TOKEN');
        if (!token) {
          throw new Error('TELEGRAM_BOT_TOKEN is not defined');
        }

        // Сессии: Redis (горизонтальный масштаб) при наличии REDIS_URL,
        // иначе in-memory (store=undefined) — удобно для локальной разработки.
        const store = redis ? new RedisSessionStore(redis) : undefined;

        // Режим запуска: webhook при заданном WEBHOOK_DOMAIN, иначе long-polling.
        // launchOptions: false отключает авто-launch в nestjs-telegraf —
        // webhook поднимается вручную в main.ts поверх HTTP-сервера Nest.
        const useWebhook = !!config.get<string>('WEBHOOK_DOMAIN');

        return {
          token,
          middlewares: [session({ store })],
          launchOptions: useWebhook ? false : { dropPendingUpdates: true }, // Сброс старых/конфликтующих апдейтов в polling
        };
      },
    }),
    UsersModule,
    CalculatorModule,
    AiModule,
  ],
  providers: [TelegramUpdate, CalculateWizard],
})
export class TelegramModule {}
