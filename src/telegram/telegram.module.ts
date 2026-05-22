import { Module } from '@nestjs/common';
import { TelegrafModule } from 'nestjs-telegraf';
import { ConfigService } from '@nestjs/config';
import { session } from 'telegraf';
import { TelegramUpdate } from './telegram.update';
import { UsersModule } from '../users/users.module';
import { CalculatorModule } from '../calculator/calculator.module';
import { CalculateWizard } from './scenes/calculate.wizard';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    TelegrafModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const token = config.get<string>('TELEGRAM_BOT_TOKEN');
        if (!token) {
          throw new Error('TELEGRAM_BOT_TOKEN is not defined');
        }
        return {
          token,
          middlewares: [session()],
          launchOptions: { dropPendingUpdates: true }, // Сброс старых/конфликтующих апдейтов
        };
      },
    }),
    UsersModule,
    CalculatorModule,
    AiModule,
  ],
  providers: [TelegramUpdate, CalculateWizard],
})
export class TelegramModule { }
