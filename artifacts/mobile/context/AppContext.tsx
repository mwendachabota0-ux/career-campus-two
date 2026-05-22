import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type ApplicationStatus = 'Interested' | 'Applied' | 'Interviewing' | 'Offer' | 'Rejected' | 'Accepted';
export type ThemeOverride = 'system' | 'light' | 'dark';

export interface ProfileField {
  id: string;
  label: string;
  value: string;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  weeklyGoal?: number;
  currentDegree: string;
  institution?: string;
  yearOfStudy?: string;
  skills?: string;
  city?: string;
  preferredIndustries?: string;
  careerGoals: string;
  portfolioUrl?: string;
  linkedInUrl?: string;
  githubUrl?: string;
  profileImageUri?: string;
  profileFields?: ProfileField[];
}

export interface Application {
  id: string;
  companyName: string;
  role: string;
  status: ApplicationStatus;
  deadline?: string;
  notes?: string;
  appliedDate?: string;
  lastModified: string;
  createdDate?: string;
  draftedLetter?: string;
  researchSummary?: string;
  interviewQuestions?: { personal: string[]; company: string[]; experience: string[] };
  interviewVerdict?: string;
}

export interface Contact {
  id: string;
  name: string;
  company: string;
  howWeMet: string;
  notes?: string;
  isWarmLead: boolean;
  needsFollowUp: boolean;
  addedDate: string;
}

export interface SavedEvent {
  id: string;
  title: string;
  eventType: string;
  organizer: string;
  dateLabel: string;
  dateIso?: string;
  location: string;
  description?: string;
  url?: string;
  source?: string;
  tags?: string[];
  isOnline?: boolean;
  savedAt: string;
}

export type DocCategory =
  | 'CV / Resume'
  | 'Cover Letter'
  | 'Certificate'
  | 'Academic Transcript'
  | 'Reference Letter'
  | 'Portfolio'
  | 'Other';

export interface StoredDocument {
  id: string;
  name: string;
  category: DocCategory;
  objectPath: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  extractedText?: string;
}

interface AppContextType {
  profile: UserProfile | null;
  applications: Application[];
  contacts: Contact[];
  savedEvents: SavedEvent[];
  docs: StoredDocument[];
  isLoaded: boolean;
  isAuthenticated: boolean;
  themeOverride: ThemeOverride;
  setThemeOverride: (t: ThemeOverride) => Promise<void>;
  updateProfile: (p: UserProfile) => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  addApplication: (data: Omit<Application, 'id' | 'lastModified'>) => Promise<Application>;
  updateApplication: (id: string, updates: Partial<Application>) => Promise<void>;
  deleteApplication: (id: string) => Promise<void>;
  addContact: (data: Omit<Contact, 'id' | 'addedDate'>) => Promise<Contact>;
  updateContact: (id: string, updates: Partial<Contact>) => Promise<void>;
  deleteContact: (id: string) => Promise<void>;
  saveEvent: (event: Omit<SavedEvent, 'savedAt'>) => Promise<void>;
  unsaveEvent: (id: string) => Promise<void>;
  addDoc: (doc: Omit<StoredDocument, 'id' | 'uploadedAt'>) => Promise<StoredDocument>;
  updateDoc: (id: string, updates: Partial<StoredDocument>) => Promise<void>;
  deleteDoc: (id: string) => Promise<void>;
  clearAllData: () => Promise<void>;
}

export const AppContext = createContext<AppContextType | null>(null);

// ── Storage key helpers ────────────────────────────────────────────────────────
// Keys are user-scoped so multiple users on the same device never share data.
// Legacy (non-scoped) keys are read once for migration then abandoned.

const THEME_KEY = 'cc_theme'; // theme is device-level, not user-level

function storageKeys(uid: string) {
  return {
    profile:  `cc_profile_${uid}`,
    apps:     `cc_applications_${uid}`,
    contacts: `cc_contacts_${uid}`,
    events:   `cc_saved_events_${uid}`,
    docs:     `cc_documents_${uid}`,
  };
}

// Legacy (pre-scoping) keys — used only for one-time migration
const LEGACY_KEYS = {
  profile:  'cc_profile',
  apps:     'cc_applications',
  contacts: 'cc_contacts',
  events:   'cc_saved_events',
  docs:     'cc_documents',
};

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

export function genId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

async function loadLocalData(
  setProfile: (p: UserProfile) => void,
  setApplications: (a: Application[]) => void,
  setContacts: (c: Contact[]) => void,
  setSavedEvents: (e: SavedEvent[]) => void,
  setDocs: (d: StoredDocument[]) => void,
  uid: string,
  displayName?: string,
) {
  const keys = storageKeys(uid);

  // Load from user-scoped keys
  const [rawProfile, rawApps, rawContacts, rawEvents, rawDocs] = await Promise.all([
    AsyncStorage.getItem(keys.profile),
    AsyncStorage.getItem(keys.apps),
    AsyncStorage.getItem(keys.contacts),
    AsyncStorage.getItem(keys.events),
    AsyncStorage.getItem(keys.docs),
  ]);

  // One-time migration: if scoped key is missing, pull from legacy global key
  async function migrateIfNeeded(scopedRaw: string | null, legacyKey: string, scopedKey: string) {
    if (scopedRaw !== null) return scopedRaw; // already scoped
    const legacy = await AsyncStorage.getItem(legacyKey).catch(() => null);
    if (legacy) {
      await AsyncStorage.setItem(scopedKey, legacy).catch(() => {});
    }
    return legacy;
  }

  const [migratedProfile, migratedApps, migratedContacts, migratedEvents, migratedDocs] =
    await Promise.all([
      migrateIfNeeded(rawProfile,  LEGACY_KEYS.profile,  keys.profile),
      migrateIfNeeded(rawApps,     LEGACY_KEYS.apps,     keys.apps),
      migrateIfNeeded(rawContacts, LEGACY_KEYS.contacts, keys.contacts),
      migrateIfNeeded(rawEvents,   LEGACY_KEYS.events,   keys.events),
      migrateIfNeeded(rawDocs,     LEGACY_KEYS.docs,     keys.docs),
    ]);

  const defaultProfile: UserProfile = {
    uid, displayName: displayName ?? 'You',
    currentDegree: '', careerGoals: '', weeklyGoal: 5,
  };

  const p = safeParse<UserProfile>(migratedProfile, defaultProfile);
  if (!migratedProfile) {
    await AsyncStorage.setItem(keys.profile, JSON.stringify(p)).catch(() => {});
  }

  setProfile(p);
  setApplications(safeParse<Application[]>(migratedApps, []));
  setContacts(safeParse<Contact[]>(migratedContacts, []));
  setSavedEvents(safeParse<SavedEvent[]>(migratedEvents, []));
  setDocs(safeParse<StoredDocument[]>(migratedDocs, []));
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [savedEvents, setSavedEvents] = useState<SavedEvent[]>([]);
  const [docs, setDocs] = useState<StoredDocument[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [themeOverride, setThemeOverrideState] = useState<ThemeOverride>('system');

  useEffect(() => {
    const rawThemeLoad = AsyncStorage.getItem(THEME_KEY).then(rawTheme => {
      if (rawTheme === 'light' || rawTheme === 'dark' || rawTheme === 'system') {
        setThemeOverrideState(rawTheme);
      }
    }).catch(() => {});

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      await rawThemeLoad;
      if (session?.user) {
        const meta = session.user.user_metadata as { display_name?: string } | undefined;
        await loadLocalData(
          setProfile, setApplications, setContacts, setSavedEvents, setDocs,
          session.user.id, meta?.display_name,
        );
        setIsAuthenticated(true);
      }
      setIsLoaded(true);
    }).catch(() => setIsLoaded(true));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      // Sign the user out locally if their token can no longer be refreshed
      if (event === 'TOKEN_REFRESHED' && !session) {
        await supabase.auth.signOut().catch(() => {});
        return;
      }

      if (session?.user) {
        const meta = session.user.user_metadata as { display_name?: string } | undefined;
        await loadLocalData(
          setProfile, setApplications, setContacts, setSavedEvents, setDocs,
          session.user.id, meta?.display_name,
        );
        setIsAuthenticated(true);
      } else {
        setIsAuthenticated(false);
        setProfile(null);
        setApplications([]);
        setContacts([]);
        setSavedEvents([]);
        setDocs([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) return { success: false, error: error.message };
      return { success: true };
    } catch {
      return { success: false, error: 'Connection error — check your internet and try again.' };
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: displayName.trim() } },
      });
      if (error) return { success: false, error: error.message };
      // Email-confirmation required: data.user exists but data.session is null.
      // Treat this as success — the signup screen will show "Check your inbox".
      if (data.user) return { success: true };
      return { success: false, error: 'Sign up failed — please try again.' };
    } catch {
      return { success: false, error: 'Connection error — check your internet and try again.' };
    }
  }, []);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // If sign-out fails remotely, clear local state anyway
      setIsAuthenticated(false);
      setProfile(null);
      setApplications([]);
      setContacts([]);
      setSavedEvents([]);
      setDocs([]);
    }
  }, []);

  // ── Scoped key helpers for mutations ────────────────────────────────────────

  const getKeys = useCallback(() => {
    return profile ? storageKeys(profile.uid) : storageKeys('anon');
  }, [profile]);

  const saveApps = useCallback(async (apps: Application[]) => {
    setApplications(apps);
    await AsyncStorage.setItem(getKeys().apps, JSON.stringify(apps)).catch(() => {});
  }, [getKeys]);

  const saveContacts = useCallback(async (ctcts: Contact[]) => {
    setContacts(ctcts);
    await AsyncStorage.setItem(getKeys().contacts, JSON.stringify(ctcts)).catch(() => {});
  }, [getKeys]);

  const updateProfile = useCallback(async (p: UserProfile) => {
    setProfile(p);
    await AsyncStorage.setItem(storageKeys(p.uid).profile, JSON.stringify(p)).catch(() => {});
  }, []);

  const addApplication = useCallback(async (data: Omit<Application, 'id' | 'lastModified'>) => {
    const now = new Date().toISOString();
    const app: Application = { ...data, id: genId(), lastModified: now, createdDate: now };
    setApplications(prev => {
      const next = [app, ...prev];
      AsyncStorage.setItem(getKeys().apps, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return app;
  }, [getKeys]);

  const updateApplication = useCallback(async (id: string, updates: Partial<Application>) => {
    setApplications(prev => {
      const next = prev.map(a => a.id === id ? { ...a, ...updates, lastModified: new Date().toISOString() } : a);
      AsyncStorage.setItem(getKeys().apps, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [getKeys]);

  const deleteApplication = useCallback(async (id: string) => {
    setApplications(prev => {
      const next = prev.filter(a => a.id !== id);
      AsyncStorage.setItem(getKeys().apps, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [getKeys]);

  const addContact = useCallback(async (data: Omit<Contact, 'id' | 'addedDate'>) => {
    const contact: Contact = { ...data, id: genId(), addedDate: new Date().toISOString() };
    setContacts(prev => {
      const next = [contact, ...prev];
      AsyncStorage.setItem(getKeys().contacts, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return contact;
  }, [getKeys]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    setContacts(prev => {
      const next = prev.map(c => c.id === id ? { ...c, ...updates } : c);
      AsyncStorage.setItem(getKeys().contacts, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [getKeys]);

  const deleteContact = useCallback(async (id: string) => {
    setContacts(prev => {
      const next = prev.filter(c => c.id !== id);
      AsyncStorage.setItem(getKeys().contacts, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [getKeys]);

  const saveEvent = useCallback(async (event: Omit<SavedEvent, 'savedAt'>) => {
    const saved: SavedEvent = { ...event, savedAt: new Date().toISOString() };
    setSavedEvents(prev => {
      if (prev.some(e => e.id === event.id)) return prev;
      const next = [saved, ...prev];
      AsyncStorage.setItem(getKeys().events, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [getKeys]);

  const unsaveEvent = useCallback(async (id: string) => {
    setSavedEvents(prev => {
      const next = prev.filter(e => e.id !== id);
      AsyncStorage.setItem(getKeys().events, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [getKeys]);

  const addDoc = useCallback(async (data: Omit<StoredDocument, 'id' | 'uploadedAt'>) => {
    const doc: StoredDocument = { ...data, id: genId(), uploadedAt: new Date().toISOString() };
    setDocs(prev => {
      const next = [doc, ...prev];
      AsyncStorage.setItem(getKeys().docs, JSON.stringify(next)).catch(() => {});
      return next;
    });
    return doc;
  }, [getKeys]);

  const updateDoc = useCallback(async (id: string, updates: Partial<StoredDocument>) => {
    setDocs(prev => {
      const next = prev.map(d => d.id === id ? { ...d, ...updates } : d);
      AsyncStorage.setItem(getKeys().docs, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [getKeys]);

  const deleteDoc = useCallback(async (id: string) => {
    setDocs(prev => {
      const next = prev.filter(d => d.id !== id);
      AsyncStorage.setItem(getKeys().docs, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [getKeys]);

  const setThemeOverride = useCallback(async (t: ThemeOverride) => {
    setThemeOverrideState(t);
    await AsyncStorage.setItem(THEME_KEY, t).catch(() => {});
  }, []);

  const clearAllData = useCallback(async () => {
    const keys = getKeys();
    await AsyncStorage.multiRemove([
      keys.profile, keys.apps, keys.contacts, keys.events, keys.docs,
    ]).catch(() => {});
    setProfile(null);
    setApplications([]);
    setContacts([]);
    setSavedEvents([]);
    setDocs([]);
  }, [getKeys]);

  return (
    <AppContext.Provider value={{
      profile, applications, contacts, savedEvents, docs, isLoaded,
      isAuthenticated,
      themeOverride, setThemeOverride,
      updateProfile,
      signIn, signUp, signOut,
      addApplication, updateApplication, deleteApplication,
      addContact, updateContact, deleteContact,
      saveEvent, unsaveEvent,
      addDoc, updateDoc, deleteDoc,
      clearAllData,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
