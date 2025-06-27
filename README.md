# 🏥 NöbetSihirbazı - Supabase Cloud Database

**Doktor nöbet planlama uygulaması** - Supabase ile güçlendirilmiş, gerçek zamanlı tercih toplama ve akıllı çizelge sistemi

## ✨ Özellikler

- 🔥 **Supabase Cloud Database** - Farklı cihazlardan erişim
- ⚡ **Gerçek Zamanlı Güncellemeler** - Anlık senkronizasyon  
- 🎯 **Akıllı Çizelge Algoritması** - Adil nöbet dağılımı
- 📱 **Responsive Tasarım** - Mobil ve desktop uyumlu
- 📊 **Admin Panel** - Kapsamlı yönetim ve istatistikler
- 💾 **Offline Destek** - İnternet kesildiğinde yerel çalışma
- 📤 **Export İşlemleri** - JSON ve CSV formatında veri çıktısı

### Nöbet Kuralları
- Her doktor ayda en fazla **8 nöbet**
- Ardışık nöbet yasak (**en az 1 gün ara**)
- Hafta içi **2 doktor**, hafta sonu **3 doktor**
- **Pozitif/negatif** tercihler dikkate alınır
- **Dengeleme algoritması** ile adil dağılım

## 🚀 Hızlı Kurulum

### 1. Projeyi İndirin
```bash
git clone <repository-url>
cd nobet-sihirbazi
npm install
```

### 2. Supabase Kurulumu

#### 2.1 Supabase Hesabı
1. [https://supabase.com](https://supabase.com) adresine gidin
2. **"Start your project"** ile kayıt olun
3. **"New Project"** ile yeni proje oluşturun
   - Proje adı: `nobet-sihirbazi`
   - Şifre belirleyin
   - Bölge: Europe West (önerilir)

#### 2.2 API Bilgilerini Alın
1. **Settings > API** menüsüne gidin
2. **Project URL** ve **anon public** key'i kopyalayın

#### 2.3 Environment Variables
```bash
# .env.example dosyasını .env olarak kopyalayın
cp .env.example .env

# .env dosyasını düzenleyin
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 2.4 Database Tablolarını Oluşturun
1. Supabase Dashboard'da **SQL Editor**'e gidin
2. `supabase-schema.sql` dosyasının içeriğini kopyalayın
3. SQL Editor'e yapıştırıp **RUN** butonuna basın

### 3. Uygulamayı Başlatın
```bash
npm run dev
```

🎉 Tarayıcınızda [http://localhost:5173](http://localhost:5173) adresini açın!

## 🌐 Deploy

### Netlify Deploy (Önerilen)
1. GitHub'a push edin
2. Netlify'de "New site from Git" seçin
3. Repository'yi bağlayın
4. Environment variables'ı Netlify'de ayarlayın:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy edin

### Vercel Deploy
```bash
npm run build
vercel --prod
```

## 📁 Proje Yapısı

```
nobet-sihirbazi/
├── src/
│   ├── components/          # React bileşenleri
│   │   ├── UserNameInput.jsx     # Doktor adı girişi
│   │   ├── ScheduleCalendar.jsx  # Tercih takvimi
│   │   ├── SubmitButton.jsx      # Kaydet butonu
│   │   └── ScheduleDisplay.jsx   # Çizelge görüntüleme
│   ├── supabaseClient.js    # Supabase konfigürasyonu
│   ├── App.jsx             # Ana uygulama
│   ├── main.jsx            # Entry point
│   └── index.css           # Tailwind CSS
├── supabase-schema.sql     # Database schema
├── .env.example            # Environment variables örneği
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## 🗄️ Database Yapısı

### `doctor_preferences` Tablosu
```sql
id              SERIAL PRIMARY KEY
doctor_name     VARCHAR(255) UNIQUE NOT NULL
positive_days   INTEGER[] DEFAULT '{}'    -- Tercih edilen günler
negative_days   INTEGER[] DEFAULT '{}'    -- İstenmeyen günler  
special_notes   TEXT DEFAULT ''          -- Özel notlar
created_at      TIMESTAMP WITH TIME ZONE
updated_at      TIMESTAMP WITH TIME ZONE
```

### `schedule` Tablosu  
```sql
id                SERIAL PRIMARY KEY
day_number        INTEGER NOT NULL       -- Ayın günü (1-31)
assigned_doctors  TEXT[] DEFAULT '{}'    -- Atanan doktorlar
created_at        TIMESTAMP WITH TIME ZONE
```

## ⚡ Supabase İşlemleri

### Tercih Kaydetme
```javascript
await dbOperations.savePreferences(
  doctorName,     // Doktor adı
  pozitifGunler,  // [5, 12, 19] - tercih edilen günler
  negatifGunler,  // [2, 9, 23] - istenmeyen günler
  ozelSebepler    // "Pazartesi günleri müsait değil"
)
```

### Çizelge Oluşturma
```javascript
await dbOperations.saveSchedule({
  1: ["Dr. Ali", "Dr. Ayşe"],      // 1 Temmuz
  2: ["Dr. Mehmet", "Dr. Fatma"],  // 2 Temmuz
  // ...
})
```

### Gerçek Zamanlı Güncellemeler
```javascript
dbOperations.subscribeToPreferences((payload) => {
  console.log('Tercih güncellendi:', payload)
  // UI'ı güncelle
})
```

## 👩‍⚕️ Kullanım Kılavuzu

### Doktor Tercihleri Girme
1. **Doktor adınızı** girin (yeni doktor otomatik eklenir)
2. **Takvimde** tercih ettiğiniz günlere tıklayın
   - **Yeşil**: Pozitif tercih (o günü istiyorum)
   - **Kırmızı**: Negatif tercih (o günü istemiyorum)
   - **Gri**: Nötr (tercih yok)
3. **Özel notlar** ekleyin (opsiyonel)
4. **"Tercihleri Kaydet"** butonuna basın

### Admin Paneli (Şifre: admin2025)
1. Sağ üstteki **şifre alanına** `admin2025` yazın
2. **Admin** butonuna basın
3. **3 sekme** görünür:
   - **Tercih Toplama**: Doktor tercihlerini görüntüleme
   - **Çizelge Yönetimi**: Akıllı çizelge oluşturma
   - **Admin Panel**: İstatistikler ve export işlemleri

### Admin İşlemleri
- 📊 **Sistem İstatistikleri**: Doktor sayısı, tamamlanma oranı
- 🔄 **Supabase'den Yenile**: Cloud'dan güncel veriyi çek
- ⚡ **Gerçek Zamanlı**: Anlık güncellemeleri aç/kapat
- 📤 **Export**: JSON/CSV formatında veri indirme
- 🗑️ **Veri Temizleme**: Tüm verileri silme

## 🤖 Akıllı Çizelge Algoritması

### 1. Tercih Önceliklendirme
- **Pozitif tercihler** önce değerlendirilir
- **Negatif tercihler** kesinlikle dikkate alınır
- **En az nöbet alan** doktorlar öncelik kazanır

### 2. Kural Kontrolü
- ✅ Maksimum **8 nöbet/ay** sınırı
- ✅ **Ardışık nöbet yasağı** (1 gün ara)
- ✅ Hafta içi **2 doktor**, hafta sonu **3 doktor**
- ✅ **Negatif tercih** kontrolü

### 3. Adil Dağılım
- Nöbet sayıları **dengelenir**
- Az nöbet alan doktorlar **önceliklendirilir**
- **Hafta sonu** dağılımı optimize edilir

## 🛠️ Teknoloji Stack'i

### Frontend
- **React 18** - Modern UI framework
- **Vite** - Hızlı build tool  
- **Tailwind CSS** - Utility-first CSS
- **Lucide React** - Modern ikonlar
- **React Day Picker** - Takvim komponenti

### Backend & Database
- **Supabase** - PostgreSQL cloud database
- **Realtime API** - Anlık güncellemeler
- **Row Level Security** - Güvenlik politikaları  
- **Auto-generated REST API** - Otomatik API'ler

### Deployment
- **Netlify** - Frontend hosting (önerilir)
- **Vercel** - Alternatif hosting
- **Environment Variables** - Güvenli yapılandırma

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişiklikleri commit edin (`git commit -m 'Add amazing feature'`)
4. Branch'i push edin (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📝 Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

## 🌟 Öne Çıkan Özellikler

### ✨ Dinamik Doktor Yönetimi
- **Sınırsız doktor** ekleme/çıkarma
- **Otomatik kayıt**: Yeni doktor adı girdiğinizde sistem otomatik ekler
- **Flexible sistem**: 5 doktor da, 50 doktor da desteklenir

### 🚀 Performans & Güvenilirlik  
- **Supabase PostgreSQL**: Enterprise-grade database
- **Realtime sync**: Anında senkronizasyon
- **Offline fallback**: İnternet kesilirse yerel çalışma
- **Auto-backup**: Her işlem localStorage'a da kaydedilir

### 📊 Gelişmiş Analytics
- **Sistem istatistikleri**: Gerçek zamanlı metrikler
- **Completion tracking**: Tamamlanma oranları
- **Export capabilities**: Profesyonel raporlama

## 🔍 Sorun Giderme

### 🚨 Yaygın Sorunlar

#### "Database bağlantı hatası"
- `.env` dosyasındaki **Supabase URL** ve **API key**'i kontrol edin
- Supabase projesinin **aktif** olduğunu doğrulayın
- **Internet bağlantınızı** kontrol edin
- Browser **Developer Tools > Network** sekmesinde hataları inceleyin

#### "Tercihler kaydedilmiyor"
- Supabase **RLS politikalarını** kontrol edin
- `supabase-schema.sql` dosyasının **tam olarak çalıştırıldığından** emin olun
- Browser **console**'da hata mesajlarını inceleyin
- **Offline moda** geçerek yerel kaydetme deneyin

#### "Admin paneline erişemiyorum"
- Şifre: `admin2025` (**küçük harflerle**)
- Browser **cache**'ini temizleyin
- **Hard refresh** yapın (Ctrl+F5 / Cmd+Shift+R)
- **Incognito/Private** modda deneyin

#### "Realtime güncellemeler çalışmıyor"
- Supabase **Realtime** özelliğinin aktif olduğunu kontrol edin
- Admin panelinden **Gerçek Zamanlı** butonunu açın
- Network bağlantısının **stabil** olduğundan emin olun

### 🔧 Debug Modları

#### Console Debug Açma
```javascript
// Browser console'da çalıştırın
localStorage.setItem('debug', 'true')
localStorage.setItem('supabase.debug', 'true')
```

#### Supabase Bağlantı Testi
```javascript
// Browser console'da test edin
import { supabase } from './src/supabaseClient.js'
const { data, error } = await supabase.from('doctor_preferences').select('*')
console.log('Data:', data, 'Error:', error)
```

### 📋 Sistem Gereksinimleri
- **Node.js**: 18+ versiyonu
- **NPM**: 8+ versiyonu  
- **Browser**: Chrome 90+, Firefox 88+, Safari 14+
- **Internet**: Stabil bağlantı (Supabase için)

### 🔄 Yeniden Kurulum
```bash
# Tam temizlik ve yeniden kurulum
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### 📞 Destek

Hala sorun yaşıyorsanız:
- 🐛 **GitHub Issues**: Hata raporları için
- 💬 **GitHub Discussions**: Genel sorular için  
- 📧 **Email**: [destek@nobetsihirbazi.com](mailto:destek@nobetsihirbazi.com)

---

**Developed with ❤️ for healthcare professionals**

*Supabase ile güçlendirilmiş, doktorların hayatını kolaylaştırmak için tasarlanmış modern nöbet planlama sistemi.*

🚀 **[Demo'yu görün](https://nobet-sihirbazi.netlify.app)** | 📖 **[Belgeler](https://github.com/yourusername/nobet-sihirbazi)** | 🐛 **[Bug Report](https://github.com/yourusername/nobet-sihirbazi/issues)** 