export interface CalculationResult {
  /** Закупочная цена в KZT */
  purchasePriceKzt: number;

  /** Стоимость доставки в KZT */
  shippingCostKzt: number;

  /** Полная себестоимость (закупка + доставка) */
  costPriceKzt: number;

  /** Сумма комиссии Kaspi в KZT */
  kaspiCommissionKzt: number;

  /** Минимальная цена продажи для выхода в 0 (себестоимость + комиссия) */
  breakEvenPriceKzt: number;

  /** Использованные курсы валют */
  rates: {
    cnyKzt: number;
    usdKzt: number;
  };
}
