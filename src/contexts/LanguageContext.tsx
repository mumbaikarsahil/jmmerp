import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';

export type Language = 'EN' | 'MR' | 'HI';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const translations = {
  EN: {
    good_morning: "Good Morning",
    good_afternoon: "Good Afternoon",
    good_evening: "Good Evening",
    search_placeholder: "Search billing items, categories, or pages...",
    quick_actions: "Quick Actions",
    yearly_masala: "Yearly Masala",
    dryfruits: "Dryfruits",
    ready_masala: "Ready Masala",
    seeds: "Seeds",
    oils: "Oils & Ghee",
    billing: "Billing",
    inventory: "Inventory",
    dashboard: "Dashboard",
    sales: "Sales Ledger",
    settings: "Settings",
    store_console: "Store Console",
  logged_in_as: "Logged in as",
  db_disconnected: "Database Disconnected",
  system_synced: "System Synced",
  search: "Search",
  searching: "Searching...",
  system_app: "System App",
  product: "Product",
  no_results: "No results found",
  customize_layout: "Customize Layout",
  system_modules: "System Modules",
  layout_manager: "Layout Manager",
  edit_shortcuts: "Edit store shortcuts",
  quick_action_tiles: "Quick Action Tiles",
  saving: "Saving...",
  category_buttons: "Category Buttons",
  action_name_placeholder: "Action Name...",
  category_name_placeholder: "Category Name...",
  add: "Add",
  loading_system: "Loading System...",

  desc_billing: "Fast checkout counter",
  add_stock: "Add Stock",
  desc_add_stock: "Inward shipments",
  udhaar_book: "Due / Advance",
  desc_udhaar_book: "Pending store balances",
  desc_inventory: "Stock and catalog manager",
  desc_sales: "Store transactions ledger",
  discovery: "Discovery",
  desc_discovery: "Customer relationships",
  analytics: "Analytics",
  desc_analytics: "Store performance metrics",
  desc_settings: "Hardware and terminal setup",
  system_override: "System Override",
  desc_system_override: "Root DB access"
  },
  MR: {
    good_morning: "शुभ सकाळ",
    good_afternoon: "शुभ दुपार",
    good_evening: "शुभ संध्याकाळ",
    search_placeholder: "बिलिंग आयटम, मेनू किंवा पेज शोधा...",
    quick_actions: "त्वरित बिलिंग (Quick Actions)",
    yearly_masala: "वर्षभराचे मसाले",
    dryfruits: "ड्रायफ्रूट्स",
    ready_masala: "तयार मसाले",
    seeds: "बियाणे (Seeds)",
    oils: "तेल आणि तूप",
    billing: "बिलिंग (Billing)",
    inventory: "इन्व्हेंटरी (Inventory)",
    dashboard: "डॅशबोर्ड",
    sales: "विक्री (Sales)",
    settings: "सेटिंग्ज",
      store_console: "स्टोअर कन्सोल (Console)",
      logged_in_as: "लॉग इन केले आहे:",
      db_disconnected: "डेटाबेस डिस्कनेक्ट झाला",
      system_synced: "सिस्टम सिंक झाले",
      search: "शोधा",
      searching: "शोधत आहे...",
      system_app: "सिस्टम ॲप",
      product: "उत्पादन (Product)",
      no_results: "काहीही सापडले नाही",
      customize_layout: "लेआउट बदला",
      system_modules: "सिस्टम मॉड्यूल्स",
      layout_manager: "लेआउट व्यवस्थापक",
      edit_shortcuts: "स्टोअर शॉर्टकट संपादित करा",
      quick_action_tiles: "क्विक ॲक्शन टाईल्स",
      saving: "सेव्ह होत आहे...",
      category_buttons: "कॅटेगरी बटणे",
      action_name_placeholder: "क्रियेचे नाव...",
    category_name_placeholder: "श्रेणीचे नाव...",
      add: "जोडा",
      loading_system: "सिस्टम लोड होत आहे...",
    
      desc_billing: "जलद चेकआउट काउंटर",
      add_stock: "स्टॉक जोडा (Add Stock)",
      desc_add_stock: "नवीन माल जमा करा",
      udhaar_book: "उधार बुक (Udhaar Book)",
      desc_udhaar_book: "प्रलंबित स्टोअर शिल्लक",
      desc_inventory: "स्टॉक आणि कॅटलॉग व्यवस्थापक",
      desc_sales: "स्टोअर व्यवहार लेजर",
      discovery: "ग्राहक (CRM)",
      desc_discovery: "ग्राहक संबंध",
      analytics: "अॅनालिटिक्स (Analytics)",
      desc_analytics: "स्टोअर कार्यप्रदर्शन मेट्रिक्स",
      desc_settings: "हार्डवेअर आणि टर्मिनल सेटअप",
      system_override: "सिस्टम ओव्हरराइड",
      desc_system_override: "रूट डीबी प्रवेश"
  },
  HI: {
    good_morning: "शुभ प्रभात",
    good_afternoon: "शुभ दोपहर",
    good_evening: "शुभ संध्या",
    search_placeholder: "आइटम, मेनू या पेज खोजें...",
    quick_actions: "त्वरित क्रिया (Quick Actions)",
    yearly_masala: "सालाना मसाला",
    dryfruits: "मेवे (Dryfruits)",
    ready_masala: "तैयार मसाला",
    seeds: "बीज (Seeds)",
    oils: "तेल और घी",
    billing: "बिलिंग (Billing)",
    inventory: "इन्वेंटरी (Inventory)",
    dashboard: "डैशबोर्ड",
    sales: "बिक्री (Sales)",
    settings: "सेटिंग्स",
    store_console: "स्टोर कंसोल (Console)",
    logged_in_as: "लॉग इन हैं:",
  db_disconnected: "डेटाबेस डिस्कनेक्ट हो गया",
  system_synced: "सिस्टम सिंक हो गया",
  search: "खोजें",
  searching: "खोज रहा है...",
  system_app: "सिस्टम ऐप",
  product: "उत्पाद (Product)",
  no_results: "कोई परिणाम नहीं मिला",
  customize_layout: "लेआउट बदलें",
  system_modules: "सिस्टम मॉड्यूल",
  layout_manager: "लेआउट प्रबंधक",
  edit_shortcuts: "स्टोर शॉर्टकट संपादित करें",
  quick_action_tiles: "क्विक एक्शन टाइल्स",
  saving: "सेव हो रहा है...",
  category_buttons: "कैटेगरी बटन",
  action_name_placeholder: "क्रिया का नाम...",
  category_name_placeholder: "श्रेणी का नाम...",
  add: "जोड़ें",
  loading_system: "सिस्टम लोड हो रहा है...",

  desc_billing: "फास्ट चेकआउट काउंटर",
  add_stock: "स्टॉक जोड़ें (Add Stock)",
  desc_add_stock: "नया माल जमा करें",
  udhaar_book: "उधार बुक (Udhaar Book)",
  desc_udhaar_book: "लंबित स्टोर बैलेंस",
  desc_inventory: "स्टॉक और कैटलॉग प्रबंधक",
  desc_sales: "स्टोर लेनदेन लेजर",
  discovery: "ग्राहक (CRM)",
  desc_discovery: "ग्राहक संबंध",
  analytics: "एनालिटिक्स (Analytics)",
  desc_analytics: "स्टोर प्रदर्शन मेट्रिक्स",
  desc_settings: "हार्डवेयर और टर्मिनल सेटअप",
  system_override: "सिस्टम ओवरराइड",
  desc_system_override: "रूट डीबी एक्सेस"
  }
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    return (localStorage.getItem('jmm_lang') as Language) || 'MR';
  });

  useEffect(() => {
    localStorage.setItem('jmm_lang', language);
  }, [language]);

  const t = (key: keyof typeof translations['EN']) => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
};