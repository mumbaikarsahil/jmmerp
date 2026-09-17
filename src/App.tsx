import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner, toast as sonnerToast } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { StatusBar, Style } from "@capacitor/status-bar";


// Import the Bouncer
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";

// Pages
import Login from "./pages/auth/Login"; 
import Index from "./pages/Index";
import AddInventory from "./pages/inventory/AddInventory";
import Billing from "./pages/billing/Billing";
import Analytics from "./pages/analytics/Analytics";
import Manage from "./pages/manage/Manage";
import NotFound from "./pages/NotFound";
import Udhaar from "./pages/udhaar/Udhaar";
import Sales from "./pages/sales/Sales";
import Settings from "./pages/settings/Settings";
import InvoiceView from "./pages/invoiceview/InvoiceView";
import SuperAdmin from "./pages/admin/SuperAdmin";
import CRM from "./pages/crm/crm";
import Production from "./pages/production/Production";
import MixMasala from "./pages/mixmasala/MixMasala";

const queryClient = new QueryClient();

const AppRoutes = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPressTime = useRef(0);

  useEffect(() => {
    const configureStatusBar = async () => {
      try {
        await StatusBar.setStyle({ style: Style.Light }); 
        await StatusBar.setBackgroundColor({ color: '#FFFFFF' }); 
      } catch (err) {
        console.log("Status bar not available (web mode)");
      }
    };
    configureStatusBar();

    const setupBackButton = async () => {
      const backListener = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        const currentPath = location.pathname;

        if (currentPath === "/" || currentPath === "/dashboard" || currentPath === "/billing") {
          const now = Date.now();
          if (now - lastBackPressTime.current < 2000) {
            CapacitorApp.exitApp();
          } else {
            lastBackPressTime.current = now;
            sonnerToast("Press back again to exit", {
              position: "bottom-center",
              duration: 2000,
            });
          }
        } else {
          navigate(-1); 
        }
      });

      return backListener;
    };

    const listenerPromise = setupBackButton();

    return () => {
      listenerPromise.then(listener => listener.remove());
    };
  }, [location, navigate]);

  return (
    <Routes>
      {/* PUBLIC ROUTES */}
      <Route path="/" element={<Login />} />
      <Route path="/invoice/:id" element={<InvoiceView />} />
      <Route path="/super-admin-secret" element={<SuperAdmin />} />
      
      {/* SHARED ROUTES (Admins, Managers, and Sales) */}
      <Route path="/dashboard" element={
        <ProtectedRoute allowedRoles={['admin', 'manager', 'sales']}>
          <Index />
        </ProtectedRoute>
      } />
      <Route path="/billing" element={
        <ProtectedRoute allowedRoles={['admin', 'manager', 'sales']}>
          <Billing />
        </ProtectedRoute>
      } />
      <Route path="/settings" element={
        <ProtectedRoute allowedRoles={['admin', 'manager', 'sales']}>
          <Settings />
        </ProtectedRoute>
      } />

<Route path="/mixmasala" element={
        <ProtectedRoute allowedRoles={['admin', 'manager', 'sales']}>
          <MixMasala />
        </ProtectedRoute>
      } />


      {/* RESTRICTED ROUTES (Admins and Managers Only) */}
      <Route path="/inventory/add" element={
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <AddInventory />
        </ProtectedRoute>
      } />

      <Route path="/production" element={
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <Production />
        </ProtectedRoute>
      } />
      <Route path="/analytics" element={
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <Analytics />
        </ProtectedRoute>
      } />
      <Route path="/manage" element={
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <Manage />
        </ProtectedRoute>
      } />
      <Route path="/udhaar" element={
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <Udhaar />
        </ProtectedRoute>
      } />
      <Route path="/sales" element={
        <ProtectedRoute allowedRoles={['admin', 'manager']}>
          <Sales />
        </ProtectedRoute>
      } />

<Route path="/crm" element={
  <ProtectedRoute allowedRoles={['admin', 'manager']}>
    <CRM />
  </ProtectedRoute>
} />


      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;