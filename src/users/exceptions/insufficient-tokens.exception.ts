import { HttpException, HttpStatus } from '@nestjs/common';

export class InsufficientTokensException extends HttpException {
  constructor(tgId: number) {
    super(
      `User with tg_id=${tgId} has no tokens left`,
      HttpStatus.PAYMENT_REQUIRED,
    );
  }
}
