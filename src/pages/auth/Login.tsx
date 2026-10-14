import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Lock, Mail, Loader2, ShieldCheck, ArrowLeft } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState(""); 
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  
  // Verification Code States (For Employees)
  const [requiresVerification, setRequiresVerification] = useState(false);
  const [expectedCode, setExpectedCode] = useState("");
  const [enteredCode, setEnteredCode] = useState("");
  
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    const checkActiveSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await (supabase as any).from('profiles').select('role, is_active').eq('id', session.user.id).single();
        
        if (profile?.is_active === false) {
          await supabase.auth.signOut();
          setCheckingSession(false);
          return;
        }
        
        if (profile?.role === 'admin' || profile?.role === 'owner') {
          navigate('/dashboard', { replace: true });
        } else {
          navigate('/billing', { replace: true });
        }
      } else {
        setCheckingSession(false);
      }
    };
    checkActiveSession();
  }, [navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Authenticate with standard Email
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ 
        email: email.trim(), 
        password 
      });
      if (authError) throw authError;

      // 2. Fetch Employee Profile
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('role, tenant_id, is_active')
        .eq('id', authData.user.id)
        .single();

      if (profile?.is_active === false) throw new Error("Account suspended.");

      // 3. Owners / Admins bypass verification code
      if (profile?.role === 'admin' || profile?.role === 'owner') {
        navigate('/dashboard', { replace: true });
        return;
      }

      // 4. Employees must pass Verification Code Check
      const { data: tenant } = await (supabase as any)
        .from('tenants')
        .select('store_status, daily_pin')
        .eq('id', profile.tenant_id)
        .single();

      if (tenant?.store_status === 'CLOSED') {
        throw new Error("System Locked. The store is currently closed.");
      }

      // Trigger Verification Code Screen
      setExpectedCode(tenant?.daily_pin || "1234");
      setRequiresVerification(true);

    } catch (error: any) {
      toast({ title: "Access Denied", description: error.message, variant: "destructive" });
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  const handleVerificationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (enteredCode === expectedCode) {
      toast({ title: "Verified", description: "Store system unlocked.", variant: "default" });
      navigate('/billing', { replace: true });
    } else {
      toast({ title: "Verification Failed", description: "Incorrect code.", variant: "destructive" });
      setEnteredCode("");
    }
  };

  const cancelVerification = async () => {
    await supabase.auth.signOut();
    setRequiresVerification(false);
    setEnteredCode("");
  };

  if (checkingSession) {
    return <div className="h-screen w-screen flex items-center justify-center bg-zinc-50"><Loader2 className="h-8 w-8 animate-spin text-zinc-900" /></div>;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-md p-8 rounded-[32px] shadow-xl border-zinc-200 bg-white">
        
        {requiresVerification ? (
          <div className="flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <button onClick={cancelVerification} className="self-start p-2 -ml-2 mb-2 text-zinc-400 hover:bg-zinc-100 rounded-full transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="h-20 w-20 bg-blue-50 rounded-[24px] flex items-center justify-center mb-5 border border-blue-100 shadow-inner">
              <ShieldCheck className="h-10 w-10 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Verification Code</h2>
            <p className="text-sm font-medium text-zinc-500 mb-8 px-2">Enter today's 4-digit code to unlock the billing terminal.</p>
            
            <form onSubmit={handleVerificationSubmit} className="w-full flex flex-col items-center">
              <Input
                type="password"
                maxLength={4}
                autoFocus
                required
                value={enteredCode}
                onChange={(e) => setEnteredCode(e.target.value.replace(/\D/g, ''))} 
                className="w-40 h-20 text-center text-4xl tracking-[0.5em] font-black bg-zinc-100 border-zinc-200 rounded-2xl shadow-inner focus-visible:ring-blue-500 mb-6"
              />
              <Button type="submit" disabled={enteredCode.length !== 4} className="w-full h-14 rounded-2xl bg-zinc-900 font-bold text-[16px] text-white hover:bg-zinc-800 transition-all shadow-md">
                Verify & Enter
              </Button>
            </form>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-[20px] bg-zinc-900 mb-5 shadow-md">
                <Lock className="h-7 w-7 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">System Login</h1>
              <p className="text-sm font-medium text-zinc-500 mt-1">Sign in to the JMM workspace</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Email Address</Label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                  <Input 
                    type="email"
                    required 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="h-14 pl-12 rounded-2xl bg-zinc-50 border-zinc-200 text-[16px] font-bold focus-visible:ring-zinc-900 shadow-inner" 
                    placeholder="name@example.com"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold uppercase tracking-widest text-zinc-500 ml-1">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                  <Input 
                    type="password" 
                    required 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    className="h-14 pl-12 rounded-2xl bg-zinc-50 border-zinc-200 text-[16px] font-bold focus-visible:ring-zinc-900 shadow-inner" 
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full h-14 mt-2 rounded-2xl bg-zinc-900 font-bold text-[16px] text-white hover:bg-zinc-800 transition-all shadow-md active:scale-95">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Secure Login"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}