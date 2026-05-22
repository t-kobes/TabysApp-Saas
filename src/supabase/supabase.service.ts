import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private readonly logger = new Logger(SupabaseService.name);
  private _client: SupabaseClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_KEY');

    if (!supabaseUrl) {
      throw new Error(
        'SUPABASE_URL is not defined. Add it to your .env file.',
      );
    }

    if (!supabaseKey) {
      throw new Error(
        'SUPABASE_KEY is not defined. Add it to your .env file.',
      );
    }

    this._client = createClient(supabaseUrl, supabaseKey);
    this.logger.log('Supabase client initialized successfully');
  }

  /**
   * Returns the initialized Supabase client instance.
   * @throws Error if the client has not been initialized yet.
   */
  get client(): SupabaseClient {
    if (!this._client) {
      throw new Error(
        'Supabase client is not initialized. Ensure the module has started.',
      );
    }
    return this._client;
  }
}
