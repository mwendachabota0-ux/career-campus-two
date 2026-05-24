-- ===== PROFILES TABLE =====
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  current_degree TEXT NOT NULL,
  institution TEXT,
  year_of_study TEXT,
  city TEXT,
  preferred_industries TEXT[],
  career_goals TEXT,
  portfolio_url TEXT,
  linked_in_url TEXT,
  github_url TEXT,
  profile_image_url TEXT,
  skills TEXT[],
  profile_completeness INTEGER DEFAULT 0 CHECK (profile_completeness >= 0 AND profile_completeness <= 100),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_profiles_user_id ON profiles(user_id);
CREATE INDEX idx_profiles_created_at ON profiles(created_at DESC);

-- ===== DOCUMENTS TABLE =====
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID,
  file_name TEXT NOT NULL,
  category TEXT NOT NULL,
  file_url TEXT NOT NULL,
  extracted_text TEXT,
  file_size INTEGER,
  mime_type TEXT,
  uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_documents_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_profile_id ON documents(profile_id);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_uploaded_at ON documents(uploaded_at DESC);

-- ===== APPLICATIONS TABLE =====
CREATE TABLE IF NOT EXISTS applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID,
  company_name TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Interested',
  deadline TIMESTAMP,
  notes TEXT,
  applied_date TIMESTAMP,
  last_modified TIMESTAMP NOT NULL DEFAULT NOW(),
  created_date TIMESTAMP NOT NULL DEFAULT NOW(),
  drafted_letter TEXT,
  research_summary TEXT,
  interview_questions JSONB,
  interview_verdict TEXT,
  CONSTRAINT fk_applications_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
  CONSTRAINT valid_status CHECK (status IN ('Interested', 'Applied', 'Interviewing', 'Offer', 'Rejected', 'Accepted'))
);

CREATE INDEX idx_applications_user_id ON applications(user_id);
CREATE INDEX idx_applications_profile_id ON applications(profile_id);
CREATE INDEX idx_applications_status ON applications(status);
CREATE INDEX idx_applications_created_date ON applications(created_date DESC);

-- ===== CONTACTS TABLE =====
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID,
  name TEXT NOT NULL,
  company TEXT,
  job_title TEXT,
  email TEXT,
  phone TEXT,
  linked_in_url TEXT,
  how_we_met TEXT,
  notes TEXT,
  is_warm_lead BOOLEAN DEFAULT FALSE,
  needs_follow_up BOOLEAN DEFAULT FALSE,
  last_contact_date TIMESTAMP,
  added_date TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_date TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_contacts_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_contacts_user_id ON contacts(user_id);
CREATE INDEX idx_contacts_profile_id ON contacts(profile_id);
CREATE INDEX idx_contacts_is_warm_lead ON contacts(is_warm_lead);
CREATE INDEX idx_contacts_needs_follow_up ON contacts(needs_follow_up);
CREATE INDEX idx_contacts_added_date ON contacts(added_date DESC);

-- ===== SAVED EVENTS TABLE =====
CREATE TABLE IF NOT EXISTS saved_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  profile_id UUID,
  title TEXT NOT NULL,
  event_type TEXT NOT NULL,
  organizer TEXT,
  date_label TEXT,
  date_iso TIMESTAMP,
  location TEXT NOT NULL,
  description TEXT,
  url TEXT,
  source TEXT,
  tags TEXT[],
  is_online BOOLEAN DEFAULT FALSE,
  is_attending BOOLEAN DEFAULT FALSE,
  reminder_set BOOLEAN DEFAULT FALSE,
  notes TEXT,
  saved_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_saved_events_profile FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
);

CREATE INDEX idx_saved_events_user_id ON saved_events(user_id);
CREATE INDEX idx_saved_events_profile_id ON saved_events(profile_id);
CREATE INDEX idx_saved_events_date_iso ON saved_events(date_iso DESC);
CREATE INDEX idx_saved_events_saved_at ON saved_events(saved_at DESC);

-- ===== ENABLE RLS (Row Level Security) =====
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_events ENABLE ROW LEVEL SECURITY;

-- ===== RLS POLICIES (Users can only access their own data) =====

-- Profiles
CREATE POLICY "Users can read their own profile" ON profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile" ON profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile" ON profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Documents
CREATE POLICY "Users can read their own documents" ON documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents" ON documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents" ON documents FOR DELETE
  USING (auth.uid() = user_id);

-- Applications
CREATE POLICY "Users can read their own applications" ON applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own applications" ON applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own applications" ON applications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own applications" ON applications FOR DELETE
  USING (auth.uid() = user_id);

-- Contacts
CREATE POLICY "Users can read their own contacts" ON contacts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own contacts" ON contacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own contacts" ON contacts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own contacts" ON contacts FOR DELETE
  USING (auth.uid() = user_id);

-- Saved Events
CREATE POLICY "Users can read their own saved events" ON saved_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved events" ON saved_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved events" ON saved_events FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved events" ON saved_events FOR DELETE
  USING (auth.uid() = user_id);
