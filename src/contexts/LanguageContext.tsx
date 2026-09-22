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
    settings: "Settings"
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
    settings: "सेटिंग्ज"
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
    settings: "सेटिंग्स"
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