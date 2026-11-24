# HemşireNöbet — Servis Hemşire Nöbet & YH.FR.31 Puantaj Planlama Sistemi

Antalya Eğitim ve Araştırma Hastanesi servis hemşirelerinin aylık nöbet/mesai planlaması, mobil tercih toplaması ve hastane standart **YH.FR.31 (Rev.04)** puantaj çıktısı için hazırlanmış sıfır-bakımlı web uygulaması.

> **Önceki Sürüm Arşivi:** Doktor nöbet planlama sürümü (Pediatri) git geçmişinde `pediatri-arsiv` etiketiyle (`git checkout pediatri-arsiv`) korunmaktadır.

---

## Temel Özellikler

- **Mobil Tercih Toplama (4 Mod):**
  - 🟢 **Nöbet İstiyorum** (ör. eşiyle aynı gün nöbet)
  - 🔴 **Çalışamam (Kesin)** (ör. eşinin vardiya günleri — sert kısıt)
  - 🟡 **Mümkünse Boş** (yumuşak tercih)
  - 🟣 **İzin / Rapor (`Yİ`, `R`, `İİ`)** — yasal çalışma hedefinden otomatik düşer
  - ✨ **5 Gün Yıllık İzin Köprüleme Sihirbazı:** Pzt–Cum `Yİ` + önceki Perşembe öncelikli `24s Nöbet` + iki taraftaki hafta sonları kapalı (~10 gün kesintisiz blok).
- **Matematiksel Kısıt Çözücü (Tarayıcı İçi Web Worker):**
  - Ek sunucu gerektirmez; 1–2 saniyede tüm servis kurallarını çözer:
    - Hafta içi `2 Mesai (08-16) + 2 Nöbet (08-08) + 1 Sorumlu`
    - Hafta sonu ve resmî/dinî bayramlar `1 Mesai + 2 Nöbet`
    - Nöbet sonrası ertesi gün (`d+1`) tam dinlenme, `d+2` tekrar nöbet yasağı, `d+2` mesai kaçınma
    - Kişi başı **en az 1–2 kez 3 günlük boşluk** adaleti
    - Fazla mesai saat farkını dar tutma ve **11 kişide** eksik saatleri hafta içi `+1 mesai` ile otomatik tamamlama
    - **Ay Devri:** Önceki ayın son 3 gününü sonraki aya otomatik devretme
- **Etkileşimli Tablo & `YH.FR.31` Excel Entegrasyonu:**
  - Hücre tıklama ile vardiya düzenleme veya **Değiş-Tokuş (Swap)** modu + canlı ihlal uyarısı
  - Sıfırdan `YH.FR.31` `.xlsx` üretimi (formüllü toplam, aylık çalışma saati, fazla mesai, gece/bayram kırılımları, doğum iznindeki pasif hemşireler dahil)
  - **Mevcut Şablon Doldurma:** Hastane sistemindeki `.xlsx` `YH.FR.31` dosyasını yükleyip logo, formül ve diğer ay sekmelerine dokunmadan yalnızca ilgili ayın gün hücrelerini doldurma.

---

## Kurulum & Canlıya Alma (`nobet.netlify.app` + Mevcut Supabase)

### 1. Mevcut Supabase Projesine Yeni Tabloları Ekleme
Bu sürüm eski doktor tablolarına (`doctor_preferences`, `schedule`) dokunmaz; ayrı `app_*` tabloları kullanır.
1. Supabase Dashboard → **SQL Editor** ekranını açın.
2. [`supabase/schema.sql`](supabase/schema.sql) dosyasının tamamını yapıştırıp **Run** butonuna basın.

### 2. Netlify Ortam Değişkenleri
Netlify → **Site configuration → Environment variables** kısmında şunların tanımlı olduğundan emin olun:
- `VITE_SUPABASE_URL` (mevcut projenizde zaten var)
- `VITE_SUPABASE_ANON_KEY` (mevcut projenizde zaten var)
- `VITE_ADMIN_PIN` → Sorumlu hemşire şifresi (tanımlanmazsa varsayılan `hemsire2026` kullanılır).

### 3. Yerel Geliştirme ve Doğrulama
```bash
npm install
npm test
npm run build
npm run dev
```

---

## KVKK / Gizlilik Tasarımı
- Bu depoda **gerçek personel isimleri veya TC Kimlik numaraları yer almaz**; varsayılan ilk açılış sentetik demo verisiyle başlar.
- Sorumlu hemşire **Kadro, Ay Devri & Kurallar → Demo Verisini Temizle (Gerçek Kadroya Geç)** ve **Toplu Personel Ekle** üzerinden gerçek servis ekibini ekleyebilir.
- **TC Kimlik No** alanı yalnızca sorumlu hemşirenin kendi tarayıcısında (`localStorage`) saklanır; **Supabase veritabanına kesinlikle gönderilmez** ve sadece Excel (`.xlsx`) indirilirken yerel olarak forma eklenir.
