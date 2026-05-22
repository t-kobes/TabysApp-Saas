import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { CalculateDto } from './dto/calculate.dto';
import { CalculationResult } from './interfaces/calculation-result.interface';

@Injectable()
export class CalculatorService {
  private readonly logger = new Logger(CalculatorService.name);

  /** Захардкоженные курсы валют (будут заменены на API позже) */
  private readonly CNY_KZT = 65;
  private readonly USD_KZT = 450;

  /**
   * Рассчитывает юнит-экономику товара для продажи на Kaspi.
   *
   * Формулы:
   * - purchasePrice  = priceCny × CNY_KZT
   * - shippingCost   = weightKg × cargoRateUsd × USD_KZT
   * - costPrice      = purchasePrice + shippingCost
   * - kaspiCommission = costPrice × (kaspiCommissionPercent / 100)
   *   (рассчитана от себестоимости для точки безубыточности)
   * - breakEvenPrice = costPrice / (1 − kaspiCommissionPercent / 100)
   */
  calculateUnitEconomics(dto: CalculateDto): CalculationResult {
    this.validateInput(dto);

    const purchasePriceKzt = dto.priceCny * this.CNY_KZT;
    const shippingCostKzt = dto.weightKg * dto.cargoRateUsd * this.USD_KZT;
    const costPriceKzt = purchasePriceKzt + shippingCostKzt;

    const commissionMultiplier = dto.kaspiCommissionPercent / 100;
    const breakEvenPriceKzt = costPriceKzt / (1 - commissionMultiplier);
    const kaspiCommissionKzt = breakEvenPriceKzt - costPriceKzt;

    const result: CalculationResult = {
      purchasePriceKzt: this.round(purchasePriceKzt),
      shippingCostKzt: this.round(shippingCostKzt),
      costPriceKzt: this.round(costPriceKzt),
      kaspiCommissionKzt: this.round(kaspiCommissionKzt),
      breakEvenPriceKzt: this.round(breakEvenPriceKzt),
      rates: {
        cnyKzt: this.CNY_KZT,
        usdKzt: this.USD_KZT,
      },
    };

    this.logger.debug(`Calculation result: ${JSON.stringify(result)}`);
    return result;
  }

  /**
   * Валидирует входные данные — все числа должны быть положительными,
   * комиссия — в диапазоне (0, 100).
   */
  private validateInput(dto: CalculateDto): void {
    const { priceCny, weightKg, cargoRateUsd, kaspiCommissionPercent } = dto;

    if (priceCny <= 0) {
      throw new BadRequestException('priceCny must be a positive number');
    }
    if (weightKg <= 0) {
      throw new BadRequestException('weightKg must be a positive number');
    }
    if (cargoRateUsd <= 0) {
      throw new BadRequestException('cargoRateUsd must be a positive number');
    }
    if (kaspiCommissionPercent <= 0 || kaspiCommissionPercent >= 100) {
      throw new BadRequestException(
        'kaspiCommissionPercent must be between 0 and 100 (exclusive)',
      );
    }
  }

  /** Округляет до 2 знаков после запятой */
  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
