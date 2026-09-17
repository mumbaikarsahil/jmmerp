import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { 
  ChevronRight, ChevronLeft, Minus, Plus, CheckCircle2, 
  Banknote, CreditCard, Flame, ShoppingBag, Loader2, Calendar, Phone, User
} from "lucide-react";

// --- TYPES ---
type Item = {
  id: number;
  item_code: string;
  item_name: string;
  selling_price: number;
  base_unit: string;
  item_type: string;
};

type MasalaTemplate = {
  id: string;
  template_name: string;
  template_ingredients: {
    item_id: number;
    base_qty: number;
    unit: string;
    items?: { item_name: string | null; selling_price: number | null; base_unit: string | null; } | null;
  }[];
};

type CartIngredient = {
  item_id: number;
  item_name: string;
  qty_g: number;
  price_per_kg: number;
};

type Customer = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
};

export default function MixMasalaKiosk() {
  const { toast } = useToast();
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  
  // Data
  const [rawSpices, setRawSpices] = useState<Item[]>([]);
  const [templates, setTemplates] = useState<MasalaTemplate[]>([]);
  const [labourRate, setLabourRate] = useState<number>(80); 
  const [baseMasalaItem, setBaseMasalaItem] = useState<Item | null>(null);

  // Kiosk Flow State
  const [step, setStep] = useState<number>(1);
  
  // Order State
  const [selectedTemplateName, setSelectedTemplateName] = useState<string>("");
  const [cartIngredients, setCartIngredients] = useState<CartIngredient[]>([]);
  
  // CRM & Billing State
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);
  const [deliveryDate, setDeliveryDate] = useState("");
  const [amountPaying, setAmountPaying] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "UPI">("CASH");
  const [completedOrderNo, setCompletedOrderNo] = useState("");

  // --- INITIALIZATION ---
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data: profile } = await (supabase as any).from("profiles").select("tenant_id").eq("id", session.user.id).single();
        if (profile?.tenant_id) {
          setTenantId(profile.tenant_id);
          await fetchMasterData(profile.tenant_id);
        }
      } catch (e) {
        console.error("Init error", e);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const fetchMasterData = async (tid: string) => {
    const { data: itemsData } = await (supabase as any)
      .from("items")
      .select("*")
      .eq("tenant_id", tid)
      .eq("is_sellable", true);
      
    if (itemsData) {
      setRawSpices(itemsData.filter((i: any) => i.item_type === "RAW_MATERIAL"));
      
      const labourItem = itemsData.find((i: any) => i.item_name.includes("मजूरी") || i.item_type === "SERVICE");
      if (labourItem && labourItem.selling_price) setLabourRate(Number(labourItem.selling_price));

      let masterItem = itemsData.find((i: any) => i.item_name === "Yearly Masala" || i.item_name === "Custom Masala Blend");
      if (!masterItem) {
         const { data: newItem } = await (supabase as any).from("items").insert({
            tenant_id: tid, item_code: `CUST-MIX`, item_name: "Custom Masala Blend",
            item_type: "FINISHED_PRODUCT", base_unit: "kg", selling_price: 0, purchase_price: 0, track_inventory: false, is_sellable: true
         }).select().single();
         masterItem = newItem;
      }
      setBaseMasalaItem(masterItem);
    }

    const { data: templateData } = await (supabase as any)
      .from("masala_templates")
      .select(`id, template_name, template_ingredients (item_id, base_qty, unit, items (item_name, selling_price, base_unit))`)
      .eq("tenant_id", tid)
      .order("template_name", { ascending: true });
    
    if (templateData) setTemplates(templateData);
  };

  // --- CALCULATIONS ---
  const totals = useMemo(() => {
    const totalWeightKg = cartIngredients.reduce((sum, ing) => sum + ing.qty_g, 0) / 1000;
    const materialCost = cartIngredients.reduce((sum, ing) => sum + (ing.qty_g / 1000) * ing.price_per_kg, 0);
    const labourCost = totalWeightKg * labourRate;
    return {
      weightKg: totalWeightKg,
      materialCost: Math.round(materialCost),
      labourCost: Math.round(labourCost),
      grandTotal: Math.round(materialCost + labourCost)
    };
  }, [cartIngredients, labourRate]);

  // Set default payment amount when reaching step 3
  useEffect(() => {
    if (step === 3) {
      setAmountPaying(String(totals.grandTotal));
    }
  }, [step, totals.grandTotal]);

  const balanceDue = Math.max(0, totals.grandTotal - Number(amountPaying || 0));

  // --- CUSTOMER LOOKUP ---
  const findCustomerByPhone = useCallback(async (phone: string) => {
    if (!tenantId) return;
    const normalized = phone.replace(/\D/g, "").slice(-10);
    if (normalized.length < 10) {
      setFoundCustomer(null);
      return;
    }
    try {
      const { data } = await (supabase as any).from("customers").select("*").eq("tenant_id", tenantId).eq("phone_number", normalized).maybeSingle();
      if (data) {
        setFoundCustomer(data);
        setCustomerName(data.full_name || "");
      } else {
        setFoundCustomer(null);
      }
    } catch(e) {}
  }, [tenantId]);

  const handlePhoneChange = (value: string) => {
    setCustomerPhone(value);
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) findCustomerByPhone(digits);
    else setFoundCustomer(null);
  };

  // --- ACTIONS ---
  const handleSelectTemplate = (t: MasalaTemplate) => {
    setSelectedTemplateName(t.template_name);
    const initialCart: CartIngredient[] = t.template_ingredients.map(ing => {
      let qtyGrams = Number(ing.base_qty);
      if (ing.unit === 'kg') qtyGrams *= 1000;
      return {
        item_id: ing.item_id,
        item_name: ing.items?.item_name || "Unknown",
        qty_g: qtyGrams,
        price_per_kg: Number(ing.items?.selling_price || 0)
      };
    });
    setCartIngredients(initialCart);
    setStep(2);
  };

  const updateIngredientQty = (itemId: number, deltaGrams: number) => {
    setCartIngredients(prev => prev.map(ing => {
      if (ing.item_id === itemId) {
        const newQty = Math.max(0, ing.qty_g + deltaGrams);
        return { ...ing, qty_g: newQty };
      }
      return ing;
    }).filter(ing => ing.qty_g > 0));
  };

  const addExtraSpice = (spiceId: string) => {
    if (!spiceId) return;
    const spice = rawSpices.find(s => s.id === Number(spiceId));
    if (!spice) return;
    
    setCartIngredients(prev => {
      const exists = prev.find(p => p.item_id === spice.id);
      if (exists) return prev.map(p => p.item_id === spice.id ? { ...p, qty_g: p.qty_g + 50 } : p);
      return [...prev, { item_id: spice.id, item_name: spice.item_name, qty_g: 50, price_per_kg: Number(spice.selling_price || 0) }];
    });
  };

  const submitOrder = async () => {
    if (!tenantId || !baseMasalaItem) return;
    const paying = Number(amountPaying || 0);

    if (paying > totals.grandTotal) {
      return toast({ title: "Overpayment", description: "Amount paying cannot exceed grand total.", variant: "destructive" });
    }
    if (balanceDue > 0 && customerPhone.length < 10) {
      return toast({ title: "Phone Required", description: "Phone number is required for advance/pending orders.", variant: "destructive" });
    }

    setProcessing(true);
    try {
      // 1. Ensure Customer
      let customerId = foundCustomer?.id || null;
      if (!customerId && customerPhone) {
        const phone = customerPhone.replace(/\D/g, "").slice(-10);
        const { data: newCust } = await (supabase as any).from("customers").insert({ 
          tenant_id: tenantId, full_name: customerName || "Kiosk Walk-in", phone_number: phone, customer_type: "retail" 
        }).select("id").single();
        if (newCust) customerId = newCust.id;
      }

      // 2. Generate Order No
      const { data: latestOrder } = await (supabase as any).from("orders").select("order_number").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      let nextOrderNum = "ORD-1001";
      if (latestOrder?.order_number) {
        const match = latestOrder.order_number.match(/^(.*?)(\d+)$/);
        if (match) nextOrderNum = `${match[1]}${String(parseInt(match[2], 10) + 1).padStart(match[2].length, "0")}`;
      }
      setCompletedOrderNo(nextOrderNum);

      // 3. Create Order
      const paymentStatus = paying >= totals.grandTotal ? "PAID" : paying > 0 ? "PARTIAL" : "PENDING";
      const orderStatus = deliveryDate ? "BOOKED" : "DELIVERED";

      const { data: order, error: orderError } = await (supabase as any).from("orders").insert({
        tenant_id: tenantId, customer_id: customerId, order_number: nextOrderNum,
        source: "WALK_IN", status: orderStatus, payment_status: paymentStatus, total_amount: totals.grandTotal,
        delivery_date: deliveryDate || null
      }).select("id").single();
      
      if (orderError) throw orderError;

      // 4. Create Order Item (The Master Mix)
      const { data: orderItem, error: oiError } = await (supabase as any).from("order_items").insert({
        tenant_id: tenantId, order_id: order.id, item_id: baseMasalaItem.id, quantity: totals.weightKg,
        unit: "kg", price_at_order: totals.grandTotal
      }).select("id").single();
      
      if (oiError) throw oiError;

      // 5. Create Ingredients List
      const ingredientsToInsert = cartIngredients.map(ing => ({
        tenant_id: tenantId, order_item_id: orderItem.id, item_id: ing.item_id,
        custom_quantity: ing.qty_g / 1000, unit: "kg"
      }));
      await (supabase as any).from("order_item_ingredients").insert(ingredientsToInsert);

      // 6. Create Payment Record (If they paid anything)
      if (paying > 0) {
        await (supabase as any).from("payments").insert({
          tenant_id: tenantId, order_id: order.id, customer_id: customerId, amount: paying,
          payment_method: paymentMethod, payment_type: balanceDue > 0 ? "ADVANCE" : "PAYMENT", payment_date: new Date().toISOString()
        });
      }

      setStep(4); // Success Step

    } catch (e: any) {
      toast({ title: "Order Failed", description: e.message, variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const resetKiosk = () => {
    setCartIngredients([]);
    setCustomerName("");
    setCustomerPhone("");
    setFoundCustomer(null);
    setDeliveryDate("");
    setAmountPaying("");
    setSelectedTemplateName("");
    setCompletedOrderNo("");
    setStep(1);
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="min-h-[80vh] flex flex-col items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-orange-600 mb-4" />
          <p className="font-bold text-zinc-500">Loading Kiosk...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="w-full min-h-[calc(100vh-4rem)] bg-gradient-to-br from-orange-50 via-white to-yellow-50 flex flex-col items-center relative overflow-x-hidden font-sans pb-16 sm:pb-20">
        
        {/* Decorative Background Elements */}
        <div className="absolute top-[-5%] left-[-5%] w-[50%] h-[50%] bg-orange-200/30 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute bottom-[-5%] right-[-5%] w-[40%] h-[40%] bg-yellow-200/30 blur-3xl rounded-full pointer-events-none" />

        {/* KIOSK HEADER */}
        <div className="w-full max-w-5xl pt-6 sm:pt-8 pb-4 sm:pb-6 px-4 z-10 text-center relative">
          
          {/* EXPLICIT BACK BUTTONS FOR KIOSK NAVIGATION */}
          {step > 1 && step < 4 && (
            <button 
              onClick={() => setStep(step - 1)} 
              className="absolute left-4 top-8 sm:top-10 bg-white border border-orange-200 text-orange-700 hover:bg-orange-50 px-4 py-2 sm:px-6 sm:py-3 rounded-xl sm:rounded-2xl font-black text-sm sm:text-lg flex items-center gap-2 shadow-sm transition-all active:scale-95 z-20"
            >
              <ChevronLeft className="h-5 w-5 sm:h-6 sm:w-6" /> <span className="hidden sm:inline">मागे / </span>Back
            </button>
          )}

          <div className="inline-flex items-center justify-center gap-2 sm:gap-3 bg-white px-4 sm:px-6 py-1.5 sm:py-2 rounded-full shadow-md border border-orange-100 mb-3 sm:mb-4">
            <Flame className="h-4 w-4 sm:h-5 sm:w-5 text-orange-600" />
            <span className="font-black text-sm sm:text-xl tracking-tight text-zinc-900 uppercase">JMM <span className="text-orange-600">जय महाराष्ट्र मसाले</span></span>
          </div>
          {step === 1 && <h1 className="text-2xl sm:text-4xl font-black text-zinc-900 tracking-tight leading-tight">कोणता मसाला बनवायचा आहे?<br/><span className="text-sm sm:text-2xl text-zinc-600 font-bold mt-1 sm:mt-2 block">Choose Your Base Recipe</span></h1>}
          {step === 2 && <h1 className="text-2xl sm:text-4xl font-black text-zinc-900 tracking-tight leading-tight">जिन्नस आणि वजन तपासा<br/><span className="text-sm sm:text-2xl text-zinc-600 font-bold mt-1 sm:mt-2 block">Customize Ingredients</span></h1>}
          {step === 3 && <h1 className="text-2xl sm:text-4xl font-black text-zinc-900 tracking-tight leading-tight">बिलिंग आणि तपशील<br/><span className="text-sm sm:text-2xl text-zinc-600 font-bold mt-1 sm:mt-2 block">Billing & Checkout</span></h1>}
        </div>

        {/* KIOSK MAIN CONTENT AREA */}
        <div className="w-full max-w-5xl px-3 sm:px-4 z-10 flex-1 flex flex-col">
          
          {/* STEP 1: CHOOSE TEMPLATE */}
          {step === 1 && (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6 animate-in fade-in slide-in-from-bottom-8 duration-500">
              {templates.map(t => (
                <Card 
                  key={t.id} 
                  onClick={() => handleSelectTemplate(t)}
                  className="cursor-pointer border border-orange-100 sm:border-2 sm:border-transparent hover:border-orange-500 hover:shadow-xl transition-all rounded-2xl sm:rounded-[2rem] overflow-hidden bg-white group active:scale-95"
                >
                  <div className="h-24 sm:h-36 bg-orange-50 flex items-center justify-center border-b border-orange-100/50">
                    <img src="https://api.iconify.design/noto:pot-of-food.svg" alt="Masala" className="h-12 w-12 sm:h-20 sm:w-20 group-hover:scale-110 transition-transform drop-shadow-md" />
                  </div>
                  <CardContent className="p-3 sm:p-6 text-center">
                    <h3 className="text-base sm:text-2xl font-black text-zinc-900 leading-tight mb-1 sm:mb-2 line-clamp-2">{t.template_name}</h3>
                    <p className="text-[10px] sm:text-sm font-bold text-orange-600 uppercase tracking-widest">{t.template_ingredients.length} Spices included</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* STEP 2: CUSTOMIZE INGREDIENTS */}
          {step === 2 && (
            <div className="flex flex-col lg:flex-row gap-4 sm:gap-6 h-full animate-in fade-in slide-in-from-right-8 duration-500">
              
              {/* Left: Ingredients List */}
              <div className="flex-1 bg-white rounded-3xl sm:rounded-[2rem] shadow-md sm:shadow-xl border border-orange-200 overflow-hidden flex flex-col h-[55vh] lg:h-[65vh]">
                <div className="p-4 sm:p-6 bg-orange-50 border-b border-orange-200 flex justify-between items-center">
                  <h3 className="font-black text-lg sm:text-2xl text-zinc-900 truncate pr-2">{selectedTemplateName}</h3>
                  <div className="text-right shrink-0">
                     <p className="text-[10px] sm:text-xs font-bold text-orange-600 uppercase tracking-widest">Total Weight</p>
                     <p className="font-black text-xl sm:text-2xl text-zinc-900">{totals.weightKg.toFixed(3)} kg</p>
                  </div>
                </div>
                
                <div className="flex-1 overflow-y-auto p-2 sm:p-5 space-y-2 sm:space-y-3 scrollbar-none bg-zinc-50/50">
                  {cartIngredients.map(ing => (
                    <div key={ing.item_id} className="flex flex-row items-center justify-between p-3 sm:p-4 rounded-2xl sm:rounded-[1.5rem] border border-zinc-200 bg-white shadow-sm gap-2 sm:gap-4">
                      <div className="flex-1 min-w-0 pl-1 sm:pl-2">
                        <h4 className="font-bold text-base sm:text-xl text-zinc-900 leading-tight truncate">{ing.item_name}</h4>
                        <p className="text-[10px] sm:text-sm font-bold text-zinc-500 mt-0.5 sm:mt-1 uppercase tracking-wider">₹{ing.price_per_kg} / kg</p>
                      </div>
                      
                      {/* Compact Touch Controls for Weight */}
                      <div className="flex items-center gap-2 sm:gap-4 bg-zinc-50 p-1.5 sm:p-2 rounded-xl sm:rounded-2xl border border-zinc-200 shrink-0">
                        <button onClick={() => updateIngredientQty(ing.item_id, -50)} className="h-10 w-10 sm:h-14 sm:w-14 rounded-lg sm:rounded-xl bg-white border border-zinc-200 text-rose-600 flex items-center justify-center active:bg-rose-50 transition-colors shadow-sm">
                          <Minus className="h-5 w-5 sm:h-7 sm:w-7" strokeWidth={3} />
                        </button>
                        <div className="w-14 sm:w-24 text-center flex flex-col justify-center">
                          <span className="font-black text-base sm:text-2xl text-zinc-900 leading-none">{ing.qty_g}</span>
                          <span className="text-[9px] sm:text-xs font-bold text-zinc-400 uppercase tracking-widest mt-1">Grams</span>
                        </div>
                        <button onClick={() => updateIngredientQty(ing.item_id, 50)} className="h-10 w-10 sm:h-14 sm:w-14 rounded-lg sm:rounded-xl bg-white border border-zinc-200 text-emerald-600 flex items-center justify-center active:bg-emerald-50 transition-colors shadow-sm">
                          <Plus className="h-5 w-5 sm:h-7 sm:w-7" strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {/* Add Extra Spice Dropdown */}
                  <div className="pt-3 sm:pt-4 pb-2 mt-2 px-1">
                    <Label className="text-[10px] sm:text-xs font-bold text-zinc-500 uppercase tracking-widest ml-2 mb-2 block">Add Extra Spices manually</Label>
                    <select 
                      onChange={(e) => { addExtraSpice(e.target.value); e.target.value = ""; }}
                      className="w-full h-14 sm:h-16 bg-white border-2 border-orange-200 rounded-xl sm:rounded-2xl px-4 text-sm sm:text-base font-bold text-zinc-700 outline-none focus:border-orange-500 shadow-sm appearance-none"
                    >
                      <option value="">+ Tap to select a spice to add...</option>
                      {rawSpices.map(s => (
                        <option key={s.id} value={s.id}>{s.item_name} - ₹{s.selling_price}/kg</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Right: Live Bill Summary */}
              <div className="w-full lg:w-96 shrink-0 flex flex-col gap-3 sm:gap-4">
                <Card className="rounded-3xl sm:rounded-[2rem] shadow-xl border-orange-200 bg-white">
                  <CardContent className="p-5 sm:p-8">
                    <h3 className="font-black text-lg sm:text-2xl text-zinc-900 mb-5 sm:mb-8 flex items-center gap-2 border-b border-zinc-100 pb-4"><ShoppingBag className="text-orange-600 h-6 w-6 sm:h-8 sm:w-8" /> Order Summary</h3>
                    
                    <div className="space-y-4 sm:space-y-6 text-sm sm:text-lg">
                      <div className="flex justify-between items-center text-zinc-600 font-bold">
                        <span>Total Weight</span>
                        <span className="text-zinc-900 font-black">{totals.weightKg.toFixed(3)} kg</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-600 font-bold">
                        <span>Material Cost</span>
                        <span className="text-zinc-900 font-black">₹{totals.materialCost}</span>
                      </div>
                      <div className="flex justify-between items-center text-zinc-600 font-bold border-b border-orange-100 pb-5 sm:pb-6">
                        <span>Labour (₹{labourRate}/kg)</span>
                        <span className="text-zinc-900 font-black">₹{totals.labourCost}</span>
                      </div>
                      <div className="flex justify-between items-end pt-2 sm:pt-4">
                        <span className="font-black text-xl sm:text-2xl text-zinc-900 uppercase">Grand Total</span>
                        <span className="font-black text-4xl sm:text-5xl text-orange-600 tracking-tighter">₹{totals.grandTotal}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Button 
                  onClick={() => setStep(3)}
                  className="w-full h-16 sm:h-20 rounded-2xl sm:rounded-3xl bg-orange-600 hover:bg-orange-700 text-white font-black text-xl sm:text-2xl shadow-[0_8px_30px_rgba(234,88,12,0.3)] active:scale-95 transition-all mt-auto"
                >
                  Proceed to Billing <ChevronRight className="ml-2 h-6 w-6 sm:h-8 sm:w-8" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: CUSTOMER & BILLING (ADVANCE/UDHAAR SUPPORT) */}
          {step === 3 && (
            <div className="max-w-4xl mx-auto w-full animate-in fade-in slide-in-from-right-8 duration-500">
              <div className="flex flex-col lg:flex-row gap-6">
                
                {/* LEFT: Customer & Order Meta */}
                <Card className="flex-1 rounded-3xl sm:rounded-[2rem] shadow-lg border-orange-200 bg-white overflow-hidden h-fit">
                  <div className="bg-orange-50 p-5 sm:p-6 border-b border-orange-100">
                     <h3 className="font-black text-lg sm:text-xl text-zinc-900 flex items-center gap-2">
                       <User className="text-orange-600" /> Customer Details
                     </h3>
                  </div>
                  <CardContent className="p-5 sm:p-6 space-y-6">
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label className="text-xs font-black text-zinc-500 uppercase tracking-widest pl-1">Phone Number (Required for Advance)</Label>
                        <div className="relative">
                          <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                          <Input 
                            type="tel" 
                            value={customerPhone}
                            onChange={(e) => handlePhoneChange(e.target.value)}
                            placeholder="10-digit mobile number" 
                            className="h-14 sm:h-16 pl-12 text-lg sm:text-xl font-bold rounded-2xl border-2 border-zinc-200 focus-visible:border-orange-500 focus-visible:ring-0 shadow-sm tracking-widest bg-zinc-50"
                          />
                        </div>
                      </div>

                      {customerPhone.length >= 10 && (
                        <div className="space-y-2 animate-in fade-in zoom-in-95 duration-300">
                          <Label className="text-xs font-black text-zinc-500 uppercase tracking-widest pl-1">Customer Name</Label>
                          <Input 
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Enter full name" 
                            className="h-14 sm:h-16 text-lg sm:text-xl font-bold rounded-2xl border-2 border-zinc-200 focus-visible:border-orange-500 focus-visible:ring-0 shadow-sm bg-zinc-50"
                          />
                        </div>
                      )}

                      <div className="space-y-2 pt-2 border-t border-zinc-100">
                        <Label className="text-xs font-black text-zinc-500 uppercase tracking-widest pl-1">Expected Delivery Date (Optional)</Label>
                        <div className="relative">
                          <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                          <Input 
                            type="date" 
                            value={deliveryDate}
                            onChange={(e) => setDeliveryDate(e.target.value)}
                            className="h-14 sm:h-16 pl-12 text-lg font-bold rounded-2xl border-2 border-zinc-200 focus-visible:border-orange-500 focus-visible:ring-0 shadow-sm bg-zinc-50"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* RIGHT: Payment & Billing Console */}
                <Card className="w-full lg:w-[420px] shrink-0 rounded-3xl sm:rounded-[2rem] shadow-2xl border-orange-200 bg-white overflow-hidden flex flex-col">
                  
                  <div className="bg-zinc-900 p-6 sm:p-8 text-white flex justify-between items-center">
                    <div>
                      <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1">Grand Total</p>
                      <p className="font-black text-4xl sm:text-5xl leading-none">₹{totals.grandTotal}</p>
                    </div>
                  </div>

                  <CardContent className="p-6 sm:p-8 space-y-6 sm:space-y-8 flex-1 flex flex-col">
                    
                    {/* Advance / Paying Amount Input */}
                    <div className="space-y-2">
                      <Label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest pl-1 flex justify-between">
                        <span>Amount Paying Now (₹)</span>
                        {balanceDue > 0 && <span className="text-amber-500">Balance: ₹{balanceDue}</span>}
                      </Label>
                      <Input 
                        type="number" 
                        value={amountPaying}
                        onChange={(e) => setAmountPaying(e.target.value)}
                        className="h-16 sm:h-20 text-3xl sm:text-4xl font-black rounded-2xl border-2 border-zinc-200 focus-visible:border-orange-500 focus-visible:ring-0 shadow-inner text-center bg-zinc-50"
                        placeholder="0"
                      />
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => setAmountPaying(String(totals.grandTotal))} className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border border-zinc-200 shadow-sm">Full Pay</button>
                        <button onClick={() => setAmountPaying(String(Math.floor(totals.grandTotal / 2)))} className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border border-zinc-200 shadow-sm">Half Adv</button>
                        <button onClick={() => setAmountPaying("0")} className="flex-1 bg-rose-50 hover:bg-rose-100 text-rose-700 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors border border-rose-200 shadow-sm">Udhaar</button>
                      </div>
                    </div>

                    {/* Payment Mode Selection */}
                    <div className="space-y-3 pt-2">
                      <Label className="text-[11px] font-black text-zinc-500 uppercase tracking-widest pl-1 block text-center mb-2">Payment Method</Label>
                      <div className="grid grid-cols-2 gap-3">
                        <button 
                          onClick={() => setPaymentMethod("CASH")}
                          className={`h-16 sm:h-20 rounded-2xl flex items-center justify-center gap-2 border-[3px] transition-all active:scale-95 ${paymentMethod === "CASH" ? "border-orange-500 bg-orange-50 text-orange-700 shadow-md" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-orange-200"}`}
                        >
                          <Banknote className={`h-6 w-6 sm:h-8 sm:w-8 ${paymentMethod === "CASH" ? "text-orange-600" : ""}`} />
                          <span className="font-black text-sm sm:text-lg">CASH</span>
                        </button>
                        <button 
                          onClick={() => setPaymentMethod("UPI")}
                          className={`h-16 sm:h-20 rounded-2xl flex items-center justify-center gap-2 border-[3px] transition-all active:scale-95 ${paymentMethod === "UPI" ? "border-emerald-500 bg-emerald-50 text-emerald-700 shadow-md" : "border-zinc-200 bg-zinc-50 text-zinc-500 hover:border-emerald-200"}`}
                        >
                          <CreditCard className={`h-6 w-6 sm:h-8 sm:w-8 ${paymentMethod === "UPI" ? "text-emerald-600" : ""}`} />
                          <span className="font-black text-sm sm:text-lg">UPI</span>
                        </button>
                      </div>
                    </div>

                    <Button 
                      onClick={submitOrder}
                      disabled={processing}
                      className="w-full h-16 sm:h-20 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-black text-xl sm:text-2xl shadow-xl active:scale-95 transition-all mt-auto"
                    >
                      {processing ? <Loader2 className="animate-spin h-6 w-6 sm:h-8 sm:w-8" /> : "Save Bill & Print"}
                    </Button>

                  </CardContent>
                </Card>

              </div>
            </div>
          )}

          {/* STEP 4: SUCCESS */}
          {step === 4 && (
            <div className="max-w-md mx-auto w-full text-center animate-in zoom-in-95 duration-500 mt-10">
              <div className="mx-auto w-20 h-20 sm:w-24 sm:h-24 bg-emerald-100 rounded-full flex items-center justify-center border-4 border-emerald-50 mb-5 sm:mb-6 shadow-xl">
                <CheckCircle2 className="h-10 w-10 sm:h-12 sm:w-12 text-emerald-500" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black text-zinc-900 tracking-tight mb-2">Order Complete!</h2>
              <p className="text-base sm:text-lg font-bold text-zinc-500 mb-8">Bill No: <span className="text-zinc-900 bg-white px-2.5 sm:px-3 py-1 rounded-lg border border-zinc-200 shadow-sm">{completedOrderNo}</span></p>
              
              <div className="flex flex-col gap-4">
                <Button onClick={resetKiosk} className="h-14 sm:h-16 rounded-xl sm:rounded-2xl bg-orange-600 hover:bg-orange-700 text-white font-black text-lg sm:text-xl shadow-lg active:scale-95 transition-all">
                  Start New Order
                </Button>
              </div>
            </div>
          )}

        </div>
      </div>
    </AppLayout>
  );
}