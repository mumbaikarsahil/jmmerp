import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";

// Define the Super Admin to prevent lockout
const SUPER_ADMIN_EMAIL = "mumbaikarsahill@gmail.com";

export const ProtectedRoute = ({ 
  children, 
  allowedRoles 
}: { 
  children: JSX.Element; 
  allowedRoles: string[]; 
}) => {
  const [loading, setLoading] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const location = useLocation();

  useEffect(() => {
    const checkAccess = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setAuthorized(false);
        setUserRole(null);
        setLoading(false);
        return;
      }

      // 1. SUPER ADMIN BYPASS: Instantly authorize
      if (session.user.email === SUPER_ADMIN_EMAIL) {
        setAuthorized(true);
        setUserRole("admin"); // Treat super admin as 'admin' for UI purposes
        setLoading(false);
        return;
      }

      // 2. STANDARD USER CHECK
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", session.user.id)
        .single();

      // Force TypeScript to recognize the shape and eliminate the 'never' error
      const profile = data as { role: string | null } | null;

      if (profile && profile.role) {
        const cleanRole = profile.role.toLowerCase();
        setUserRole(cleanRole);

        if (allowedRoles.map(r => r.toLowerCase()).includes(cleanRole)) {
          setAuthorized(true);
        } else {
          setAuthorized(false);
        }
      } else {
        setAuthorized(false);
      }
      
      setLoading(false);
    };

    checkAccess();
  }, [allowedRoles]);

  if (loading) {
    return <div className="h-screen flex items-center justify-center text-zinc-500">Verifying access...</div>;
  }
  
  if (!authorized) {
    // 1. If not logged in at all, send to Login
    if (!userRole) {
      return <Navigate to="/" state={{ from: location }} replace />;
    }

    // 2. If admin/manager trying to access something they shouldn't, bounce to Dashboard
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};