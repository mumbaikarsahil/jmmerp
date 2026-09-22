import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Camera, Search, X, ShoppingCart, ScanLine, Minus, Plus, Trash2,
  UserRound, Phone, ChevronRight, CreditCard, Banknote, Package, Scale, 
  FlaskConical, CheckCircle2, RotateCcw, Edit3, Receipt, Mic, ArrowLeft, ChevronDown, Printer, MessageCircle, Delete
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/supabase";
import { ThermalReceipt } from "@/components/receipts/ThermalReceipt";

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

type AppliedService = {
  item_id: number;
  item_name: string;
  rate: number;
};

export interface OrderCartItem extends Item {
  cartId: string;
  cartQuantity: number;
  customIngredients: CustomIngredient[];
  sourceTemplateId?: string | null;
  recipeMultiplier?: number;
  appliedServices?: AppliedService[];
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

const normalizeUnitStr = (str: string) => String(str || "").toLowerCase().trim();

// BULLETPROOF NORMALIZATION
const getNormalizedQtyForCost = (qty: number, displayUnit: string, dbBaseUnit: string) => {
  const u = normalizeUnitStr(displayUnit);
  const bu = normalizeUnitStr(dbBaseUnit);
  
  if (u === 'piece' || u === 'nug' || u === 'pcs' || bu === 'piece') return qty;
  if ((u === 'g' || u === 'gm' || u === 'gram' || u === 'grams') && (bu === 'kg' || bu === 'kilogram' || bu === 'kilograms')) return qty / 1000;
  if ((u === 'ml') && (bu === 'l' || bu === 'ltr' || bu === 'liter' || bu === 'liters')) return qty / 1000;
  if (qty >= 10 && bu.includes('kg')) return qty / 1000; // Fallback
  return qty;
};

// TRADITIONAL MASALA SEQUENCE
// EXACT SEQUENCE BASED ON JMM PHYSICAL BILL BOOK
const MASALA_SEQUENCE = [
  "बेडगी", "लवंगी", "काश्मिरी", "मिरची", "धणे", "हळकुंड", "मिरी", "बडीशेप", 
  "खसखस", "लवंग", "दालचिनी", "लालफुल", "चक्रिफुल", "मसाला वेलची", "दगडफुल", 
  "तेजपान", "शहाजिरे", "जायफळ", "जायपत्री", "त्रिफळ", "नागकेशर", "कबाब चिनी",
  "हिंग", "मेथी", "राई", "जिरा", "पिंपळी", "सुंठ", "हिरवी वेलची", "गुलाब पाकळी", 
  "कसुरी मेथी", "ओवा", "खोबरा", "लसूण", "मीठ", "तेल"
];

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

// --- PREMIUM POS NUMPAD COMPONENT (Eliminates iOS Keyboard) ---
// --- PREMIUM POS NUMPAD COMPONENT (Eliminates iOS Keyboard) ---
// --- PREMIUM POS NUMPAD COMPONENT (Eliminates iOS Keyboard) ---
const PosNumpad = ({ value, onChange, allowDecimal = true }: { value: string, onChange: (v: string)=>void, allowDecimal?: boolean }) => {
  const handlePress = (key: string) => {
    if (key === 'DEL') onChange(value.slice(0, -1));
    else if (key === '.' && (!allowDecimal || value.includes('.'))) return;
    else onChange(value + key);
  };
  const keys = ['1','2','3','4','5','6','7','8','9','.', '0','DEL'];
  if (!allowDecimal) keys[9] = '00'; 

  return (
    <div className="grid grid-cols-3 gap-2 sm:gap-3 w-full max-w-[320px] mx-auto">
      {keys.map(k => (
         <button 
           key={k} type="button" onClick={() => handlePress(k)}
           className={`h-14 sm:h-16 rounded-2xl text-2xl font-bold shadow-sm flex items-center justify-center transition-all active:scale-95 ${k === 'DEL' ? 'bg-rose-50 text-rose-500 border border-rose-100 hover:bg-rose-100' : 'bg-white border border-zinc-200/80 text-zinc-800 hover:bg-zinc-50 hover:border-zinc-300'}`}
         >
           {k === 'DEL' ? <Delete className="h-6 w-6"/> : k}
         </button>
      ))}
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

const SwipeAction = ({ label, onSwipe, disabled = false, cartCount = 0, variant = 'default' }: { label: string | React.ReactNode, onSwipe: () => void, disabled?: boolean, cartCount?: number, variant?: 'default' | 'success' }) => {
  const [dragProgress, setDragProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startXRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const getMaxDrag = () => {
    if (!containerRef.current) return 250;
    return containerRef.current.offsetWidth - 64; 
  };

  const handleStart = (clientX: number) => {
    if (disabled) return;
    setIsDragging(true);
    startXRef.current = clientX - (dragProgress * getMaxDrag());
  };

  const handleMove = (clientX: number) => {
    if (!isDragging || disabled) return;
    let newX = clientX - startXRef.current;
    newX = Math.max(0, Math.min(newX, getMaxDrag()));
    setDragProgress(newX / getMaxDrag());
  };

  const handleEnd = () => {
    if (disabled) return;
    setIsDragging(false);
    if (dragProgress > 0.85) {
      onSwipe();
      setTimeout(() => setDragProgress(0), 400); 
    } else {
      setDragProgress(0);
    }
  };

  const isSuccess = variant === 'success';

  return (
    <div 
      ref={containerRef}
      className={`relative h-[64px] rounded-[24px] flex items-center overflow-hidden select-none touch-none border-2 transition-colors ${disabled ? 'bg-zinc-100 border-zinc-200' : (isSuccess ? 'bg-emerald-600 border-emerald-600 shadow-xl shadow-emerald-600/20' : 'bg-zinc-900 border-zinc-900 shadow-xl')}`}
      onMouseLeave={() => isDragging && handleEnd()}
      onMouseUp={() => isDragging && handleEnd()}
      onMouseMove={(e) => isDragging && handleMove(e.clientX)}
      onTouchEnd={() => isDragging && handleEnd()}
      onTouchMove={(e) => isDragging && handleMove(e.touches[0].clientX)}
    >
      <div 
        className={`absolute left-0 top-0 bottom-0 rounded-[24px] ${disabled ? 'bg-zinc-200' : (isSuccess ? 'bg-emerald-500' : 'bg-emerald-500')}`}
        style={{ width: `calc(52px + 8px + ${dragProgress * getMaxDrag()}px)`, opacity: dragProgress > 0.05 ? 1 : 0, transition: isDragging ? 'none' : 'width 0.3s ease-out, opacity 0.3s' }} 
      />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <span className={`text-[13px] font-bold tracking-[0.2em] uppercase transition-colors duration-200 z-10 ${dragProgress > 0.4 ? 'text-white' : (disabled ? 'text-zinc-400' : (isSuccess ? 'text-emerald-50' : 'text-zinc-300'))}`}>
          {dragProgress > 0.85 ? 'Release' : label}
        </span>
      </div>
      {cartCount > 0 && (
      <div className={`absolute right-4 top-1/2 -translate-y-1/2 transition-opacity duration-200 pointer-events-none z-10 ${dragProgress > 0.1 ? 'opacity-0' : 'opacity-100'}`}>
         <div className="bg-white/20 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-lg">
           {cartCount} {cartCount === 1 ? 'ITEM' : 'ITEMS'}
         </div>
      </div>
      )}
      <div 
        className={`absolute left-[4px] h-[52px] w-[52px] bg-white rounded-[20px] flex items-center justify-center shadow-md z-20 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-grab active:cursor-grabbing'}`}
        style={{ transform: `translateX(${dragProgress * getMaxDrag()}px)`, transition: isDragging ? 'none' : 'transform 0.3s ease-out' }}
        onMouseDown={(e) => handleStart(e.clientX)}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      >
        <ChevronRight className={`h-6 w-6 transition-transform ${disabled ? 'text-zinc-400' : 'text-zinc-900'} ${dragProgress > 0.85 ? 'rotate-90 text-emerald-600' : ''}`} />
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

// UI Modals
const [checkoutOpen, setCheckoutOpen] = useState(false); // Mobile/iPad Full Screen
const [checkoutStep, setCheckoutStep] = useState(1);
const [paymentDialogOpen, setPaymentDialogOpen] = useState(false); // Desktop Popup
const [scannerOpen, setScannerOpen] = useState(false);

  
  
  // Custom Masala States
  const [showCustomMasala, setShowCustomMasala] = useState(false);
  const [customizingCartId, setCustomizingCartId] = useState<string | null>(null);
  const [tempCustomIngredients, setTempCustomIngredients] = useState<CustomIngredient[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [masalaMultiplier, setMasalaMultiplier] = useState<number>(1);
  const [customPrice, setCustomPrice] = useState<number | "">("");
  
  // DYNAMIC SERVICES STATE
  const [availableServices, setAvailableServices] = useState<Item[]>([]);
  const [activeServices, setActiveServices] = useState<AppliedService[]>([]);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // SMART WEIGHT STATE
  const [weightDialogOpen, setWeightDialogOpen] = useState(false);
  const [weightedItem, setWeightedItem] = useState<Item | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [weightInputMode, setWeightInputMode] = useState<'quick'|'custom'>('quick');

  // Global POS Numpad Dialog State
  const [numpadConfig, setNumpadConfig] = useState<{isOpen: boolean, title: string, value: string, allowDecimal: boolean, onConfirm: (v: string)=>void}>({ isOpen: false, title: "", value: "", allowDecimal: true, onConfirm: ()=>{} });

  const [printType, setPrintType] = useState<"LABEL" | "RECEIPT" | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasAutoOpened = useRef(false);

  // SMART GRIDS FOR QUICK WEIGHT
  const SPICE_WEIGHTS = [
    { label: '10g', val: 0.01 }, { label: '20g', val: 0.02 }, { label: '25g', val: 0.025 },
    { label: '50g', val: 0.05 }, { label: '100g', val: 0.1 }, { label: '200g', val: 0.2 },
    { label: '250g', val: 0.25 }, { label: '500g', val: 0.5 }, { label: '750g', val: 0.75 },
    { label: '1kg', val: 1 }, { label: '2kg', val: 2 }, { label: '3kg', val: 3 }
  ];

  const LIQUID_WEIGHTS = [
    { label: '1L', val: 1 }, { label: '5L', val: 5 }, { label: '10L', val: 10 }, { label: '15L', val: 15 }
  ];

  // Calculations
  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.selling_price || 0) * item.cartQuantity, 0), [cart]);
  const finalTotal = Math.max(0, subtotal - discountAmount);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = Math.max(0, finalTotal - totalPaid);

  useEffect(() => {
    if (balanceDue > 0 && payments.length === 0) setPaymentAmountInput(String(balanceDue));
    else if (balanceDue === 0) setPaymentAmountInput("");
  }, [balanceDue, checkoutOpen, paymentDialogOpen]);

  // --- STRICT SEQUENCE SORTING ---
  const sortedCustomIngredients = useMemo(() => {
    return [...tempCustomIngredients].sort((a, b) => {
      let idxA = MASALA_SEQUENCE.findIndex(seq => a.item_name.includes(seq));
      let idxB = MASALA_SEQUENCE.findIndex(seq => b.item_name.includes(seq));
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
  }, [tempCustomIngredients]);

  // --- SMART PRICING ENGINE ---
  const totalMixWeightKg = useMemo(() => {
    return tempCustomIngredients.reduce((sum, ing) => {
      const u = normalizeUnitStr(ing.unit);
      if (u === 'piece' || u === 'nug' || u === 'pcs') return sum;
      
      let normalizedQty = Number(ing.qty) || 0;
      if (u === 'g' || u === 'gm' || u === 'gram') normalizedQty = normalizedQty / 1000;
      return sum + normalizedQty;
    }, 0);
  }, [tempCustomIngredients]);

  const materialCost = useMemo(() => {
    return tempCustomIngredients.reduce((sum, ing) => {
      const unit = String(ing.unit || "g").toLowerCase().trim();
      const baseUnit = String(ing.base_unit || "kg").toLowerCase().trim();
      let qtyForPricing = Number(ing.qty) || 0;

      if (unit === 'piece' || unit === 'nug' || unit === 'pcs' || baseUnit === 'piece' || baseUnit === 'nug') {
          return sum + (qtyForPricing * Number(ing.price_per_unit || 0));
      }

      if (unit === 'g' || unit === 'gm' || unit === 'gram' || qtyForPricing >= 20) {
          qtyForPricing = qtyForPricing / 1000;
      }

      return sum + (qtyForPricing * Number(ing.price_per_unit || 0));
    }, 0);
  }, [tempCustomIngredients]);

  const calculatedServicesCharge = useMemo(() => {
    return activeServices.reduce((sum, svc) => sum + (masalaMultiplier * svc.rate), 0);
  }, [activeServices, masalaMultiplier]);

  useEffect(() => {
    if (showCustomMasala) {
      setCustomPrice(Math.round(materialCost + calculatedServicesCharge));
    }
  }, [materialCost, calculatedServicesCharge, showCustomMasala]);


 

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
        fetchServices(p.tenant_id)
      ]);
    };
    initialize();
  }, []);

  // DASHBOARD URL HANDSHAKE
  useEffect(() => {
    if (currentTenantId && !hasAutoOpened.current) {
      const params = new URLSearchParams(location.search);
      const action = params.get("action");
      const cat = params.get("category");
      const search = params.get("search");

      if (cat) setSelectedCategory(cat.replace(/_/g, " "));
      if (search) setSearchTerm(search);
      if (action === "yearly_masala") {
        startCustomMasalaOrder();
      }
      hasAutoOpened.current = true;
    }
  }, [currentTenantId, location.search]);

  const fetchServices = async (tenantId: string) => {
    const { data } = await (supabase as any).from("items").select("*").eq("tenant_id", tenantId).eq("item_type", "SERVICE").order("item_name", { ascending: true });
    if (data) setAvailableServices(data);
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
      const englishName = String((item as any).english_name || "").toLowerCase();
      
      const matchesSearch = queryWords.every(
        (word) => name.includes(word) || code.includes(word) || englishName.includes(word)
      );
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
        
        // Auto apply default services (Labour and Oil)
        const defaultServices = availableServices
          .filter(s => 
            s.item_name.includes("Labour") || s.item_name.includes("मजूरी") || 
            s.item_name.includes("Oil") || s.item_name.includes("तेल")
          )
          .map(svc => ({
            item_id: svc.id, 
            item_name: svc.item_name, 
            rate: Number(svc.selling_price || 0)
          }));

        setActiveServices(defaultServices);
        setShowCustomMasala(true);
      }
    } catch(e) {} finally { setIsProcessing(false); }
  };

  const openEditMix = (item: OrderCartItem) => {
    setCustomizingCartId(item.cartId);
    setTempCustomIngredients([...item.customIngredients]);
    setCustomPrice(Number(item.selling_price || 0));
    setSelectedTemplateId(item.sourceTemplateId || "");
    setMasalaMultiplier(item.recipeMultiplier || 1);
    setActiveServices(item.appliedServices || []);
    setShowCustomMasala(true);
  };

  const applyTemplate = (templateId: string, multiplier: number = masalaMultiplier) => {
    const template = masalaTemplates.find((item) => item.id === templateId);
    if (!template) return;
    const ingredients: CustomIngredient[] = template.template_ingredients.map((ing) => {
      const itemObj = Array.isArray(ing.items) ? ing.items[0] : ing.items;
      return {
        item_id: ing.item_id, 
        item_name: itemObj?.item_name || "Unknown item", 
        qty: Number(ing.base_qty || 0) * multiplier, 
        unit: normalizeUnitStr(ing.unit || "g"),
        price_per_unit: Number(itemObj?.selling_price || 0),
        base_unit: normalizeUnitStr(itemObj?.base_unit || "kg")
      };
    });
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
    
    const baseU = normalizeUnitStr((raw as any).base_unit || "kg");
    const defaultUnit = baseU.includes('kg') ? 'g' : baseU;

    setTempCustomIngredients((prev) => [...prev, { 
      item_id: raw.id, 
      item_name: getSafeItemName(raw), 
      qty: 0, 
      unit: defaultUnit,
      price_per_unit: Number((raw as any).selling_price || 0),
      base_unit: baseU
    }]);
  };

  // Uses ItemID instead of Map Index to support dynamic sorting safely
  const updateCustomIngredient = (itemId: number, quantity: number) => {
    setTempCustomIngredients((prev) => prev.map((ing) => ing.item_id === itemId ? { ...ing, qty: quantity } : ing));
  };

  const removeCustomIngredient = (itemId: number) => {
    setTempCustomIngredients((prev) => prev.filter((ing) => ing.item_id !== itemId));
  };

  const saveCustomization = async () => {
    if (!customPrice || Number(customPrice) <= 0) return toast({ title: "Enter a selling price", variant: "destructive" });
    
    if (currentTenantId) {
       for (const svc of activeServices) {
          (supabase as any).from("items").update({ selling_price: svc.rate }).eq("id", svc.item_id).then();
       }
    }

    if (customizingCartId) {
      setCart((prev) => prev.map((item) => item.cartId === customizingCartId ? { ...item, customIngredients: [...tempCustomIngredients], selling_price: Number(customPrice), sourceTemplateId: selectedTemplateId || null, recipeMultiplier: masalaMultiplier, appliedServices: activeServices } : item));
    } else {
      const customItem = allItems.find((item) => getSafeItemName(item) === "Yearly Masala" || getSafeItemName(item) === "Custom Masala Blend");
      if (!customItem) return toast({ title: "Item missing", description: "Create 'Yearly Masala' in DB.", variant: "destructive" });
      setCart((prev) => [...prev, { ...customItem, cartId: crypto.randomUUID(), cartQuantity: 1, selling_price: Number(customPrice), customIngredients: [...tempCustomIngredients], sourceTemplateId: selectedTemplateId || null, recipeMultiplier: masalaMultiplier, appliedServices: activeServices }]);
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
      const aggregatedServices = new Map<string, number>();

      for (const cartItem of cart) {
        const { data: orderItem, error: orderItemError } = await (supabase as any).from("order_items").insert({
          tenant_id: currentTenantId, order_id: order.id, item_id: cartItem.id, quantity: cartItem.cartQuantity,
          unit: getItemDisplayUnit(cartItem), price_at_order: Number(cartItem.selling_price || 0),
        }).select("*").single();

        if (orderItemError) throw orderItemError;

        if (cartItem.customIngredients && cartItem.customIngredients.length > 0) {
          const weight = cartItem.customIngredients.reduce((s, i) => {
             const u = normalizeUnitStr(i.unit);
             if (u === 'piece' || u === 'nug' || u === 'pcs') return s;
             return s + (u === 'g' || u === 'gm' ? i.qty / 1000 : i.qty);
          }, 0);
          totalMixWeight += weight;

          if (cartItem.appliedServices && cartItem.appliedServices.length > 0) {
            for (const svc of cartItem.appliedServices) {
              const charge = (cartItem.recipeMultiplier || 1) * svc.rate;
              aggregatedServices.set(svc.item_name, (aggregatedServices.get(svc.item_name) || 0) + charge);
            }
          }

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

      const receiptServicesArray = Array.from(aggregatedServices, ([name, total]) => ({ name, total }));

      setCompletedOrder({ 
        ...order, 
        final_amount: finalTotal, 
        subtotal, 
        cartItems: cart,
        customerName: customerName || customer?.full_name || "",
        customerPhone: customerPhone || customer?.phone_number || "",
        totalMixWeightKg: totalMixWeight,
        receiptServices: receiptServicesArray,
        advancePaid: totalPaid,
        balanceDue: balanceDue,
        discountAmount, 
        payments 
      });
      setShowSuccessModal(true);
      
      setCart([]); setPayments([]); setCustomerPhone(""); setCustomerName(""); setFoundCustomer(null); setDeliveryDate("");
      setDiscountAmount(0); setSearchTerm(""); setSelectedCategory("ALL"); setQuickQuantity("1");
      setCheckoutOpen(false); 
      setCheckoutStep(1);
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
          <Button disabled={cart.length === 0} onClick={() => setPaymentDialogOpen(true)} className="h-14 w-full rounded-2xl bg-zinc-900 text-white font-bold text-[16px] shadow-sm hover:bg-zinc-800 active:scale-95 transition-all">
            Proceed to Checkout <ChevronRight className="ml-2 h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col bg-zinc-50 font-sans relative">
        
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
                  className="h-12 text-[16px] rounded-xl border-zinc-200 bg-zinc-50 pl-11 pr-10 font-medium shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-900 focus:bg-white transition-colors"
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

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
            
            <div className="mb-4 lg:hidden">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 mb-1.5 block ml-1">Quick Add Quantity</span>
              <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                {[1, 2, 5, 10].map((quantity) => (
                  <button key={quantity} onClick={() => setQuickQuantity(String(quantity))} className={`shrink-0 h-11 w-14 rounded-xl text-sm font-bold transition-all border ${Number(quickQuantity) === quantity ? "bg-zinc-900 border-zinc-900 text-white shadow-md scale-105" : "bg-white border-zinc-200 text-zinc-700 shadow-sm hover:border-zinc-300"}`}>
                    {quantity}
                  </button>
                ))}
                
                <div className="shrink-0 relative">
                  <select 
                    value={quickQuantity} 
                    onChange={(e) => setQuickQuantity(e.target.value)}
                    className="h-11 w-20 rounded-xl border border-zinc-200 bg-white font-bold text-[16px] text-center shadow-sm focus-visible:ring-2 focus-visible:ring-zinc-900 appearance-none pl-3 pr-6"
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
  <h3 className="line-clamp-1 text-sm font-semibold leading-tight text-zinc-900">{getSafeItemName(item)}</h3>
  {(item as any).english_name && (
    <p className="text-[11px] font-medium text-zinc-500 truncate leading-tight">{(item as any).english_name}</p>
  )}
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

      {/* --- FIXED IPAD BUTTON VISIBILITY --- */}
      {cart.length > 0 && !checkoutOpen && (
          <div className="absolute bottom-6 left-0 right-0 mx-auto w-[92%] max-w-[400px] z-40 xl:hidden animate-in fade-in slide-in-from-bottom-4">
            <SwipeAction cartCount={cart.length} label={`Swipe to Pay ${formatCurrency(finalTotal)}`} onSwipe={() => { setCheckoutStep(1); setCheckoutOpen(true); }} />
          </div>
        )}
      </div>

      {/* --- FULL-SCREEN MOBILE/IPAD STEP-WIZARD --- */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-[100] bg-zinc-50 flex flex-col animate-in slide-in-from-right-full duration-300 xl:hidden">
          <div className="h-14 px-4 bg-white border-b border-zinc-200 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-3">
              {checkoutStep > 1 ? (
                <button onClick={() => setCheckoutStep(p => p - 1)} className="p-2 -ml-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors active:scale-95"><ArrowLeft className="h-5 w-5" /></button>
              ) : (
                <button onClick={() => setCheckoutOpen(false)} className="p-2 -ml-2 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors active:scale-95"><X className="h-5 w-5" /></button>
              )}
              <div>
                <h2 className="text-lg font-bold text-zinc-900 leading-tight">Checkout</h2>
                <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mt-0.5">Step {checkoutStep} of 5</p>
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
             {/* STEP 1: REVIEW LEDGER */}
             {checkoutStep === 1 && (
               <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex justify-between items-center bg-white p-4 rounded-2xl border border-zinc-200 shadow-sm">
                    <span className="font-bold text-zinc-900 text-[15px]">Review Ledger Items</span>
                    <span className="text-xs font-bold bg-zinc-100 px-3 py-1.5 rounded-lg text-zinc-700">{cart.length}</span>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-4">
                    <div className="max-h-[45vh] overflow-y-auto space-y-4 pr-2">
                      {cart.map(item => (
                        <div key={item.cartId} className="flex justify-between items-start text-sm pb-4 border-b border-zinc-100 last:border-0 last:pb-0">
                          <div className="flex-1 pr-3">
                            <span className="font-bold text-zinc-800 leading-tight block">{getSafeItemName(item)}</span>
                            <div className="text-[11px] font-bold text-zinc-500 mt-1">{item.cartQuantity} x {formatCurrency(item.selling_price || 0)}</div>
                          </div>
                          <span className="font-bold text-zinc-900 text-[15px]">{formatCurrency(item.cartQuantity * Number(item.selling_price || 0))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Button variant="outline" onClick={() => setCheckoutOpen(false)} className="w-full h-14 rounded-2xl font-bold border-dashed border-2 border-zinc-300 text-zinc-600 hover:bg-zinc-50 shadow-none text-[15px]">+ Add More Items</Button>
               </div>
             )}

             {/* STEP 2: ORDER SETTINGS */}
             {checkoutStep === 2 && (
               <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Order Settings</Label>
                  <div className="space-y-5 bg-white p-5 rounded-[24px] border border-zinc-200 shadow-sm">
                    <div>
                      <Label className="text-[13px] font-bold text-zinc-800 mb-2 block">Order Number</Label>
                      <div className="relative">
                        <Receipt className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                        <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="h-14 pl-11 text-[16px] rounded-2xl font-bold bg-zinc-50 border-zinc-200 shadow-inner" />
                      </div>
                    </div>
                    <div>
                      <Label className="text-[13px] font-bold text-zinc-800 mb-2 block">Delivery Schedule</Label>
                      <div className="flex gap-2">
                         <button onClick={() => setDeliveryDate("")} className={`flex-1 h-14 rounded-2xl text-[15px] font-bold border transition-all active:scale-95 ${!deliveryDate ? 'bg-zinc-900 text-white border-zinc-900 shadow-md' : 'bg-zinc-50 text-zinc-600 border-zinc-200 shadow-inner'}`}>Instant (Today)</button>
                         <button onClick={() => setDeliveryDate(new Date().toISOString().split('T')[0])} className={`flex-1 h-14 rounded-2xl text-[15px] font-bold border transition-all active:scale-95 ${deliveryDate ? 'bg-zinc-900 text-white border-zinc-900 shadow-md' : 'bg-zinc-50 text-zinc-600 border-zinc-200 shadow-inner'}`}>Custom Date</button>
                      </div>
                      {deliveryDate && (
                        <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="h-14 mt-3 rounded-2xl font-bold bg-zinc-50 text-[16px] border-zinc-200 shadow-inner px-4" />
                      )}
                    </div>
                  </div>
               </div>
             )}

             {/* STEP 3: CUSTOMER CRM */}
             {checkoutStep === 3 && (
               <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Customer CRM (Optional)</Label>
                  <div className="space-y-5 bg-white p-5 rounded-[24px] border border-zinc-200 shadow-sm">
                    <div>
                      <Label className="text-[13px] font-bold text-zinc-800 mb-2 block">Phone Number</Label>
                      <div className="relative">
                        <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                        <button onClick={() => setNumpadConfig({isOpen: true, title: "Customer Phone", value: customerPhone, allowDecimal: false, onConfirm: (v) => handlePhoneChange(v)})} className="h-14 w-full pl-11 text-left text-[16px] rounded-2xl font-bold bg-zinc-50 border border-zinc-200 shadow-inner flex items-center hover:bg-zinc-100 transition-colors">
                           {customerPhone || <span className="text-zinc-400 font-medium">Enter 10-digit number</span>}
                        </button>
                      </div>
                    </div>
                    {customerPhone.length >= 10 && (
                      <div className="animate-in fade-in slide-in-from-top-2">
                        <Label className="text-[13px] font-bold text-zinc-800 mb-2 block">Full Name</Label>
                        <div className="relative">
                          <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                          <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer Name" className="h-14 pl-11 text-[16px] rounded-2xl font-bold bg-zinc-50 border-zinc-200 shadow-inner" />
                        </div>
                      </div>
                    )}
                  </div>
               </div>
             )}

             {/* STEP 4: PAYMENT SPLIT (Redesigned) */}
             {checkoutStep === 4 && (
               <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="flex justify-between items-center px-1">
                    <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Payment Split</Label>
                    <span className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-lg shadow-sm">Pending: {formatCurrency(balanceDue)}</span>
                  </div>
                  <div className="bg-white p-5 rounded-[24px] border border-zinc-200 shadow-sm space-y-5">
                    
                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Payment Method</Label>
                      <div className="flex gap-2 p-1 bg-zinc-100/80 border border-zinc-200 rounded-2xl">
                        {["CASH", "UPI", "CARD"].map(m => (
                          <button key={m} onClick={() => setPaymentMethodInput(m as PaymentMethod)} className={`flex-1 h-12 rounded-xl text-sm font-bold transition-all ${paymentMethodInput === m ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200' : 'text-zinc-500 hover:text-zinc-700'}`}>{m}</button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Amount Received</Label>
                      <div className="flex gap-3">
                        <button onClick={() => setNumpadConfig({isOpen: true, title: "Payment Amount", value: paymentAmountInput, allowDecimal: true, onConfirm: (v) => setPaymentAmountInput(String(v))})} className="h-14 flex-1 rounded-2xl border border-zinc-200 bg-white text-left px-4 text-[16px] font-bold text-zinc-900 shadow-sm flex items-center hover:bg-zinc-50 transition-colors">
                          {paymentAmountInput ? `₹ ${paymentAmountInput}` : "Enter Amount"}
                        </button>
                        <Button onClick={addPayment} className="h-14 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[15px] shadow-sm active:scale-95 transition-all">Record</Button>
                      </div>
                    </div>
                    
                    {balanceDue > 0 && (
                      <div className="flex gap-2 overflow-x-auto scrollbar-none pt-1">
                        <button onClick={() => setPaymentAmountInput(String(balanceDue))} className="px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold shadow-sm active:scale-95 text-zinc-700">Full Pay</button>
                        <button onClick={() => setPaymentAmountInput(String(Math.floor(balanceDue / 2)))} className="px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-xs font-bold shadow-sm active:scale-95 text-zinc-700">Split 50%</button>
                        <button onClick={() => { setPayments([]); setPaymentAmountInput(""); }} className="px-4 py-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-700 shadow-sm active:scale-95">Udhaar (0 Pay)</button>
                      </div>
                    )}
                    
                    {payments.length > 0 && (
                      <div className="pt-3 border-t border-zinc-100 space-y-2">
                        {payments.map(p => (
                          <div key={p.id} className="flex justify-between items-center bg-zinc-50 p-3.5 rounded-2xl border border-zinc-200 shadow-sm">
                            <span className="font-bold text-zinc-800 text-[13px]">{p.method}</span>
                            <div className="flex items-center gap-4">
                              <span className="font-bold text-emerald-600 text-[15px]">{formatCurrency(p.amount)}</span>
                              <button onClick={() => removePayment(p.id)} className="text-zinc-400 hover:text-rose-500 hover:bg-white p-2 rounded-xl transition-colors"><Trash2 className="h-4 w-4" /></button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
               </div>
             )}

             {/* STEP 5: FINAL COMPLETE */}
             {checkoutStep === 5 && (
               <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-center bg-white border border-zinc-200 p-8 rounded-[32px] shadow-sm">
                     <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-1.5">Final Amount</p>
                     <p className="text-5xl font-bold tracking-tight text-zinc-900">{formatCurrency(finalTotal)}</p>
                     <div className="mt-4 flex justify-center gap-2">
                       {totalPaid > 0 && <span className="text-[13px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 py-1.5 px-4 rounded-xl shadow-sm">Paid: {formatCurrency(totalPaid)}</span>}
                       {balanceDue > 0 && <span className="text-[13px] font-bold text-rose-700 bg-rose-50 border border-rose-200 py-1.5 px-4 rounded-xl shadow-sm">Due: {formatCurrency(balanceDue)}</span>}
                     </div>
                  </div>
                  <div className="bg-white border border-zinc-200 rounded-[24px] p-5 text-[15px] font-semibold space-y-3 shadow-sm">
                     <div className="flex justify-between items-center pb-3 border-b border-zinc-50"><span className="text-zinc-500">Order</span><span className="text-zinc-900 font-bold bg-zinc-50 px-2.5 py-1 rounded-lg border border-zinc-100">{orderNumber}</span></div>
                     <div className="flex justify-between items-center pb-3 border-b border-zinc-50"><span className="text-zinc-500">Items</span><span className="text-zinc-900 font-bold">{cart.length} Units</span></div>
                     <div className="flex justify-between items-center pb-3 border-b border-zinc-50"><span className="text-zinc-500">Customer</span><span className="text-zinc-900 font-bold">{customerName || customerPhone || "Walk-in"}</span></div>
                     <div className="flex justify-between items-center"><span className="text-zinc-500">Delivery</span><span className="text-zinc-900 font-bold">{deliveryDate ? new Date(deliveryDate).toLocaleDateString('en-IN') : 'Instant (Today)'}</span></div>
                  </div>
               </div>
             )}
          </div>
          
          <div className="p-4 sm:p-5 border-t border-zinc-200 bg-white shrink-0 pb-safe shadow-[0_-4px_20px_rgba(0,0,0,0.05)]">
             <div className="max-w-[500px] mx-auto">
               {checkoutStep === 1 && <SwipeAction label="Swipe to Confirm Ledger" onSwipe={() => setCheckoutStep(2)} />}
               {checkoutStep === 2 && <SwipeAction label="Swipe to Confirm Details" onSwipe={() => setCheckoutStep(3)} />}
               {checkoutStep === 3 && <SwipeAction label="Swipe to Confirm CRM" onSwipe={() => setCheckoutStep(4)} />}
               {checkoutStep === 4 && <SwipeAction label="Swipe to Review Payment" disabled={balanceDue > 0 && !customerPhone} onSwipe={() => setCheckoutStep(5)} />}
               
               {/* GREEN THEMED FINAL SWIPE */}
               {checkoutStep === 5 && <SwipeAction variant="success" label={isProcessing ? "Processing..." : "Swipe to Complete Order"} disabled={isProcessing} onSwipe={createOrder} />}
               
               {checkoutStep === 4 && balanceDue > 0 && !customerPhone && (
                 <p className="text-[10px] text-center text-rose-500 font-bold mt-3 uppercase tracking-widest">Customer phone required for pending balance</p>
               )}
             </div>
          </div>
        </div>
      )}

      {/* --- DESKTOP-ONLY QUICK PAYMENT DIALOG --- */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md w-[95vw] rounded-[32px] p-0 overflow-hidden bg-white shadow-2xl border-zinc-200 flex flex-col max-h-[90dvh]">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 bg-zinc-50/50 shrink-0">
            <div>
              <DialogTitle className="text-base font-bold text-zinc-900">Order Checkout</DialogTitle>
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">Review & Pay</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <div className="rounded-[24px] border border-zinc-200 bg-zinc-50 p-6 shadow-inner text-center mb-6">
              <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 mb-2">Amount Due</p>
              <p className="text-4xl font-bold tracking-tight text-zinc-900">{formatCurrency(balanceDue)}</p>
              {totalPaid > 0 && <p className="text-xs font-bold text-emerald-600 mt-2 bg-emerald-50 inline-block px-3 py-1 rounded-lg">Paid: {formatCurrency(totalPaid)}</p>}
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Order Details</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Receipt className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="h-12 pl-11 text-[16px] rounded-xl border-zinc-200 shadow-sm font-bold bg-white" placeholder="Order No."/>
                  </div>
                  <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className="h-12 w-[130px] rounded-xl border-zinc-200 shadow-sm text-[16px] font-bold bg-white" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Customer CRM</Label>
                <div className="relative">
                  <Phone className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <button onClick={() => setNumpadConfig({isOpen: true, title: "Customer Phone", value: customerPhone, allowDecimal: false, onConfirm: (v) => handlePhoneChange(v)})} className="h-12 w-full pl-11 text-left text-[16px] rounded-xl font-bold bg-white border border-zinc-200 shadow-sm flex items-center hover:bg-zinc-50">
                    {customerPhone || <span className="text-zinc-400 font-medium">Enter 10-digit number</span>}
                  </button>
                </div>
                {customerPhone.length >= 10 && (
                  <div className="relative mt-2 animate-in fade-in slide-in-from-top-2">
                    <UserRound className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer Name" className="h-12 pl-11 text-[16px] rounded-xl border-zinc-200 shadow-sm font-bold bg-white" />
                  </div>
                )}
              </div>

              <div className="space-y-3 bg-zinc-50 border border-zinc-200 p-4 rounded-[24px] shadow-inner">
                <div className="flex justify-between items-center mb-1">
                   <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Split Payment Record</Label>
                </div>
                
                {/* Redesigned Desktop Split Payment Area */}
                <div className="flex gap-2 p-1 bg-white border border-zinc-200 rounded-xl mb-2 shadow-sm">
                  {["CASH", "UPI", "CARD"].map(m => (
                    <button key={m} onClick={() => setPaymentMethodInput(m as PaymentMethod)} className={`flex-1 h-10 rounded-lg text-xs font-bold transition-all ${paymentMethodInput === m ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>{m}</button>
                  ))}
                </div>

                <div className="flex gap-3">
                  <button onClick={() => setNumpadConfig({isOpen: true, title: "Payment Amount", value: paymentAmountInput, allowDecimal: true, onConfirm: (v) => setPaymentAmountInput(String(v))})} className="h-12 flex-1 rounded-xl border border-zinc-200 bg-white text-left px-3 text-[16px] font-bold text-zinc-900 shadow-sm flex items-center hover:bg-zinc-50">
                    {paymentAmountInput ? `₹ ${paymentAmountInput}` : "Enter Amount"}
                  </button>
                  <Button onClick={addPayment} className="h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm active:scale-95">Record</Button>
                </div>
                
                {balanceDue > 0 && (
                  <div className="flex gap-2 overflow-x-auto scrollbar-none pt-1">
                    <button onClick={() => setPaymentAmountInput(String(balanceDue))} className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs font-bold shadow-sm active:scale-95">Full Pay</button>
                    <button onClick={() => setPaymentAmountInput(String(Math.floor(balanceDue / 2)))} className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-xs font-bold shadow-sm active:scale-95">Split 50%</button>
                    <button onClick={() => { setPayments([]); setPaymentAmountInput(""); }} className="px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold text-rose-700 shadow-sm active:scale-95">Udhaar (0 Pay)</button>
                  </div>
                )}

                {payments.length > 0 && (
                  <div className="pt-2 mt-2 border-t border-zinc-200/80 space-y-2">
                    {payments.map(p => (
                      <div key={p.id} className="flex justify-between items-center bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                        <span className="font-bold text-zinc-700 text-xs">{p.method}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-emerald-600 text-[14px]">{formatCurrency(p.amount)}</span>
                          <button onClick={() => removePayment(p.id)} className="text-zinc-400 hover:text-rose-500 hover:bg-rose-50 p-1.5 rounded-lg transition-colors"><X className="h-4 w-4" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="p-5 border-t border-zinc-100 bg-white shrink-0">
            <Button disabled={isProcessing || (balanceDue > 0 && !customerPhone)} onClick={createOrder} className="h-14 w-full rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-[16px] font-bold text-white shadow-[0_4px_15px_rgba(16,185,129,0.25)] active:scale-[0.98] transition-transform">
              {isProcessing ? "Processing..." : balanceDue > 0 ? `Save Order — ${formatCurrency(balanceDue)} Due` : "Complete Transaction"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* GLOBAL POS NUMPAD OVERLAY (Custom Z-Index 120 to stay above Checkout Drawer) */}
      {numpadConfig.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-zinc-950/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="sm:max-w-[380px] w-[95vw] rounded-[32px] p-6 shadow-2xl border border-zinc-200 bg-white animate-in zoom-in-95 duration-200">
            <div className="text-center text-lg font-bold text-zinc-900 mb-4">{numpadConfig.title}</div>
            <div className="flex flex-col items-center">
              <div className="h-20 w-full bg-zinc-50 border border-zinc-200/80 rounded-2xl mb-6 flex items-center justify-center shadow-inner">
                <span className="text-4xl font-bold text-zinc-900 tracking-tight">{numpadConfig.value || "0"}</span>
              </div>
              <PosNumpad value={numpadConfig.value} onChange={(v) => setNumpadConfig(p => ({...p, value: v}))} allowDecimal={numpadConfig.allowDecimal} />
            </div>
            <div className="grid grid-cols-2 gap-3 w-full mt-6">
              <Button variant="outline" className="h-14 rounded-2xl w-full border-zinc-200 font-bold text-[16px]" onClick={() => setNumpadConfig(p => ({...p, isOpen: false}))}>Cancel</Button>
              <Button className="h-14 rounded-2xl w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-[16px]" onClick={() => { numpadConfig.onConfirm(numpadConfig.value); setNumpadConfig(p => ({...p, isOpen: false})); }}>Confirm</Button>
            </div>
          </div>
        </div>
      )}

      {/* SMART WEIGHT KEYPAD DIALOG */}
      <Dialog open={weightDialogOpen} onOpenChange={setWeightDialogOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md w-[95vw] rounded-3xl p-6 flex flex-col max-h-[90dvh]">
          <DialogHeader className="shrink-0 flex flex-row items-center justify-between">
            <div><DialogTitle className="text-lg font-semibold text-zinc-900">Select Weight</DialogTitle><p className="text-xs text-zinc-500">{weightedItem ? getSafeItemName(weightedItem) : ""}</p></div>
            <span className="text-lg font-bold text-zinc-400">{weightedItem ? getItemDisplayUnit(weightedItem) : "kg"}</span>
          </DialogHeader>

          <div className="py-2 flex-1 overflow-y-auto">
            <div className="flex bg-zinc-100 p-1.5 rounded-2xl mb-4 shrink-0">
              <button onClick={() => setWeightInputMode('quick')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${weightInputMode === 'quick' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}>Quick Select</button>
              <button onClick={() => setWeightInputMode('custom')} className={`flex-1 py-2.5 text-sm font-bold rounded-xl transition-all ${weightInputMode === 'custom' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500'}`}>Manual Numpad</button>
            </div>

            {weightInputMode === 'quick' ? (
              <div className="space-y-4">
                <div className="text-center bg-zinc-50 border border-zinc-200/80 shadow-inner rounded-2xl py-6">
                   <span className="text-4xl font-bold text-zinc-900 tracking-tight">{weightInput || "0"}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {(weightedItem && ['litre', 'ml', 'l'].includes(String((weightedItem as any).base_unit).toLowerCase()) ? LIQUID_WEIGHTS : SPICE_WEIGHTS).map((btn) => (
                    <button key={btn.label} onClick={() => setWeightInput(String(btn.val))} className={`py-4 rounded-xl text-sm font-bold transition-colors ${weightInput === String(btn.val) ? 'bg-zinc-900 text-white shadow-md border border-zinc-900' : 'bg-white border border-zinc-200 text-zinc-700 shadow-sm active:scale-95'}`}>
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="text-center w-full bg-zinc-50 border border-zinc-200/80 shadow-inner rounded-2xl py-6 mb-6">
                   <span className="text-4xl font-bold text-zinc-900 tracking-tight">{weightInput || "0"}</span>
                </div>
                <PosNumpad value={weightInput} onChange={setWeightInput} />
              </div>
            )}
          </div>
          <DialogFooter className="mt-4 shrink-0 grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setWeightDialogOpen(false)} className="h-14 rounded-2xl font-bold border-zinc-200 w-full text-[16px]">Cancel</Button>
            <Button onClick={confirmWeightedItem} className="h-14 rounded-2xl bg-emerald-500 text-white font-bold w-full text-[16px]">Add to Cart</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* YEARLY MASALA MODAL */}
      <Dialog open={showCustomMasala} onOpenChange={setShowCustomMasala}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md w-[95vw] rounded-2xl p-0 overflow-hidden bg-white shadow-2xl flex flex-col max-h-[90dvh]">
          <DialogHeader className="border-b border-zinc-100 px-5 py-4 bg-zinc-50/50 shrink-0">
            <DialogTitle className="text-base font-semibold text-zinc-900">{customizingCartId ? "Edit Yearly Masala" : "Yearly Masala (Varshbharache)"}</DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            <div className="space-y-4 border-b border-zinc-100 pb-5">
               <div className="space-y-1.5">
                 <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">1. Base Recipe</Label>
                 <select value={selectedTemplateId} onChange={(e) => applyTemplate(e.target.value)} className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 font-semibold text-zinc-900 shadow-sm">
                   <option value="">No Template Selected</option>
                   {masalaTemplates.map((t) => (<option key={t.id} value={t.id}>{t.template_name}</option>))}
                 </select>
               </div>

               {/* iOS STYLE HORIZONTAL BATCH SELECTOR */}
               <div className="space-y-2">
                 <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Batch Multiplier</Label>
                 <div className="flex items-center gap-2">
                   <div className="flex-1 overflow-x-auto scrollbar-none flex gap-2 snap-x snap-mandatory py-2 px-1">
                      {[1,2,3,4,5,10,12,15,20,25,30,50].map(num => (
                         <button key={num} onClick={() => setMasalaMultiplier(num)} className={`shrink-0 snap-center h-12 w-12 rounded-[14px] flex items-center justify-center text-lg font-bold transition-all ${masalaMultiplier === num ? 'bg-emerald-500 text-white shadow-lg scale-110' : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}>
                           {num}
                         </button>
                      ))}
                   </div>
                   <button onClick={() => setNumpadConfig({isOpen: true, title: "Batch Multiplier", value: String(masalaMultiplier), allowDecimal: false, onConfirm: (v) => setMasalaMultiplier(Number(v))})} className="shrink-0 h-12 px-4 rounded-[14px] border border-zinc-200 bg-zinc-900 text-white font-bold text-sm shadow-sm active:scale-95">
                     Custom
                   </button>
                 </div>
               </div>
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">2. Configure Ingredients</Label>
              <select defaultValue="" onChange={(e) => { if (e.target.value) { addCustomIngredient(Number(e.target.value)); e.currentTarget.value = ""; } }} className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 font-semibold text-zinc-600 shadow-sm">
                <option value="">+ Add raw spice material...</option>
                {rawMaterials.map((raw) => (<option key={raw.id} value={raw.id}>{getSafeItemName(raw)}</option>))}
              </select>
              
              <div className="mt-2 space-y-1.5 border border-zinc-100 rounded-xl p-2 bg-zinc-50/50 max-h-[30vh] overflow-y-auto">
                {sortedCustomIngredients.map((ing, idx) => (
                  <div key={`${ing.item_id}-${idx}`} className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-white p-1.5 shadow-sm">
                    <div className="min-w-0 flex-1 pl-2"><p className="truncate text-xs font-semibold text-zinc-900">{ing.item_name}</p></div>
                    <button onClick={() => setNumpadConfig({isOpen: true, title: `Edit ${ing.item_name}`, value: String(ing.qty), allowDecimal: true, onConfirm: (v) => setTempCustomIngredients(p => p.map(i => i.item_id === ing.item_id ? { ...i, qty: Number(v) } : i))})} className="h-9 w-20 rounded-md border border-zinc-200 bg-white text-center font-bold text-[16px] shadow-sm flex items-center justify-center active:bg-zinc-100 text-zinc-900">
                      {ing.qty}
                    </button>
                    <span className="text-[10px] font-medium text-zinc-400 w-5">{ing.unit}</span>
                    <button onClick={() => setTempCustomIngredients(p => p.filter(i => i.item_id !== ing.item_id))} className="flex h-8 w-8 items-center justify-center rounded-md text-zinc-400 hover:text-rose-500 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 pt-4 border-t border-zinc-100">
              <div className="flex justify-between text-xs font-semibold text-zinc-600"><span>Raw Material Cost</span><span>{formatCurrency(materialCost)}</span></div>
              <div className="space-y-2 pt-2 border-t border-zinc-100">
                <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">3. Applied Services</Label>
                {availableServices.map(svc => {
                  const isActive = activeServices.find(a => a.item_id === svc.id);
                  return (
                    <div key={svc.id} className="flex justify-between items-center text-xs font-semibold text-zinc-600">
                      <div className="flex items-center gap-2">
                        <Switch checked={!!isActive} onCheckedChange={(checked) => { if (checked) setActiveServices(prev => [...prev, { item_id: svc.id, item_name: svc.item_name, rate: Number(svc.selling_price || 0) }]); else setActiveServices(prev => prev.filter(a => a.item_id !== svc.id)); }} className="scale-75 data-[state=checked]:bg-zinc-900" />
                        <span>{svc.item_name}</span>
                      </div>
                      {isActive && (
                        <button onClick={() => setNumpadConfig({isOpen: true, title: `Edit ${svc.item_name} Rate`, value: String(isActive.rate), allowDecimal: true, onConfirm: (v) => setActiveServices(p => p.map(a => a.item_id === svc.id ? { ...a, rate: Number(v) } : a))})} className="h-7 px-3 border border-zinc-200 rounded-md bg-white font-bold shadow-sm flex items-center justify-center text-zinc-900">
                          ₹{isActive.rate}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-zinc-100">
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Final Selling Price (₹)</Label>
              </div>
              <button onClick={() => setNumpadConfig({isOpen: true, title: "Selling Price", value: String(customPrice), allowDecimal: true, onConfirm: (v) => setCustomPrice(Number(v))})} className="w-full h-14 rounded-xl border border-emerald-200 bg-emerald-50 text-2xl font-bold text-emerald-700 shadow-inner flex items-center justify-end px-4">
                {customPrice || "0"}
              </button>
            </div>
          </div>
          <DialogFooter className="border-t border-zinc-100 bg-zinc-50/50 p-4 shrink-0 grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={() => setShowCustomMasala(false)} className="h-12 rounded-xl font-bold w-full text-[15px]">Cancel</Button>
            <Button onClick={saveCustomization} className="h-12 rounded-xl bg-zinc-900 text-white font-bold w-full text-[15px]">Save to Ledger</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
{/* SCANNER DIALOG */}
<Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md w-[95vw] overflow-hidden rounded-3xl p-0 flex flex-col max-h-[90dvh]">
          <DialogHeader className="border-b border-zinc-100 px-5 py-4 bg-zinc-50/50 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-zinc-900"><Camera className="h-4 w-4" /> Scan Barcode</DialogTitle>
          </DialogHeader>
          <div className="bg-black p-2 flex-1"><div id="billing-scanner" className="min-h-[300px] overflow-hidden rounded-2xl" /></div>
          <div className="p-4 shrink-0"><Button variant="outline" onClick={() => setScannerOpen(false)} className="h-12 w-full rounded-xl font-semibold border-zinc-200 shadow-sm">Close Scanner</Button></div>
        </DialogContent>
      </Dialog>

      {/* SUCCESS MODAL WITH PRINT & WHATSAPP */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md w-[95vw] rounded-3xl p-6 text-center border-zinc-200 shadow-2xl bg-white mb-auto mt-20 sm:m-auto">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 border border-emerald-100 mb-4"><CheckCircle2 className="h-8 w-8 text-emerald-500" /></div>
          <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900">Transaction Complete</DialogTitle>
          
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

      <ThermalReceipt order={completedOrder} source="billing" />
    </AppLayout>
  );
}