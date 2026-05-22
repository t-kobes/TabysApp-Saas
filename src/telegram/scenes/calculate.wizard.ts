import { Logger } from '@nestjs/common';
import { Wizard, WizardStep, Ctx } from 'nestjs-telegraf';
import { Scenes, Markup } from 'telegraf';
import { CalculatorService } from '../../calculator/calculator.service';
import type { CalculateWizardState } from '../interfaces/bot-context.interface';

@Wizard('calculate-wizard')
export class CalculateWizard {
  private readonly logger = new Logger(CalculateWizard.name);

  constructor(private readonly calculatorService: CalculatorService) {}

  /**
   * Шаг 0: Запрос названия товара.
   */
  @WizardStep(1)
  async askProductName(@Ctx() ctx: Scenes.WizardContext): Promise<void> {
    await ctx.reply(
      '📝 Введите название товара (например: Беспроводные наушники P9):',
    );
    ctx.wizard.next();
  }

  /**
   * Шаг 1: Получаем название, запрашиваем цену в юанях.
   */
  @WizardStep(2)
  async askPriceCny(@Ctx() ctx: Scenes.WizardContext): Promise<void> {
    const productName = this.extractProductName(ctx);
    if (!productName) {
      await ctx.reply('⚠️ Пожалуйста, введите название товара текстом (от 2 до 200 символов).');
      return;
    }

    this.getState(ctx).productName = productName;

    await ctx.reply(
      '📝 *Расчёт юнит\\-экономики*\n\n' +
        'Шаг 2/5\\. Введите *цену товара в юанях* \\(CNY\\):',
      { parse_mode: 'MarkdownV2' },
    );
    ctx.wizard.next();
  }

  /**
   * Шаг 2: Получаем цену, запрашиваем вес.
   */
  @WizardStep(3)
  async askWeightKg(@Ctx() ctx: Scenes.WizardContext): Promise<void> {
    const value = this.extractNumber(ctx);
    if (value === null) {
      await ctx.reply('⚠️ Пожалуйста, введите корректное положительное число.');
      return;
    }

    this.getState(ctx).priceCny = value;

    await ctx.reply(
      'Шаг 3/5\\. Введите *вес товара в кг*:',
      { parse_mode: 'MarkdownV2' },
    );
    ctx.wizard.next();
  }

  /**
   * Шаг 3: Получаем вес, запрашиваем тариф карго.
   */
  @WizardStep(4)
  async askCargoRate(@Ctx() ctx: Scenes.WizardContext): Promise<void> {
    const value = this.extractNumber(ctx);
    if (value === null) {
      await ctx.reply('⚠️ Пожалуйста, введите корректное положительное число.');
      return;
    }

    this.getState(ctx).weightKg = value;

    await ctx.reply(
      'Шаг 4/5\\. Введите *тариф карго\\-доставки в $* за кг:',
      { parse_mode: 'MarkdownV2' },
    );
    ctx.wizard.next();
  }

  /**
   * Шаг 4: Получаем тариф, запрашиваем комиссию.
   */
  @WizardStep(5)
  async askCommission(@Ctx() ctx: Scenes.WizardContext): Promise<void> {
    const value = this.extractNumber(ctx);
    if (value === null) {
      await ctx.reply('⚠️ Пожалуйста, введите корректное положительное число.');
      return;
    }

    this.getState(ctx).cargoRateUsd = value;

    await ctx.reply(
      'Шаг 5/5\\. Введите *процент комиссии маркетплейса* \\(например, 15\\):',
      { parse_mode: 'MarkdownV2' },
    );
    ctx.wizard.next();
  }

  /**
   * Шаг 5: Получаем комиссию, считаем и отправляем результат.
   */
  @WizardStep(6)
  async calculateAndReply(@Ctx() ctx: Scenes.WizardContext): Promise<void> {
    const value = this.extractNumber(ctx);
    if (value === null) {
      await ctx.reply('⚠️ Пожалуйста, введите корректное положительное число.');
      return;
    }

    if (value <= 0 || value >= 100) {
      await ctx.reply('⚠️ Комиссия должна быть от 0 до 100% (не включительно).');
      return;
    }

    const state = this.getState(ctx);
    state.kaspiCommissionPercent = value;

    try {
      const result = this.calculatorService.calculateUnitEconomics({
        priceCny: state.priceCny!,
        weightKg: state.weightKg!,
        cargoRateUsd: state.cargoRateUsd!,
        kaspiCommissionPercent: state.kaspiCommissionPercent,
      });

      (ctx as any).session.lastCalculation = { ...state, result };

      const msg = [
        '✅ *Результат расчёта юнит\\-экономики*',
        '',
        '```',
        `Закупка:          ${this.formatNumber(result.purchasePriceKzt)} ₸`,
        `Доставка:         ${this.formatNumber(result.shippingCostKzt)} ₸`,
        `─────────────────────────`,
        `Себестоимость:    ${this.formatNumber(result.costPriceKzt)} ₸`,
        `Комиссия (${state.kaspiCommissionPercent}%):  ${this.formatNumber(result.kaspiCommissionKzt)} ₸`,
        `─────────────────────────`,
        `Мин. цена продажи: ${this.formatNumber(result.breakEvenPriceKzt)} ₸`,
        '```',
        '',
        `_Курсы: 1 CNY \\= ${result.rates.cnyKzt} ₸, 1 USD \\= ${result.rates.usdKzt} ₸_`,
        '',
        '🤖 *Хотите сгенерировать продающую SEO\\-карточку?* \\(Спишется 1 токен\\)',
      ].join('\n');

      await ctx.reply(msg, {
        parse_mode: 'MarkdownV2',
        reply_markup: Markup.inlineKeyboard([
          Markup.button.callback('Да', 'generate_seo'),
        ]).reply_markup,
      });

      this.logger.log(
        `Calculation done for tg_id=${ctx.from?.id}: product="${state.productName}", breakEven=${result.breakEvenPriceKzt}`,
      );
    } catch (error) {
      this.logger.error('Calculation failed', error);
      await ctx.reply('❌ Ошибка расчёта. Проверьте введённые данные.');
    }

    await ctx.scene.leave();
  }

  // ── Helpers ──────────────────────────────────────────────

  /**
   * Извлекает название товара из текстового сообщения.
   */
  private extractProductName(ctx: Scenes.WizardContext): string | null {
    const msg = ctx.message;
    if (!msg || !('text' in msg)) {
      return null;
    }

    const name = msg.text.trim();
    if (name.length < 2 || name.length > 200) {
      return null;
    }

    return name;
  }

  /**
   * Извлекает число из текстового сообщения.
   * Возвращает null, если сообщение не текстовое или не является положительным числом.
   */
  private extractNumber(ctx: Scenes.WizardContext): number | null {
    const msg = ctx.message;
    if (!msg || !('text' in msg)) {
      return null;
    }

    const normalized = msg.text.replace(',', '.');
    const value = parseFloat(normalized);

    if (isNaN(value) || value <= 0) {
      return null;
    }

    return value;
  }

  /**
   * Типобезопасный доступ к wizard state.
   */
  private getState(ctx: Scenes.WizardContext): CalculateWizardState {
    return ctx.wizard.state as CalculateWizardState;
  }

  /**
   * Форматирует число с разделителями тысяч.
   */
  private formatNumber(value: number): string {
    return value.toLocaleString('ru-RU', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }
}
