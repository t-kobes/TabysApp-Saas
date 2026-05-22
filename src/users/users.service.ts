import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { User } from './interfaces/user.interface';
import { InsufficientTokensException } from './exceptions/insufficient-tokens.exception';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Finds an existing user by Telegram ID or creates a new one.
   * New users are created with the default `balance_tokens = 3`.
   */
  async findOrCreateUser(tgId: number, username: string): Promise<User> {
    // 1. Try to find existing user
    const { data: existing, error: selectError } = await this.supabase.client
      .from('users')
      .select('*')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (selectError) {
      this.logger.error(
        `Failed to query user tg_id=${tgId}: ${selectError.message}`,
      );
      console.error('Raw Supabase Error (select):', selectError);
      throw new InternalServerErrorException('Database query failed');
    }

    if (existing) {
      return existing as User;
    }

    // 2. User not found — create a new one
    const { data: created, error: insertError } = await this.supabase.client
      .from('users')
      .insert({ tg_id: tgId, tg_username: username })
      .select('*')
      .single();

    if (insertError) {
      this.logger.error(
        `Failed to create user tg_id=${tgId}: ${insertError.message}`,
      );
      console.error('Raw Supabase Error (insert):', insertError);
      throw new InternalServerErrorException('Failed to create user');
    }

    this.logger.log(`Created new user tg_id=${tgId} (${username})`);
    return created as User;
  }

  /**
   * Decrements `balance_tokens` by 1.
   * @throws InsufficientTokensException if balance is already 0.
   * @throws NotFoundException if user does not exist.
   */
  async decrementToken(tgId: number): Promise<User> {
    // 1. Fetch current balance
    let { data: user, error: fetchError } = await this.supabase.client
      .from('users')
      .select('id, tg_id, tg_username, balance_tokens')
      .eq('tg_id', tgId)
      .maybeSingle();

    if (fetchError) {
      this.logger.error(
        `Failed to fetch user tg_id=${tgId}: ${fetchError.message}`,
      );
      console.error('Raw Supabase Error (fetch):', fetchError);
      throw new InternalServerErrorException('Database query failed');
    }

    if (!user) {
      this.logger.warn(`User tg_id=${tgId} not found during decrement. Auto-creating.`);
      user = await this.findOrCreateUser(tgId, 'unknown');
    }

    if (user.balance_tokens <= 0) {
      throw new InsufficientTokensException(tgId);
    }

    // 2. Decrement
    const { data: updated, error: updateError } = await this.supabase.client
      .from('users')
      .update({ balance_tokens: user.balance_tokens - 1 })
      .eq('tg_id', tgId)
      .select('*')
      .single();

    if (updateError) {
      this.logger.error(
        `Failed to decrement tokens for tg_id=${tgId}: ${updateError.message}`,
      );
      console.error('Raw Supabase Error (update):', updateError);
      throw new InternalServerErrorException('Failed to update balance');
    }

    this.logger.log(
      `Decremented token for tg_id=${tgId}: ${user.balance_tokens} → ${updated.balance_tokens}`,
    );
    return updated as User;
  }
}
