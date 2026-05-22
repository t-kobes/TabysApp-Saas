import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Используем порт 0 (случайный свободный) чтобы избежать ошибки EADDRINUSE при тестировании
  await app.listen(process.env.PORT ?? 0);
}
bootstrap();
