export class CalculateDto {
  /** Закупочная цена товара в китайских юанях */
  priceCny: number;

  /** Вес товара в кг */
  weightKg: number;

  /** Ставка карго-доставки за кг в USD */
  cargoRateUsd: number;

  /** Комиссия Kaspi в процентах (например, 15) */
  kaspiCommissionPercent: number;
}
