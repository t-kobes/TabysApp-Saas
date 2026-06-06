import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisModule } from './redis/redis.module';
import { SupabaseModule } from './supabase/supabase.module';
import { UsersModule } from './users/users.module';
import { CalculatorModule } from './calculator/calculator.module';
import { TelegramModule } from './telegram/telegram.module';
import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    RedisModule,
    SupabaseModule,
    UsersModule,
    CalculatorModule,
    TelegramModule,
    AiModule,
  ],
})
export class AppModule {}
