"use client";

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Capacitor } from "@capacitor/core"; 
import { 
  Loader2, 
  Eye,
  EyeOff,
  Headphones,
  ShoppingBag,
  ShieldCheck,
  ArrowLeft
} from "lucide-react";

export default function RetailLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  
  // Form Toggle State (Login vs Request Access)
  const [isLoginView, setIsLoginView] = useState(true);

  // Request Form State
  const [reqName, setReqName] = useState("");
  const [reqPhone, setReqPhone] = useState("");
  const [reqStore, setReqStore] = useState("");
  const [reqNeeds, setReqNeeds] = useState("");

  const navigate = useNavigate();
  const { toast } = useToast();
  
  const isApp = Capacitor.isNativePlatform();

  // --- CHECK EXISTING SESSION & ROUTE BY ROLE ---
  useEffect(() => {
    const checkExistingSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        // Route Sales directly to billing, everyone else to dashboard
        if (profile?.role?.toLowerCase() === 'sales') {
          navigate("/dashboard", { replace: true });
        } else {
          navigate("/", { replace: true });
        }
      }
    };
    checkExistingSession();
  }, [navigate]);

  // --- 1. HANDLE LOGIN & ROUTE BY ROLE ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Authenticate user
      const { data: authData, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // 2. Default destination for Admins & Managers
      let destination = "/dashboard"; 

      // 3. Check role in database
      if (authData.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .single();

        // If sales, change destination to billing
        if (profile?.role?.toLowerCase() === 'sales') {
          destination = "/dashboard";
        }
      }

      toast({ title: "Welcome back!", className: "bg-indigo-600 text-white border-none" });
      
      // 4. Navigate directly to the allowed page
      navigate(destination, { replace: true }); 

    } catch (error: any) {
      toast({ 
        title: "Login Failed", 
        description: "Invalid credentials. Please try again.", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    toast({ title: "Notice", description: "Please contact the system admin or the main office manager to reset your credentials." });
  };

  // --- 2. HANDLE REQUEST ACCESS ---
  const handleRequestAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
        setLoading(false);
        toast({ 
            title: "Request Sent!", 
            description: "Our sales team will call you within 24 hours.", 
            className: "bg-blue-600 text-white border-none"
        });
        setReqName("");
        setReqPhone("");
        setReqStore("");
        setReqNeeds("");
        setIsLoginView(true);
    }, 1500);
  };

  return (
    <div className="flex min-h-[100dvh] w-full bg-white font-sans overflow-hidden">
      
      {/* --- INJECTED CSS FOR CONNECTED DESIGN & AURORA WAVES --- */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes dynamicGradient {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes liquidWave {
          0% { transform: scale(1) translate(0, 0); opacity: 0.5; }
          33% { transform: scale(1.1) translate(30px, -50px); opacity: 0.7; }
          66% { transform: scale(0.9) translate(-20px, 20px); opacity: 0.6; }
          100% { transform: scale(1) translate(0, 0); opacity: 0.5; }
        }
        @keyframes diagonalLight {
          0% { transform: rotate(35deg) translate(-100%); opacity: 0.4; }
          50% { opacity: 0.6; }
          100% { transform: rotate(35deg) translate(100%); opacity: 0.4; }
        }
        .bg-connected {
          background: linear-gradient(-45deg, #e0e7ff, #ede9fe, #f3e8ff, #ffffff, #e0e7ff);
          background-size: 400% 400%;
          animation: dynamicGradient 15s ease infinite;
        }
        .animate-liquid {
          animation: liquidWave 10s ease-in-out infinite;
        }
        .animate-diagonal-light {
          animation: diagonalLight 12s ease infinite;
        }
        .glass-overlay {
          background: rgba(255, 255, 255, 0.25);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
        }
      `}} />

      {/* ========================================================= */}
      {/* LEFT SIDE: ART & BRANDING (Split-screen)                  */}
      {/* ========================================================= */}
      <div className="hidden lg:flex flex-col relative w-1/2 xl:w-[55%] bg-connected border-r border-slate-200 overflow-hidden">
        
        {/* Animated Background Elements */}
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-indigo-200/50 blur-[120px] animate-liquid pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[60%] rounded-full bg-violet-200/60 blur-[120px] animate-liquid pointer-events-none" />

        {/* Diagonal Light Rays */}
        <div className="absolute -inset-[100%] flex gap-8 opacity-40 animate-diagonal-light rotate-[35deg] pointer-events-none z-0">
          <div className="w-32 h-[300%] bg-gradient-to-r from-transparent via-white to-transparent blur-xl" />
          <div className="w-64 h-[300%] bg-gradient-to-r from-transparent via-white to-transparent blur-2xl" />
          <div className="w-24 h-[300%] bg-gradient-to-r from-transparent via-indigo-100 to-transparent blur-xl" />
        </div>

        {/* Frosted Glass Layer */}
        <div className="absolute inset-0 glass-overlay z-0"></div>

        {/* Top Left Logo */}
        <div className="absolute top-0 left-0 p-8 xl:p-12 z-30">
          <div className="bg-white/90 backdrop-blur-md shadow-sm border border-white/20 px-5 py-2.5 rounded-2xl flex items-center gap-2">
            <ShoppingBag className="text-indigo-600 h-5 w-5" />
            <span className="font-black text-xl tracking-tight text-slate-900">Biillo</span>
            <span className="font-medium text-indigo-600 text-xl tracking-tight">Retail</span>
          </div>
        </div>

        {/* Model Image */}
        <div className="relative flex-1 flex items-end justify-center pt-12 z-10 w-full min-h-0 overflow-hidden">
          {/* PLACE YOUR TRANSPARENT IMAGE IN THE PUBLIC FOLDER AS 'retail-model.png' */}
          <img 
            src="/retail-model.png" 
            alt="Retail Model" 
            className="w-auto h-full max-h-[55vh] object-contain object-bottom z-10 drop-shadow-2xl"
          />
          <div className="absolute bottom-0 left-0 w-full h-12 bg-gradient-to-b from-transparent to-white z-20"></div>
        </div>

        {/* Bottom Text Area */}
        <div className="relative z-20 px-8 xl:px-12 pb-8 xl:pb-12 w-full bg-white pt-6 shrink-0">
          <div className="mb-5 flex items-center gap-2 bg-[#312e81]/10 text-[#312e81] px-3 py-1 rounded-full text-xs font-semibold tracking-widest uppercase w-fit">
            Biillo Retail OS
          </div>
          <h1 className="text-4xl xl:text-5xl font-semibold tracking-tight text-[#312e81] mb-5 leading-[1.15]">
            The automated co-founder <br />
            for modern retail brands.
          </h1>
          
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-[15px] font-medium text-[#312e81]/80">
            <span className="flex items-center gap-2">
              <span className="text-[#312e81]/40 font-light text-lg">+</span> Omnichannel POS
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[#312e81]/40 font-light text-lg">+</span> Smart Inventory
            </span>
            <span className="flex items-center gap-2">
              <span className="text-[#312e81]/40 font-light text-lg">+</span> Automated CRM
            </span>
          </div>
        </div>
      </div>

      {/* MOBILE HEADER */}
      <div className="lg:hidden absolute top-0 left-0 right-0 p-6 flex justify-center z-20 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md shadow-sm border border-slate-100 px-5 py-2.5 rounded-2xl flex items-center gap-2 pointer-events-auto">
          <ShoppingBag className="text-indigo-600 h-5 w-5" />
          <span className="font-black text-xl tracking-tight text-slate-900">Biillo</span>
          <span className="font-medium text-indigo-600 text-xl tracking-tight">Retail</span>
        </div>
      </div>

      {/* ========================================================= */}
      {/* RIGHT SIDE: FORM AREA                                     */}
      {/* ========================================================= */}
      <div className="flex flex-col justify-center flex-1 w-full lg:w-1/2 xl:w-[45%] px-6 sm:px-12 lg:px-16 xl:px-24 bg-white relative z-10 overflow-y-auto shadow-[-20px_0_40px_rgba(0,0,0,0.02)] pt-24 lg:pt-0">
        <div className="mx-auto w-full max-w-[380px]">
          
          {isLoginView ? (
            /* --- LOGIN VIEW --- */
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="mb-8">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl mb-2">
                  Welcome back
                </h2>
                <p className="text-[15px] text-slate-500">
                  Enter your credentials to access your workspace.
                </p>
              </div>

              <form onSubmit={handleLogin}>
                <div className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="email" className="text-sm font-semibold text-slate-900">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      disabled={loading}
                      required
                      className="h-11 text-[16px] sm:text-sm bg-white border-slate-200 focus-visible:border-indigo-600 focus-visible:ring-1 focus-visible:ring-indigo-600 rounded-lg shadow-sm transition-all placeholder:text-slate-400"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password" className="text-sm font-semibold text-slate-900">
                        Password
                      </Label>
                      <button 
                        type="button"
                        onClick={handleForgotPassword}
                        className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors outline-none focus-visible:underline"
                      >
                        Forgot?
                      </button>
                    </div>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={loading}
                        required
                        className="h-11 text-[16px] sm:text-sm bg-white border-slate-200 focus-visible:border-indigo-600 focus-visible:ring-1 focus-visible:ring-indigo-600 rounded-lg shadow-sm transition-all pr-12 placeholder:text-slate-400"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={loading}
                        className="absolute right-0 top-0 h-full px-3 text-slate-400 hover:text-slate-700 focus:outline-none disabled:opacity-50 transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 space-y-5">
                    <Button
                      type="submit"
                      disabled={loading}
                      className="w-full h-11 rounded-lg text-[15px] font-medium bg-slate-900 hover:bg-slate-800 text-white transition-all active:scale-[0.98] shadow-md"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Authenticating...
                        </>
                      ) : (
                        'Sign In'
                      )}
                    </Button>
                    
                    <div className="w-full flex items-center justify-center gap-2 p-3 rounded-lg bg-slate-50/50 border border-slate-100">
                      <ShieldCheck className="h-4 w-4 text-slate-400 shrink-0" />
                      <p className="text-[11px] font-medium text-slate-500">
                        Secure enterprise environment. All activity is logged.
                      </p>
                    </div>
                  </div>
                </div>
              </form>

              <div className="mt-8 text-center">
                <p className="text-sm text-slate-500 font-medium">
                  Don't have an account?{' '}
                  <button onClick={() => setIsLoginView(false)} className="text-indigo-600 font-bold hover:underline">
                    Request Access
                  </button>
                </p>
              </div>
            </div>

          ) : (

            /* --- REQUEST ACCESS VIEW --- */
            <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
              <button 
                onClick={() => setIsLoginView(true)}
                className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900 mb-6 transition-colors"
              >
                <ArrowLeft size={16} /> Back to login
              </button>

              <div className="mb-8">
                <h2 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl mb-2">
                  Join Biillo Retail
                </h2>
                <p className="text-[15px] text-slate-500">
                  Request a demo to see how our automated management streamlines your store.
                </p>
              </div>

              <form onSubmit={handleRequestAccess} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-sm font-semibold text-slate-900">Name</Label>
                        <Input 
                           placeholder="John Doe" 
                           className="h-11 text-[16px] sm:text-sm bg-white border-slate-200 focus-visible:border-indigo-600 focus-visible:ring-1 focus-visible:ring-indigo-600 rounded-lg shadow-sm"
                           value={reqName}
                           onChange={e => setReqName(e.target.value)}
                           required
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-sm font-semibold text-slate-900">Mobile</Label>
                        <Input 
                           placeholder="98765..." 
                           className="h-11 text-[16px] sm:text-sm bg-white border-slate-200 focus-visible:border-indigo-600 focus-visible:ring-1 focus-visible:ring-indigo-600 rounded-lg shadow-sm"
                           type="tel"
                           value={reqPhone}
                           onChange={e => setReqPhone(e.target.value)}
                           required
                        />
                    </div>
                </div>

                <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-900">Store / Brand Name</Label>
                    <Input 
                        placeholder="e.g. Sakhi Collections" 
                        className="h-11 text-[16px] sm:text-sm bg-white border-slate-200 focus-visible:border-indigo-600 focus-visible:ring-1 focus-visible:ring-indigo-600 rounded-lg shadow-sm"
                        value={reqStore}
                        onChange={e => setReqStore(e.target.value)}
                        required
                    />
                </div>

                <div className="space-y-1.5">
                    <Label className="text-sm font-semibold text-slate-900">Requirements (Optional)</Label>
                    <Textarea 
                        placeholder="I need Inventory management, POS, and CRM..." 
                        className="h-20 text-[16px] sm:text-sm bg-white border-slate-200 focus-visible:border-indigo-600 focus-visible:ring-1 focus-visible:ring-indigo-600 rounded-lg shadow-sm resize-none"
                        value={reqNeeds}
                        onChange={e => setReqNeeds(e.target.value)}
                    />
                </div>

                <Button 
                  type="submit" 
                  disabled={loading}
                  className="w-full h-11 rounded-lg text-[15px] font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-all active:scale-[0.98] shadow-md mt-2" 
                >
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Request Demo"}
                </Button>
              </form>
              
              <div className="mt-6 flex flex-col items-center justify-center gap-2 pt-6 border-t border-slate-100">
                  <p className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Direct Sales Line</p>
                  <a href="tel:+917304600704" className="text-base font-black text-slate-800 hover:text-indigo-600 flex items-center gap-2 transition-colors">
                      <Headphones className="h-4 w-4" /> +91 73046 00704
                  </a>
              </div>
            </div>
          )}

          <div className="mt-8 pt-6 border-t border-slate-100 text-center pb-8 lg:pb-0">
            <p className="text-[11px] text-slate-400 font-medium">
              By continuing, you agree to our <a href="#" className="text-slate-600 hover:text-slate-900 transition-colors">Privacy Policy</a> and <a href="#" className="text-slate-600 hover:text-slate-900 transition-colors">Terms of Service</a>.
            </p>
          </div>
        </div>
      </div>
      
    </div>
  )
}