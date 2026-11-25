-- HemşireNöbet (YH.FR.31) — Supabase PostgreSQL Şeması
-- Eski doktor tablolarına (doctor_preferences, schedule) DOKUNMAZ; yanına ayrı
-- "app_*" tabloları kurar. Böylece mevcut Supabase projenizde güvenle çalıştırabilirsiniz.
--
-- KVKK / Gizlilik Notu: Bu veritabanında TC Kimlik No KESİNLİKLE tutulmaz.
-- TC Kimlik No yalnızca yöneticinin kendi tarayıcısında (localStorage) saklanır ve
-- sadece Excel (.xlsx) çıktısı alınırken yerel olarak birleştirilir.

CREATE TABLE IF NOT EXISTS app_nurses (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'HEM',
  default_role TEXT NOT NULL DEFAULT 'nobetli',
  passive_reason TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_month_configs (
  year_month TEXT PRIMARY KEY,
  config_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_nurse_preferences (
  year_month TEXT NOT NULL,
  nurse_id TEXT NOT NULL,
  pref_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (year_month, nurse_id)
);

CREATE TABLE IF NOT EXISTS app_month_schedules (
  year_month TEXT PRIMARY KEY,
  schedule_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Row Level Security (RLS) — Ekip içi ortak kullanım için açık politikalar
ALTER TABLE app_nurses ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_month_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_nurse_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_month_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can manage app_nurses" ON app_nurses;
CREATE POLICY "Anyone can manage app_nurses" ON app_nurses
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can manage app_month_configs" ON app_month_configs;
CREATE POLICY "Anyone can manage app_month_configs" ON app_month_configs
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can manage app_nurse_preferences" ON app_nurse_preferences;
CREATE POLICY "Anyone can manage app_nurse_preferences" ON app_nurse_preferences
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can manage app_month_schedules" ON app_month_schedules;
CREATE POLICY "Anyone can manage app_month_schedules" ON app_month_schedules
  FOR ALL USING (true) WITH CHECK (true);

-- Realtime yayınları (hata verirse tablo zaten ekli olabilir; güvenle geçilebilir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_nurse_preferences'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app_nurse_preferences;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_month_schedules'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app_month_schedules;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_nurses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app_nurses;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'app_month_configs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE app_month_configs;
  END IF;
END $$;

-- Üretim ortamında ek güvenlik (Supabase Auth) isterseniz yukarıdaki politikaları
-- `auth.role() = 'authenticated'` koşuluyla daraltabilirsiniz.
