import { createClient } from '@supabase/supabase-js'

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: { id: string; tenant_name: string; created_at: string; tenant_logo: string | null; tenant_address: string | null; tenant_contact_name: string | null; tenant_phone: number | null }
        Insert: { id?: string; tenant_name: string; created_at?: string; tenant_logo?: string | null; tenant_address?: string | null; tenant_contact_name?: string | null; tenant_phone?: number | null }
        Update: Partial<Database['public']['Tables']['tenants']['Insert']>
      }
      profiles: {
        Row: { id: string; tenant_id: string; full_name: string | null; role: string | null; created_at: string }
        Insert: { id: string; tenant_id: string; full_name?: string | null; role?: string | null; created_at?: string }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: [] // <-- ADD THIS LINE
      }
      items: {
        Row: {
          id: number; created_at: string; item_code: string; make: string | null; brand_name: string | null; purchase_price: number | null; selling_price: number | null; supplier_code: string | null;
          quantity: number | null; item_name: string | null; pieces_per_box: number | null; price_per_piece: number | null; size: string | null; tenant_id: string; image_url: string | null; category: string | null; show_on_web: boolean | null;
          item_type: 'RAW_MATERIAL' | 'FINISHED_PRODUCT' | 'PACKAGED_PRODUCT' | 'SERVICE' | null;
          base_unit: string | null; track_inventory: boolean | null; is_sellable: boolean | null;
        }
        Insert: Omit<Database['public']['Tables']['items']['Row'], 'id' | 'created_at'> & { id?: number; created_at?: string }
        Update: Partial<Database['public']['Tables']['items']['Insert']>
      }
      stock_transactions: {
        Row: {
          id: string; tenant_id: string; item_id: number; transaction_type: string; quantity: number; unit: string; reference_type: string | null; reference_id: string | null; notes: string | null; created_at: string; created_by: string | null
        }
        Insert: {
          id?: string; tenant_id: string; item_id: number; transaction_type: string; quantity: number; unit: string; reference_type?: string | null; reference_id?: string | null; notes?: string | null; created_at?: string; created_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['stock_transactions']['Insert']>
        Relationships: [] // <--- ADD THIS LINE
      }
      masala_templates: {
        Row: { id: string; tenant_id: string; template_name: string; spiciness_level: string | null; default_labor_charge: number | null; created_at: string }
        Insert: { id?: string; tenant_id: string; template_name: string; spiciness_level?: string | null; default_labor_charge?: number | null; created_at?: string }
        Update: Partial<Database['public']['Tables']['masala_templates']['Insert']>
      }
      template_ingredients: {
        Row: { id: string; tenant_id: string; template_id: string; item_id: number; base_qty: number; unit: string | null; is_editable: boolean | null }
        Insert: { id?: string; tenant_id: string; template_id: string; item_id: number; base_qty: number; unit?: string | null; is_editable?: boolean | null }
        Update: Partial<Database['public']['Tables']['template_ingredients']['Insert']>
      }
      production_batches: {
        Row: { id: string; tenant_id: string; template_id: string | null; output_item_id: number | null; batch_number: string; production_date: string | null; planned_quantity: number | null; actual_quantity: number | null; labor_charge: number | null; status: string | null; notes: string | null; created_by: string | null }
        Insert: { id?: string; tenant_id: string; template_id?: string | null; output_item_id?: number | null; batch_number: string; production_date?: string | null; planned_quantity?: number | null; actual_quantity?: number | null; labor_charge?: number | null; status?: string | null; notes?: string | null; created_by?: string | null }
        Update: Partial<Database['public']['Tables']['production_batches']['Insert']>
      }
      production_batch_items: {
        Row: { id: string; tenant_id: string; batch_id: string; item_id: number; planned_quantity: number; actual_quantity_used: number | null; unit: string }
        Insert: { id?: string; tenant_id: string; batch_id: string; item_id: number; planned_quantity: number; actual_quantity_used?: number | null; unit: string }
        Update: Partial<Database['public']['Tables']['production_batch_items']['Insert']>
      }
      customers: {
        Row: { id: string; tenant_id: string; full_name: string | null; phone_number: string | null; customer_type: string | null; price_list_id: string | null; created_at: string }
        Insert: { id?: string; tenant_id: string; full_name?: string | null; phone_number?: string | null; customer_type?: string | null; price_list_id?: string | null; created_at?: string }
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      customer_addresses: {
        Row: { id: string; tenant_id: string; customer_id: string; address_type: string | null; address_line: string; city: string | null; pincode: string | null }
        Insert: { id?: string; tenant_id: string; customer_id: string; address_type?: string | null; address_line: string; city?: string | null; pincode?: string | null }
        Update: Partial<Database['public']['Tables']['customer_addresses']['Insert']>
      }
      orders: {
        Row: { id: string; tenant_id: string; customer_id: string | null; delivery_address_id: string | null; order_number: string; source: string | null; status: string | null; payment_status: string | null; total_amount: number | null; delivery_date: string | null; notes: string | null; created_at: string }
        Insert: { id?: string; tenant_id: string; customer_id?: string | null; delivery_address_id?: string | null; order_number: string; source?: string | null; status?: string | null; payment_status?: string | null; total_amount?: number | null; delivery_date?: string | null; notes?: string | null; created_at?: string }
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
      }
      order_items: {
        Row: { id: string; tenant_id: string; order_id: string; item_id: number; quantity: number; unit: string | null; price_at_order: number }
        Insert: { id?: string; tenant_id: string; order_id: string; item_id: number; quantity: number; unit?: string | null; price_at_order: number }
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
      }
      order_item_ingredients: {
        Row: { id: string; tenant_id: string; order_item_id: string; item_id: number; custom_quantity: number; unit: string }
        Insert: { id?: string; tenant_id: string; order_item_id: string; item_id: number; custom_quantity: number; unit: string }
        Update: Partial<Database['public']['Tables']['order_item_ingredients']['Insert']>
      }
      order_status_history: {
        Row: { id: string; tenant_id: string; order_id: string; status: string; changed_by: string | null; created_at: string }
        Insert: { id?: string; tenant_id: string; order_id: string; status: string; changed_by?: string | null; created_at?: string }
        Update: Partial<Database['public']['Tables']['order_status_history']['Insert']>
      }
      bills: {
        Row: { id: number; created_at: string; total_amount: number | null; discount_amount: number | null; final_amount: number | null; customer_phone: string | null; status: string | null; customer_name: string | null; payment_status: string | null; payment_method: string | null; is_udhaar: boolean | null; share_id: string | null; tenant_id: string; advance_paid: number | null; balance_due: number | null; invoice_number: string | null; order_id: string | null; customer_id: string | null }
        Insert: Omit<Database['public']['Tables']['bills']['Row'], 'id' | 'created_at'> & { id?: number; created_at?: string }
        Update: Partial<Database['public']['Tables']['bills']['Insert']>
      }
      bill_items: {
        Row: { id: number; bill_id: number | null; item_id: number | null; item_code: string | null; quantity: number | null; price_at_sale: number | null; tenant_id: string }
        Insert: Omit<Database['public']['Tables']['bill_items']['Row'], 'id'> & { id?: number }
        Update: Partial<Database['public']['Tables']['bill_items']['Insert']>
      }
      payments: {
        Row: { id: string; tenant_id: string; bill_id: number | null; order_id: string | null; customer_id: string | null; amount: number; payment_type: string | null; payment_method: string | null; payment_date: string | null; reference_number: string | null; created_by: string | null }
        Insert: { id?: string; tenant_id: string; bill_id?: number | null; order_id?: string | null; customer_id?: string | null; amount: number; payment_type?: string | null; payment_method?: string | null; payment_date?: string | null; reference_number?: string | null; created_by?: string | null }
        Update: Partial<Database['public']['Tables']['payments']['Insert']>
      }
      price_lists: {
        Row: { id: string; tenant_id: string; list_name: string; created_at: string | null }
        Insert: { id?: string; tenant_id: string; list_name: string; created_at?: string | null }
        Update: Partial<Database['public']['Tables']['price_lists']['Insert']>
      }
      price_list_items: {
        Row: { id: string; tenant_id: string; price_list_id: string; item_id: number; selling_price: number }
        Insert: { id?: string; tenant_id: string; price_list_id: string; item_id: number; selling_price: number }
        Update: Partial<Database['public']['Tables']['price_list_items']['Insert']>
      }
      wholesale_prices: {
        Row: { id: string; tenant_id: string; item_id: number; price: number; minimum_quantity: number | null; customer_type: string | null; valid_from: string | null; valid_until: string | null }
        Insert: { id?: string; tenant_id: string; item_id: number; price: number; minimum_quantity?: number | null; customer_type?: string | null; valid_from?: string | null; valid_until?: string | null }
        Update: Partial<Database['public']['Tables']['wholesale_prices']['Insert']>
      }
      item_packaging: {
        Row: { id: string; tenant_id: string; bulk_item_id: number; packaged_item_id: number; bulk_quantity_consumed: number; packages_generated: number }
        Insert: { id?: string; tenant_id: string; bulk_item_id: number; packaged_item_id: number; bulk_quantity_consumed: number; packages_generated?: number }
        Update: Partial<Database['public']['Tables']['item_packaging']['Insert']>
      }
      vouchers: {
        Row: { id: string; tenant_id: string; voucher_code: string; discount_value: number; is_percentage: boolean | null; minimum_order_value: number | null; maximum_discount: number | null; valid_from: string | null; valid_until: string | null; usage_limit_per_customer: number | null; total_usage_limit: number | null; active: boolean | null }
        Insert: { id?: string; tenant_id: string; voucher_code: string; discount_value: number; is_percentage?: boolean | null; minimum_order_value?: number | null; maximum_discount?: number | null; valid_from?: string | null; valid_until?: string | null; usage_limit_per_customer?: number | null; total_usage_limit?: number | null; active?: boolean | null }
        Update: Partial<Database['public']['Tables']['vouchers']['Insert']>
      }
      voucher_redemptions: {
        Row: { id: string; tenant_id: string; voucher_id: string; customer_id: string; order_id: string | null; redeemed_at: string | null }
        Insert: { id?: string; tenant_id: string; voucher_id: string; customer_id: string; order_id?: string | null; redeemed_at?: string | null }
        Update: Partial<Database['public']['Tables']['voucher_redemptions']['Insert']>
      }
      tenant_settings: {
        Row: { id: string; tenant_id: string; setting_category: string; settings: Json; updated_at: string | null }
        Insert: { id?: string; tenant_id: string; setting_category: string; settings?: Json; updated_at?: string | null }
        Update: Partial<Database['public']['Tables']['tenant_settings']['Insert']>
      }
      print_templates: {
        Row: { id: string; tenant_id: string; template_type: string; template_name: string; layout_config: Json; is_active: boolean | null }
        Insert: { id?: string; tenant_id: string; template_type: string; template_name: string; layout_config?: Json; is_active?: boolean | null }
        Update: Partial<Database['public']['Tables']['print_templates']['Insert']>
      }
      audit_logs: {
        Row: { id: string; tenant_id: string; user_id: string | null; action: string; entity_type: string; entity_id: string; old_data: Json | null; new_data: Json | null; created_at: string | null }
        Insert: { id?: string; tenant_id: string; user_id?: string | null; action: string; entity_type: string; entity_id: string; old_data?: Json | null; new_data?: Json | null; created_at?: string | null }
        Update: Partial<Database['public']['Tables']['audit_logs']['Insert']>
      }
    } // <-- End of Tables object

    // ADD THESE MISSING REQUIRED SUPABASE TYPES HERE:
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  } // <-- End of public object
} // <-- End of Database interface

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey)
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey)