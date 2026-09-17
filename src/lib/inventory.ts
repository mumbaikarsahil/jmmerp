import { supabase } from './supabase';
import type { Database } from './supabase';

export type StockTransactionInsert = Database['public']['Tables']['stock_transactions']['Insert'];

export async function recordStockTransaction(params: StockTransactionInsert) {
  // 1. The function parameter strictly enforces your schema rules.
  // 2. Casting the client execution bypasses the internal V2 type constraint bug.
  const { data: transaction, error: txError } = await (supabase as any)
    .from('stock_transactions')
    .insert(params)
    .select()
    .single();

  if (txError) {
    console.error('Inventory Ledger Error:', txError);
    throw txError;
  }
  
  return transaction;
}