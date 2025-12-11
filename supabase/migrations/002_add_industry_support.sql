-- Migration: Add industry support
-- Description: Adds industry_aliases table and amplifai_industry column to data tables

-- 1. Create the industry_aliases table (mirrors metric_aliases structure)
CREATE TABLE IF NOT EXISTS industry_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_industry TEXT NOT NULL,
  alias TEXT NOT NULL,
  match_type TEXT NOT NULL CHECK (match_type IN ('exact', 'contains', 'regex')),
  case_sensitive BOOLEAN NOT NULL DEFAULT false,
  priority INTEGER NOT NULL DEFAULT 0,
  client TEXT DEFAULT NULL,
  notes TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_industry_aliases_priority ON industry_aliases(priority DESC);
CREATE INDEX IF NOT EXISTS idx_industry_aliases_client ON industry_aliases(client);

-- 2. Add amplifai_industry column to behavioral_coaching table
ALTER TABLE behavioral_coaching
ADD COLUMN IF NOT EXISTS amplifai_industry TEXT DEFAULT NULL;

-- 3. Add amplifai_industry column to monthly_metrics table
ALTER TABLE monthly_metrics
ADD COLUMN IF NOT EXISTS amplifai_industry TEXT DEFAULT NULL;

-- 4. Add amplifai_industry column to activity_metrics table
ALTER TABLE activity_metrics
ADD COLUMN IF NOT EXISTS amplifai_industry TEXT DEFAULT NULL;

-- 5. Seed some initial industry aliases
INSERT INTO industry_aliases (canonical_industry, alias, match_type, case_sensitive, priority, notes) VALUES
  -- Healthcare
  ('HEALTHCARE', 'uhc', 'contains', false, 100, 'UnitedHealthcare variations'),
  ('HEALTHCARE', 'united health', 'contains', false, 100, 'UnitedHealthcare variations'),
  ('HEALTHCARE', 'optum', 'contains', false, 100, 'Optum UBH'),
  ('HEALTHCARE', 'blue shield', 'contains', false, 100, 'Blue Shield'),
  ('HEALTHCARE', 'anthem', 'contains', false, 100, 'Anthem'),
  ('HEALTHCARE', 'cigna', 'contains', false, 100, 'Cigna'),
  ('HEALTHCARE', 'humana', 'contains', false, 100, 'Humana'),
  ('HEALTHCARE', 'kaiser', 'contains', false, 100, 'Kaiser'),
  ('HEALTHCARE', 'aetna', 'contains', false, 100, 'Aetna'),
  ('HEALTHCARE', 'vantive', 'contains', false, 100, 'Vantive Health'),
  ('HEALTHCARE', 'remodel health', 'contains', false, 100, 'Remodel Health'),

  -- Telecommunications
  ('TELECOMMUNICATIONS', 'at&t', 'contains', false, 100, 'AT&T'),
  ('TELECOMMUNICATIONS', 'att', 'exact', false, 90, 'ATT abbreviation'),
  ('TELECOMMUNICATIONS', 't-mobile', 'contains', false, 100, 'T-Mobile'),
  ('TELECOMMUNICATIONS', 'tmobile', 'contains', false, 100, 'T-Mobile no hyphen'),
  ('TELECOMMUNICATIONS', 'verizon', 'contains', false, 100, 'Verizon'),
  ('TELECOMMUNICATIONS', 'sirius', 'contains', false, 100, 'SiriusXM'),
  ('TELECOMMUNICATIONS', 'nomad internet', 'contains', false, 100, 'Nomad Internet'),

  -- Retail
  ('RETAIL', 'sams club', 'contains', false, 100, 'Sam''s Club'),
  ('RETAIL', 'walmart', 'contains', false, 100, 'Walmart'),
  ('RETAIL', 'macys', 'contains', false, 100, 'Macy''s'),
  ('RETAIL', 'american eagle', 'contains', false, 100, 'American Eagle Outfitters'),
  ('RETAIL', 'target', 'contains', false, 100, 'Target'),
  ('RETAIL', 'costco', 'contains', false, 100, 'Costco'),

  -- Food & Beverage
  ('FOOD & BEVERAGE', 'coca cola', 'contains', false, 100, 'Coca-Cola'),
  ('FOOD & BEVERAGE', 'coca-cola', 'contains', false, 100, 'Coca-Cola hyphenated'),
  ('FOOD & BEVERAGE', 'keurig', 'contains', false, 100, 'Keurig Dr Pepper'),
  ('FOOD & BEVERAGE', 'dr pepper', 'contains', false, 100, 'Dr Pepper'),
  ('FOOD & BEVERAGE', 'pepsi', 'contains', false, 100, 'PepsiCo'),

  -- Automotive
  ('AUTOMOTIVE', 'mercedes', 'contains', false, 100, 'Mercedes-Benz'),
  ('AUTOMOTIVE', 'ford', 'exact', false, 90, 'Ford Motor'),
  ('AUTOMOTIVE', 'toyota', 'contains', false, 100, 'Toyota'),
  ('AUTOMOTIVE', 'honda', 'contains', false, 100, 'Honda'),

  -- Travel & Hospitality
  ('TRAVEL & HOSPITALITY', 'delta', 'contains', false, 100, 'Delta Air Lines'),
  ('TRAVEL & HOSPITALITY', 'extended stay', 'contains', false, 100, 'Extended Stay America'),
  ('TRAVEL & HOSPITALITY', 'marriott', 'contains', false, 100, 'Marriott'),
  ('TRAVEL & HOSPITALITY', 'hilton', 'contains', false, 100, 'Hilton'),
  ('TRAVEL & HOSPITALITY', 'tripadvisor', 'contains', false, 100, 'TripAdvisor'),

  -- Financial Services
  ('FINANCIAL SERVICES', 'liberty mutual', 'contains', false, 100, 'Liberty Mutual'),
  ('FINANCIAL SERVICES', 'allstate', 'contains', false, 100, 'Allstate'),
  ('FINANCIAL SERVICES', 'geico', 'contains', false, 100, 'GEICO'),
  ('FINANCIAL SERVICES', 'progressive', 'contains', false, 100, 'Progressive'),
  ('FINANCIAL SERVICES', 'state farm', 'contains', false, 100, 'State Farm'),

  -- Technology
  ('TECHNOLOGY', 'pitney bowes', 'contains', false, 100, 'Pitney Bowes'),
  ('TECHNOLOGY', 'microsoft', 'contains', false, 100, 'Microsoft'),

  -- Utilities
  ('UTILITIES', 'energy australia', 'contains', false, 100, 'Energy Australia'),
  ('UTILITIES', 'energyaustralia', 'contains', false, 100, 'Energy Australia no space')
ON CONFLICT DO NOTHING;

-- Add trigger for updated_at on industry_aliases
CREATE OR REPLACE FUNCTION update_industry_aliases_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_industry_aliases_updated_at ON industry_aliases;
CREATE TRIGGER trigger_industry_aliases_updated_at
  BEFORE UPDATE ON industry_aliases
  FOR EACH ROW
  EXECUTE FUNCTION update_industry_aliases_updated_at();

-- Grant permissions (adjust role names as needed for your Supabase setup)
-- GRANT SELECT ON industry_aliases TO anon, authenticated;
-- GRANT ALL ON industry_aliases TO service_role;
