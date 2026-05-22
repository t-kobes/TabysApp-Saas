import { Logger } from '@nestjs/common';
import { Update, Start, Command, Ctx, Action } from 'nestjs-telegraf';
import { Scenes, Markup } from 'telegraf';
import { UsersService } from '../users/users.service';
import { AiService } from '../ai/ai.service';
import { SupabaseService } from '../supabase/supabase.service';
import { InsufficientTokensException } from '../users/exceptions/insufficient-tokens.exception';

@Update()
export class TelegramUpdate {
  private readonly logger = new Logger(TelegramUpdate.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly aiService: AiService,
    private readonly supabaseService: SupabaseService,
  ) {}

  @Start()
  async onStart(@Ctx() ctx: Scenes.SceneContext): Promise<void> {
    const from = ctx.from;
    console.log('Команда /start получена от юзера:', from?.id);

    if (!from) {
      await ctx.reply('❌ Не удалось определить пользователя.');
      return;
    }

    const tgId = from.id;
    const username = from.username ?? from.first_name ?? 'unknown';

    try {
      const user = await this.usersService.findOrCreateUser(tgId, username);

      const greeting = [
        `👋 Привет, *${this.escapeMarkdown(username)}*\\!`,
        '',
        '🤖 Я — бот для расчёта юнит\\-экономики селлеров\\.',
        '',
        `💰 Твой баланс: *${this.escapeMarkdown(String(user.balance_tokens))}* токенов`,
        '',
        '📊 Используй /calculate для расчёта себестоимости товара\\.',
      ].join('\n');

      await ctx.reply(greeting, { parse_mode: 'MarkdownV2' });

      this.logger.log(
        `User @${username} (tg_id=${tgId}) started the bot | balance=${user.balance_tokens}`,
      );
    } catch (error) {
      this.logger.error(`Failed to handle /start for tg_id=${tgId}`, error);
      await ctx.reply('❌ Произошла ошибка. Попробуйте позже.');
    }
  }

  @Command('calculate')
  async onCalculate(@Ctx() ctx: Scenes.SceneContext): Promise<void> {
    try {
      await ctx.scene.enter('calculate-wizard');
    } catch (error) {
      this.logger.error('Failed to enter calculate wizard', error);
      await ctx.reply('❌ Не удалось запустить расчёт. Попробуйте позже.');
    }
  }

  @Action('generate_seo')
  async onGenerateSeo(@Ctx() ctx: any): Promise<void> {
    const tgId = ctx.from.id;
    const sessionData = ctx.session?.lastCalculation;

    if (!sessionData) {
      await ctx.answerCbQuery('❌ Нет данных для генерации. Сначала сделайте расчёт (/calculate).', { show_alert: true });
      return;
    }

    try {
      // 1. Списываем токен
      await this.usersService.decrementToken(tgId);
    } catch (error) {
      if (error instanceof InsufficientTokensException) {
        await ctx.answerCbQuery();

        const noTokensMessage = [
          '⚠️ *У вас закончились бесплатные токены\\!*',
          'Чтобы продолжить генерировать продающие SEO\\-карточки, пополните баланс\\.',
          '',
          '💳 *Стоимость пакетов:*',
          '• 20 генераций — 1 500 ₸',
          '• 50 генераций — 3 000 ₸',
          '• 100 генераций — 5 000 ₸',
          '',
          'Для покупки нажмите кнопку ниже и отправьте сообщение менеджеру\\. Баланс будет пополнен в течение 5 минут\\.',
        ].join('\n');

        await ctx.reply(noTokensMessage, {
          parse_mode: 'MarkdownV2',
          reply_markup: Markup.inlineKeyboard([
            Markup.button.url('💳 Пополнить баланс', 'https://t.me/singersh'),
          ]).reply_markup,
        });
      } else {
        this.logger.error('Failed to decrement token', error);
        await ctx.answerCbQuery('❌ Произошла ошибка. Попробуйте позже.', { show_alert: true });
      }
      return;
    }

    await ctx.answerCbQuery('✅ Генерирую SEO-карточку...');
    const loadingMessage = await ctx.reply('⏳ Запрос к ИИ... Пожалуйста, подождите.');

    try {
      const seoResult = await this.aiService.generateSeoCard(
        sessionData,
        sessionData.productName ?? 'Товар',
      );

      // Форматируем текст для отправки
      const finalMessage = `✨ *Сгенерированная SEO-карточка*\n\n*🇷🇺 На русском:*\n${seoResult.description_ru}\n\n*🇰🇿 Қазақша:*\n${seoResult.description_kk}`;

      // 3. Сохраняем в БД (calculations)
      const { data: calcResult, error: calcError } = await this.supabaseService.client
        .from('calculations')
        .insert({
          tg_id: tgId,
          price_cny: sessionData.priceCny,
          weight_kg: sessionData.weightKg,
          cargo_rate_usd: sessionData.cargoRateUsd,
          commission_percent: sessionData.kaspiCommissionPercent,
          cost_price_kzt: sessionData.result.costPriceKzt,
          break_even_price_kzt: sessionData.result.breakEvenPriceKzt
        })
        .select('id')
        .single();

      if (calcError) {
        this.logger.error(`Failed to save calculation for tg_id=${tgId}`, calcError);
      }

      // 4. Сохраняем в БД (seo_cards) если расчёт сохранился успешно
      if (calcResult?.id) {
        const { error: seoError } = await this.supabaseService.client
          .from('seo_cards')
          .insert({
            calculation_id: calcResult.id,
            content: finalMessage // Сохраняем объединенный текст
          });

        if (seoError) {
          this.logger.error(`Failed to save SEO card for calculation ${calcResult.id}`, seoError);
        }
      }

      // 5. Отправляем результат
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
      await ctx.reply(finalMessage, { parse_mode: 'Markdown' });

    } catch (error) {
      this.logger.error('Error in AI generation flow', error);
      await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
      await ctx.reply('❌ Ошибка при генерации карточки.');
    }
  }

  /**
   * Экранирует спецсимволы MarkdownV2.
   */
  private escapeMarkdown(text: string): string {
    return text.replace(/([_*\[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
  }
}
