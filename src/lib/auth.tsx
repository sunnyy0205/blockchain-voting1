import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';

interface Profile {
  id: string;
  user_id: string;
  role: 'company' | 'voter';
  name: string;
  email: string;
  phone: string | null;
  id_document_url: string | null;
  id_verified: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, role: 'company' | 'voter', name: string, phone?: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error) {
      console.error('Failed to fetch profile', error);
      setProfile(null);
      return null;
    }

    const nextProfile = data as Profile;
    setProfile(nextProfile);
    return nextProfile;
  }, []);

  useEffect(() => {
    let isMounted = true;

    const syncAuthState = async (nextSession: Session | null, shouldLoadProfile = true) => {
      if (!isMounted) return;

      setSession(nextSession);
      const nextUser = nextSession?.user ?? null;
      setUser(nextUser);

      if (!nextUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      if (shouldLoadProfile) {
        await fetchProfile(nextUser.id);
      }

      if (isMounted) {
        setLoading(false);
      }
    };

    void supabase.auth.getSession().then(({ data: { session } }) => {
      setLoading(true);
      void syncAuthState(session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const shouldLoadProfile = event !== 'TOKEN_REFRESHED';

      if (shouldLoadProfile && isMounted) {
        setLoading(true);
      }

      void syncAuthState(nextSession, shouldLoadProfile);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const signUp = async (email: string, password: string, role: 'company' | 'voter', name: string, phone?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role, name, phone: phone || null } },
    });
    if (error) throw error;
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    setSession(data.session ?? null);
    setUser(data.user ?? null);

    if (data.user) {
      await fetchProfile(data.user.id);
    } else {
      setProfile(null);
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
