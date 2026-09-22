import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

export const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const location = useLocation();

  useEffect(() => {
    let mounted = true;

    const verifySession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          // SECURITY CHECK: Verify the user is still marked as active by the owner
          const { data: profile } = await (supabase as any)
            .from('profiles')
            .select('is_active')
            .eq('id', session.user.id)
            .single();

          if (profile && profile.is_active === false) {
            // Force logout if suspended
            await supabase.auth.signOut();
            if (mounted) setIsAuthenticated(false);
          } else {
            if (mounted) setIsAuthenticated(true);
          }
        } else {
          if (mounted) setIsAuthenticated(false);
        }
      } catch (error) {
        console.error("Session check error:", error);
      } finally {
        if (mounted) setIsChecking(false);
      }
    };

    verifySession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        if (event === 'SIGNED_OUT') setIsAuthenticated(false);
        else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') verifySession();
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (isChecking) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-200 border-t-zinc-900" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};