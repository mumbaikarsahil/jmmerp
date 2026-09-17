import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Camera, Search, X, ShoppingCart, ScanLine, Minus, Plus, Trash2,
  UserRound, Phone, ChevronRight, CreditCard, Banknote, Package, Scale, 
  FlaskConical, CheckCircle2, RotateCcw, Edit3, Receipt, Mic, ArrowLeft, ChevronDown, Printer, MessageCircle
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/supabase";

export type Item = Database["public"]["Tables"]["items"]["Row"];
type PaymentMethod = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER";

type PaymentEntry = {
  id: string;
  method: PaymentMethod;
  amount: number;
};

type CustomIngredient = {
  item_id: number;
  item_name: string;
  qty: number;
  unit: string;
  price_per_unit: number; 
  base_unit: string;      
};

export interface OrderCartItem extends Item {
  cartId: string;
  cartQuantity: number;
  customIngredients: CustomIngredient[];
  sourceTemplateId?: string | null;
}

type Customer = {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  customer_type: string | null;
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

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value || 0);

const getItemDisplayUnit = (item: Item) => {
  const type = (item as any).item_type;
  if (type === "RAW_MATERIAL") return (item as any).base_unit || "kg";
  return (item as any).base_unit || "piece";
};

const isWeightedItem = (item: Item) => {
  const type = (item as any).item_type;
  return type === "RAW_MATERIAL" || ["kg", "g", "litre", "ml"].includes(String((item as any).base_unit || "").toLowerCase());
};

const getSafeItemName = (item: Item) => item.item_name || "Unnamed Item";

const StockBadge = ({ item }: { item: Item }) => {
  const quantity = Number((item as any).quantity || 0);
  const unit = getItemDisplayUnit(item);
  if (!(item as any).track_inventory) return null;

  return (
    <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500">
      <span className={`h-1.5 w-1.5 rounded-full ${quantity <= 0 ? "bg-rose-500" : quantity <= 5 ? "bg-amber-500" : "bg-emerald-500"}`} />
      <span>{quantity} {unit !== "piece" ? ` ${unit}` : ""}</span>
    </div>
  );
};

const EmptyCart = () => (
  <div className="flex h-full min-h-[250px] flex-col items-center justify-center px-6 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-zinc-50 border border-zinc-100">
      <ShoppingCart className="h-6 w-6 text-zinc-300" />
    </div>
    <h3 className="text-sm font-semibold text-zinc-900">Ledger is empty</h3>
    <p className="mt-1 max-w-[240px] text-xs text-zinc-500">Add items to begin transaction.</p>
  </div>
);

const SwipeToCheckout = ({ cartCount, total, onCheckout }: { cartCount: number, total: number, onCheckout: () => void }) => {
  const [dragProgress, setDragProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const getMaxDrag = () => {
    if (!containerRef.current) return 250;
    return containerRef.current.offsetWidth - 60; 
  };

  const handleStart = (clientX: number) => {
    setIsDragging(true);
    startXRef.current = clientX - (dragProgress * getMaxDrag());
  };

  const handleMove = (clientX: number) => {
    if (!isDragging) return;
    let newX = clientX - startXRef.current;
    newX = Math.max(0, Math.min(newX, getMaxDrag()));
    setDragProgress(newX / getMaxDrag());
  };

  const handleEnd = () => {
    setIsDragging(false);
    if (dragProgress > 0.85) {
      onCheckout();
      setTimeout(() => setDragProgress(0), 500); 
    } else {
      setDragProgress(0);
    }
  };

  return (
    <div 
      ref={containerRef}
      className="relative h-[60px] bg-zinc-900 rounded-full flex items-center overflow-hidden shadow-2xl select-none touch-none border border-zinc-800"
      onMouseLeave={() => isDragging && handleEnd()}
      onMouseUp={() => isDragging && handleEnd()}
      onMouseMove={(e) => isDragging && handleMove(e.clientX)}
      onTouchEnd={() => isDragging && handleEnd()}
      onTouchMove={(e) => isDragging && handleMove(e.touches[0].clientX)}
    >
      <div 
        className="absolute left-0 top-0 bottom-0 bg-emerald-500 rounded-full"
        style={{ width: `calc(52px + 8px + ${dragProgress * getMaxDrag()}px)`, opacity: dragProgress > 0.05 ? 1 : 0, transition: isDragging ? 'none' : 'width 0.3s ease-out, opacity 0.3s' }} 
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={`text-[13px] font-bold tracking-widest uppercase transition-colors duration-200 z-10 ${dragProgress > 0.4 ? 'text-white' : 'text-zinc-300'}`}>
          {dragProgress > 0.85 ? 'Release to Pay' : `Swipe to Pay ${formatCurrency(total)}`}
        </span>
      </div>
      <div className={`absolute right-4 top-1/2 -translate-y-1/2 transition-opacity duration-200 pointer-events-none z-10 ${dragProgress > 0.1 ? 'opacity-0' : 'opacity-100'}`}>
         <div className="bg-white/20 text-white text-[11px] font-bold px-2 py-1 rounded-md">
           {cartCount} {cartCount === 1 ? 'ITEM' : 'ITEMS'}
         </div>
      </div>
      <div 
        className="absolute left-[4px] h-[52px] w-[52px] bg-white rounded-full flex items-center justify-center shadow-md cursor-grab active:cursor-grabbing z-20"
        style={{ transform: `translateX(${dragProgress * getMaxDrag()}px)`, transition: isDragging ? 'none' : 'transform 0.3s ease-out' }}
        onMouseDown={(e) => handleStart(e.clientX)}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      >
        <ChevronRight className={`h-6 w-6 text-zinc-900 transition-transform ${dragProgress > 0.85 ? 'rotate-90 text-emerald-600' : ''}`} />
      </div>
    </div>
  );
};

export default function Billing() {
  const { toast } = useToast();
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [billingUser, setBillingUser] = useState({ name: "Admin", role: "Manager" });
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [rawMaterials, setRawMaterials] = useState<Item[]>([]);
  const [masalaTemplates, setMasalaTemplates] = useState<MasalaTemplate[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [quickCategories, setQuickCategories] = useState<string[]>([]);
  const [quickQuantity, setQuickQuantity] = useState("1");
  const [cart, setCart] = useState<OrderCartItem[]>([]);

  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);

  const [orderNumber, setOrderNumber] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentMethodInput, setPaymentMethodInput] = useState<PaymentMethod>("CASH");

  // UI STATE
  const [mobileCheckoutOpen, setMobileCheckoutOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false); 
  const [scannerOpen, setScannerOpen] = useState(false);
  
  // Custom Masala States
  const [showCustomMasala, setShowCustomMasala] = useState(false);
  const [customizingCartId, setCustomizingCartId] = useState<string | null>(null);
  const [tempCustomIngredients, setTempCustomIngredients] = useState<CustomIngredient[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [masalaMultiplier, setMasalaMultiplier] = useState<number>(1);
  const [customPrice, setCustomPrice] = useState<number | "">("");
  
  // LABOUR CHARGE STATE
  const [labourRate, setLabourRate] = useState<number>(80); 
  const [labourItemId, setLabourItemId] = useState<number | null>(null);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [weightDialogOpen, setWeightDialogOpen] = useState(false);
  const [weightedItem, setWeightedItem] = useState<Item | null>(null);
  const [weightInput, setWeightInput] = useState("");

  const [printType, setPrintType] = useState<"LABEL" | "RECEIPT" | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Calculations
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.selling_price || 0) * item.cartQuantity, 0), [cart]);
  const finalTotal = Math.max(0, subtotal - discountAmount);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = Math.max(0, finalTotal - totalPaid);

  useEffect(() => {
    if (balanceDue > 0 && payments.length === 0) {
      setPaymentAmountInput(String(balanceDue));
    } else if (balanceDue === 0) {
      setPaymentAmountInput("");
    }
  }, [balanceDue, mobileCheckoutOpen, paymentDialogOpen]);

  // --- SMART PRICING ENGINE FOR MASALA ---
  const totalMixWeightKg = useMemo(() => {
    return tempCustomIngredients.reduce((sum, ing) => {
      let normalizedQty = ing.qty || 0;
      if (ing.unit === 'g') normalizedQty = ing.qty / 1000;
      return sum + normalizedQty;
    }, 0);
  }, [tempCustomIngredients]);

  const materialCost = useMemo(() => {
    return tempCustomIngredients.reduce((sum, ing) => {
      let normalizedQty = ing.qty || 0;
      if (ing.unit === 'g' && ing.base_unit === 'kg') normalizedQty = ing.qty / 1000;
      else if (ing.unit === 'kg' && ing.base_unit === 'g') normalizedQty = ing.qty * 1000;
      return sum + (normalizedQty * (ing.price_per_unit || 0));
    }, 0);
  }, [tempCustomIngredients]);

  // LABOUR CALCULATION FIX: Based purely on the multiplier value
  const calculatedLabourCharge = masalaMultiplier * labourRate;

  useEffect(() => {
    if (showCustomMasala) {
      setCustomPrice(Math.round(materialCost + calculatedLabourCharge));
    }
  }, [materialCost, calculatedLabourCharge, showCustomMasala]);


  useEffect(() => {
    const handlePopState = () => { if (mobileCheckoutOpen) setMobileCheckoutOpen(false); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [mobileCheckoutOpen]);

  const openMobileCheckout = () => {
    setMobileCheckoutOpen(true);
    window.history.pushState({ modal: 'checkout' }, '', window.location.pathname + '#checkout');
  };

  const closeMobileCheckout = () => {
    if (window.location.hash === '#checkout') window.history.back(); 
    else setMobileCheckoutOpen(false);
  };

  useEffect(() => {
    const initialize = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profileData } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
      const p = profileData as any;
      if (!p?.tenant_id) return;
      setBillingUser({ name: p.full_name || "Admin", role: p.role || "Staff" });
      setCurrentTenantId(p.tenant_id);
      
      await Promise.all([
        fetchAllTenantData(p.tenant_id), 
        fetchTemplates(p.tenant_id), 
        fetchNextOrderNumber(p.tenant_id),
        fetchLabourRate(p.tenant_id)
      ]);
    };
    initialize();
  }, []);

  const fetchLabourRate = async (tenantId: string) => {
    let { data } = await (supabase as any).from("items")
      .select("id, selling_price")
      .eq("tenant_id", tenantId)
      .eq("item_name", "Labour Charge (मजूरी)")
      .maybeSingle();

    if (!data) {
      const { data: newItem } = await (supabase as any).from("items").insert({
        tenant_id: tenantId,
        item_code: "LABOUR",
        item_name: "Labour Charge (मजूरी)",
        item_type: "SERVICE",
        base_unit: "kg",
        selling_price: 80, 
        track_inventory: false,
        is_sellable: false
      }).select("id, selling_price").single();
      data = newItem;
    }
    if (data) {
      setLabourItemId(data.id);
      setLabourRate(Number(data.selling_price || 0));
    }
  };

  const fetchAllTenantData = async (tenantId: string) => {
    const { data, error } = await (supabase as any).from("items").select("*").eq("tenant_id", tenantId).eq("is_sellable", true).order("item_name", { ascending: true });
    if (error || !data) return;
    setAllItems(data);
    setRawMaterials(data.filter((item: Item) => (item as any).item_type === "RAW_MATERIAL"));
    const rawCats = data.map((item: Item) => item.category).filter(Boolean) as string[];
    setQuickCategories(Array.from(new Set(rawCats)));
  };

  const fetchTemplates = async (tenantId: string) => {
    const { data } = await (supabase as any).from("masala_templates").select(`id, template_name, template_ingredients (item_id, base_qty, unit, items (item_name, selling_price, base_unit))`).eq("tenant_id", tenantId).order("template_name", { ascending: true });
    if (data) setMasalaTemplates(data);
  };

  const fetchNextOrderNumber = async (tenantId: string) => {
    const { data } = await (supabase as any).from("orders").select("order_number").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const latest = data?.order_number;
    if (!latest) return setOrderNumber("ORD-1001");
    const match = latest.match(/^(.*?)(\d+)$/);
    if (!match) return setOrderNumber(`${latest}-1`);
    const next = parseInt(match[2], 10) + 1;
    setOrderNumber(`${match[1]}${String(next).padStart(match[2].length, "0")}`);
  };

  const findCustomerByPhone = useCallback(async (phone: string) => {
    if (!currentTenantId) return;
    const normalized = phone.replace(/\D/g, "").slice(-10);
    if (normalized.length < 10) return setFoundCustomer(null);
    try {
      const { data } = await (supabase as any).from("customers").select("*").eq("tenant_id", currentTenantId).eq("phone_number", normalized).maybeSingle();
      if (data) {
        setFoundCustomer(data);
        setCustomerName(data.full_name || "");
      } else setFoundCustomer(null);
    } catch(e) {}
  }, [currentTenantId]);

  const handlePhoneChange = (value: string) => {
    setCustomerPhone(value);
    const digits = value.replace(/\D/g, "");
    if (digits.length === 10) findCustomerByPhone(digits);
    else setFoundCustomer(null);
  };

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return toast({title: "Not supported", description: "Browser does not support voice search.", variant: "destructive"});
    const recognition = new SpeechRecognition();
    recognition.lang = 'mr-IN'; 
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e: any) => setSearchTerm(e.results[0][0].transcript);
    recognition.start();
  };

  const displayItems = useMemo(() => {
    const queryWords = searchTerm.trim().toLowerCase().split(/\s+/);
    return allItems.filter((item) => {
      const name = getSafeItemName(item).toLowerCase();
      const code = String(item.item_code || "").toLowerCase();
      const matchesSearch = queryWords.every(word => name.includes(word) || code.includes(word));
      const category = item.category || "OTHER";
      const matchesCategory = selectedCategory === "ALL" || category === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [allItems, searchTerm, selectedCategory]);

  const addItemToCart = (item: Item, quantity = 1) => {
    if (quantity <= 0) return;
    if (item.item_name === "Custom Masala Blend" || item.item_name === "Yearly Masala") {
       startCustomMasalaOrder();
       return;
    }
    if (isWeightedItem(item)) {
      setWeightedItem(item);
      setWeightInput("");
      setWeightDialogOpen(true);
      return;
    }
    setCart((previous) => {
      const existingIndex = previous.findIndex((cartItem) => cartItem.id === item.id && cartItem.customIngredients.length === 0);
      if (existingIndex >= 0) {
        const copy = [...previous];
        copy[existingIndex] = { ...copy[existingIndex], cartQuantity: copy[existingIndex].cartQuantity + quantity };
        return copy;
      }
      return [...previous, { ...item, cartId: crypto.randomUUID(), cartQuantity: quantity, customIngredients: [] }];
    });
  };

  const confirmWeightedItem = () => {
    if (!weightedItem) return;
    const qty = Number(weightInput);
    if (!qty || qty <= 0) return toast({ title: "Enter a valid quantity", variant: "destructive" });
    setCart((previous) => [...previous, { ...weightedItem, cartId: crypto.randomUUID(), cartQuantity: qty, customIngredients: [] }]);
    setWeightDialogOpen(false);
    setWeightedItem(null);
    setWeightInput("");
  };

  const updateCartQuantity = (cartId: string, nextQuantity: number) => {
    if (nextQuantity <= 0) return setCart((prev) => prev.filter((item) => item.cartId !== cartId));
    setCart((prev) => prev.map((item) => item.cartId === cartId ? { ...item, cartQuantity: nextQuantity } : item));
  };

  const removeCartItem = (cartId: string) => setCart((prev) => prev.filter((item) => item.cartId !== cartId));

  const startCustomMasalaOrder = async () => {
    if (!currentTenantId) return;
    setIsProcessing(true);
    try {
      let { data: baseItem } = await (supabase as any).from("items").select("*").eq("item_name", "Yearly Masala").eq("tenant_id", currentTenantId).maybeSingle();
      if (!baseItem) {
        const { data: newItem } = await (supabase as any).from("items").insert({
          tenant_id: currentTenantId, item_code: `YRLY-${Date.now().toString().slice(-4)}`, item_name: "Yearly Masala",
          item_type: "FINISHED_PRODUCT", base_unit: "kg", selling_price: 0, purchase_price: 0, track_inventory: false, is_sellable: true
        }).select().single();
        baseItem = newItem;
      }
      if (baseItem) {
        setCustomizingCartId(null);
        setSelectedTemplateId("");
        setTempCustomIngredients([]);
        setCustomPrice(""); 
        setMasalaMultiplier(1);
        setShowCustomMasala(true);
      }
    } catch(e) {} finally { setIsProcessing(false); }
  };

  const openEditMix = (item: OrderCartItem) => {
    setCustomizingCartId(item.cartId);
    setTempCustomIngredients([...item.customIngredients]);
    setCustomPrice(Number(item.selling_price || 0));
    setSelectedTemplateId(item.sourceTemplateId || "");
    // Default to 1, as custom adjustments don't easily reverse engineer multiplier
    setMasalaMultiplier(1);
    setShowCustomMasala(true);
  };

  const applyTemplate = (templateId: string, multiplier: number = masalaMultiplier) => {
    const template = masalaTemplates.find((item) => item.id === templateId);
    if (!template) return;
    const ingredients: CustomIngredient[] = template.template_ingredients.map((ing) => ({
      item_id: ing.item_id, 
      item_name: ing.items?.item_name || "Unknown item", 
      qty: Number(ing.base_qty || 0) * multiplier, 
      unit: ing.unit || "g",
      price_per_unit: Number(ing.items?.selling_price || 0),
      base_unit: String(ing.items?.base_unit || "kg")
    }));
    setSelectedTemplateId(templateId);
    setTempCustomIngredients(ingredients);
  };

  const handleMultiplierChange = (val: string) => {
    const multi = Number(val);
    if (multi < 0) return;
    setMasalaMultiplier(multi);
    if (selectedTemplateId) {
      applyTemplate(selectedTemplateId, multi);
    }
  };

  const addCustomIngredient = (itemId: number) => {
    const raw = rawMaterials.find((item) => item.id === itemId);
    if (!raw) return;
    setTempCustomIngredients((prev) => [...prev, { 
      item_id: raw.id, 
      item_name: getSafeItemName(raw), 
      qty: 0, 
      unit: String((raw as any).base_unit || "kg"),
      price_per_unit: Number((raw as any).selling_price || 0),
      base_unit: String((raw as any).base_unit || "kg")
    }]);
  };

  const updateCustomIngredient = (index: number, quantity: number) => {
    setTempCustomIngredients((prev) => prev.map((ing, i) => i === index ? { ...ing, qty: quantity } : ing));
  };

  const removeCustomIngredient = (index: number) => setTempCustomIngredients((prev) => prev.filter((_, i) => i !== index));

  const saveCustomization = async () => {
    if (!customPrice || Number(customPrice) <= 0) return toast({ title: "Enter a selling price", variant: "destructive" });
    
    if (labourItemId && currentTenantId) {
       (supabase as any).from("items").update({ selling_price: labourRate }).eq("id", labourItemId).then();
    }

    if (customizingCartId) {
      setCart((prev) => prev.map((item) => item.cartId === customizingCartId ? { ...item, customIngredients: [...tempCustomIngredients], selling_price: Number(customPrice), sourceTemplateId: selectedTemplateId || null } : item));
    } else {
      const customItem = allItems.find((item) => getSafeItemName(item) === "Yearly Masala" || getSafeItemName(item) === "Custom Masala Blend");
      if (!customItem) return toast({ title: "Item missing", description: "Create 'Yearly Masala' in DB.", variant: "destructive" });
      setCart((prev) => [...prev, { ...customItem, cartId: crypto.randomUUID(), cartQuantity: 1, selling_price: Number(customPrice), customIngredients: [...tempCustomIngredients], sourceTemplateId: selectedTemplateId || null }]);
    }
    setShowCustomMasala(false);
  };

  const addPayment = () => {
    const amount = Number(paymentAmountInput);
    if (!amount || amount <= 0) return toast({ title: "Invalid Amount", description: "Enter an amount greater than 0.", variant: "destructive" });
    if (totalPaid + amount > finalTotal) return toast({ title: "Payment exceeds balance", variant: "destructive" });
    
    setPayments((prev) => [...prev, { id: crypto.randomUUID(), method: paymentMethodInput, amount }]);
    
    const newBalance = finalTotal - (totalPaid + amount);
    if (newBalance > 0) {
      setPaymentAmountInput(String(newBalance));
      setPaymentMethodInput(prev => prev === "CASH" ? "UPI" : "CASH");
    } else {
      setPaymentAmountInput("");
    }
  };

  const removePayment = (id: string) => setPayments((prev) => prev.filter((p) => p.id !== id));

  const ensureCustomer = async (): Promise<Customer | null> => {
    if (!currentTenantId) return null;
    const phone = customerPhone.replace(/\D/g, "").slice(-10);
    if (!phone) return null;
    if (foundCustomer) return foundCustomer;
    const { data: existing } = await (supabase as any).from("customers").select("*").eq("tenant_id", currentTenantId).eq("phone_number", phone).maybeSingle();
    if (existing) return existing;
    const { data: created } = await (supabase as any).from("customers").insert({ tenant_id: currentTenantId, full_name: customerName || null, phone_number: phone, customer_type: "retail" }).select("*").single();
    return created;
  };

  const createOrder = async () => {
    if (!currentTenantId || cart.length === 0) return;
    if (!orderNumber.trim()) return toast({ title: "Order number missing", variant: "destructive" });

    setIsProcessing(true);
    try {
      let customer: Customer | null = null;
      if (customerPhone || customerName || balanceDue > 0 || deliveryDate) customer = await ensureCustomer();
      if (balanceDue > 0 && !customer) throw new Error("Customer phone number is required for pending/credit orders.");

      const paymentStatus = totalPaid >= finalTotal && finalTotal > 0 ? "PAID" : totalPaid > 0 ? "PARTIAL" : "PENDING";
      const orderStatus = deliveryDate ? "BOOKED" : "DELIVERED";

      const { data: order, error: orderError } = await (supabase as any).from("orders").insert({
        tenant_id: currentTenantId, customer_id: customer?.id || null, order_number: orderNumber,
        source: "WALK_IN", status: orderStatus, payment_status: paymentStatus, total_amount: finalTotal,
        delivery_date: deliveryDate || null, notes: null,
      }).select("*").single();

      if (orderError) throw orderError;

      let totalMixWeight = 0;
      for (const cartItem of cart) {
        const { data: orderItem, error: orderItemError } = await (supabase as any).from("order_items").insert({
          tenant_id: currentTenantId, order_id: order.id, item_id: cartItem.id, quantity: cartItem.cartQuantity,
          unit: getItemDisplayUnit(cartItem), price_at_order: Number(cartItem.selling_price || 0),
        }).select("*").single();

        if (orderItemError) throw orderItemError;

        if (cartItem.customIngredients && cartItem.customIngredients.length > 0) {
          // Track weight for receipt
          const weight = cartItem.customIngredients.reduce((s, i) => s + (i.unit === 'g' ? i.qty / 1000 : i.qty), 0);
          totalMixWeight += weight;

          const overrides = cartItem.customIngredients.filter((ing) => ing.qty > 0).map((ing) => ({
            tenant_id: currentTenantId, order_item_id: orderItem.id, item_id: ing.item_id, custom_quantity: ing.qty, unit: ing.unit,
          }));
          if (overrides.length > 0) await (supabase as any).from("order_item_ingredients").insert(overrides);
        }
      }

      if (payments.length > 0) {
        const records = payments.map((p) => ({
          tenant_id: currentTenantId, order_id: order.id, customer_id: customer?.id || null, amount: p.amount,
          payment_method: p.method, payment_type: balanceDue > 0 ? "ADVANCE" : "PAYMENT", payment_date: new Date().toISOString(),
        }));
        await (supabase as any).from("payments").insert(records);
      }

      setCompletedOrder({ 
        ...order, 
        final_amount: finalTotal, 
        subtotal, 
        cartItems: cart,
        customerName: customerName || customer?.full_name || "",
        customerPhone: customerPhone || customer?.phone_number || "",
        totalMixWeightKg: totalMixWeight,
        labourRate: labourRate,
        advancePaid: totalPaid,
        balanceDue: balanceDue,
        discountAmount, 
        payments 
      });
      setShowSuccessModal(true);
      
      setCart([]); setPayments([]); setCustomerPhone(""); setCustomerName(""); setFoundCustomer(null); setDeliveryDate("");
      setDiscountAmount(0); setSearchTerm(""); setSelectedCategory("ALL"); setQuickQuantity("1");
      closeMobileCheckout(); 
      setPaymentDialogOpen(false);
      await fetchNextOrderNumber(currentTenantId);
    } catch (error: any) {
      toast({ title: "Transaction Failed", description: error?.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetBill = async () => {
    setCart([]); setPayments([]); setCustomerPhone(""); setCustomerName(""); setFoundCustomer(null);
    setDeliveryDate(""); setDiscountAmount(0); setSearchTerm(""); setSelectedCategory("ALL"); setQuickQuantity("1");
    if (currentTenantId) await fetchNextOrderNumber(currentTenantId);
  };

  const handlePrintReceipt = () => {
    setPrintType("RECEIPT");
    setTimeout(() => { window.print(); }, 100);
  };

  const handleSendWhatsApp = () => {
    const phone = completedOrder?.customerPhone;
    if (!phone) return toast({ title: "No Phone Number", description: "Cannot send WhatsApp without a customer phone number.", variant: "destructive" });
    
    const PUBLIC_DOMAIN = "https://retail.biillo.com"; 
    const invoiceLink = `${PUBLIC_DOMAIN}/#/invoice/${completedOrder.id}`;
    
    const message = encodeURIComponent(
      `🙏 नमस्कार! Thank you for shopping at *JMM जय महाराष्ट्र मसाले*!\n\n` +
      `🧾 Order No: ${completedOrder.order_number}\n` +
      `💰 Total Amount: ₹${completedOrder.final_amount}\n` +
      `${completedOrder.balanceDue > 0 ? `⏳ Balance Pending: ₹${completedOrder.balanceDue}\n\n` : '\n'}` +
      `View your E-Receipt here:\n${invoiceLink}`
    );
    
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/91${cleanPhone}?text=${message}`, "_blank");
  };

  // RAW JSX for Payment Engine to prevent React remounting & losing input focus
  const renderPaymentEngine = () => (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-zinc-500 uppercase ml-1">Order Details</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Receipt className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="h-11 pl-9 rounded-xl border-zinc-200 shadow-sm font-medium text-sm bg-white" placeholder="Order No."/>
          </div>
          <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="h-11 w-[130px] rounded-xl border-zinc-200 shadow-sm text-xs font-medium bg-white" />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label className="text-[11px] font-semibold text-zinc-500 uppercase ml-1">Customer CRM</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input value={customerPhone} onChange={e => handlePhoneChange(e.target.value)} placeholder="Phone Number (e.g., 9876543210)" className="h-11 pl-9 rounded-xl border-zinc-200 shadow-sm font-medium text-sm bg-white" />
        </div>
        {customerPhone.length >= 10 && (
          <div className="relative mt-2 animate-in fade-in slide-in-from-top-2">
            <UserRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
            <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer Name" className="h-11 pl-9 rounded-xl border-zinc-200 shadow-sm font-medium text-sm bg-white" />
          </div>
        )}
      </div>

      <div className="space-y-2 bg-zinc-50 border border-zinc-200/80 p-3 rounded-xl shadow-sm">
        <div className="flex justify-between items-center mb-1">
           <Label className="text-[11px] font-semibold text-zinc-500 uppercase ml-1">Split Payment Record</Label>
           <span className="text-[11px] font-bold text-zinc-500 bg-white border border-zinc-200 px-2 py-0.5 rounded shadow-sm">Pending: {formatCurrency(balanceDue)}</span>
        </div>
        <div className="flex gap-2">
          <select value={paymentMethodInput} onChange={(e) => setPaymentMethodInput(e.target.value as PaymentMethod)} className="h-11 w-[90px] rounded-xl border border-zinc-300 bg-white px-2 text-xs font-bold outline-none focus:ring-1 focus:ring-zinc-900 shadow-sm">
            <option value="CASH">CASH</option>
            <option value="UPI">UPI</option>
            <option value="CARD">CARD</option>
          </select>
          <Input type="number" value={paymentAmountInput} onChange={(e) => setPaymentAmountInput(e.target.value)} placeholder="Amount" className="h-11 flex-1 rounded-xl border-zinc-300 font-bold text-zinc-900 shadow-sm bg-white" />
          <Button onClick={addPayment} className="h-11 px-4 rounded-xl bg-zinc-900 text-white font-semibold shadow-sm hover:bg-zinc-800">
             {Number(paymentAmountInput) > 0 && Number(paymentAmountInput) < balanceDue ? "Split" : "Add"}
          </Button>
        </div>
        
        {balanceDue > 0 && (
          <div className="flex gap-2 overflow-x-auto scrollbar-none pt-1">
            <button onClick={() => setPaymentAmountInput(String(balanceDue))} className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-700 whitespace-nowrap active:scale-95 transition-all shadow-sm">Full Pay</button>
            <button onClick={() => setPaymentAmountInput(String(Math.floor(balanceDue / 2)))} className="px-3 py-1.5 bg-white border border-zinc-200 rounded-lg text-[11px] font-bold text-zinc-700 whitespace-nowrap active:scale-95 transition-all shadow-sm">Split 50%</button>
            <button onClick={() => { setPayments([]); setPaymentAmountInput(""); }} className="px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-lg text-[11px] font-bold text-rose-700 whitespace-nowrap active:scale-95 transition-all shadow-sm">Zero Advance (Udhaar)</button>
          </div>
        )}

        {payments.length > 0 && (
          <div className="pt-2 mt-2 border-t border-zinc-200/80 space-y-2">
            {payments.map(payment => (
              <div key={payment.id} className="flex justify-between items-center text-sm bg-white p-2 rounded-lg border border-zinc-200 shadow-sm">
                <span className="font-bold text-zinc-700 text-xs">{payment.method}</span>
                <div className="flex items-center gap-3">
                  <span className="font-bold text-emerald-600">{formatCurrency(payment.amount)}</span>
                  <button onClick={() => removePayment(payment.id)} className="text-zinc-400 hover:text-rose-500 bg-zinc-50 p-1 rounded-md"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderCartContent = (compact = false) => (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
        <div>
          <h2 className="font-semibold tracking-tight text-zinc-900">Current Ledger</h2>
          <p className="text-xs font-medium text-zinc-500">{cart.length} items</p>
        </div>
        {cart.length > 0 && (
          <button onClick={resetBill} className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-zinc-600 border border-zinc-200 hover:bg-zinc-50 transition-all">
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {cart.length === 0 ? <EmptyCart /> : (
          <div className="space-y-1">
            {cart.map((item) => {
              const lineTotal = Number(item.selling_price || 0) * item.cartQuantity;
              return (
                <div key={item.cartId} className="group relative flex flex-col gap-2 rounded-xl border border-zinc-100 bg-white p-3 hover:border-zinc-200 transition-colors">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-sm font-semibold text-zinc-900">{getSafeItemName(item)}</h3>
                      <p className="text-[11px] font-medium text-zinc-500">{formatCurrency(Number(item.selling_price || 0))} / {getItemDisplayUnit(item)}</p>
                    </div>
                    <span className="text-sm font-semibold text-zinc-900">{formatCurrency(lineTotal)}</span>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center rounded-lg border border-zinc-200 bg-zinc-50/50 h-9">
                      <button type="button" onClick={() => updateCartQuantity(item.cartId, item.cartQuantity - 1)} className="flex h-full w-9 items-center justify-center text-zinc-600 hover:bg-zinc-100"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="min-w-[2.5rem] text-center text-xs font-semibold text-zinc-900">{item.cartQuantity}</span>
                      <button type="button" onClick={() => updateCartQuantity(item.cartId, item.cartQuantity + 1)} className="flex h-full w-9 items-center justify-center text-zinc-600 hover:bg-zinc-100"><Plus className="h-3.5 w-3.5" /></button>
                    </div>

                    <div className="flex gap-2">
                      {(item as any).item_type === "FINISHED_PRODUCT" && item.customIngredients.length > 0 && (
                        <button onClick={() => openEditMix(item)} className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 transition-colors">
                          <Edit3 className="h-3 w-3" /> Edit Mix
                        </button>
                      )}
                      <button onClick={() => removeCartItem(item.cartId)} className="flex items-center justify-center h-9 w-9 rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {item.customIngredients.length > 0 && (
                    <div className="mt-2 rounded-lg bg-zinc-50 border border-zinc-100 p-2 space-y-1">
                      {item.customIngredients.slice(0, 4).map((ing, idx) => (
                        <div key={idx} className="flex justify-between text-[11px] text-zinc-600">
                          <span className="truncate pr-2 font-medium">• {ing.item_name}</span>
                          <span className="font-mono text-zinc-400">{ing.qty}{ing.unit}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="border-t border-zinc-100 bg-zinc-50/50 p-4 shrink-0 pb-safe">
        <div className="space-y-1.5 text-sm mb-4">
          <div className="flex justify-between text-zinc-500">
            <span className="font-medium text-[11px] uppercase tracking-wider">Subtotal</span>
            <span className="font-semibold text-zinc-800">{formatCurrency(subtotal)}</span>
          </div>
          <div className="flex justify-between pt-2 border-t border-zinc-200 mt-2">
            <span className="font-semibold text-zinc-900">Total</span>
            <span className="text-xl font-bold tracking-tight text-zinc-900">{formatCurrency(finalTotal)}</span>
          </div>
        </div>

        {!compact && (
          <Button disabled={cart.length === 0} onClick={() => setPaymentDialogOpen(true)} className="h-12 w-full rounded-xl bg-zinc-900 text-white font-semibold shadow-sm hover:bg-zinc-800 transition-all">
            Proceed to Checkout <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col bg-zinc-50 font-sans relative">
        
        {/* HEADER & COMMAND BAR */}
        <header className="shrink-0 border-b border-zinc-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          <div className="flex flex-col sm:flex-row gap-3 px-3 sm:px-5 py-3">
            <div className="flex items-center gap-3 w-full">
              <div className="hidden shrink-0 lg:block mr-2">
                <h1 className="text-lg font-semibold tracking-tight text-zinc-900">Billing</h1>
                <p className="text-[11px] font-medium text-zinc-500">Fast counter checkout</p>
              </div>

              <div className="relative min-w-0 flex-1">
                <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
                <Input
                  value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search products or voice search..."
                  className="h-12 rounded-xl border-zinc-200 bg-zinc-50 pl-11 pr-10 text-sm font-medium shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-900 focus:bg-white transition-colors"
                />
                <button onClick={startVoiceSearch} className={`absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${isListening ? 'bg-rose-100 text-rose-600 animate-pulse' : 'text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100'}`}>
                   <Mic className="h-4 w-4" />
                </button>
              </div>

              <Button variant="outline" onClick={() => setScannerOpen(true)} className="h-12 rounded-xl border-zinc-200 bg-white px-3 font-semibold shadow-sm">
                <ScanLine className="h-5 w-5 sm:mr-2 text-zinc-600" />
                <span className="hidden sm:inline">Scan</span>
              </Button>
            </div>
          </div>

          <div className="flex gap-3 overflow-x-auto border-t border-zinc-100 px-3 py-3 scrollbar-none sm:px-5 bg-zinc-50/50 items-center">
            {/* YEARLY MASALA BUTTON */}
            <button onClick={startCustomMasalaOrder} className="flex shrink-0 items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 h-10 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 transition-colors shadow-sm">
              <FlaskConical className="h-4 w-4" /> Yearly Masala
            </button>
            <div className="h-6 w-px bg-zinc-200 shrink-0 mx-1"></div>
            <button onClick={() => setSelectedCategory("ALL")} className={`shrink-0 rounded-lg px-4 h-9 text-xs font-semibold transition-colors border ${selectedCategory === "ALL" ? "bg-white border-zinc-300 text-zinc-900 shadow-sm" : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-900"}`}>
              All
            </button>
            {quickCategories.map((category) => (
              <button key={category} onClick={() => setSelectedCategory(category)} className={`shrink-0 rounded-lg px-4 h-9 text-xs font-semibold capitalize transition-colors border ${selectedCategory === category ? "bg-white border-zinc-300 text-zinc-900 shadow-sm" : "bg-transparent border-transparent text-zinc-500 hover:text-zinc-900"}`}>
                {category.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </header>

        {/* MAIN LAYOUT */}
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
            
            {/* COMPACT NATIVE QUICK QTY CONTROLS */}
            <div className="mb-4 lg:hidden">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 block ml-1">Quick Add Quantity</span>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {[1, 2, 5, 10].map((quantity) => (
                  <button key={quantity} onClick={() => setQuickQuantity(String(quantity))} className={`shrink-0 h-11 w-14 rounded-xl text-sm font-bold transition-all border ${Number(quickQuantity) === quantity ? "bg-zinc-900 border-zinc-900 text-white shadow-md scale-105" : "bg-white border-zinc-200 text-zinc-700 shadow-sm hover:border-zinc-300"}`}>
                    {quantity}
                  </button>
                ))}
                
                {/* NATIVE DIAL SELECT FOR 1-100 */}
                <div className="shrink-0 relative">
                  <select 
                    value={quickQuantity} 
                    onChange={(e) => setQuickQuantity(e.target.value)}
                    className="h-11 w-20 rounded-xl border border-zinc-200 bg-white font-bold text-sm text-center shadow-sm focus-visible:ring-2 focus-visible:ring-zinc-900 appearance-none pl-3 pr-6"
                  >
                    <option value="" disabled>Qty</option>
                    {Array.from({ length: 100 }, (_, i) => i + 1).map(num => (
                      <option key={num} value={num}>{num}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {displayItems.length === 0 ? (
              <div className="flex min-h-[50vh] flex-col items-center justify-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm border border-zinc-100">
                  <Package className="h-6 w-6 text-zinc-400" />
                </div>
                <h3 className="font-semibold text-zinc-900 text-sm">No products found</h3>
                <p className="mt-1 text-xs text-zinc-500">Try another search or category.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 pb-32 lg:pb-4">
                {displayItems.map((item) => {
                  const quantityInCart = cart.filter((cartItem) => cartItem.id === item.id).reduce((sum, cartItem) => sum + cartItem.cartQuantity, 0);
                  const weighted = isWeightedItem(item);

                  return (
                    <Card key={item.id} onClick={() => addItemToCart(item, weighted ? 1 : Math.max(1, Number(quickQuantity) || 1))} className="group cursor-pointer overflow-hidden rounded-2xl border-zinc-200/80 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md active:scale-[0.98]">
                      <div className="flex min-h-[140px] flex-col p-4">
                        <div className="mb-3 flex items-start justify-between gap-2">
                          <span className="flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
                            {weighted ? <><Scale className="h-3 w-3" /> Wgt</> : <><Package className="h-3 w-3" /> Pck</>}
                          </span>
                          <StockBadge item={item} />
                        </div>
                        <div className="flex-1">
                          <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-900">{getSafeItemName(item)}</h3>
                          <p className="mt-0.5 text-[10px] font-medium text-zinc-400">{item.item_code}</p>
                        </div>
                        <div className="mt-3 flex items-end justify-between gap-2">
                          <div>
                            <p className="text-base font-semibold tracking-tight text-zinc-900">{formatCurrency(Number(item.selling_price || 0))}</p>
                            <p className="text-[9px] font-medium text-zinc-400">per {getItemDisplayUnit(item)}</p>
                          </div>
                          {quantityInCart > 0 ? (
                            <span className="rounded-lg bg-emerald-50 border border-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">{quantityInCart} in</span>
                          ) : (
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-600 transition-colors group-hover:bg-zinc-900 group-hover:border-zinc-900 group-hover:text-white">
                              <Plus className="h-4 w-4" />
                            </span>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </main>

          <aside className="hidden w-[380px] shrink-0 border-l border-zinc-200 bg-white xl:flex shadow-[-2px_0_10px_rgba(0,0,0,0.02)]">
            {renderCartContent()}
          </aside>
        </div>

        {/* --- 1. SWIGGY-STYLE FLOATING BOTTOM PILL (MOBILE) --- */}
        {cart.length > 0 && !mobileCheckoutOpen && (
          <div className="fixed bottom-[80px] left-4 right-4 z-40 lg:hidden animate-in fade-in slide-in-from-bottom-4">
            <SwipeToCheckout cartCount={cart.length} total={finalTotal} onCheckout={openMobileCheckout} />
          </div>
        )}

      </div>

      {/* --- 2. STEP 2 FULL-SCREEN MOBILE CHECKOUT (SLIDE FROM RIGHT) --- */}
      {mobileCheckoutOpen && (
        <div className="fixed inset-0 z-[100] bg-zinc-50 flex flex-col animate-in slide-in-from-right-full duration-300 lg:hidden">
          
          <div className="h-14 px-4 bg-white border-b border-zinc-200 flex items-center shrink-0 shadow-sm">
            <button onClick={closeMobileCheckout} className="p-2 -ml-2 text-zinc-600 hover:text-zinc-900 active:bg-zinc-100 rounded-full transition-colors mr-2">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <span className="font-semibold text-lg text-zinc-900">Checkout</span>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
               <div className="bg-zinc-50 border-b border-zinc-100 px-4 py-3 flex justify-between items-center">
                 <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Items in Ledger</span>
                 <span className="text-xs font-bold text-zinc-900 bg-white border border-zinc-200 px-2 py-0.5 rounded-md shadow-sm">{cart.length}</span>
               </div>
               <div className="max-h-[30vh] overflow-y-auto p-4 space-y-3">
                 {cart.map(item => (
                   <div key={item.cartId} className="flex justify-between items-start text-sm pb-2 border-b border-zinc-100 last:border-0 last:pb-0">
                     <div className="flex-1 pr-2">
                       <span className="font-semibold text-zinc-800">{getSafeItemName(item)}</span>
                       <div className="text-[11px] font-medium text-zinc-500 mt-0.5">{item.cartQuantity} x {formatCurrency(item.selling_price)}</div>
                     </div>
                     <span className="font-bold text-zinc-900">{formatCurrency(item.cartQuantity * item.selling_price)}</span>
                   </div>
                 ))}
               </div>
               <div className="bg-zinc-50 border-t border-zinc-100 p-4">
                 <div className="flex justify-between items-center text-lg">
                   <span className="font-semibold text-zinc-600">Total</span>
                   <span className="font-bold text-zinc-900 tracking-tight">{formatCurrency(finalTotal)}</span>
                 </div>
               </div>
            </div>

            {renderPaymentEngine()}

          </div>
          
          <div className="p-4 border-t border-zinc-200 bg-white shrink-0 pb-safe">
            <Button disabled={isProcessing || (balanceDue > 0 && !customerPhone)} onClick={createOrder} className="h-14 w-full rounded-2xl bg-emerald-600 text-base font-semibold text-white shadow-[0_4px_15px_rgba(16,185,129,0.25)] hover:bg-emerald-700 active:scale-[0.98] transition-transform">
              {isProcessing ? "Processing..." : balanceDue > 0 ? `Save Order — ${formatCurrency(balanceDue)} Due` : "Complete Transaction"}
            </Button>
          </div>
        </div>
      )}

      {/* --- DESKTOP ONLY PAYMENT DIALOG --- */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl p-0 overflow-hidden bg-white shadow-2xl border-zinc-200">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 bg-zinc-50/50">
            <div>
              <DialogTitle className="text-base font-semibold text-zinc-900">Order Checkout</DialogTitle>
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider">Review & Pay</p>
            </div>
          </div>

          <div className="p-5 overflow-y-auto max-h-[80vh]">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm text-center mb-6">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400 mb-1">Amount Due</p>
              <p className="text-3xl font-semibold tracking-tight text-zinc-900">{formatCurrency(balanceDue)}</p>
              {totalPaid > 0 && <p className="text-xs font-medium text-emerald-600 mt-2">Paid: {formatCurrency(totalPaid)}</p>}
            </div>

            {renderPaymentEngine()}

            <Button disabled={isProcessing || (balanceDue > 0 && !customerPhone)} onClick={createOrder} className="mt-8 h-12 w-full rounded-xl bg-zinc-900 text-sm font-semibold text-white shadow-sm hover:bg-zinc-800 active:scale-[0.98] transition-transform">
              {isProcessing ? "Processing..." : balanceDue > 0 ? `Save Order — ${formatCurrency(balanceDue)} Due` : "Complete Transaction"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* WEIGHT DIALOG */}
      <Dialog open={weightDialogOpen} onOpenChange={setWeightDialogOpen}>
        <DialogContent className="max-w-sm rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-zinc-900">Enter Quantity</DialogTitle>
            <p className="text-xs font-medium text-zinc-500">{weightedItem ? getSafeItemName(weightedItem) : ""}</p>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <Label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Weight ({weightedItem ? getItemDisplayUnit(weightedItem) : "kg"})</Label>
            <Input autoFocus type="number" step="0.001" inputMode="decimal" value={weightInput} onChange={(e) => setWeightInput(e.target.value)} placeholder="0.00" className="h-14 rounded-2xl text-center text-2xl font-semibold border-zinc-200 focus-visible:ring-1 focus-visible:ring-zinc-900 shadow-sm" />
            <div className="grid grid-cols-4 gap-2 mt-4">
              {[0.25, 0.5, 1, 2].map((value) => (
                <button key={value} onClick={() => setWeightInput(String(value))} className="rounded-xl border border-zinc-200 bg-zinc-50 py-3 text-sm font-semibold text-zinc-700 hover:bg-white hover:border-zinc-300 transition-colors shadow-sm">{value}</button>
              ))}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setWeightDialogOpen(false)} className="h-12 rounded-xl font-semibold border-zinc-200">Cancel</Button>
            <Button onClick={confirmWeightedItem} className="h-12 rounded-xl bg-zinc-900 font-semibold text-white">Confirm Addition</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* YEARLY MASALA MODAL */}
      <Dialog open={showCustomMasala} onOpenChange={setShowCustomMasala}>
        <DialogContent className="max-w-md rounded-2xl p-0 overflow-hidden bg-white shadow-2xl">
          <DialogHeader className="border-b border-zinc-100 px-5 py-4 bg-zinc-50/50">
            <DialogTitle className="text-base font-semibold text-zinc-900">{customizingCartId ? "Edit Yearly Masala" : "Yearly Masala (Varshbharache)"}</DialogTitle>
            <p className="text-[11px] font-medium text-zinc-500 mt-1">Select a template or mix raw spices manually.</p>
          </DialogHeader>
          
          <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
            
            {/* NEW: VOLUME MULTIPLIER AND TEMPLATE SELECTION */}
            <div className="flex gap-3">
               <div className="flex-1 space-y-1.5">
                 <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">1. Base Recipe</Label>
                 <select value={selectedTemplateId} onChange={(e) => applyTemplate(e.target.value)} className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-900 shadow-sm">
                   <option value="">No Template Selected</option>
                   {masalaTemplates.map((t) => (<option key={t.id} value={t.id}>{t.template_name}</option>))}
                 </select>
               </div>
               <div className="w-24 space-y-1.5">
                 <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Multiplier</Label>
                 <Input 
                   type="number" 
                   min="0" 
                   step="1" 
                   value={masalaMultiplier} 
                   onChange={(e) => handleMultiplierChange(e.target.value)} 
                   className="h-12 rounded-xl border-zinc-200 bg-white font-bold text-center shadow-sm" 
                 />
               </div>
            </div>
            
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">2. Configure Ingredients</Label>
              </div>
              <select defaultValue="" onChange={(e) => { if (e.target.value) { addCustomIngredient(Number(e.target.value)); e.currentTarget.value = ""; } }} className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-600 outline-none shadow-sm">
                <option value="">+ Add raw spice material...</option>
                {rawMaterials.map((raw) => (<option key={raw.id} value={raw.id}>{getSafeItemName(raw)}</option>))}
              </select>
              
              <div className="mt-2 space-y-1.5 border border-zinc-100 rounded-xl p-2 bg-zinc-50/50 max-h-[30vh] overflow-y-auto">
                {tempCustomIngredients.length === 0 ? (
                  <p className="text-xs text-center text-zinc-400 py-6 font-medium">No ingredients added yet.</p>
                ) : (
                  tempCustomIngredients.map((ing, idx) => (
                    <div key={`${ing.item_id}-${idx}`} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-sm">
                      <div className="min-w-0 flex-1 pl-2"><p className="truncate text-xs font-semibold text-zinc-900">{ing.item_name}</p></div>
                      <Input type="number" step="0.001" value={ing.qty} onChange={(e) => updateCustomIngredient(idx, Number(e.target.value))} className="h-9 w-20 rounded-md border-zinc-200 text-center font-semibold text-xs shadow-none focus-visible:ring-1 focus-visible:ring-zinc-900" />
                      <span className="text-[10px] font-medium text-zinc-400 w-5">{ing.unit}</span>
                      <button onClick={() => removeCustomIngredient(idx)} className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* SMART PRICING BREAKDOWN */}
            <div className="space-y-3 pt-4 border-t border-zinc-100">
              <div className="flex justify-between items-center text-xs font-semibold text-zinc-600">
                <span>Raw Material Cost</span>
                <span>{formatCurrency(materialCost)}</span>
              </div>
              
              <div className="flex justify-between items-center text-xs font-semibold text-zinc-600">
                <div className="flex items-center gap-2">
                  <span>Labour / मजूरी</span>
                  <span className="text-[10px] bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-500">{masalaMultiplier} batch × ₹{labourRate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Input 
                    type="number" 
                    value={labourRate} 
                    onChange={(e) => setLabourRate(Number(e.target.value))} 
                    className="h-7 w-16 text-xs px-2 text-right border-zinc-200" 
                  />
                  <span className="w-16 text-right">{formatCurrency(calculatedLabourCharge)}</span>
                </div>
              </div>

              <div className="flex justify-between items-center pt-2 border-t border-zinc-100">
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Final Selling Price (₹)</Label>
                <span className="text-[10px] text-zinc-400 font-medium">Auto-calculated</span>
              </div>
              <Input type="number" value={customPrice} onChange={(e) => setCustomPrice(e.target.value ? Number(e.target.value) : "")} className="h-14 rounded-xl border-emerald-200 bg-emerald-50 text-2xl font-bold text-emerald-700 focus-visible:ring-1 focus-visible:ring-emerald-500 shadow-inner text-right" />
            </div>

          </div>
          
          <DialogFooter className="border-t border-zinc-100 bg-zinc-50/50 p-4">
            <Button variant="outline" onClick={() => setShowCustomMasala(false)} className="h-12 rounded-xl font-semibold border-zinc-200 bg-white">Cancel</Button>
            <Button onClick={saveCustomization} className="h-12 rounded-xl bg-zinc-900 font-semibold text-white shadow-sm hover:bg-zinc-800">Save to Ledger</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* SCANNER DIALOG */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent className="max-w-sm overflow-hidden rounded-3xl p-0">
          <DialogHeader className="border-b border-zinc-100 px-5 py-4 bg-zinc-50/50">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-zinc-900"><Camera className="h-4 w-4" /> Scan Barcode</DialogTitle>
          </DialogHeader>
          <div className="bg-black p-2"><div id="billing-scanner" className="min-h-[300px] overflow-hidden rounded-2xl" /></div>
          <div className="p-4"><Button variant="outline" onClick={() => setScannerOpen(false)} className="h-12 w-full rounded-xl font-semibold border-zinc-200 shadow-sm">Close Scanner</Button></div>
        </DialogContent>
      </Dialog>

      {/* SUCCESS MODAL WITH PRINT & WHATSAPP */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="max-w-sm rounded-3xl p-6 text-center border-zinc-200 shadow-2xl bg-white">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 mb-4"><CheckCircle2 className="h-8 w-8 text-emerald-500" /></div>
          <h2 className="text-xl font-bold tracking-tight text-zinc-900">Transaction Complete</h2>
          
          <div className="mt-5 rounded-2xl border border-zinc-100 bg-zinc-50 p-5 shadow-inner">
            <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Amount Recorded</p>
            <p className="mt-1 text-4xl font-black tracking-tight text-zinc-900">{formatCurrency(completedOrder?.final_amount || 0)}</p>
            <p className="mt-2 text-[11px] font-bold text-zinc-500 bg-white border border-zinc-200 shadow-sm rounded-lg px-2.5 py-1 inline-block">{completedOrder?.order_number}</p>
          </div>

          <div className="flex flex-col gap-3 mt-6">
            <div className="grid grid-cols-2 gap-3">
              <Button onClick={handlePrintReceipt} variant="outline" className="h-12 rounded-xl font-bold text-zinc-700 border-zinc-200 shadow-sm hover:bg-zinc-50">
                <Printer className="h-4 w-4 mr-2 text-zinc-500" /> Print Bill
              </Button>
              <Button onClick={handleSendWhatsApp} disabled={!completedOrder?.customerPhone} className="h-12 rounded-xl font-bold bg-[#25D366] text-white shadow-sm hover:bg-[#1DA851] border-none">
                <MessageCircle className="h-4 w-4 mr-2" /> WhatsApp
              </Button>
            </div>
            <Button onClick={() => setShowSuccessModal(false)} className="h-12 w-full rounded-xl bg-zinc-900 font-bold text-white shadow-sm hover:bg-zinc-800">
              Start New Transaction
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- JMM BRANDED PRINTABLE RECEIPT BLOCK --- */}
      {printType === "RECEIPT" && completedOrder && (
        <div id="printable-receipt" className="hidden print:block">
          <style type="text/css" media="print">
            {`
              body * { visibility: hidden; }
              #printable-receipt, #printable-receipt * { visibility: visible; }
              #printable-receipt { 
                position: absolute; left: 0; top: 0; 
                width: 100%; margin: 0; padding: 10px; 
                background: white; color: black; font-family: sans-serif; 
                font-size: 13px;
                -webkit-print-color-adjust: exact !important; 
                print-color-adjust: exact !important;
              }
              @page { size: auto; margin: 0; }
              table { width: 100%; border-collapse: collapse; margin-top: 10px; }
              th, td { border: 1px solid black; padding: 6px; text-align: left; }
              th { font-weight: bold; background-color: #e53935; color: white; }
              .text-right { text-align: right; }
              .text-center { text-align: center; }
              .font-bold { font-weight: bold; }
              .jmm-header { background-color: #8B0000; color: white; padding: 10px; text-align: center; border-bottom: 5px solid #FFC107; }
              .jmm-address { background-color: #FFECB3; color: black; padding: 8px; text-align: center; font-size: 11px; font-weight: bold; }
            `}
          </style>
          
          <div className="jmm-header">
            <h1 className="text-3xl font-black mb-1 tracking-wider m-0">JMM</h1>
            <h2 className="text-xl font-bold m-0">जय महाराष्ट्र मसाले</h2>
          </div>
          
          <div className="jmm-address mb-3 border-b-2 border-black">
            दुकान नं. ३, बाबला मस्जिद, डिलाई रोड, ना. म. जोशी मार्ग, करीरोड, मुंबई - १३.<br/>
            GSTIN : 27AAKPG4562D1ZU • Fssai No.: 11518004000348
          </div>

          <div className="flex justify-between font-bold text-sm mb-2 px-1">
            <div>नाव: {completedOrder.customerName || "Walk-in"}</div>
            <div>दि.: {new Date().toLocaleDateString('en-IN')}</div>
          </div>

          <table>
            <thead>
              <tr>
                <th>तपशील</th>
                <th className="text-center w-24">वजन</th>
                <th className="text-right w-24">रुपये</th>
              </tr>
            </thead>
            <tbody>
              {completedOrder.cartItems.map((item: OrderCartItem, index: number) => {
                if (item.customIngredients.length === 0) {
                  return (
                    <tr key={index}>
                      <td className="font-semibold">{item.item_name}</td>
                      <td className="text-center font-bold">{item.cartQuantity} {item.base_unit || 'pc'}</td>
                      <td className="text-right font-bold">{Math.round(item.cartQuantity * Number(item.selling_price || 0))}</td>
                    </tr>
                  );
                }
                
                return item.customIngredients.filter(ing => ing.qty > 0).map((ing, iIdx) => {
                  let cost = 0;
                  if (ing.unit === 'g') cost = (ing.qty / 1000) * ing.price_per_unit;
                  else if (ing.unit === 'kg') cost = ing.qty * ing.price_per_unit;
                  else if (ing.unit === 'piece') cost = ing.qty * ing.price_per_unit;

                  return (
                    <tr key={`${index}-${iIdx}`}>
                      <td className="font-semibold">{ing.item_name}</td>
                      <td className="text-center font-bold">{ing.qty}</td>
                      <td className="text-right font-bold">{Math.round(cost)}</td>
                    </tr>
                  );
                });
              })}

              {/* Total Calculation Blocks matching the image */}
              <tr className="border-t-[3px] border-black font-black bg-zinc-100">
                <td>एकूण वजन</td>
                <td className="text-center" colSpan={2}>{completedOrder.totalMixWeightKg ? `${completedOrder.totalMixWeightKg.toFixed(3)} kg` : '-'}</td>
              </tr>
              <tr className="font-black bg-zinc-100">
                <td colSpan={2}>मजुरी</td>
                <td className="text-right">{completedOrder.totalMixWeightKg ? Math.round((completedOrder.masalaMultiplier || 1) * completedOrder.labourRate) : 0}</td>
              </tr>
              <tr className="font-black border-t-2 border-black bg-zinc-200">
                <td colSpan={2}>एकूण रुपये</td>
                <td className="text-right text-lg">{Math.round(completedOrder.final_amount)}</td>
              </tr>
              <tr className="font-black">
                <td colSpan={2}>अॅडव्हान्स जमा</td>
                <td className="text-right">{Math.round(completedOrder.advancePaid)}</td>
              </tr>
              <tr className="font-black border-t-2 border-black">
                <td colSpan={2}>एकूण शिल्लक</td>
                <td className="text-right">{Math.round(completedOrder.balanceDue)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}