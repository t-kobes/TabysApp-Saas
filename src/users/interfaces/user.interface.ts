export interface User {
  id: string;          // uuid
  tg_id: number;       // bigint
  tg_username: string; // varchar
  balance_tokens: number; // int, default 3
}
