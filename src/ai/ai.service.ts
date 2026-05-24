import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CalculateWizardState } from '../telegram/interfaces/bot-context.interface';

export interface SeoCardResult {
  description_ru: string;
  description_kk: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private genAI: GoogleGenerativeAI;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (!apiKey) {
      this.logger.warn('GEMINI_API_KEY is not set. AI generation will fail.');
    }
    
    this.genAI = new GoogleGenerativeAI(apiKey || 'mock-key');
  }

  /**
   * Генерация SEO-карточки через Google Gemini (gemini-1.5-flash).
   */
  async generateSeoCard(data: CalculateWizardState, productName: string = 'Товар'): Promise<SeoCardResult> {
    this.logger.log(`Generating SEO card for ${productName}...`);
    
    const systemPrompt = `
Ты — профессиональный SEO-копирайтер для маркетплейса Kaspi.kz в Казахстане.
Задача: Сгенерировать продающее описание товара на двух языках: сначала на русском (RU), затем на казахском (KK).
Логика казахского языка: Текст на казахском языке должен быть написан носителем, без дословного перевода (кальки) с русского. Используй правильную e-commerce терминологию, принятую в Казахстане.

Структура ответа для каждого языка:
1. Короткий цепляющий абзац (для чего товар, его главная фишка).
2. Блок ключевых преимуществ (список через эмодзи).
3. Блок поисковых SEO-ключей (аккуратно вписанные в текст теги и ключевые слова, по которым товар будут искать на Kaspi).

Формат ответа ИИ: Строгий JSON с двумя полями: "description_ru" и "description_kk". Не выводи никаких дополнительных символов, только JSON. Не оборачивай JSON в markdown-блоки или любые другие символы.
`.trim();

    const userPrompt = `Название товара: ${productName}\nДополнительные данные: Цена ${data.priceCny} CNY, Вес ${data.weightKg} кг.`;

    try {
      const model = this.genAI.getGenerativeModel({
        model: 'gemini-3.5-flash',
        systemInstruction: systemPrompt,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.7,
        }
      });

      const response = await model.generateContent(userPrompt);
      const content = response.response.text();

      if (!content) {
        throw new Error('Empty response from Gemini');
      }

      let parsed: SeoCardResult;

      try {
        parsed = JSON.parse(content) as SeoCardResult;
      } catch (parseError) {
        this.logger.error(
          `Failed to parse Gemini JSON response: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        );
        this.logger.debug(`Gemini raw response: ${content}`);

        return {
          description_ru: 'Не удалось сформировать описание. Попробуйте ещё раз.',
          description_kk: 'Сипаттаманы құру мүмкін болмады. Қайта көріңіз.',
        };
      }

      if (!parsed.description_ru || !parsed.description_kk) {
        this.logger.error('Gemini returned JSON without required fields');
        this.logger.debug(`Gemini parsed response: ${JSON.stringify(parsed)}`);

        return {
          description_ru: 'Не удалось сформировать описание. Попробуйте ещё раз.',
          description_kk: 'Сипаттаманы құру мүмкін болмады. Қайта көріңіз.',
        };
      }

      return parsed;
    } catch (error) {
      this.logger.error('Failed to generate SEO card via Gemini', error);
      throw new InternalServerErrorException('Ошибка при генерации карточки. Попробуйте позже.');
    }
  }
}