# NöbetSihirbazı 🏥

Doktor nöbet planlama uygulaması - Doktorların tercihlerini toplar ve adil, kurallara uygun nöbet çizelgesi oluşturur.

## 📋 Özellikler

- **9 doktor için otomatik nöbet planlaması**
- **Tercih tabanlı algoritma** - Doktorların pozitif/negatif tercihlerini dikkate alır
- **Kurallar:**
  - Her doktor ayda en fazla 8 nöbet
  - Ardışık nöbet yasak (en az 1 gün ara)
  - Hafta içi 2 doktor, hafta sonu 3 doktor
  - Dengeleme kuralı ile adil dağılım

## 🚀 Kurulum

### Gereksinimler
- Node.js 18+ 
- npm veya yarn
- Netlify hesabı

### Yerel Geliştirme

1. **Projeyi klonlayın:**
```bash
git clone <repository-url>
cd nobet-sihirbazi
```

2. **Bağımlılıkları yükleyin:**
```bash
npm install
```

3. **Netlify CLI ile geliştirme sunucusunu başlatın:**
```bash
npm run netlify:dev
```

Bu komut hem frontend'i (Vite) hem de backend fonksiyonlarını (Netlify Functions) aynı anda çalıştırır.

### Alternatif Geliştirme

Sadece frontend'i çalıştırmak için:
```bash
npm run dev
```

## 🌐 Deploy

### Netlify'e Deploy

1. **Netlify hesabınıza giriş yapın:**
```bash
netlify login
```

2. **Projeyi build edin:**
```bash
npm run netlify:build
```

3. **Deploy edin:**
```bash
npm run netlify:deploy
```

### Otomatik Deploy

GitHub'a push ettiğinizde otomatik deploy için:

1. Netlify Dashboard'da "New site from Git" seçin
2. Repository'nizi bağlayın
3. Build ayarları otomatik olarak `netlify.toml` dosyasından alınır

## 📁 Proje Yapısı

```
nobet-sihirbazi/
├── netlify/
│   └── functions/           # Serverless API fonksiyonları
│       ├── get-preferences.js
│       ├── save-preferences.js
│       ├── generate-schedule.js
│       └── get-schedule.js
├── src/
│   ├── components/          # React bileşenleri
│   │   ├── DoctorSelector.jsx
│   │   ├── ScheduleCalendar.jsx
│   │   ├── SubmitButton.jsx
│   │   └── ScheduleDisplay.jsx
│   ├── App.jsx             # Ana uygulama
│   ├── main.jsx            # Entry point
│   └── index.css           # Tailwind CSS
├── package.json
├── vite.config.js
├── tailwind.config.js
├── netlify.toml            # Netlify konfigürasyonu
└── README.md
```

## 🔧 API Endpoints

### `/api/get-preferences`
- **Method:** GET
- **Açıklama:** Tüm doktorların tercihlerini getirir

### `/api/save-preferences`
- **Method:** POST
- **Body:** 
```json
{
  "doktorAdi": "Dr. Ahmet Yılmaz",
  "pozitifGunler": [5, 12, 18],
  "negatifGunler": [2, 9]
}
```

### `/api/generate-schedule`
- **Method:** POST
- **Açıklama:** Tercihlere göre nöbet çizelgesi oluşturur

### `/api/get-schedule`
- **Method:** GET
- **Açıklama:** Oluşturulan çizelgeyi getirir

## 🎯 Kullanım

1. **Tercih Toplama Sekmesi:**
   - Doktor seçin
   - Takvimde günlere tıklayarak tercih belirtin
   - Yeşil: İstenen günler
   - Kırmızı: İstenmeyen günler
   - "Tercihlerimi Kaydet" butonuna tıklayın

2. **Nöbet Çizelgesi Sekmesi:**
   - "Çizelge Oluştur" butonuna tıklayın
   - Algoritma otomatik olarak adil bir çizelge oluşturur
   - Sonuçları görüntüleyin

## 🔄 Nöbet Planlama Algoritması

1. **Tercih Skorlaması:**
   - Pozitif tercih: +50 puan
   - Negatif tercih: -100 puan
   - Az nöbet sayısı: +10 puan

2. **Kural Kontrolü:**
   - Maksimum nöbet sayısı aşımı
   - Ardışık nöbet kontrolü
   - Negatif tercih kontrolü

3. **Dengeleme:**
   - Hedefin altında kalan doktorlar için hafta içi günlerde 3. doktor ataması

## 🛠️ Teknolojiler

- **Frontend:** React, Vite, Tailwind CSS
- **UI Kütüphaneleri:** react-day-picker, lucide-react
- **Backend:** Netlify Functions
- **Database:** Netlify Blobs
- **Hosting:** Netlify

## 🤝 Katkıda Bulunma

1. Fork edin
2. Feature branch oluşturun (`git checkout -b feature/amazing-feature`)
3. Değişiklikleri commit edin (`git commit -m 'Add amazing feature'`)
4. Branch'i push edin (`git push origin feature/amazing-feature`)
5. Pull Request oluşturun

## 📝 Lisans

Bu proje MIT lisansı altında lisanslanmıştır.

## 👨‍⚕️ Doktor Listesi

Sistem şu doktorlar için yapılandırılmıştır:
- Dr. Ahmet Yılmaz
- Dr. Ayşe Kaya
- Dr. Mehmet Özkan
- Dr. Fatma Demir
- Dr. Ali Şahin
- Dr. Zeynep Arslan
- Dr. Mustafa Çelik
- Dr. Elif Yıldız
- Dr. Okan Avcı

## 🔍 Sorun Giderme

### Build Hataları
- Node.js sürümünüzün 18+ olduğundan emin olun
- `npm install` komutunu tekrar çalıştırın

### API Hataları
- Netlify Functions'ın düzgün deploy edildiğinden emin olun
- Browser console'da hata mesajlarını kontrol edin

### Stil Sorunları
- Tailwind CSS'in düzgün yüklendiğinden emin olun
- `npm run build` sonrası `dist` klasörünü kontrol edin

## 📞 Destek

Herhangi bir sorun yaşarsanız GitHub Issues bölümünden bildirin. 