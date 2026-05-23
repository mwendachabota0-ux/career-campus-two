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

function normalizeString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return undefined;
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(item => typeof item === 'string') : [];
}

function mapRemoteProfileRow(row: Record<string, any>, uid: string): UserProfile {
  return {
    uid,
    displayName: normalizeString(row.display_name) ?? normalizeString(row.name) ?? 'You',
    weeklyGoal: typeof row.weekly_goal === 'number' ? row.weekly_goal : 5,
    currentDegree: normalizeString(row.current_degree) ?? '',
    institution: normalizeString(row.institution),
    yearOfStudy: normalizeString(row.year_of_study),
    skills: normalizeString(row.skills),
    city: normalizeString(row.city),
    preferredIndustries: normalizeString(row.preferred_industries),
    careerGoals: normalizeString(row.career_goals) ?? '',
    portfolioUrl: normalizeString(row.portfolio_url),
    linkedInUrl: normalizeString(row.linkedin_url),
    githubUrl: normalizeString(row.github_url),
    profileImageUri: normalizeString(row.profile_image_uri),
    profileFields: Array.isArray(row.profile_fields) ? row.profile_fields : undefined,
  };
}

function mapProfileToRemoteRow(profile: UserProfile): Record<string, unknown> {
  return {
    user_id: profile.uid,
    display_name: profile.displayName,
    weekly_goal: profile.weeklyGoal,
    current_degree: profile.currentDegree,
    institution: profile.institution,
    year_of_study: profile.yearOfStudy,
    skills: profile.skills,
    city: profile.city,
    preferred_industries: profile.preferredIndustries,
    career_goals: profile.careerGoals,
    portfolio_url: profile.portfolioUrl,
    linkedin_url: profile.linkedInUrl,
    github_url: profile.githubUrl,
    profile_image_uri: profile.profileImageUri,
    profile_fields: profile.profileFields,
  };
}

function mapRemoteApplicationRow(row: Record<string, any>): Application {
  return {
    id: String(row.id ?? genId()),
    companyName: normalizeString(row.company_name) ?? normalizeString(row.companyName) ?? '',
    role: normalizeString(row.role) ?? '',
    status: (row.status as Application['status']) ?? 'Interested',
    deadline: normalizeString(row.deadline) ?? normalizeString(row.deadline_date),
    notes: normalizeString(row.notes),
    appliedDate: normalizeString(row.applied_date) ?? normalizeString(row.appliedDate),
    lastModified: normalizeString(row.last_modified) ?? normalizeString(row.lastModified) ?? new Date().toISOString(),
    createdDate: normalizeString(row.created_date) ?? normalizeString(row.createdDate),
    draftedLetter: normalizeString(row.drafted_letter) ?? normalizeString(row.draftedLetter),
    researchSummary: normalizeString(row.research_summary) ?? normalizeString(row.researchSummary),
    interviewQuestions: typeof row.interview_questions === 'object' ? row.interview_questions : row.interviewQuestions ?? { personal: [], company: [], experience: [] },
    interviewVerdict: normalizeString(row.interview_verdict) ?? normalizeString(row.interviewVerdict),
  };
}

function mapApplicationToRemoteRow(app: Application, uid: string): Record<string, unknown> {
  return {
    id: app.id,
    user_id: uid,
    company_name: app.companyName,
    role: app.role,
    status: app.status,
    deadline: app.deadline,
    notes: app.notes,
    applied_date: app.appliedDate,
    last_modified: app.lastModified,
    created_date: app.createdDate,
    drafted_letter: app.draftedLetter,
    research_summary: app.researchSummary,
    interview_questions: app.interviewQuestions,
    interview_verdict: app.interviewVerdict,
  };
}

function mapRemoteContactRow(row: Record<string, any>): Contact {
  return {
    id: String(row.id ?? genId()),
    name: normalizeString(row.name) ?? '',
    company: normalizeString(row.company) ?? '',
    howWeMet: normalizeString(row.how_we_met) ?? normalizeString(row.howWeMet) ?? '',
    notes: normalizeString(row.notes),
    isWarmLead: Boolean(row.is_warm_lead ?? row.isWarmLead),
    needsFollowUp: Boolean(row.needs_follow_up ?? row.needsFollowUp),
    addedDate: normalizeString(row.added_date) ?? normalizeString(row.addedDate) ?? new Date().toISOString(),
  };
}

function mapContactToRemoteRow(contact: Contact, uid: string): Record<string, unknown> {
  return {
    id: contact.id,
    user_id: uid,
    name: contact.name,
    company: contact.company,
    how_we_met: contact.howWeMet,
    notes: contact.notes,
    is_warm_lead: contact.isWarmLead,
    needs_follow_up: contact.needsFollowUp,
    added_date: contact.addedDate,
  };
}

function mapRemoteSavedEventRow(row: Record<string, any>): SavedEvent {
  return {
    id: String(row.id ?? genId()),
    title: normalizeString(row.title) ?? '',
    eventType: normalizeString(row.event_type) ?? normalizeString(row.eventType) ?? '',
    organizer: normalizeString(row.organizer) ?? '',
    dateLabel: normalizeString(row.date_label) ?? normalizeString(row.dateLabel) ?? '',
    dateIso: normalizeString(row.date_iso) ?? normalizeString(row.dateIso),
    location: normalizeString(row.location) ?? '',
    description: normalizeString(row.description),
    url: normalizeString(row.url),
    source: normalizeString(row.source),
    tags: Array.isArray(row.tags) ? row.tags.filter((item: unknown) => typeof item === 'string') : undefined,
    isOnline: Boolean(row.is_online ?? row.isOnline),
    savedAt: normalizeString(row.saved_at) ?? normalizeString(row.savedAt) ?? new Date().toISOString(),
  };
}

function mapSavedEventToRemoteRow(event: SavedEvent, uid: string): Record<string, unknown> {
  return {
    id: event.id,
    user_id: uid,
    title: event.title,
    event_type: event.eventType,
    organizer: event.organizer,
    date_label: event.dateLabel,
    date_iso: event.dateIso,
    location: event.location,
    description: event.description,
    url: event.url,
    source: event.source,
    tags: event.tags,
    is_online: event.isOnline,
    saved_at: event.savedAt,
  };
}

function mapRemoteDocumentRow(row: Record<string, any>): StoredDocument {
  return {
    id: String(row.id ?? genId()),
    name: normalizeString(row.name) ?? '',
    category: (row.category as DocCategory) ?? row.category ?? 'Other',
    objectPath: normalizeString(row.object_path) ?? normalizeString(row.objectPath) ?? '',
    contentType: normalizeString(row.content_type) ?? normalizeString(row.contentType) ?? 'application/octet-stream',
    size: typeof row.size === 'number' ? row.size : Number(row.size) || 0,
    uploadedAt: normalizeString(row.uploaded_at) ?? normalizeString(row.uploadedAt) ?? new Date().toISOString(),
    extractedText: normalizeString(row.extracted_text) ?? normalizeString(row.extractedText),
  };
}

function mapDocumentToRemoteRow(doc: StoredDocument, uid: string): Record<string, unknown> {
  return {
    id: doc.id,
    user_id: uid,
    name: doc.name,
    category: doc.category,
    object_path: doc.objectPath,
    content_type: doc.contentType,
    size: doc.size,
    uploaded_at: doc.uploadedAt,
    extracted_text: doc.extractedText,
  };
}

async function getCurrentUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user.id ?? null;
}

async function fetchRemoteProfile(uid: string): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', uid)
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn('[AppContext] fetchRemoteProfile failed:', error.message);
      return null;
    }
    if (!data) return null;
    return mapRemoteProfileRow(data, uid);
  } catch (err) {
    console.warn('[AppContext] fetchRemoteProfile exception:', err);
    return null;
  }
}

async function fetchRemoteRecords<T>(
  table: string,
  uid: string,
  mapper: (row: Record<string, any>) => T,
): Promise<T[]> {
  try {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', uid);
    if (error) {
      console.warn(`[AppContext] fetchRemoteRecords(${table}) failed:`, error.message);
      return [];
    }
    if (!Array.isArray(data)) return [];
    return data.map(row => mapper(row as Record<string, any>));
  } catch (err) {
    console.warn(`[AppContext] fetchRemoteRecords(${table}) exception:`, err);
    return [];
  }
}

async function upsertRemoteRecords(table: string, rows: Record<string, unknown>[]) {
  if (rows.length === 0) return;
  try {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: ['id'] });
    if (error) {
      console.warn(`[AppContext] upsertRemoteRecords(${table}) failed:`, error.message);
    }
  } catch (err) {
    console.warn(`[AppContext] upsertRemoteRecords(${table}) exception:`, err);
  }
}

async function deleteRemoteRecord(table: string, id: string, uid: string) {
  try {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id)
      .eq('user_id', uid);
    if (error) {
      console.warn(`[AppContext] deleteRemoteRecord(${table}) failed:`, error.message);
    }
  } catch (err) {
    console.warn(`[AppContext] deleteRemoteRecord(${table}) exception:`, err);
  }
}

async function syncRemoteData(
  uid: string,
  setProfile: (p: UserProfile) => void,
  setApplications: (a: Application[]) => void,
  setContacts: (c: Contact[]) => void,
  setSavedEvents: (e: SavedEvent[]) => void,
  setDocs: (d: StoredDocument[]) => void,
  currentApps: Application[],
  currentContacts: Contact[],
  currentSavedEvents: SavedEvent[],
  currentDocs: StoredDocument[],
) {
  const remoteProfile = await fetchRemoteProfile(uid);
  if (remoteProfile) {
    const keys = storageKeys(uid);
    await AsyncStorage.setItem(keys.profile, JSON.stringify(remoteProfile)).catch(() => {});
    setProfile(remoteProfile);
  }

  const [remoteApplications, remoteContacts, remoteEvents, remoteDocs] = await Promise.all([
    fetchRemoteRecords('applications', uid, mapRemoteApplicationRow),
    fetchRemoteRecords('contacts', uid, mapRemoteContactRow),
    fetchRemoteRecords('saved_events', uid, mapRemoteSavedEventRow),
    fetchRemoteRecords('documents', uid, mapRemoteDocumentRow),
  ]);

  const keys = storageKeys(uid);

  if (remoteApplications.length && currentApps.length === 0) {
    setApplications(remoteApplications);
    await AsyncStorage.setItem(keys.apps, JSON.stringify(remoteApplications)).catch(() => {});
  }

  if (remoteContacts.length && currentContacts.length === 0) {
    setContacts(remoteContacts);
    await AsyncStorage.setItem(keys.contacts, JSON.stringify(remoteContacts)).catch(() => {});
  }

  if (remoteEvents.length && currentSavedEvents.length === 0) {
    setSavedEvents(remoteEvents);
    await AsyncStorage.setItem(keys.events, JSON.stringify(remoteEvents)).catch(() => {});
  }

  if (remoteDocs.length && currentDocs.length === 0) {
    setDocs(remoteDocs);
    await AsyncStorage.setItem(keys.docs, JSON.stringify(remoteDocs)).catch(() => {});
  }
}

async function loadLocalData(
  setProfile: (p: UserProfile) => void,
  setApplications: (a: Application[]) => void,
  setContacts: (c: Contact[]) => void,
  setSavedEvents: (e: SavedEvent[]) => void,
  setDocs: (d: StoredDocument[]) => void,
  uid: string,
  displayName?: string,
): Promise<{ profile: UserProfile; applications: Application[]; contacts: Contact[]; savedEvents: SavedEvent[]; docs: StoredDocument[] }> {
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

  const parsedProfile = p;
  const parsedApplications = safeParse<Application[]>(migratedApps, []);
  const parsedContacts = safeParse<Contact[]>(migratedContacts, []);
  const parsedSavedEvents = safeParse<SavedEvent[]>(migratedEvents, []);
  const parsedDocs = safeParse<StoredDocument[]>(migratedDocs, []);

  setProfile(parsedProfile);
  setApplications(parsedApplications);
  setContacts(parsedContacts);
  setSavedEvents(parsedSavedEvents);
  setDocs(parsedDocs);

  return {
    profile: parsedProfile,
    applications: parsedApplications,
    contacts: parsedContacts,
    savedEvents: parsedSavedEvents,
    docs: parsedDocs,
  };
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
        const loaded = await loadLocalData(
          setProfile, setApplications, setContacts, setSavedEvents, setDocs,
          session.user.id, meta?.display_name,
        );
        await syncRemoteData(
          session.user.id,
          setProfile,
          setApplications,
          setContacts,
          setSavedEvents,
          setDocs,
          loaded.applications,
          loaded.contacts,
          loaded.savedEvents,
          loaded.docs,
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
        const loaded = await loadLocalData(
          setProfile, setApplications, setContacts, setSavedEvents, setDocs,
          session.user.id, meta?.display_name,
        );
        await syncRemoteData(
          session.user.id,
          setProfile,
          setApplications,
          setContacts,
          setSavedEvents,
          setDocs,
          loaded.applications,
          loaded.contacts,
          loaded.savedEvents,
          loaded.docs,
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
      // ignore remote sign-out errors
    } finally {
      // Always clear local state immediately so the UI reflects signed-out state
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
    const uid = p.uid || (await getCurrentUserId());
    if (uid) {
      await upsertRemoteRecords('profiles', [mapProfileToRemoteRow(p)]);
    }
  }, []);

  const addApplication = useCallback(async (data: Omit<Application, 'id' | 'lastModified'>) => {
    const now = new Date().toISOString();
    const app: Application = { ...data, id: genId(), lastModified: now, createdDate: now };
    setApplications(prev => {
      const next = [app, ...prev];
      AsyncStorage.setItem(getKeys().apps, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid) {
      await upsertRemoteRecords('applications', [mapApplicationToRemoteRow(app, uid)]);
    }
    return app;
  }, [getKeys, profile]);

  const updateApplication = useCallback(async (id: string, updates: Partial<Application>) => {
    let updatedApp: Application | undefined;
    setApplications(prev => {
      const next = prev.map(a => {
        if (a.id !== id) return a;
        updatedApp = { ...a, ...updates, lastModified: new Date().toISOString() };
        return updatedApp!;
      });
      AsyncStorage.setItem(getKeys().apps, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid && updatedApp) {
      await upsertRemoteRecords('applications', [mapApplicationToRemoteRow(updatedApp, uid)]);
    }
  }, [getKeys, profile]);

  const deleteApplication = useCallback(async (id: string) => {
    setApplications(prev => {
      const next = prev.filter(a => a.id !== id);
      AsyncStorage.setItem(getKeys().apps, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid) {
      await deleteRemoteRecord('applications', id, uid);
    }
  }, [getKeys, profile]);

  const addContact = useCallback(async (data: Omit<Contact, 'id' | 'addedDate'>) => {
    const contact: Contact = { ...data, id: genId(), addedDate: new Date().toISOString() };
    setContacts(prev => {
      const next = [contact, ...prev];
      AsyncStorage.setItem(getKeys().contacts, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid) {
      await upsertRemoteRecords('contacts', [mapContactToRemoteRow(contact, uid)]);
    }
    return contact;
  }, [getKeys, profile]);

  const updateContact = useCallback(async (id: string, updates: Partial<Contact>) => {
    let updatedContact: Contact | undefined;
    setContacts(prev => {
      const next = prev.map(c => {
        if (c.id !== id) return c;
        updatedContact = { ...c, ...updates };
        return updatedContact!;
      });
      AsyncStorage.setItem(getKeys().contacts, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid && updatedContact) {
      await upsertRemoteRecords('contacts', [mapContactToRemoteRow(updatedContact, uid)]);
    }
  }, [getKeys, profile]);

  const deleteContact = useCallback(async (id: string) => {
    setContacts(prev => {
      const next = prev.filter(c => c.id !== id);
      AsyncStorage.setItem(getKeys().contacts, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid) {
      await deleteRemoteRecord('contacts', id, uid);
    }
  }, [getKeys, profile]);

  const saveEvent = useCallback(async (event: Omit<SavedEvent, 'savedAt'>) => {
    const saved: SavedEvent = { ...event, savedAt: new Date().toISOString() };
    setSavedEvents(prev => {
      if (prev.some(e => e.id === event.id)) return prev;
      const next = [saved, ...prev];
      AsyncStorage.setItem(getKeys().events, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid) {
      await upsertRemoteRecords('saved_events', [mapSavedEventToRemoteRow(saved, uid)]);
    }
  }, [getKeys, profile]);

  const unsaveEvent = useCallback(async (id: string) => {
    setSavedEvents(prev => {
      const next = prev.filter(e => e.id !== id);
      AsyncStorage.setItem(getKeys().events, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid) {
      await deleteRemoteRecord('saved_events', id, uid);
    }
  }, [getKeys, profile]);

  const addDoc = useCallback(async (data: Omit<StoredDocument, 'id' | 'uploadedAt'>) => {
    const doc: StoredDocument = { ...data, id: genId(), uploadedAt: new Date().toISOString() };
    setDocs(prev => {
      const next = [doc, ...prev];
      AsyncStorage.setItem(getKeys().docs, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid) {
      await upsertRemoteRecords('documents', [mapDocumentToRemoteRow(doc, uid)]);
    }
    return doc;
  }, [getKeys, profile]);

  const updateDoc = useCallback(async (id: string, updates: Partial<StoredDocument>) => {
    let updatedDoc: StoredDocument | undefined;
    setDocs(prev => {
      const next = prev.map(d => {
        if (d.id !== id) return d;
        updatedDoc = { ...d, ...updates };
        return updatedDoc!;
      });
      AsyncStorage.setItem(getKeys().docs, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid && updatedDoc) {
      await upsertRemoteRecords('documents', [mapDocumentToRemoteRow(updatedDoc, uid)]);
    }
  }, [getKeys, profile]);

  const deleteDoc = useCallback(async (id: string) => {
    setDocs(prev => {
      const next = prev.filter(d => d.id !== id);
      AsyncStorage.setItem(getKeys().docs, JSON.stringify(next)).catch(() => {});
      return next;
    });
    const uid = profile?.uid ?? await getCurrentUserId();
    if (uid) {
      await deleteRemoteRecord('documents', id, uid);
    }
  }, [getKeys, profile]);

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
