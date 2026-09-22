import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Lock, Mail, ShieldCheck, Loader2 } from "lucide-react";
import { Label } from "recharts";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  
  // 2FA States
  const [show2FA, setShow2FA] = useState(false);
  const [authCode, setAuthCode] = useState<number | null>(null);
  
  const navigate = useNavigate();
  const { toast } = useToast();

  // 1. Auto-Redirect if already logged in
  useEffect(() => {
    const checkActiveSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // Added (supabase as any) to bypass the TypeScript error
        const { data: profile } = await (supabase as any).from('profiles').select('role').eq('id', session.user.id).single();
        if (profile?.role === 'admin') navigate('/dashboard', { replace: true });
        else navigate('/billing', { replace: true });
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
      // Authenticate
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;

      // Check Role (Bypass strict TS typing for dynamic profile check)
      const { data: profile } = await (supabase as any)
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', authData.user.id)
        .single();

      if (profile?.role === 'admin') {
        // Owner bypasses 2FA
        navigate('/dashboard', { replace: true });
      } else {
        // Employee triggers Google-Style 2FA
        const generatedCode = Math.floor(10 + Math.random() * 90); // 10 to 99
        setAuthCode(generatedCode);
        setShow2FA(true);

        // Bypass strict TS typing for the newly created login_requests table
        const { data: requestRecord, error: reqError } = await (supabase as any)
          .from('login_requests')
          .insert({
            tenant_id: profile?.tenant_id,
            user_id: authData.user.id,
            email: authData.user.email,
            auth_code: generatedCode
          })
          .select()
          .single();

        if (reqError) throw reqError;
        if (!requestRecord) throw new Error("Could not create login request");

        // Listen for Owner Approval
        supabase.channel(`login-approval-${requestRecord.id}`)
          .on('postgres_changes', { 
            event: 'UPDATE', 
            schema: 'public', 
            table: 'login_requests', 
            filter: `id=eq.${requestRecord.id}` 
          }, async (payload: any) => {
            if (payload.new.status === 'APPROVED') {
              toast({ title: "Access Granted", description: "Owner approved your session." });
              navigate('/billing', { replace: true });
            } else if (payload.new.status === 'DENIED') {
              await supabase.auth.signOut();
              setShow2FA(false);
              toast({ title: "Access Denied", description: "Owner rejected this login attempt.", variant: "destructive" });
            }
          }).subscribe();
      }
    } catch (error: any) {
      toast({ title: "Login Failed", description: error.message, variant: "destructive" });
      await supabase.auth.signOut();
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-900" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-md p-8 rounded-3xl shadow-xl border-zinc-200 bg-white">
        
        {show2FA ? (
          <div className="flex flex-col items-center text-center animate-in fade-in zoom-in duration-300">
            <div className="h-20 w-20 bg-blue-50 rounded-full flex items-center justify-center mb-6 border border-blue-100 shadow-inner">
              <ShieldCheck className="h-10 w-10 text-blue-500" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Device Verification</h2>
            <p className="text-sm font-medium text-zinc-500 mb-8">Ask the owner to verify this login attempt. Select the number below on their screen.</p>
            
            <div className="text-6xl font-black text-zinc-900 tracking-tighter mb-8 bg-zinc-100 px-8 py-4 rounded-2xl border border-zinc-200 shadow-sm">
              {authCode}
            </div>
            
            <div className="flex items-center text-sm font-semibold text-zinc-400 animate-pulse">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Waiting for approval...
            </div>
          </div>
        ) : (
          <>
            <div className="text-center mb-8">
              <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-900 mb-4 shadow-md">
                <Lock className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">Welcome Back</h1>
              <p className="text-sm font-medium text-zinc-500 mt-1">Sign in to your workspace</p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                  <Input 
                    type="email" 
                    required 
                    value={email} 
                    onChange={e => setEmail(e.target.value)} 
                    className="h-12 pl-10 rounded-xl bg-zinc-50 border-zinc-200 text-[16px] font-medium focus-visible:ring-zinc-900" 
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold uppercase tracking-wider text-zinc-500 ml-1">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-zinc-400" />
                  <Input 
                    type="password" 
                    required 
                    value={password} 
                    onChange={e => setPassword(e.target.value)} 
                    className="h-12 pl-10 rounded-xl bg-zinc-50 border-zinc-200 text-[16px] font-medium focus-visible:ring-zinc-900" 
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <Button type="submit" disabled={loading} className="w-full h-12 rounded-xl bg-zinc-900 font-bold text-[16px] text-white hover:bg-zinc-800 transition-all shadow-md">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In"}
              </Button>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}