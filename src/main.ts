import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getBotToken } from 'nestjs-telegraf';
import type { Telegraf } from 'telegraf';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks(); // чтобы Redis-клиент корректно закрывался при завершении

  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');
  const port = config.get<string>('PORT') ?? 3000;

  const domain = config.get<string>('WEBHOOK_DOMAIN');

  let webhookPath: string | undefined;
  let secretToken: string | undefined;

  if (domain) {
    // Webhook-режим: регистрируем обработчик как middleware на том же
    // HTTP-сервере, что и health-эндпоинт. secretPathComponent() стабилен
    // (выводится из токена бота), поэтому все реплики ставят один и тот же URL.
    const bot = app.get<Telegraf>(getBotToken());
    secretToken =
      config.get<string>('WEBHOOK_SECRET') ?? bot.secretPathComponent();
    webhookPath = `/telegraf/${bot.secretPathComponent()}`;
    app.use(bot.webhookCallback(webhookPath, { secretToken }));
  }

  await app.listen(port, '0.0.0.0');

  if (domain && webhookPath) {
    const bot = app.get<Telegraf>(getBotToken());
    // botInfo нужен Telegraf для обработки апдейтов без авто-launch.
    bot.botInfo = bot.botInfo ?? (await bot.telegram.getMe());

    const url = `${domain.replace(/\/$/, '')}${webhookPath}`;
    await bot.telegram.setWebhook(url, {
      secret_token: secretToken,
      drop_pending_updates: true,
      allowed_updates: ['message', 'callback_query'],
    });
    logger.log(`Webhook-режим: апдейты на ${url}`);
  } else {
    logger.log('Polling-режим (WEBHOOK_DOMAIN не задан).');
  }
}
bootstrap().catch((err) => {
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
