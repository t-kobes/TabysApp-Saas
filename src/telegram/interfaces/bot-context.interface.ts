import { Scenes, Context } from 'telegraf';

/**
 * Промежуточное состояние Wizard-сцены расчёта.
 * Хранится в ctx.wizard.state.
 */
export interface CalculateWizardState {
  productName?: string;
  priceCny?: number;
  weightKg?: number;
  cargoRateUsd?: number;
  kaspiCommissionPercent?: number;
}

/**
 * Данные сессии, доступные глобально (вне сцен).
 */
export interface SessionData extends Scenes.WizardSession {
  lastCalculation?: CalculateWizardState;
}

/**
 * Контекст бота с поддержкой сцен и кастомной сессии.
 */
export interface BotContext extends Context {
  session: SessionData;
  scene: Scenes.SceneContextScene<BotContext, Scenes.WizardSessionData>;
  wizard: Scenes.WizardContextWizard<BotContext>;
}

/**
 * Контекст внутри Wizard-сцены.
 */
export type CalculateWizardContext = BotContext;
