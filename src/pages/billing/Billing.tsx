import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Html5Qrcode } from "html5-qrcode";
import {
  Camera, Search, X, ShoppingCart, ScanLine, Minus, Plus, Trash2,
  UserRound, Phone, ChevronRight, Package, Scale, 
  FlaskConical, CheckCircle2, Edit3, Receipt, Mic, ArrowLeft, ChevronDown, Printer, MessageCircle, Delete, NotebookPen, MapPin, Tag
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
  base_qty: number; 
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
  address?: string | null;
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

const MASALA_SEQUENCE = [
  "बेडगी", "लवंगी", "गावठी", "काश्मिरी", "संकेश्वरी", "निप्पाणी", "मिरची", 
  "धने", "धणे", "हळकुंड", "मिरी", "बडिशेप", "बडीशेप", "जिरा", "तिळ", 
  "खसखस", "लवंग", "दालचिनी", "लालफुल", "चक्रिफुल", "मसाला वेलची", "दगडफुल", 
  "तेजपान", "शहाजिरे", "जायफळ", "जायपत्री", "त्रिफळ", "नागकेशर", "कबाब चिनी", 
  "पिंपरी", "पिंपळी", "हिंग", "मेथी", "राई", "सुंठ", "हिरवी वेलची", 
  "गुलाब पाकळी", "कसुरी मेथी", "ओवा", "खोबरा", "लसूण", "मीठ", "तेल"
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

const PosNumpad = ({ value, onChange, allowDecimal = true }: { value: string, onChange: (v: string)=>void, allowDecimal?: boolean }) => {
  const handlePress = (key: string) => {
    if (key === 'DEL') onChange(value.slice(0, -1));
    else if (key === '.' && (!allowDecimal || value.includes('.'))) return;
    else onChange(value + key);
  };
  const keys = ['1','2','3','4','5','6','7','8','9','.', '0','DEL'];
  if (!allowDecimal) keys[9] = '00'; 

  return (
    <div className="grid grid-cols-3 gap-2 w-full max-w-[320px] mx-auto">
      {keys.map(k => (
         <button 
           key={k} type="button" onClick={() => handlePress(k)}
           className={`h-12 sm:h-14 rounded-xl text-lg font-medium flex items-center justify-center transition-colors active:scale-[0.98] ${k === 'DEL' ? 'bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-100' : 'bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm'}`}
         >
           {k === 'DEL' ? <Delete className="h-5 w-5"/> : k}
         </button>
      ))}
    </div>
  );
};

const EmptyCart = () => (
  <div className="flex h-full min-h-[250px] flex-col items-center justify-center px-4 text-center border border-dashed border-zinc-200 rounded-2xl m-3 bg-zinc-50/50">
    <div className="mb-3 flex h-12 w-12 items-center justify-center bg-white border border-zinc-100 rounded-full shadow-sm">
      <ShoppingCart className="h-5 w-5 text-zinc-400" />
    </div>
    <h3 className="text-sm font-semibold text-zinc-900">Ledger is empty</h3>
    <p className="mt-1 text-xs font-medium text-zinc-500">Scan or tap items to add</p>
  </div>
);

const POS_CATEGORY_COLORS = [
  { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800", activeBg: "bg-blue-600" },
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800", activeBg: "bg-emerald-600" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-800", activeBg: "bg-amber-600" },
  { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800", activeBg: "bg-purple-600" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-800", activeBg: "bg-rose-600" },
  { bg: "bg-orange-100", border: "border-orange-300", text: "text-orange-800", activeBg: "bg-orange-600" },
  { bg: "bg-teal-100", border: "border-teal-300", text: "text-teal-800", activeBg: "bg-teal-600" },
];

const PosCategoryBar = ({ selectedCategory, setSelectedCategory, quickCategories }: any) => {
  return (
    <div className="flex flex-wrap gap-2.5 items-center">
      <button 
        onClick={() => setSelectedCategory("ALL")} 
        className={`px-4 py-2.5 rounded text-[11px] sm:text-xs font-black transition-all border shadow-sm ${
          selectedCategory === "ALL" 
            ? "bg-zinc-800 border-zinc-900 text-white scale-105" 
            : "bg-white border-zinc-300 text-zinc-700 hover:bg-zinc-100"
        }`}
      >
        ALL ITEMS
      </button>
      
      {quickCategories.map((cat: string, index: number) => {
        const isActive = selectedCategory === cat;
        const theme = POS_CATEGORY_COLORS[index % POS_CATEGORY_COLORS.length];
        
        return (
          <button 
            key={cat} 
            onClick={() => setSelectedCategory(cat)} 
            className={`px-4 py-2.5 rounded text-[11px] sm:text-xs font-black transition-all border shadow-sm ${
              isActive 
                ? `${theme.activeBg} border-transparent text-white shadow-md scale-105` 
                : `${theme.bg} ${theme.border} ${theme.text} hover:brightness-95`
            }`}
          >
            {cat.replace(/_/g, " ").toUpperCase()}
          </button>
        );
      })}
    </div>
  );
};

export default function Billing() {
  const { toast } = useToast();
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [billingUser, setBillingUser] = useState({ name: "Admin", role: "Manager", id: "" });
  const [allItems, setAllItems] = useState<Item[]>([]);
  const [rawMaterials, setRawMaterials] = useState<Item[]>([]);
  const [masalaTemplates, setMasalaTemplates] = useState<MasalaTemplate[]>([]);
  const location = useLocation();
  const navigate = useNavigate();

  // META CONFIGURATION STATE
  const [orderMode, setOrderMode] = useState("WALK_IN"); 
  const [orderNotes, setOrderNotes] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [foundCustomer, setFoundCustomer] = useState<Customer | null>(null);

  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSmartListening, setIsSmartListening] = useState(false);
  const [quickCategories, setQuickCategories] = useState<string[]>([]);
  const [quickQuantity, setQuickQuantity] = useState("1");
  
  // CORE CART STATE
  const [cart, setCart] = useState<OrderCartItem[]>([]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (cart.length > 0) {
        e.preventDefault();
        e.returnValue = "You have items in your ledger. Are you sure you want to exit?";
        return e.returnValue;
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [cart.length]);

  const hasLoadedCart = useRef(false);
  useEffect(() => {
    if (!hasLoadedCart.current) {
      const savedCart = localStorage.getItem('biillo-cart');
      if (savedCart) {
        try { setCart(JSON.parse(savedCart)); } catch(e) { console.error("Failed to parse cart"); }
      }
      hasLoadedCart.current = true;
    }
  }, []);

  useEffect(() => {
    if (hasLoadedCart.current) {
      localStorage.setItem('biillo-cart', JSON.stringify(cart));
    }
  }, [cart]);

  const [orderNumber, setOrderNumber] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  
  const [discountType, setDiscountType] = useState<"FIXED" | "PERCENT">("FIXED");
  const [discountInput, setDiscountInput] = useState<string>("");

  const [payments, setPayments] = useState<PaymentEntry[]>([]);
  const [paymentAmountInput, setPaymentAmountInput] = useState("");
  const [paymentMethodInput, setPaymentMethodInput] = useState<PaymentMethod>("CASH");

  const [checkoutOpen, setCheckoutOpen] = useState(false); 
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false); 
  const [scannerOpen, setScannerOpen] = useState(false);

  useEffect(() => {
    if (cart.length === 0 && checkoutOpen) {
      setCheckoutOpen(false);
      setPaymentDialogOpen(false);
    }
  }, [cart.length, checkoutOpen]);

  const [showCustomMasala, setShowCustomMasala] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<'config' | 'ingredients'>('config');
  const [customizingCartId, setCustomizingCartId] = useState<string | null>(null);
  const [tempCustomIngredients, setTempCustomIngredients] = useState<CustomIngredient[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [masalaMultiplier, setMasalaMultiplier] = useState<number>(1);
  const [customPrice, setCustomPrice] = useState<number | "">("");
  
  const [availableServices, setAvailableServices] = useState<Item[]>([]);
  const [activeServices, setActiveServices] = useState<AppliedService[]>([]);

  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [completedOrder, setCompletedOrder] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  
  const [weightDialogOpen, setWeightDialogOpen] = useState(false);
  const [weightedItem, setWeightedItem] = useState<Item | null>(null);
  const [weightInput, setWeightInput] = useState("");
  const [weightInputMode, setWeightInputMode] = useState<'quick'|'custom'>('quick');

  const [numpadConfig, setNumpadConfig] = useState<{isOpen: boolean, title: string, value: string, allowDecimal: boolean, onConfirm: (v: string)=>void}>({ isOpen: false, title: "", value: "", allowDecimal: true, onConfirm: ()=>{} });

  const [printType, setPrintType] = useState<"LABEL" | "RECEIPT" | null>(null);
  const [printerSize, setPrinterSize] = useState<"80mm" | "110mm">("80mm");
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const hasAutoOpened = useRef(false);

  const LIQUID_WEIGHTS = [
    { label: '1L', val: 1 }, { label: '5L', val: 5 }, { label: '10L', val: 10 }, { label: '15L', val: 15 }
  ];

  const getDynamicQuickWeights = (item: Item | null) => {
    if (!item) return [];
    const baseUnit = String((item as any).base_unit || '').toLowerCase();
    if (['litre', 'ml', 'l'].includes(baseUnit)) return LIQUID_WEIGHTS;
    const customWeights = (item as any).quick_weights;
    if (customWeights && Array.isArray(customWeights) && customWeights.length > 0) {
       return customWeights.map((w: number) => ({
          label: w >= 1000 ? `${w/1000}kg` : `${w}g`,
          val: w >= 1000 ? w/1000 : w/1000
       }));
    }
    return [
      { label: '25g', val: 0.025 }, { label: '50g', val: 0.05 },
      { label: '100g', val: 0.1 }, { label: '200g', val: 0.2 },
      { label: '250g', val: 0.25 }, { label: '500g', val: 0.5 },
      { label: '750g', val: 0.75 }, { label: '1kg', val: 1 },
      { label: '2kg', val: 2 }, { label: '3kg', val: 3 },
      { label: '5kg', val: 5 }, { label: '10kg', val: 10 }
    ];
  };

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + Number(item.selling_price || 0) * item.cartQuantity, 0), [cart]);
  const calculatedDiscount = useMemo(() => {
    const val = Number(discountInput) || 0;
    if (discountType === "PERCENT") return (subtotal * val) / 100;
    return val;
  }, [subtotal, discountInput, discountType]);

  const finalTotal = Math.max(0, subtotal - calculatedDiscount);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const balanceDue = Math.max(0, finalTotal - totalPaid);

  useEffect(() => {
    if (balanceDue > 0 && payments.length === 0 && !paymentAmountInput) {
      setPaymentAmountInput(String(balanceDue));
    } else if (balanceDue === 0) {
      setPaymentAmountInput("");
    }
  }, [balanceDue, checkoutOpen, paymentDialogOpen]);

  const dynamicallyScaledIngredients = useMemo(() => {
    return tempCustomIngredients.map(ing => ({
      ...ing,
      qty: ing.base_qty * masalaMultiplier
    }));
  }, [tempCustomIngredients, masalaMultiplier]);

  const sortedCustomIngredients = useMemo(() => {
    return [...dynamicallyScaledIngredients].sort((a, b) => {
      let idxA = MASALA_SEQUENCE.findIndex(seq => a.item_name.includes(seq));
      let idxB = MASALA_SEQUENCE.findIndex(seq => b.item_name.includes(seq));
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
  }, [dynamicallyScaledIngredients]);

  const totalMixWeightKg = useMemo(() => {
    return dynamicallyScaledIngredients.reduce((sum, ing) => {
      const u = normalizeUnitStr(ing.unit);
      if (u === 'piece' || u === 'nug' || u === 'pcs') return sum;
      let normalizedQty = Number(ing.qty) || 0;
      if (u === 'g' || u === 'gm' || u === 'gram') normalizedQty = normalizedQty / 1000;
      return sum + normalizedQty;
    }, 0);
  }, [dynamicallyScaledIngredients]);

  const materialCost = useMemo(() => {
    return dynamicallyScaledIngredients.reduce((sum, ing) => {
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
  }, [dynamicallyScaledIngredients]);

  const calculatedServicesCharge = useMemo(() => {
    return activeServices.reduce((sum, svc) => {
      const isOil = svc.item_name.toLowerCase().includes("oil") || svc.item_name.includes("तेल");
      const qtyMultiplier = isOil ? masalaMultiplier : totalMixWeightKg;
      return sum + (qtyMultiplier * svc.rate);
    }, 0);
  }, [activeServices, totalMixWeightKg, masalaMultiplier]);

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
      
      setBillingUser({ name: p.full_name || "Admin", role: p.role || "Staff", id: session.user.id });
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

  useEffect(() => {
    if (currentTenantId && !hasAutoOpened.current) {
      const params = new URLSearchParams(location.search);
      const action = params.get("action");
      const cat = params.get("category");
      const search = params.get("search");
      const mode = params.get("mode");

      if (mode) setOrderMode(mode.toUpperCase());
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
        setCustomerAddress(data.address || "");
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

  // --- SMART VOICE BILLING LOGIC ---
  const startSmartVoiceBill = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return toast({title: "Not supported", description: "Browser does not support voice search.", variant: "destructive"});
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'mr-IN';
    recognition.interimResults = false;
    
    recognition.onstart = () => setIsSmartListening(true);
    recognition.onend = () => setIsSmartListening(false);
    
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript.toLowerCase();
      handleSmartVoiceCommand(transcript);
    };
    recognition.start();
  };

  const handleSmartVoiceCommand = (transcript: string) => {
    let text = transcript;
    let price: number | null = null;
    let qty = 1;
    let isWeighted = false;

    // Normalize Marathi common phrases to digits/english text for regex parsing
    const mappings: Record<string, string> = {
        'अडीचशे': '250',
        'adishe': '250',
        'पावशे': '250',
        'pawshe': '250',
        'शंभर': '100',
        'shambhar': '100',
        'अर्धा किलो': '500 gram',
        'ardha kilo': '500 gram',
        'दीड': '1.5',
        'dedh': '1.5',
        'अडीच': '2.5',
        'रुपये': 'rupees',
        'रु': 'rupees',
        'rs': 'rupees',
        'rupay': 'rupees',
        'किलो': 'kg',
        'kilo': 'kg',
        'ग्रॅम': 'gram',
        'g': 'gram',
        'gm': 'gram'
    };

    for (const [word, replacement] of Object.entries(mappings)) {
        text = text.replace(new RegExp(word, 'g'), replacement);
    }

    // 1. Extract Price (e.g. 170 rupees)
    const priceMatch = text.match(/(\d+)\s*rupees/);
    if (priceMatch) {
        price = Number(priceMatch[1]);
        text = text.replace(priceMatch[0], '');
    }

    // 2. Extract Quantity (e.g. 250 gram)
    const qtyMatch = text.match(/(\d+|\d+\.\d+)\s*(kg|gram|grams)/);
    if (qtyMatch) {
        isWeighted = true;
        let rawVal = Number(qtyMatch[1]);
        let unit = qtyMatch[2];

        if (unit.includes('gram')) {
            qty = rawVal / 1000;
        } else {
            qty = rawVal;
        }
        text = text.replace(qtyMatch[0], '');
    }

    const itemName = text.trim();
    if (!itemName) return toast({ title: "Voice Recognition Failed", description: "Could not detect item name.", variant: "destructive" });

    // 3. Match Item
    const match = allItems.find(i => 
       getSafeItemName(i).toLowerCase().includes(itemName) || 
       (i as any).english_name?.toLowerCase().includes(itemName)
    );

    if (match) {
        let finalQty = qty;
        const baseUnit = getItemDisplayUnit(match);
        if (baseUnit === 'g' || baseUnit === 'gram') finalQty = finalQty * 1000;

        let finalPrice = Number(match.selling_price || 0);
        if (price !== null) {
            finalPrice = price / finalQty; 
        }

        addItemToCart(match, finalQty, finalPrice);
        toast({ title: "Voice Added", description: `${match.item_name} added via voice.` });
    } else {
        // Unknown Item -> Add temporary Custom Cart Item
        const tempItem = {
            id: `custom-${Date.now()}`,
            item_name: itemName.charAt(0).toUpperCase() + itemName.slice(1),
            item_type: isWeighted ? "RAW_MATERIAL" : "PACKAGED_PRODUCT",
            base_unit: isWeighted ? "kg" : "piece",
            selling_price: price ? (price / qty) : 0,
            quantity: 0,
            track_inventory: false,
            is_sellable: true
        } as unknown as Item;

        addItemToCart(tempItem, qty, tempItem.selling_price);
        toast({ title: "Custom Item Created", description: `Added unknown item '${itemName}' to ledger.` });
    }
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

  const addItemToCart = (item: Item, quantity = 1, priceOverride?: number) => {
    if (quantity <= 0) return;
    if (item.item_name === "Custom Masala Blend" || item.item_name === "Yearly Masala") {
       startCustomMasalaOrder();
       return;
    }
    // Only show weight dialog if clicked normally (not from voice overriding the price)
    if (isWeightedItem(item) && priceOverride === undefined) { 
      setWeightedItem(item);
      setWeightInput("");
      setWeightDialogOpen(true);
      return;
    }
    
    setCart((previous) => {
      const finalPrice = priceOverride !== undefined ? priceOverride : Number(item.selling_price || 0);
      
      const existingIndex = previous.findIndex((cartItem) => cartItem.id === item.id && cartItem.customIngredients.length === 0 && cartItem.selling_price === finalPrice);
      
      if (existingIndex >= 0) {
        const copy = [...previous];
        copy[existingIndex] = { ...copy[existingIndex], cartQuantity: copy[existingIndex].cartQuantity + quantity };
        return copy;
      }
      return [...previous, { ...item, cartId: crypto.randomUUID(), cartQuantity: quantity, selling_price: finalPrice, customIngredients: [] }];
    });
  };

  const updateCartItemPrice = (cartId: string, newPrice: number) => {
    setCart((prev) => prev.map((item) => item.cartId === cartId ? { ...item, selling_price: newPrice } : item));
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
        setActiveMobileTab('config');
        
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
    
    const multiplierToUse = item.recipeMultiplier || 1;
    const baseIngredients = item.customIngredients.map(ing => ({
       ...ing,
       base_qty: ing.qty / multiplierToUse
    }));

    setTempCustomIngredients(baseIngredients);
    setCustomPrice(Number(item.selling_price || 0));
    setSelectedTemplateId(item.sourceTemplateId || "");
    setMasalaMultiplier(multiplierToUse);
    setActiveServices(item.appliedServices || []);
    setActiveMobileTab('config');
    setShowCustomMasala(true);
  };

  const applyTemplate = (templateId: string) => {
    const template = masalaTemplates.find((item) => item.id === templateId);
    if (!template) return;
    const ingredients: CustomIngredient[] = template.template_ingredients.map((ing) => {
      const itemObj = Array.isArray(ing.items) ? ing.items[0] : ing.items;
      const baseQty = Number(ing.base_qty || 0);
      return {
        item_id: ing.item_id, 
        item_name: itemObj?.item_name || "Unknown item", 
        base_qty: baseQty,
        qty: baseQty, 
        unit: normalizeUnitStr(ing.unit || "g"),
        price_per_unit: Number(itemObj?.selling_price || 0),
        base_unit: normalizeUnitStr(itemObj?.base_unit || "kg")
      };
    });
    setSelectedTemplateId(templateId);
    setTempCustomIngredients(ingredients);
  };

  const addCustomIngredient = (itemId: number) => {
    const raw = rawMaterials.find((item) => item.id === itemId);
    if (!raw) return;
    
    const baseU = normalizeUnitStr((raw as any).base_unit || "kg");
    const defaultUnit = baseU.includes('kg') ? 'g' : baseU;

    setTempCustomIngredients((prev) => [...prev, { 
      item_id: raw.id, 
      item_name: getSafeItemName(raw), 
      base_qty: 0, 
      qty: 0, 
      unit: defaultUnit,
      price_per_unit: Number((raw as any).selling_price || 0),
      base_unit: baseU
    }]);
  };

  const updateCustomIngredient = (itemId: number, newQtyInput: number) => {
    const newBaseQty = newQtyInput / masalaMultiplier;
    setTempCustomIngredients((prev) => prev.map((ing) => ing.item_id === itemId ? { ...ing, base_qty: newBaseQty } : ing));
  };

  const removeCustomIngredient = (itemId: number) => {
    setTempCustomIngredients((prev) => prev.filter((ing) => ing.item_id !== itemId));
  };

  const handlePrintMasalaEstimate = () => {
    const estimateOrderObj = {
      order_number: "ESTIMATE ONLY",
      is_estimate: true, 
      final_amount: customPrice || 0,
      subtotal: customPrice || 0,
      customerName: customerName || "Masala Estimate",
      customerPhone: customerPhone || "",
      customerAddress: "",
      totalMixWeightKg: totalMixWeightKg,
      receiptServices: Array.from(activeServices).map(svc => {
         const isOil = svc.item_name.toLowerCase().includes("oil") || svc.item_name.includes("तेल");
         const qtyMultiplier = isOil ? masalaMultiplier : totalMixWeightKg;
         return {
           name: svc.item_name,
           total: svc.rate * qtyMultiplier
         };
      }),
      cartItems: [{
        id: "estimate-1",
        item_name: "Yearly Masala (Estimate)",
        cartQuantity: 1,
        selling_price: customPrice,
        customIngredients: dynamicallyScaledIngredients.filter(ing => ing.qty > 0),
        appliedServices: activeServices,
        recipeMultiplier: masalaMultiplier,
      }],
      advancePaid: 0,
      balanceDue: customPrice || 0,
      discountAmount: 0,
      payments: [],
      created_at: new Date().toISOString(),
    };
    
    setCompletedOrder(estimateOrderObj);
    
    setTimeout(() => { window.print(); }, 300);
  };

  const saveCustomization = async () => {
    if (!customPrice || Number(customPrice) <= 0) return toast({ title: "Enter a selling price", variant: "destructive" });
    
    if (currentTenantId) {
       for (const svc of activeServices) {
          (supabase as any).from("items").update({ selling_price: svc.rate }).eq("id", svc.item_id).then();
       }
    }

    const scaledIngredientsToSave = dynamicallyScaledIngredients;

    if (customizingCartId) {
      setCart((prev) => prev.map((item) => item.cartId === customizingCartId ? { ...item, customIngredients: [...scaledIngredientsToSave], selling_price: Number(customPrice), sourceTemplateId: selectedTemplateId || null, recipeMultiplier: masalaMultiplier, appliedServices: activeServices } : item));
    } else {
      const customItem = allItems.find((item) => getSafeItemName(item) === "Yearly Masala" || getSafeItemName(item) === "Custom Masala Blend");
      if (!customItem) return toast({ title: "Item missing", description: "Create 'Yearly Masala' in DB.", variant: "destructive" });
      setCart((prev) => [...prev, { ...customItem, cartId: crypto.randomUUID(), cartQuantity: 1, selling_price: Number(customPrice), customIngredients: [...scaledIngredientsToSave], sourceTemplateId: selectedTemplateId || null, recipeMultiplier: masalaMultiplier, appliedServices: activeServices }]);
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

  const handleSmartSplit = (cashAmountStr: string) => {
    const cashAmount = Number(cashAmountStr);
    if (!cashAmount || cashAmount <= 0 || cashAmount >= balanceDue) {
      return toast({ title: "Invalid Cash Amount", description: "Cash must be less than the total due.", variant: "destructive" });
    }
    
    const upiAmount = balanceDue - cashAmount;
    
    setPayments(prev => [
      ...prev, 
      { id: crypto.randomUUID(), method: "CASH", amount: cashAmount },
      { id: crypto.randomUUID(), method: "UPI", amount: upiAmount }
    ]);
    setPaymentAmountInput("");
  };

  const removePayment = (id: string) => setPayments((prev) => prev.filter((p) => p.id !== id));

  const ensureCustomer = async (): Promise<Customer | null> => {
    if (!currentTenantId) return null;
    const phone = customerPhone.replace(/\D/g, "").slice(-10);
    if (!phone) return null;
    if (foundCustomer) return foundCustomer;
    const { data: existing } = await (supabase as any).from("customers").select("*").eq("tenant_id", currentTenantId).eq("phone_number", phone).maybeSingle();
    if (existing) return existing;
    const { data: created } = await (supabase as any).from("customers").insert({ 
      tenant_id: currentTenantId, 
      full_name: customerName || null, 
      phone_number: phone, 
      address: customerAddress || null, 
      customer_type: "retail" 
    }).select("*").single();
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
        tenant_id: currentTenantId, 
        customer_id: customer?.id || null, 
        order_number: orderNumber,
        source: orderMode,
        status: orderStatus, 
        payment_status: paymentStatus, 
        total_amount: finalTotal,
        delivery_date: deliveryDate || null, 
        notes: orderNotes || null,
        customer_address: customerAddress || null,
        discount_type: discountType,
        discount_value: Number(discountInput) || 0,
        discount_amount: calculatedDiscount,
        created_by: billingUser.id 
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
          const itemWeight = cartItem.customIngredients.reduce((s, i) => {
             const u = normalizeUnitStr(i.unit);
             if (u === 'piece' || u === 'nug' || u === 'pcs') return s;
             return s + (u === 'g' || u === 'gm' ? i.qty / 1000 : i.qty);
          }, 0);
          totalMixWeight += itemWeight;

          if (cartItem.appliedServices && cartItem.appliedServices.length > 0) {
            for (const svc of cartItem.appliedServices) {
              const isOil = svc.item_name.toLowerCase().includes("oil") || svc.item_name.includes("तेल");
              const qtyMultiplier = isOil ? cartItem.recipeMultiplier || 1 : itemWeight;
              const charge = qtyMultiplier * svc.rate; 
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
          tenant_id: currentTenantId, 
          order_id: order.id, 
          customer_id: customer?.id || null, 
          amount: p.amount,
          payment_method: p.method, 
          payment_type: balanceDue > 0 ? "ADVANCE" : "PAYMENT", 
          payment_date: new Date().toISOString(),
          created_by: billingUser.id 
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
        customerAddress: customerAddress || customer?.address || "",
        totalMixWeightKg: totalMixWeight,
        receiptServices: receiptServicesArray,
        advancePaid: totalPaid,
        balanceDue: balanceDue,
        discountAmount: calculatedDiscount, 
        payments 
      });
      setShowSuccessModal(true);
      
      resetBill();
      setCheckoutOpen(false); 
      setPaymentDialogOpen(false);
    } catch (error: any) {
      toast({ title: "Transaction Failed", description: error?.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const resetBill = async () => {
    setCart([]); setPayments([]); setCustomerPhone(""); setCustomerName(""); setFoundCustomer(null);
    setDeliveryDate(""); setDiscountInput(""); setDiscountType("FIXED"); setSearchTerm(""); setSelectedCategory("ALL"); setQuickQuantity("1");
    setOrderNotes(""); setCustomerAddress(""); setOrderMode("WALK_IN");
    localStorage.removeItem('biillo-cart');
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
      <div className="flex items-center justify-between border-b border-zinc-200/80 px-4 py-3 bg-zinc-50/80 backdrop-blur-md">
        <div>
          <h2 className="font-semibold text-zinc-900 text-sm">Ledger</h2>
          <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{cart.length} items</p>
        </div>
        <div className="flex items-center gap-2">
          {cart.length > 0 && (
            <button onClick={resetBill} className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-rose-600 bg-rose-50 hover:bg-rose-100 transition-colors">
              <Trash2 className="h-3.5 w-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2 bg-white">
        {cart.length === 0 ? <EmptyCart /> : (
          <div className="space-y-1.5">
            {cart.map((item) => {
              const lineTotal = Number(item.selling_price || 0) * item.cartQuantity;
              return (
                <div key={item.cartId} className="flex flex-col gap-1.5 rounded-xl border border-zinc-100 hover:border-zinc-200 bg-white p-2.5 shadow-sm transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 pr-2">
                      <h3 className="text-xs font-semibold text-zinc-900 leading-tight">{getSafeItemName(item)}</h3>
                      
                      {/* EDITABLE PRICE BUTTON */}
                      <button 
                        onClick={() => setNumpadConfig({
                           isOpen: true,
                           title: `Edit Price: ${getSafeItemName(item)}`,
                           value: String(item.selling_price || 0),
                           allowDecimal: true,
                           onConfirm: (v) => updateCartItemPrice(item.cartId, Number(v))
                        })} 
                        className="inline-flex items-center text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 hover:bg-indigo-100 transition-colors mt-1"
                      >
                        {formatCurrency(Number(item.selling_price || 0))} / {getItemDisplayUnit(item)} ✎
                      </button>
                    </div>
                    <span className="text-sm font-semibold text-zinc-900">{formatCurrency(lineTotal)}</span>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center border border-zinc-200/80 bg-zinc-50 h-8 rounded-lg overflow-hidden shadow-sm">
                      <button type="button" onClick={() => updateCartQuantity(item.cartId, item.cartQuantity - 1)} className="flex h-full w-8 items-center justify-center text-zinc-600 border-r border-zinc-200/80 hover:bg-zinc-100 transition-colors"><Minus className="h-3.5 w-3.5" /></button>
                      <span className="min-w-[2.2rem] text-center text-[11px] font-semibold text-zinc-900 bg-white h-full flex items-center justify-center">{item.cartQuantity}</span>
                      <button type="button" onClick={() => updateCartQuantity(item.cartId, item.cartQuantity + 1)} className="flex h-full w-8 items-center justify-center text-zinc-600 border-l border-zinc-200/80 hover:bg-zinc-100 transition-colors"><Plus className="h-3.5 w-3.5" /></button>
                    </div>

                    <div className="flex gap-1.5">
                      {(item as any).item_type === "FINISHED_PRODUCT" && item.customIngredients.length > 0 && (
                        <button onClick={() => openEditMix(item)} className="flex items-center gap-1 rounded-lg border border-indigo-200 px-2 py-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 transition-colors">
                          <Edit3 className="h-3 w-3" /> Edit
                        </button>
                      )}
                      <button onClick={() => removeCartItem(item.cartId)} className="flex items-center justify-center h-8 w-8 rounded-lg border border-zinc-200/80 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {item.customIngredients.length > 0 && (
                    <div className="mt-1 rounded-lg bg-zinc-50/80 border border-zinc-100 p-2 space-y-1">
                      {item.customIngredients.slice(0, 4).map((ing, idx) => (
                        <div key={idx} className="flex justify-between text-[10px] text-zinc-600 font-medium">
                          <span className="truncate pr-2">• {ing.item_name}</span>
                          <span className="text-zinc-400">{ing.qty}{ing.unit}</span>
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

      <div className="border-t border-zinc-200 bg-white p-3 shrink-0 pb-safe shadow-[0_-4px_15px_rgba(0,0,0,0.02)]">
        <div className="space-y-1.5 text-sm mb-3 px-1">
          <div className="flex justify-between text-zinc-600">
            <span className="font-medium text-[11px] uppercase tracking-wider">Subtotal</span>
            <span className="font-semibold text-zinc-800">{formatCurrency(subtotal)}</span>
          </div>
          {calculatedDiscount > 0 && (
            <div className="flex justify-between text-indigo-600 mt-0.5">
              <span className="font-medium text-[11px] uppercase tracking-wider">Discount</span>
              <span className="font-semibold">- {formatCurrency(calculatedDiscount)}</span>
            </div>
          )}
          <div className="flex justify-between pt-2 border-t border-zinc-100 mt-1.5">
            <span className="font-semibold text-zinc-900 text-sm">Total</span>
            <span className="text-lg font-semibold text-zinc-900 tracking-tight">{formatCurrency(finalTotal)}</span>
          </div>
        </div>

        {!compact && (
          <Button disabled={cart.length === 0} onClick={() => setPaymentDialogOpen(true)} className="h-11 w-full rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-[14px] shadow-sm transition-all active:scale-[0.98]">
            Checkout <ChevronRight className="ml-1.5 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <AppLayout>
      {showCustomMasala ? (
        <div className="flex flex-col h-[calc(100dvh-4rem)] bg-zinc-50/50 print:hidden">
          
          {/* Header Controls */}
          <div className="flex items-center justify-between border-b border-zinc-200/80 bg-white px-3 sm:px-4 py-3 shrink-0 shadow-sm z-20">
            <div className="flex items-center gap-3">
              <button onClick={() => setShowCustomMasala(false)} className="h-9 w-9 bg-white border border-zinc-200 hover:bg-zinc-50 flex items-center justify-center rounded-xl shadow-sm transition-colors">
                <ArrowLeft className="h-4.5 w-4.5 text-zinc-600" />
              </button>
              <div>
                <h1 className="text-sm font-semibold text-zinc-900 tracking-tight">{customizingCartId ? "Edit Yearly Masala" : "Yearly Masala Configuration"}</h1>
              </div>
            </div>
            <div className="flex gap-2">
               <Button onClick={handlePrintMasalaEstimate} variant="outline" className="hidden sm:flex h-9 rounded-xl font-semibold border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 text-[12px] shadow-sm">
                 <Printer className="h-3.5 w-3.5 mr-1.5"/> Print Est.
               </Button>
               <Button onClick={saveCustomization} className="h-9 rounded-xl bg-zinc-900 text-white font-semibold text-[12px] hover:bg-zinc-800 shadow-sm">
                 Save to Ledger
               </Button>
            </div>
          </div>

          {/* Responsive Layout Container */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            
            {/* Mobile Tab Switcher */}
            <div className="flex lg:hidden bg-white border-b border-zinc-200 shrink-0 shadow-sm z-10">
              <button onClick={() => setActiveMobileTab('config')} className={`flex-1 py-3 text-[13px] font-semibold text-center border-b-2 transition-colors ${activeMobileTab === 'config' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/30' : 'border-transparent text-zinc-500 hover:bg-zinc-50'}`}>
                1. Configuration
              </button>
              <button onClick={() => setActiveMobileTab('ingredients')} className={`flex-1 py-3 text-[13px] font-semibold text-center border-b-2 transition-colors ${activeMobileTab === 'ingredients' ? 'border-indigo-600 text-indigo-700 bg-indigo-50/30' : 'border-transparent text-zinc-500 hover:bg-zinc-50'}`}>
                2. Ingredients ({sortedCustomIngredients.length})
              </button>
            </div>

            <div className="flex-1 flex flex-col lg:flex-row overflow-hidden p-0 lg:p-4 gap-0 lg:gap-5 relative">
              
              {/* LEFT PANEL: CONFIG & CONTROLS */}
              <div className={`lg:w-[420px] flex-col gap-4 overflow-y-auto p-4 lg:p-0 ${activeMobileTab === 'config' ? 'flex' : 'hidden lg:flex'}`}>
                
                <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-sm">
                  <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Base Recipe</Label>
                  <select value={selectedTemplateId} onChange={(e) => applyTemplate(e.target.value)} className="h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 font-medium text-zinc-900 text-sm shadow-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none transition-all">
                    <option value="">No Template Selected</option>
                    {masalaTemplates.map((t) => (<option key={t.id} value={t.id}>{t.template_name}</option>))}
                  </select>

                  <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mt-4 mb-2 block">Batch Multiplier</Label>
                  <div className="flex gap-1.5 flex-wrap">
                     {[1,2,3,4,5,10].map(num => (
                        <button key={num} onClick={() => setMasalaMultiplier(num)} className={`h-9 px-3.5 rounded-xl font-medium border text-xs transition-colors ${masalaMultiplier === num ? 'bg-zinc-900 text-white border-zinc-900 shadow-md' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 shadow-sm'}`}>
                          {num}x
                        </button>
                     ))}
                     <button onClick={() => setNumpadConfig({isOpen: true, title: "Batch Multiplier", value: String(masalaMultiplier), allowDecimal: false, onConfirm: (v) => setMasalaMultiplier(Number(v))})} className="h-9 px-3.5 rounded-xl font-semibold border border-zinc-200 bg-white text-indigo-600 text-xs hover:bg-indigo-50 shadow-sm">
                        Custom
                     </button>
                  </div>
                </div>

                <div className="bg-white border border-zinc-200 p-4 rounded-2xl shadow-sm flex-1 flex flex-col">
                  <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider mb-3 block">Calculations & Services</Label>
                  
                  <div className="space-y-3 mb-5">
                    <div className="flex justify-between items-center text-xs font-semibold text-zinc-800 bg-zinc-50 p-2.5 border border-zinc-100 rounded-xl">
                      <span>Total Mix Weight</span>
                      <span>{totalMixWeightKg.toFixed(3)} kg</span>
                    </div>
                    <div className="flex justify-between text-xs font-medium text-zinc-500 px-1">
                      <span>Raw Material Cost</span>
                      <span>{formatCurrency(materialCost)}</span>
                    </div>
                  </div>

                  <div className="space-y-2 flex-1">
                    {availableServices.map(svc => {
                      const isActive = activeServices.find(a => a.item_id === svc.id);
                      const isOil = svc.item_name.toLowerCase().includes("oil") || svc.item_name.includes("तेल");
                      return (
                        <div key={svc.id} className="flex justify-between items-center text-xs font-medium text-zinc-700 bg-white border border-zinc-100 p-2 rounded-xl hover:border-zinc-200 transition-colors">
                          <div className="flex items-center gap-2.5">
                            <Switch checked={!!isActive} onCheckedChange={(checked) => { if (checked) setActiveServices(prev => [...prev, { item_id: svc.id, item_name: svc.item_name, rate: Number(svc.selling_price || 0) }]); else setActiveServices(prev => prev.filter(a => a.item_id !== svc.id)); }} className="scale-75 data-[state=checked]:bg-indigo-600" />
                            <span>{svc.item_name}</span>
                          </div>
                          {isActive && (
                            <button onClick={() => setNumpadConfig({isOpen: true, title: `Edit ${svc.item_name} Rate`, value: String(isActive.rate), allowDecimal: true, onConfirm: (v) => setActiveServices(p => p.map(a => a.item_id === svc.id ? { ...a, rate: Number(v) } : a))})} className="h-7 px-2.5 border border-zinc-200 rounded-lg bg-white font-semibold text-zinc-800 hover:bg-zinc-50 text-[11px] shadow-sm">
                              ₹{Math.round(isActive.rate * (isOil ? masalaMultiplier : totalMixWeightKg))}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="border-t border-zinc-100 mt-5 pt-4">
                    <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider block mb-2">Final Selling Price (₹)</Label>
                    <button onClick={() => setNumpadConfig({isOpen: true, title: "Selling Price", value: String(customPrice), allowDecimal: true, onConfirm: (v) => setCustomPrice(Number(v))})} className="w-full h-14 rounded-xl border border-zinc-200 bg-white text-2xl font-semibold text-zinc-900 flex items-center justify-end px-4 hover:bg-zinc-50 shadow-sm transition-colors">
                      {customPrice || "0"}
                    </button>
                  </div>
                </div>
              </div>

              {/* RIGHT PANEL: INGREDIENTS LIST */}
              <div className={`flex-1 flex-col bg-white lg:border lg:border-zinc-200 lg:rounded-2xl shadow-none lg:shadow-sm overflow-hidden ${activeMobileTab === 'ingredients' ? 'flex' : 'hidden lg:flex'}`}>
                
                {/* Search & Add Header */}
                <div className="p-3 border-b border-zinc-100 bg-white/80 backdrop-blur-md shrink-0 flex gap-2">
                  <select defaultValue="" onChange={(e) => { if (e.target.value) { addCustomIngredient(Number(e.target.value)); e.currentTarget.value = ""; } }} className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white px-3 font-medium text-zinc-700 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900">
                    <option value="">+ Add raw spice material...</option>
                    {rawMaterials.map((raw) => (<option key={raw.id} value={raw.id}>{getSafeItemName(raw)}</option>))}
                  </select>
                </div>

                {/* Touch-Friendly Responsive List */}
                <div className="flex-1 overflow-y-auto p-3 bg-zinc-50/30 pb-safe">
                  {sortedCustomIngredients.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-40 text-center">
                      <p className="text-sm font-medium text-zinc-500">No ingredients added yet.</p>
                      <p className="text-xs text-zinc-400 mt-1">Select from the dropdown above to begin.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sortedCustomIngredients.map((ing, idx) => {
                        const stepValue = ing.unit.toLowerCase().includes('kg') ? 0.05 : ing.unit.toLowerCase().includes('piece') ? 1 : 10;
                        
                        return (
                          <div key={`${ing.item_id}-${idx}`} className="flex flex-col sm:flex-row justify-between sm:items-center p-3.5 rounded-xl border border-zinc-200/80 bg-white shadow-sm hover:border-zinc-300 transition-colors">
                            <span className="font-semibold text-zinc-800 text-sm mb-3 sm:mb-0 block truncate pr-2">{ing.item_name}</span>
                            
                            <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
                              
                              <div className="flex items-center border border-zinc-200/80 bg-zinc-50 h-10 rounded-lg overflow-hidden shadow-sm flex-1 sm:flex-none">
                                <button onClick={() => updateCustomIngredient(ing.item_id, Math.max(0, ing.qty - stepValue))} className="flex h-full w-10 sm:w-9 items-center justify-center text-zinc-600 border-r border-zinc-200/80 hover:bg-zinc-100 transition-colors active:bg-zinc-200">
                                  <Minus className="h-4 w-4" />
                                </button>
                                
                                <button onClick={() => setNumpadConfig({isOpen: true, title: `Edit Qty: ${ing.item_name}`, value: String(ing.qty), allowDecimal: true, onConfirm: (v) => updateCustomIngredient(ing.item_id, Number(v))})} className="min-w-[4rem] flex-1 sm:flex-none text-center text-[15px] font-semibold text-zinc-900 bg-white h-full px-2 hover:text-indigo-600 transition-colors">
                                  {Number(ing.qty).toFixed(ing.unit.toLowerCase().includes('kg') ? 3 : 0)}
                                </button>
                                
                                <button onClick={() => updateCustomIngredient(ing.item_id, ing.qty + stepValue)} className="flex h-full w-10 sm:w-9 items-center justify-center text-zinc-600 border-l border-zinc-200/80 hover:bg-zinc-100 transition-colors active:bg-zinc-200">
                                  <Plus className="h-4 w-4" />
                                </button>
                              </div>
                              
                              <span className="text-xs font-medium text-zinc-500 w-8 text-center lowercase shrink-0">{ing.unit}</span>
                              
                              <button onClick={() => removeCustomIngredient(ing.item_id)} className="flex h-10 w-10 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-lg border border-transparent text-zinc-400 hover:bg-rose-50 hover:text-rose-600 transition-colors">
                                <Trash2 className="h-4.5 w-4.5 sm:h-4 sm:w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[calc(100dvh-4rem)] min-h-0 flex-col bg-zinc-50/50 font-sans relative print:hidden">

          <header className="shrink-0 border-b border-zinc-200/80 bg-white/80 backdrop-blur-md z-10">
            <div className="flex flex-col sm:flex-row gap-3 px-3 sm:px-5 py-3">
              <div className="flex items-center gap-3 w-full">
                
                <Button onClick={() => navigate("/")} variant="ghost" className="h-10 w-10 p-0 rounded-xl hover:bg-zinc-100 flex items-center justify-center shrink-0 text-zinc-500 hover:text-zinc-900 transition-colors">
                   <ArrowLeft className="h-5 w-5" />
                </Button>

                <div className="hidden shrink-0 lg:block mr-2 border-r border-zinc-200 pr-5">
                  <h1 className="text-base font-semibold tracking-tight text-zinc-900">POS Terminal</h1>
                  <div className="flex items-center gap-1.5 mt-0.5 w-max">
                    <span className="flex h-1.5 w-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-widest">{orderMode.replace('_', ' ')}</p>
                  </div>
                </div>

                <div className="relative min-w-0 flex-1 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3.5 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-zinc-400" />
                    <Input
                      value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search products..."
                      className="h-11 text-sm rounded-xl border-zinc-200 bg-white shadow-sm pl-10 pr-11 font-medium focus-visible:ring-1 focus-visible:ring-zinc-900 transition-all"
                    />
                    <button onClick={startVoiceSearch} className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors ${isListening ? 'bg-rose-100 text-rose-600 animate-pulse' : 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'}`}>
                       <Mic className="h-4.5 w-4.5" />
                    </button>
                  </div>

                  {/* SMART VOICE BILLING BUTTON */}
                  <Button onClick={startSmartVoiceBill} className={`h-11 px-4 rounded-xl shadow-sm transition-all ${isSmartListening ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}>
                      <Mic className="h-4.5 w-4.5 sm:mr-1.5" />
                      <span className="hidden sm:inline">Voice Bill</span>
                  </Button>
                </div>

                <Button onClick={() => setCheckoutOpen(true)} variant="outline" className="relative h-11 rounded-xl border-zinc-200 bg-white px-3.5 font-semibold xl:hidden shadow-sm">
                  <ShoppingCart className="h-4.5 w-4.5 text-zinc-700 sm:mr-2" />
                  <span className="hidden sm:inline">Cart</span>
                  {cart.length > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white border-2 border-white shadow-sm">
                      {cart.length}
                    </span>
                  )}
                </Button>

                <Button variant="outline" onClick={() => setScannerOpen(true)} className="h-11 rounded-xl border-zinc-200 bg-white px-4 font-semibold shadow-sm text-zinc-700">
                  <ScanLine className="h-4.5 w-4.5 sm:mr-2" />
                  <span className="hidden sm:inline">Scan</span>
                </Button>
              </div>
            </div>

            {/* --- CLASSIC POS CATEGORY GRID (Mobile Horizontal Scroll / Desktop Grid) --- */}
            <div className="flex flex-col gap-2 mb-3 shrink-0 p-2 bg-white rounded shadow-sm border border-zinc-300">
                
                {/* Full-width Yearly Masala Button */}
                <button 
                  onClick={startCustomMasalaOrder} 
                  className="w-full flex items-center justify-center gap-2 rounded border border-indigo-300 bg-indigo-50 py-3 text-xs font-black text-indigo-700 hover:bg-indigo-100 transition-colors uppercase shadow-sm shrink-0"
                >
                  <FlaskConical className="h-4 w-4" /> Yearly Masala
                </button>

                {/* SINGLE STRIP ON MOBILE, GRID ON DESKTOP */}
                <div className="flex overflow-x-auto xl:flex-wrap gap-2 pt-1 pb-1 scrollbar-none">
                  <button 
                    onClick={() => setSelectedCategory("ALL")} 
                    className={`shrink-0 px-4 py-2.5 rounded text-[10px] sm:text-[11px] font-black uppercase transition-all border shadow-sm ${
                      selectedCategory === "ALL" 
                        ? "bg-zinc-900 border-zinc-900 text-white" 
                        : "bg-[#1E1E1E] border-[#1E1E1E] text-white hover:bg-zinc-800"
                    }`}
                  >
                    ALL ITEMS
                  </button>
                  
                  {quickCategories.map((cat, index) => {
                    const isActive = selectedCategory === cat;
                    const CATEGORY_COLORS = [
                      { bg: "bg-[#e8f1ff]", border: "border-[#b3d4ff]", text: "text-[#1d4ed8]" }, 
                      { bg: "bg-[#e6fffa]", border: "border-[#a3f0e1]", text: "text-[#0f766e]" }, 
                      { bg: "bg-[#fef3c7]", border: "border-[#fde68a]", text: "text-[#b45309]" }, 
                      { bg: "bg-[#f3e8ff]", border: "border-[#d8b4fe]", text: "text-[#7e22ce]" }, 
                      { bg: "bg-[#ffe4e6]", border: "border-[#fecdd3]", text: "text-[#be123c]" }, 
                      { bg: "bg-[#ffedd5]", border: "border-[#fed7aa]", text: "text-[#c2410c]" }, 
                      { bg: "bg-[#dcfce7]", border: "border-[#bbf7d0]", text: "text-[#15803d]" }, 
                    ];
                    
                    const theme = CATEGORY_COLORS[index % CATEGORY_COLORS.length];
                    
                    return (
                      <button 
                        key={cat} 
                        onClick={() => setSelectedCategory(cat)} 
                        className={`shrink-0 px-3 py-2.5 rounded text-[10px] sm:text-[11px] font-black uppercase transition-all border shadow-sm whitespace-nowrap text-center ${
                          isActive 
                            ? "bg-indigo-600 border-indigo-700 text-white" 
                            : `${theme.bg} ${theme.border} ${theme.text} hover:brightness-95`
                        }`}
                      >
                        {cat.replace(/_/g, " ")}
                      </button>
                    );
                  })}
                </div>
              </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <main className="min-w-0 flex-1 overflow-y-auto p-3 sm:p-5">
              
              <div className="mb-4 lg:hidden flex gap-2 items-center bg-white p-1.5 border border-zinc-200 rounded-xl shadow-sm">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500 ml-2 whitespace-nowrap">Qty:</span>
                <div className="flex gap-1.5 overflow-x-auto scrollbar-none flex-1 pr-1">
                  {[1, 2, 5, 10].map((quantity) => (
                    <button key={quantity} onClick={() => setQuickQuantity(String(quantity))} className={`shrink-0 h-9 w-12 rounded-lg text-sm font-semibold transition-colors border ${Number(quickQuantity) === quantity ? "bg-indigo-600 border-indigo-600 text-white shadow-sm" : "bg-zinc-50 border-zinc-200 text-zinc-700 hover:bg-zinc-100"}`}>
                      {quantity}
                    </button>
                  ))}
                  <div className="shrink-0 relative">
                    <select 
                      value={quickQuantity} 
                      onChange={(e) => setQuickQuantity(e.target.value)}
                      className="h-9 w-16 rounded-lg border border-zinc-200 bg-zinc-50 font-semibold text-sm text-center focus:outline-none appearance-none px-2 text-zinc-700"
                    >
                      <option value="" disabled>...</option>
                      {Array.from({ length: 100 }, (_, i) => i + 1).map(num => (
                        <option key={num} value={num}>{num}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              {displayItems.length === 0 ? (
                <div className="flex min-h-[50vh] flex-col items-center justify-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center bg-white border border-zinc-200 rounded-2xl shadow-sm">
                    <Package className="h-6 w-6 text-zinc-400" />
                  </div>
                  <h3 className="font-semibold text-zinc-900 text-sm">No items found</h3>
                  <p className="text-xs text-zinc-500 mt-1">Try another search or category</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 pb-32 lg:pb-4">
                  {displayItems.map((item) => {
                    const quantityInCart = cart.filter((cartItem) => cartItem.id === item.id).reduce((sum, cartItem) => sum + cartItem.cartQuantity, 0);
                    const weighted = isWeightedItem(item);

                    return (
                      <Card key={item.id} onClick={() => addItemToCart(item, weighted ? 1 : Math.max(1, Number(quickQuantity) || 1))} className="group cursor-pointer overflow-hidden rounded-xl border-zinc-200/80 bg-white transition-all hover:shadow-md hover:border-zinc-300 active:scale-[0.98]">
                        <div className="flex flex-col p-3 h-full">
                          <div className="mb-2.5 flex items-start justify-between gap-1.5">
                            <span className="flex items-center gap-1 bg-zinc-100 border border-zinc-200/80 px-1.5 py-0.5 rounded-md text-[9px] font-semibold uppercase tracking-wider text-zinc-600">
                              {weighted ? <><Scale className="h-3 w-3" /> Wgt</> : <><Package className="h-3 w-3" /> Pck</>}
                            </span>
                            <StockBadge item={item} />
                          </div>
                          <div className="flex-1">
                            <h3 className="line-clamp-2 text-sm font-semibold leading-tight text-zinc-900">{getSafeItemName(item)}</h3>
                            {(item as any).english_name && (
                              <p className="text-[10px] font-medium text-zinc-500 truncate leading-tight mt-0.5">{(item as any).english_name}</p>
                            )}
                          </div>
                          <div className="mt-3 flex items-end justify-between gap-1.5">
                            <div>
                              <p className="text-base font-semibold text-zinc-900 tracking-tight">{formatCurrency(Number(item.selling_price || 0))}</p>
                              <p className="text-[10px] font-medium text-zinc-500">per {getItemDisplayUnit(item)}</p>
                            </div>
                            {quantityInCart > 0 ? (
                              <span className="bg-indigo-50 border border-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-700 rounded-lg">{quantityInCart} in</span>
                            ) : (
                              <span className="flex h-8 w-8 items-center justify-center bg-zinc-50 border border-zinc-200 text-zinc-600 group-hover:bg-zinc-900 group-hover:text-white group-hover:border-zinc-900 rounded-lg transition-colors">
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

            <aside className="hidden w-[380px] shrink-0 border-l border-zinc-200/80 bg-white xl:flex shadow-[-4px_0_24px_rgba(0,0,0,0.02)] z-10">
              {renderCartContent()}
            </aside>
          </div>

        {cart.length > 0 && !checkoutOpen && (
            <div className="absolute bottom-5 left-0 right-0 mx-auto w-[92%] max-w-[400px] z-40 xl:hidden">
               <Button onClick={() => setCheckoutOpen(true)} className="h-14 w-full rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-[15px] shadow-xl active:scale-[0.98] flex items-center justify-center transition-all">
                 Pay {formatCurrency(finalTotal)} <ChevronRight className="ml-2 h-4.5 w-4.5" />
               </Button>
            </div>
          )}
        </div>
      )}

      {/* --- STREAMLINED 1-STEP MOBILE CHECKOUT --- */}
      {checkoutOpen && (
        <div className="fixed inset-0 z-[100] bg-zinc-50 flex flex-col xl:hidden print:hidden">
          <div className="h-14 px-4 bg-white border-b border-zinc-200 flex items-center justify-between shrink-0 shadow-sm">
            <div className="flex items-center gap-2.5">
              <button onClick={() => setCheckoutOpen(false)} className="p-1.5 text-zinc-500 bg-zinc-50 border border-zinc-200 rounded-lg active:bg-zinc-100"><X className="h-4.5 w-4.5" /></button>
              <h2 className="text-sm font-semibold text-zinc-900">Checkout</h2>
            </div>
            <div className="text-right">
              <span className="text-[11px] font-medium bg-zinc-100 text-zinc-600 px-2.5 py-1 rounded-md">{cart.length} Items</span>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {/* 1. CART ITEMS REVIEW */}
            <div className="bg-white p-4 border border-zinc-200 rounded-2xl shadow-sm">
              <div className="flex justify-between items-center mb-3 pb-2 border-b border-zinc-100">
                 <Label className="text-[11px] font-semibold tracking-wider text-zinc-500 uppercase">Ledger Items</Label>
              </div>
              <div className="max-h-[35vh] overflow-y-auto space-y-2 pr-1">
                 {cart.map(item => (
                   <div key={item.cartId} className="flex flex-col gap-1.5 pb-2.5 border-b border-zinc-100 last:border-0 last:pb-0">
                     <div className="flex justify-between items-start">
                       <div className="flex-1 pr-3">
                         <span className="font-semibold text-zinc-900 text-sm leading-tight block">{getSafeItemName(item)}</span>
                         <button onClick={() => setNumpadConfig({
                           isOpen: true,
                           title: `Edit Price: ${getSafeItemName(item)}`,
                           value: String(item.selling_price || 0),
                           allowDecimal: true,
                           onConfirm: (v) => updateCartItemPrice(item.cartId, Number(v))
                        })} className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1.5 py-0.5 hover:bg-indigo-100 transition-colors mt-1">
                          {formatCurrency(item.selling_price || 0)} / {getItemDisplayUnit(item)} ✎
                         </button>
                       </div>
                       <span className="font-semibold text-zinc-900 text-sm">{formatCurrency(item.cartQuantity * Number(item.selling_price || 0))}</span>
                     </div>
                     <div className="flex items-center justify-between mt-1">
                       <div className="flex items-center border border-zinc-200 bg-zinc-50 h-8 rounded-lg overflow-hidden">
                         <button type="button" onClick={() => updateCartQuantity(item.cartId, item.cartQuantity - 1)} className="flex h-full w-8 items-center justify-center text-zinc-600 border-r border-zinc-200 active:bg-zinc-200"><Minus className="h-3.5 w-3.5" /></button>
                         <span className="min-w-[2.2rem] text-center text-[12px] font-semibold text-zinc-900 bg-white h-full flex items-center justify-center">{item.cartQuantity}</span>
                         <button type="button" onClick={() => updateCartQuantity(item.cartId, item.cartQuantity + 1)} className="flex h-full w-8 items-center justify-center text-zinc-600 border-l border-zinc-200 active:bg-zinc-200"><Plus className="h-3.5 w-3.5" /></button>
                       </div>
                       <button onClick={() => removeCartItem(item.cartId)} className="flex items-center justify-center h-8 w-8 rounded-lg border border-transparent text-zinc-400 active:bg-rose-50 active:text-rose-600"><Trash2 className="h-4 w-4" /></button>
                     </div>
                   </div>
                 ))}
              </div>
            </div>
            
            {/* 2. BIG TOTAL & PAYMENTS WITH DISCOUNT */}
            <div className="bg-white p-4 border border-zinc-200 rounded-2xl shadow-sm space-y-4">
              <div className="text-center pb-4 border-b border-zinc-100 bg-zinc-50/50 p-3 rounded-xl">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1">Amount Due</p>
                <p className="text-4xl font-semibold tracking-tight text-zinc-900">{formatCurrency(balanceDue)}</p>
                {totalPaid > 0 && <p className="text-[11px] font-medium text-emerald-700 mt-2 bg-emerald-50 border border-emerald-100 inline-block px-2.5 py-1 rounded-md">Paid: {formatCurrency(totalPaid)}</p>}
              </div>

              {/* DISCOUNT MODULE */}
              <div className="space-y-2 pt-1">
                 <Label className="text-[11px] font-semibold text-zinc-500 uppercase flex items-center gap-1.5"><Tag className="h-3.5 w-3.5"/> Discount (Optional)</Label>
                 <div className="flex gap-2">
                   <div className="flex bg-zinc-100 border border-zinc-200 rounded-xl shrink-0 p-1">
                     <button onClick={() => { setDiscountType("FIXED"); setDiscountInput(""); }} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${discountType === 'FIXED' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>₹</button>
                     <button onClick={() => { setDiscountType("PERCENT"); setDiscountInput(""); }} className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${discountType === 'PERCENT' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>%</button>
                   </div>
                   <button onClick={() => setNumpadConfig({isOpen: true, title: "Enter Discount", value: discountInput, allowDecimal: true, onConfirm: (v) => setDiscountInput(v)})} className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white text-left px-3 text-sm font-medium text-zinc-800 shadow-sm flex items-center">
                     {discountInput ? (discountType === 'FIXED' ? `₹ ${discountInput}` : `${discountInput} %`) : "0"}
                   </button>
                 </div>
                 {calculatedDiscount > 0 && (
                   <p className="text-[11px] font-medium text-indigo-600 text-right pr-1">- {formatCurrency(calculatedDiscount)} OFF</p>
                 )}
              </div>

              <div className="space-y-3 pt-4 border-t border-zinc-100">
                 <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Record Payment</Label>
                 <div className="flex gap-1.5 bg-zinc-100 border border-zinc-200 p-1 rounded-xl">
                   {["CASH", "UPI", "CARD"].map(m => (
                     <button key={m} onClick={() => setPaymentMethodInput(m as PaymentMethod)} className={`flex-1 h-10 rounded-lg text-xs font-medium transition-colors ${paymentMethodInput === m ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>{m}</button>
                   ))}
                 </div>
                 
                 <div className="flex gap-2">
                   <button onClick={() => setNumpadConfig({isOpen: true, title: "Payment Amount", value: "", allowDecimal: true, onConfirm: (v) => setPaymentAmountInput(String(v))})} className="h-12 flex-1 rounded-xl border border-zinc-200 bg-white shadow-sm text-left px-3 text-[15px] font-medium text-zinc-800 flex items-center hover:bg-zinc-50">
                     {paymentAmountInput ? `₹ ${paymentAmountInput}` : "Amt..."}
                   </button>
                   <Button onClick={addPayment} className="h-12 px-5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm transition-all active:scale-[0.98]">Add</Button>
                 </div>
                 
                 {balanceDue > 0 && (
                   <div className="flex gap-2 overflow-x-auto scrollbar-none py-1">
                     <button onClick={() => setPaymentAmountInput(String(balanceDue))} className="px-3 py-2 bg-white border border-zinc-200 shadow-sm rounded-lg text-[11px] font-medium text-zinc-700 whitespace-nowrap active:scale-[0.98]">Full Pay</button>
                     <button onClick={() => setNumpadConfig({isOpen: true, title: "Enter CASH (Rest is UPI)", value: "", allowDecimal: true, onConfirm: handleSmartSplit})} className="px-3 py-2 bg-white border border-zinc-200 shadow-sm rounded-lg text-[11px] font-medium text-zinc-700 whitespace-nowrap active:scale-[0.98]">Split</button>
                     <button onClick={() => { setPayments([]); setPaymentAmountInput(""); }} className="px-3 py-2 bg-zinc-50 border border-zinc-200 shadow-sm rounded-lg text-[11px] font-medium text-zinc-700 whitespace-nowrap active:scale-[0.98]">Udhaar</button>
                     <button onClick={() => setNumpadConfig({isOpen: true, title: "Advance", value: "", allowDecimal: true, onConfirm: (v) => setPaymentAmountInput(String(v))})} className="px-3 py-2 bg-white border border-zinc-200 shadow-sm rounded-lg text-[11px] font-medium text-zinc-700 whitespace-nowrap active:scale-[0.98]">Adv.</button>
                   </div>
                 )}

                 {payments.length > 0 && (
                    <div className="pt-3 border-t border-zinc-100 space-y-2">
                      {payments.map(p => (
                        <div key={p.id} className="flex justify-between items-center bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
                          <span className="font-medium text-zinc-600 text-[11px]">{p.method}</span>
                          <div className="flex items-center gap-2.5">
                            <span className="font-semibold text-zinc-900 text-[13px]">{formatCurrency(p.amount)}</span>
                            <button onClick={() => removePayment(p.id)} className="text-zinc-400 hover:text-rose-600 bg-white border border-zinc-200 hover:border-rose-200 p-1.5 rounded-lg transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                          </div>
                        </div>
                      ))}
                    </div>
                 )}
              </div>
            </div>

            {/* 3. CUSTOMER CRM */}
            <div className="bg-white p-4 border border-zinc-200 rounded-2xl shadow-sm space-y-3">
               <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Customer</Label>
               <div className="relative">
                 <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-400" />
                 <button onClick={() => setNumpadConfig({isOpen: true, title: "Customer Phone", value: customerPhone, allowDecimal: false, onConfirm: (v) => handlePhoneChange(v)})} className="h-12 w-full pl-10 text-left text-sm rounded-xl font-medium bg-white border border-zinc-200 shadow-sm flex items-center hover:bg-zinc-50">
                   {customerPhone || <span className="text-zinc-400">Phone Number</span>}
                 </button>
               </div>
               {customerPhone.length >= 10 && (
                 <div className="space-y-2 mt-1">
                   <div className="relative">
                     <UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-400" />
                     <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full Name" className="h-12 pl-10 text-sm rounded-xl font-medium bg-white border-zinc-200 shadow-sm" />
                   </div>
                 </div>
               )}
            </div>

            {/* 4. ORDER SETTINGS */}
            <div className="bg-white p-4 border border-zinc-200 rounded-2xl shadow-sm space-y-3">
               <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Order Settings</Label>
               <div className="relative">
                 <Receipt className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-400" />
                 <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="h-12 pl-10 text-sm rounded-xl font-medium bg-white border-zinc-200 shadow-sm w-full"/>
               </div>
               
               <div className="flex flex-col gap-2">
                 <Button onClick={() => setDeliveryDate("")} variant={!deliveryDate ? "default" : "outline"} className={`h-11 rounded-xl font-medium justify-start px-3 text-xs transition-colors shadow-sm ${!deliveryDate ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 border-zinc-200'}`}>
                   <CheckCircle2 className={`h-4 w-4 mr-2 ${!deliveryDate ? 'text-white' : 'text-transparent'}`} />
                   Instant (Today)
                 </Button>
                 <div className="relative">
                   <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={`h-11 w-full rounded-xl border-zinc-200 text-[13px] font-medium px-3 shadow-sm focus-visible:ring-zinc-900 ${deliveryDate ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700'}`} />
                 </div>
               </div>

               <div className="relative">
                 <NotebookPen className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-400" />
                 <Input value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Add Notes..." className="h-12 pl-10 text-sm rounded-xl font-medium bg-white border-zinc-200 shadow-sm" />
               </div>
               <div className="flex gap-1.5 p-1 bg-zinc-100 border border-zinc-200 rounded-xl mt-3">
                 {["WALK_IN", "MONTHLY", "ONLINE"].map(m => (
                   <button key={m} onClick={() => setOrderMode(m)} className={`flex-1 h-9 rounded-lg text-[10px] font-medium transition-colors ${orderMode === m ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>{m.replace('_', ' ')}</button>
                 ))}
               </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-zinc-200 bg-white shrink-0 shadow-[0_-4px_15px_rgba(0,0,0,0.02)]">
            <Button disabled={isProcessing || (balanceDue > 0 && !customerPhone)} onClick={createOrder} className="h-14 w-full rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-[15px] font-semibold text-white transition-all active:scale-[0.98] shadow-sm">
              {isProcessing ? "Processing..." : balanceDue > 0 ? `Save — ${formatCurrency(balanceDue)} Due` : "Complete Order"}
            </Button>
          </div>
        </div>
      )}

      {/* --- DESKTOP-ONLY QUICK PAYMENT DIALOG --- */}
      <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-[500px] w-[95vw] rounded-2xl p-0 overflow-hidden bg-zinc-50/50 flex flex-col max-h-[90dvh]">
          <div className="flex items-center justify-between border-b border-zinc-200/80 px-5 py-4 bg-white shrink-0 shadow-sm">
            <div>
              <DialogTitle className="text-base font-semibold text-zinc-900 tracking-tight">Order Checkout</DialogTitle>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <div className="border border-zinc-200 bg-white rounded-2xl p-5 text-center mb-5 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">Amount Due</p>
              <p className="text-4xl font-semibold text-zinc-900 tracking-tight">{formatCurrency(balanceDue)}</p>
              {totalPaid > 0 && <p className="text-[11px] font-medium text-indigo-700 mt-2.5 bg-indigo-50 border border-indigo-100 inline-block px-3 py-1 rounded-lg">Paid: {formatCurrency(totalPaid)}</p>}
            </div>

            <div className="space-y-4">
              {/* DISCOUNT MODULE */}
              <div className="space-y-2 bg-white border border-zinc-200 p-4 rounded-2xl shadow-sm">
                 <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5"><Tag className="h-3.5 w-3.5"/> Discount</Label>
                 <div className="flex gap-2">
                   <div className="flex bg-zinc-100 border border-zinc-200 rounded-xl shrink-0 p-1">
                     <button onClick={() => { setDiscountType("FIXED"); setDiscountInput(""); }} className={`px-4 rounded-lg text-sm font-medium transition-colors ${discountType === 'FIXED' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>₹</button>
                     <button onClick={() => { setDiscountType("PERCENT"); setDiscountInput(""); }} className={`px-4 rounded-lg text-sm font-medium transition-colors ${discountType === 'PERCENT' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>%</button>
                   </div>
                   <button onClick={() => setNumpadConfig({isOpen: true, title: "Enter Discount", value: discountInput, allowDecimal: true, onConfirm: (v) => setDiscountInput(v)})} className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white text-left px-3.5 text-sm font-medium text-zinc-800 shadow-sm hover:bg-zinc-50 transition-colors">
                     {discountInput ? (discountType === 'FIXED' ? `₹ ${discountInput}` : `${discountInput} %`) : "0"}
                   </button>
                 </div>
                 {calculatedDiscount > 0 && (
                   <p className="text-[11px] font-medium text-indigo-600 text-right pr-1">- {formatCurrency(calculatedDiscount)} OFF</p>
                 )}
              </div>

              <div className="space-y-3 bg-white border border-zinc-200 p-4 rounded-2xl shadow-sm">
                <div className="flex justify-between items-center mb-1">
                   <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Payment Entry</Label>
                </div>
                
                <div className="flex gap-1.5 bg-zinc-100 border border-zinc-200 p-1 rounded-xl mb-3">
                  {["CASH", "UPI", "CARD"].map(m => (
                    <button key={m} onClick={() => setPaymentMethodInput(m as PaymentMethod)} className={`flex-1 h-10 rounded-lg text-[11px] font-medium transition-colors ${paymentMethodInput === m ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:text-zinc-800'}`}>{m}</button>
                  ))}
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setNumpadConfig({isOpen: true, title: "Payment Amount", value: "", allowDecimal: true, onConfirm: (v) => setPaymentAmountInput(String(v))})} className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white text-left px-3 text-[15px] font-medium text-zinc-800 flex items-center hover:bg-zinc-50 shadow-sm">
                    {paymentAmountInput ? `₹ ${paymentAmountInput}` : "Amt..."}
                  </button>
                  <Button onClick={addPayment} className="h-11 px-6 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-sm transition-all active:scale-[0.98]">Add</Button>
                </div>
                
                {balanceDue > 0 && (
                  <div className="flex gap-2 overflow-x-auto scrollbar-none py-1 mt-1">
                    <button onClick={() => setPaymentAmountInput(String(balanceDue))} className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-[11px] font-medium text-zinc-700 whitespace-nowrap shadow-sm active:scale-[0.98]">Full Pay</button>
                    <button onClick={() => setNumpadConfig({isOpen: true, title: "Enter CASH (Rest is UPI)", value: "", allowDecimal: true, onConfirm: handleSmartSplit})} className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-[11px] font-medium text-zinc-700 whitespace-nowrap shadow-sm active:scale-[0.98]">Split</button>
                    <button onClick={() => { setPayments([]); setPaymentAmountInput(""); }} className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] font-medium text-zinc-700 whitespace-nowrap shadow-sm active:scale-[0.98]">Udhaar</button>
                    <button onClick={() => setNumpadConfig({isOpen: true, title: "Advance", value: "", allowDecimal: true, onConfirm: (v) => setPaymentAmountInput(String(v))})} className="px-3 py-2 bg-white border border-zinc-200 rounded-lg text-[11px] font-medium text-zinc-700 whitespace-nowrap shadow-sm active:scale-[0.98]">Adv.</button>
                  </div>
                )}

                {payments.length > 0 && (
                  <div className="pt-3 mt-2 border-t border-zinc-100 space-y-1.5">
                    {payments.map(p => (
                      <div key={p.id} className="flex justify-between items-center bg-zinc-50/80 p-2.5 border border-zinc-200 rounded-xl shadow-sm">
                        <span className="font-medium text-zinc-700 text-[11px]">{p.method}</span>
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-zinc-900 text-[13px]">{formatCurrency(p.amount)}</span>
                          <button onClick={() => removePayment(p.id)} className="text-zinc-400 bg-white border border-zinc-200 hover:text-rose-600 hover:bg-rose-50 p-1.5 rounded-lg transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 3. CUSTOMER CRM */}
            <div className="bg-white p-4 border border-zinc-200 rounded-2xl shadow-sm space-y-3">
               <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Customer</Label>
               <div className="relative">
                 <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-400" />
                 <button onClick={() => setNumpadConfig({isOpen: true, title: "Customer Phone", value: customerPhone, allowDecimal: false, onConfirm: (v) => handlePhoneChange(v)})} className="h-12 w-full pl-10 text-left text-sm rounded-xl font-medium bg-white border border-zinc-200 shadow-sm flex items-center hover:bg-zinc-50">
                   {customerPhone || <span className="text-zinc-400">Phone Number</span>}
                 </button>
               </div>
               {customerPhone.length >= 10 && (
                 <div className="space-y-2 mt-1">
                   <div className="relative">
                     <UserRound className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-400" />
                     <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Full Name" className="h-12 pl-10 text-sm rounded-xl font-medium bg-white border-zinc-200 shadow-sm" />
                   </div>
                 </div>
               )}
            </div>

            {/* 4. ORDER SETTINGS */}
            <div className="bg-white p-4 border border-zinc-200 rounded-2xl shadow-sm space-y-3">
               <Label className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Order Settings</Label>
               <div className="relative">
                 <Receipt className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-400" />
                 <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="h-12 pl-10 text-sm rounded-xl font-medium bg-white border-zinc-200 shadow-sm w-full"/>
               </div>
               
               <div className="flex flex-col gap-2">
                 <Button onClick={() => setDeliveryDate("")} variant={!deliveryDate ? "default" : "outline"} className={`h-11 rounded-xl font-medium justify-start px-3 text-xs transition-colors shadow-sm ${!deliveryDate ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-700 border-zinc-200'}`}>
                   <CheckCircle2 className={`h-4 w-4 mr-2 ${!deliveryDate ? 'text-white' : 'text-transparent'}`} />
                   Instant (Today)
                 </Button>
                 <div className="relative">
                   <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={`h-11 w-full rounded-xl border-zinc-200 text-[13px] font-medium px-3 shadow-sm focus-visible:ring-zinc-900 ${deliveryDate ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white text-zinc-700'}`} />
                 </div>
               </div>

               <div className="relative">
                 <NotebookPen className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-400" />
                 <Input value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Add Notes..." className="h-12 pl-10 text-sm rounded-xl font-medium bg-white border-zinc-200 shadow-sm" />
               </div>
               <div className="flex gap-1.5 p-1 bg-zinc-100 border border-zinc-200 rounded-xl mt-3">
                 {["WALK_IN", "MONTHLY", "ONLINE"].map(m => (
                   <button key={m} onClick={() => setOrderMode(m)} className={`flex-1 h-9 rounded-lg text-[10px] font-medium transition-colors ${orderMode === m ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>{m.replace('_', ' ')}</button>
                 ))}
               </div>
            </div>
          </div>
          
          <div className="p-4 border-t border-zinc-200 bg-white shrink-0 shadow-[0_-4px_15px_rgba(0,0,0,0.02)]">
            <Button disabled={isProcessing || (balanceDue > 0 && !customerPhone)} onClick={createOrder} className="h-14 w-full rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-[15px] font-semibold text-white transition-all active:scale-[0.98] shadow-sm">
              {isProcessing ? "Processing..." : balanceDue > 0 ? `Save — ${formatCurrency(balanceDue)} Due` : "Complete Order"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* GLOBAL POS NUMPAD OVERLAY (z-index increased to float above everything) */}
      {numpadConfig.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-zinc-950/40 backdrop-blur-sm animate-in fade-in duration-200 print:hidden">
          <div className="sm:max-w-[340px] w-[90vw] rounded-[24px] p-5 border border-zinc-200 bg-zinc-50/95 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="text-center text-sm font-semibold text-zinc-900 mb-4">{numpadConfig.title}</div>
            <div className="flex flex-col items-center">
              <div className="h-16 w-full bg-white border border-zinc-200/80 mb-5 flex items-center justify-center rounded-2xl shadow-sm">
                <span className="text-3xl font-semibold text-zinc-900 tracking-tight">{numpadConfig.value || "0"}</span>
              </div>
              <PosNumpad value={numpadConfig.value} onChange={(v) => setNumpadConfig(p => ({...p, value: v}))} allowDecimal={numpadConfig.allowDecimal} />
            </div>
            <div className="grid grid-cols-2 gap-2.5 w-full mt-5">
              <Button variant="outline" className="h-12 rounded-xl border-zinc-200 bg-white font-semibold text-sm text-zinc-700 shadow-sm" onClick={() => setNumpadConfig(p => ({...p, isOpen: false}))}>Cancel</Button>
              <Button className="h-12 rounded-xl bg-zinc-900 text-white font-semibold text-sm shadow-sm" onClick={() => { numpadConfig.onConfirm(numpadConfig.value); setNumpadConfig(p => ({...p, isOpen: false})); }}>Confirm</Button>
            </div>
          </div>
        </div>
      )}

      {/* SMART WEIGHT KEYPAD DIALOG */}
      <Dialog open={weightDialogOpen} onOpenChange={setWeightDialogOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-[360px] w-[95vw] rounded-2xl p-5 bg-zinc-50 border border-zinc-200 flex flex-col shadow-xl print:hidden">
          <div className="shrink-0 flex flex-row items-center justify-between border-b border-zinc-200/80 pb-3 mb-3">
            <div>
               <h3 className="text-base font-semibold text-zinc-900">Select Weight</h3>
               <p className="text-[11px] text-zinc-500 font-medium mt-0.5">{weightedItem ? getSafeItemName(weightedItem) : ""}</p>
            </div>
            <span className="text-sm font-semibold text-zinc-900 bg-white border border-zinc-200 px-2.5 py-1.5 rounded-lg shadow-sm">{weightedItem ? getItemDisplayUnit(weightedItem) : "kg"}</span>
          </div>

          <div className="py-1">
            <div className="flex bg-zinc-100 p-1 rounded-xl border border-zinc-200 mb-4 shrink-0">
              <button onClick={() => setWeightInputMode('quick')} className={`flex-1 py-2 text-[11px] font-medium rounded-lg transition-colors ${weightInputMode === 'quick' ? 'bg-white border border-zinc-200/80 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>Quick Select</button>
              <button onClick={() => setWeightInputMode('custom')} className={`flex-1 py-2 text-[11px] font-medium rounded-lg transition-colors ${weightInputMode === 'custom' ? 'bg-white border border-zinc-200/80 text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>Manual Entry</button>
            </div>

            {weightInputMode === 'quick' ? (
              <div className="space-y-4">
                <div className="text-center bg-white border border-zinc-200 rounded-2xl py-4 shadow-sm">
                   <span className="text-3xl font-semibold text-zinc-900 tracking-tight">{weightInput || "0"}</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {getDynamicQuickWeights(weightedItem).map((btn) => (
                    <button key={btn.label} onClick={() => setWeightInput(String(btn.val))} className={`py-2.5 rounded-xl text-[11px] font-medium transition-colors border shadow-sm ${weightInput === String(btn.val) ? 'bg-zinc-900 text-white border-zinc-900' : 'bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50'}`}>
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center">
                <div className="text-center w-full bg-white border border-zinc-200 rounded-2xl py-4 mb-4 shadow-sm">
                   <span className="text-3xl font-semibold text-zinc-900 tracking-tight">{weightInput || "0"}</span>
                </div>
                <PosNumpad value={weightInput} onChange={setWeightInput} />
              </div>
            )}
          </div>
          <div className="mt-4 shrink-0 grid grid-cols-2 gap-2.5 border-t border-zinc-200 pt-4">
            <Button variant="outline" onClick={() => setWeightDialogOpen(false)} className="h-11 rounded-xl font-semibold text-xs border-zinc-200 bg-white text-zinc-700 shadow-sm">Cancel</Button>
            <Button onClick={confirmWeightedItem} className="h-11 rounded-xl bg-zinc-900 text-white font-semibold text-xs shadow-sm">Add Item</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* SCANNER DIALOG */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md w-[95vw] rounded-2xl p-0 flex flex-col bg-zinc-50 border border-zinc-200 shadow-xl overflow-hidden print:hidden">
          <div className="border-b border-zinc-200 px-5 py-4 bg-white shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-zinc-900"><Camera className="h-4.5 w-4.5" /> Scan Barcode</DialogTitle>
          </div>
          <div className="bg-black p-2 flex-1"><div id="billing-scanner" className="min-h-[300px]" /></div>
          <div className="p-4 bg-white border-t border-zinc-200"><Button variant="outline" onClick={() => setScannerOpen(false)} className="h-11 w-full rounded-xl font-semibold border-zinc-200 bg-white text-zinc-700 text-sm shadow-sm">Close Scanner</Button></div>
        </DialogContent>
      </Dialog>

      {/* SUCCESS MODAL WITH PRINT & WHATSAPP */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-sm w-full rounded-[24px] p-5 text-center border border-zinc-200 bg-white shadow-2xl mt-auto sm:m-auto gap-0 max-h-[90dvh] overflow-y-auto print:hidden">
          <div className="mx-auto flex h-16 w-16 items-center justify-center bg-emerald-50 rounded-full border border-emerald-100 mb-4 mt-2">
            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
          </div>
          
          <DialogTitle className="text-xl font-semibold tracking-tight text-zinc-900">Success</DialogTitle>
          
          <div className="mt-5 border border-zinc-100 bg-zinc-50/80 rounded-2xl p-5 shadow-sm">
            <p className="text-[11px] font-medium uppercase text-zinc-500 tracking-wider mb-1.5">Total Received</p>
            <p className="text-4xl font-semibold tracking-tight text-zinc-900">{formatCurrency(completedOrder?.final_amount || 0)}</p>
            
            <div className="mt-3 flex justify-center gap-2">
              <span className="text-[10px] font-medium text-zinc-700 bg-white border border-zinc-200 rounded-lg px-2.5 py-1.5 inline-flex items-center gap-1.5 shadow-sm">
                <Receipt className="h-3 w-3 text-zinc-400"/> {completedOrder?.order_number}
              </span>
            </div>
          </div>

          {completedOrder?.customerPhone && (
            <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 p-2.5 rounded-xl border border-emerald-100">
              <CheckCircle2 className="h-3.5 w-3.5" /> Auto-Sent to {completedOrder.customerPhone}
            </div>
          )}

          <div className="flex flex-col gap-3 mt-5">
            <div className="flex items-center justify-between bg-zinc-100 border border-zinc-200 rounded-xl p-1">
              <button onClick={() => setPrinterSize("80mm")} className={`flex-1 h-9 text-[11px] font-medium rounded-lg transition-colors ${printerSize === "80mm" ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>3" Prt</button>
              <button onClick={() => setPrinterSize("110mm")} className={`flex-1 h-9 text-[11px] font-medium rounded-lg transition-colors ${printerSize === "110mm" ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>4" Prt</button>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Button onClick={handlePrintReceipt} variant="outline" className="h-11 rounded-xl font-semibold text-zinc-700 border-zinc-200 bg-white text-xs shadow-sm hover:bg-zinc-50">
                <Printer className="h-4 w-4 mr-1.5 text-zinc-500" /> Print
              </Button>
              <Button onClick={handleSendWhatsApp} disabled={!completedOrder?.customerPhone} className="h-11 rounded-xl font-semibold bg-[#25D366] text-white hover:bg-[#1DA851] border border-[#1b8a41] text-xs shadow-sm transition-colors">
                <MessageCircle className="h-4 w-4 mr-1.5" /> Share
              </Button>
            </div>
            
            <Button onClick={() => setShowSuccessModal(false)} className="h-12 w-full rounded-xl bg-zinc-900 font-semibold text-white text-sm transition-all active:scale-[0.98] mt-1.5 shadow-sm">
              New Transaction
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ThermalReceipt order={completedOrder} source="billing" printerSize={printerSize} isEstimate={completedOrder?.is_estimate} />
    </AppLayout>
  );
}