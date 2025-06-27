-- NöbetSihirbazı Supabase Database Schema
-- Bu SQL komutlarını Supabase SQL Editor'de çalıştırın

-- 1. Doktor Tercihleri Tablosu
CREATE TABLE doctor_preferences (
    id SERIAL PRIMARY KEY,
    doctor_name VARCHAR(255) UNIQUE NOT NULL,
    positive_days INTEGER[] DEFAULT '{}',
    negative_days INTEGER[] DEFAULT '{}',
    special_notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Nöbet Çizelgesi Tablosu
CREATE TABLE schedule (
    id SERIAL PRIMARY KEY,
    day_number INTEGER NOT NULL,
    assigned_doctors TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Row Level Security (RLS) Policies
-- Herkesin okuma/yazma iznini etkinleştir (basit versiyon)
ALTER TABLE doctor_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule ENABLE ROW LEVEL SECURITY;

-- Genel okuma/yazma politikaları
CREATE POLICY "Anyone can read doctor_preferences" ON doctor_preferences FOR SELECT USING (true);
CREATE POLICY "Anyone can insert doctor_preferences" ON doctor_preferences FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update doctor_preferences" ON doctor_preferences FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete doctor_preferences" ON doctor_preferences FOR DELETE USING (true);

CREATE POLICY "Anyone can read schedule" ON schedule FOR SELECT USING (true);
CREATE POLICY "Anyone can insert schedule" ON schedule FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update schedule" ON schedule FOR UPDATE USING (true);
CREATE POLICY "Anyone can delete schedule" ON schedule FOR DELETE USING (true);

-- 4. Realtime için tablo yayınını etkinleştir
ALTER PUBLICATION supabase_realtime ADD TABLE doctor_preferences;
ALTER PUBLICATION supabase_realtime ADD TABLE schedule;

-- 5. İndeks oluştur (performans için)
CREATE INDEX idx_doctor_preferences_doctor_name ON doctor_preferences(doctor_name);
CREATE INDEX idx_schedule_day_number ON schedule(day_number);

-- 6. Trigger fonksiyonu (updated_at otomatik güncelleme)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger'ı doctor_preferences tablosuna ekle
CREATE TRIGGER update_doctor_preferences_updated_at 
    BEFORE UPDATE ON doctor_preferences 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- 7. Test verisi ekle (opsiyonel)
INSERT INTO doctor_preferences (doctor_name, positive_days, negative_days, special_notes) 
VALUES 
    ('Dr. Ahmet Yılmaz', '{5, 12, 19}', '{1, 8, 15}', 'Hafta sonlarını tercih eder'),
    ('Dr. Fatma Demir', '{3, 10, 17, 24}', '{7, 14, 21}', 'Pazartesi günleri müsait değil');

-- 8. Veri kontrol sorguları
-- Tabloları kontrol et
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('doctor_preferences', 'schedule');

-- Policies kontrol et
SELECT tablename, policyname, cmd, qual 
FROM pg_policies 
WHERE tablename IN ('doctor_preferences', 'schedule');

-- Test verilerini görüntüle
SELECT * FROM doctor_preferences;
SELECT * FROM schedule;

/* 
🚀 SUPABASE KURULUM ADAMLARI:

1. https://supabase.com adresine gidip hesap oluşturun
2. "New Project" ile yeni proje oluşturun
3. Proje adı: "nobet-sihirbazi" 
4. Şifre seçin ve lokasyon belirleyin
5. Proje oluşturulduktan sonra:
   - Settings > API menüsüne gidin
   - URL ve anon public key'i kopyalayın
   - .env dosyası oluşturun ve bu bilgileri girin

6. SQL Editor'e gidin (sol menüden)
7. Bu dosyadaki SQL komutlarını kopyalayıp çalıştırın
8. Authentication > Settings'den RLS'i gerekirse ayarlayın

9. .env dosyası örneği:
   VITE_SUPABASE_URL=https://your-project-id.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

10. npm run dev ile uygulamayı başlatın!

✅ Artık farklı cihazlardan aynı verilere erişebilirsiniz!
✅ Admin panelinden tüm doktor tercihlerini görebilirsiniz!
✅ Gerçek zamanlı güncellemeler çalışacak!
*/ 