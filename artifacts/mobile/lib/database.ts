import { supabase } from './supabase';

const DATABASE_FUNCTION_URL = 'https://pwphrlbpwxytswdaglem.supabase.co/functions/v1/database';

// ===== HELPER: GET AUTH TOKEN =====
async function getAuthToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    throw new Error('No active session. User must be logged in.');
  }

  return session.access_token;
}

// ===== HELPER: MAKE REQUEST =====
async function makeRequest(
  resource: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  data?: any,
  id?: string
): Promise<any> {
  const token = await getAuthToken();
  const url = new URL(DATABASE_FUNCTION_URL);
  url.searchParams.set('resource', resource);
  if (id) url.searchParams.set('id', id);

  const headers: HeadersInit = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  const options: RequestInit = {
    method,
    headers,
  };

  if (data && (method === 'POST' || method === 'PUT')) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url.toString(), options);
  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || `Request failed: ${response.status}`);
  }

  return result;
}

// ===== PROFILES =====
export const profiles = {
  async getAll() {
    return makeRequest('profiles', 'GET');
  },

  async getOne(id: string) {
    return makeRequest('profiles', 'GET', undefined, id);
  },

  async create(data: any) {
    return makeRequest('profiles', 'POST', data);
  },

  async update(id: string, data: any) {
    return makeRequest('profiles', 'PUT', data, id);
  },

  async delete(id: string) {
    return makeRequest('profiles', 'DELETE', undefined, id);
  },
};

// ===== DOCUMENTS =====
export const documents = {
  async getAll() {
    return makeRequest('documents', 'GET');
  },

  async getOne(id: string) {
    return makeRequest('documents', 'GET', undefined, id);
  },

  async create(data: any) {
    return makeRequest('documents', 'POST', data);
  },

  async update(id: string, data: any) {
    return makeRequest('documents', 'PUT', data, id);
  },

  async delete(id: string) {
    return makeRequest('documents', 'DELETE', undefined, id);
  },
};

// ===== APPLICATIONS =====
export const applications = {
  async getAll() {
    return makeRequest('applications', 'GET');
  },

  async getOne(id: string) {
    return makeRequest('applications', 'GET', undefined, id);
  },

  async create(data: any) {
    return makeRequest('applications', 'POST', data);
  },

  async update(id: string, data: any) {
    return makeRequest('applications', 'PUT', data, id);
  },

  async delete(id: string) {
    return makeRequest('applications', 'DELETE', undefined, id);
  },
};

// ===== CONTACTS =====
export const contacts = {
  async getAll() {
    return makeRequest('contacts', 'GET');
  },

  async getOne(id: string) {
    return makeRequest('contacts', 'GET', undefined, id);
  },

  async create(data: any) {
    return makeRequest('contacts', 'POST', data);
  },

  async update(id: string, data: any) {
    return makeRequest('contacts', 'PUT', data, id);
  },

  async delete(id: string) {
    return makeRequest('contacts', 'DELETE', undefined, id);
  },
};

// ===== SAVED EVENTS =====
export const savedEvents = {
  async getAll() {
    return makeRequest('saved_events', 'GET');
  },

  async getOne(id: string) {
    return makeRequest('saved_events', 'GET', undefined, id);
  },

  async create(data: any) {
    return makeRequest('saved_events', 'POST', data);
  },

  async update(id: string, data: any) {
    return makeRequest('saved_events', 'PUT', data, id);
  },

  async delete(id: string) {
    return makeRequest('saved_events', 'DELETE', undefined, id);
  },
};

// ===== USAGE EXAMPLES =====
/*

// Get all profiles
const allProfiles = await profiles.getAll();

// Get a specific profile
const userProfile = await profiles.getOne('profile-uuid-here');

// Create a profile
const newProfile = await profiles.create({
  display_name: 'John Doe',
  email: 'john@example.com',
  current_degree: 'Bachelor of Science',
  institution: 'UNZA',
  year_of_study: '3rd Year',
  city: 'Lusaka',
  career_goals: 'Software Engineering',
  preferred_industries: ['Tech', 'Finance'],
});

// Update a profile
const updated = await profiles.update(profileId, {
  display_name: 'Jane Doe',
  career_goals: 'Data Science',
});

// Delete a profile
await profiles.delete(profileId);

// Same pattern for documents, applications, contacts, savedEvents
const docs = await documents.getAll();
const app = await applications.create({ company_name: 'TechCorp', role: 'Software Engineer' });

*/
