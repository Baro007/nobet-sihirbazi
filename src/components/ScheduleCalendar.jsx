import React, { useState, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { Save, RotateCcw, TrendingUp, Users, Calendar, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import 'react-day-picker/dist/style.css'

function ScheduleCalendar({ currentUserName, preferences, allDoctors, onSave, isAdmin }) {
  const [pozitifGunler, setPozitifGunler] = useState([])
  const [negatifGunler, setNegatifGunler] = useState([])
  const [ozelSebepler, setOzelSebepler] = useState('')
  const [selectionMode, setSelectionMode] = useState('pozitif') // 'pozitif' veya 'negatif'
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [dragSelection, setDragSelection] = useState(false)

  // Temmuz 2025
  const month = new Date(2025, 6) // 6 = Temmuz (0-indexed)

  // Kullanıcı değiştiğinde tercihleri yükle
  useEffect(() => {
    if (currentUserName && preferences[currentUserName]) {
      setPozitifGunler(preferences[currentUserName].pozitif || [])
      setNegatifGunler(preferences[currentUserName].negatif || [])
      setOzelSebepler(preferences[currentUserName].ozelSebepler || '')
    } else {
      setPozitifGunler([])
      setNegatifGunler([])
      setOzelSebepler('')
    }
  }, [currentUserName, preferences])

  // Gün tıklama işlemi - Mod bazlı seçim
  const handleDayClick = (day) => {
    const dayNumber = day.getDate()
    
    if (selectionMode === 'pozitif') {
      // Pozitif mod: Bu günü pozitif listesine ekle/çıkar
      if (pozitifGunler.includes(dayNumber)) {
        // Zaten seçili, çıkar
        setPozitifGunler(pozitifGunler.filter(d => d !== dayNumber))
      } else {
        // Seçili değil, ekle (önce negatiften çıkar)
        setNegatifGunler(negatifGunler.filter(d => d !== dayNumber))
        setPozitifGunler([...pozitifGunler, dayNumber])
      }
    } else if (selectionMode === 'negatif') {
      // Negatif mod: Bu günü negatif listesine ekle/çıkar
      if (negatifGunler.includes(dayNumber)) {
        // Zaten seçili, çıkar
        setNegatifGunler(negatifGunler.filter(d => d !== dayNumber))
      } else {
        // Seçili değil, ekle (önce pozitiften çıkar)
        setPozitifGunler(pozitifGunler.filter(d => d !== dayNumber))
        setNegatifGunler([...negatifGunler, dayNumber])
      }
    }
  }



  // Tercihleri sıfırla
  const resetPreferences = () => {
    setPozitifGunler([])
    setNegatifGunler([])
    setOzelSebepler('')
    setShowSuccess(false)
  }

  // Validation
  const isValidPreferences = () => {
    if (pozitifGunler.length === 0 && negatifGunler.length === 0) {
      return { valid: false, message: 'Lütfen en az bir gün için tercih belirtin!' }
    }
    if (pozitifGunler.length > 15) {
      return { valid: false, message: 'Çok fazla pozitif tercih! Maksimum 15 gün seçebilirsiniz.' }
    }
    if (negatifGunler.length > 20) {
      return { valid: false, message: 'Çok fazla negatif tercih! Maksimum 20 gün seçebilirsiniz.' }
    }
    return { valid: true, message: '' }
  }

  // Kaydet
  const handleSave = async () => {
    const validation = isValidPreferences()
    if (!validation.valid) {
      alert(validation.message)
      return
    }

    setSaving(true)
    setShowSuccess(false)
    
    try {
      const success = await onSave(pozitifGunler, negatifGunler, ozelSebepler)
      if (success) {
        setShowSuccess(true)
        setTimeout(() => setShowSuccess(false), 3000)
      } else {
        // Hata durumunda tercihleri geri yükle
        if (currentUserName && preferences[currentUserName]) {
          setPozitifGunler(preferences[currentUserName].pozitif || [])
          setNegatifGunler(preferences[currentUserName].negatif || [])
          setOzelSebepler(preferences[currentUserName].ozelSebepler || '')
        }
      }
    } finally {
      setSaving(false)
    }
  }

  // Gün stilini belirle
  const getDayStyle = (day) => {
    const dayNumber = day.getDate()
    const isPozitif = pozitifGunler.includes(dayNumber)
    const isNegatif = negatifGunler.includes(dayNumber)
    
    if (isPozitif) {
      return 'rdp-day-positive'
    } else if (isNegatif) {
      return 'rdp-day-negative'
    }
    return ''
  }

  // Toplam doktor sayısını say (mevcut kullanıcı dahil)
  const getTotalDoctorCount = (dayNumber) => {
    let count = 0
    Object.keys(preferences).forEach(doctor => {
      if (preferences[doctor].pozitif?.includes(dayNumber)) {
        count++
      }
    })
    // Mevcut kullanıcının tercihini de ekle (henüz kaydedilmemişse)
    if (currentUserName && pozitifGunler.includes(dayNumber) && !preferences[currentUserName]?.pozitif?.includes(dayNumber)) {
      count++
    }
    return count
  }

  // İstatistikler
  const stats = {
    totalDoctors: Object.keys(preferences).length,
    completedDoctors: Object.keys(preferences).filter(d => preferences[d].pozitif?.length > 0 || preferences[d].negatif?.length > 0).length,
    avgPositive: Object.keys(preferences).reduce((sum, d) => sum + (preferences[d].pozitif?.length || 0), 0) / Math.max(Object.keys(preferences).length, 1),
    avgNegative: Object.keys(preferences).reduce((sum, d) => sum + (preferences[d].negatif?.length || 0), 0) / Math.max(Object.keys(preferences).length, 1),
  }

  return (
    <div className="space-y-6">
      {/* Stil tanımları */}
      <style jsx>{`
        .rdp-day-positive {
          background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
          color: white !important;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4) !important;
          transform: scale(1.02) !important;
        }
        .rdp-day-negative {
          background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%) !important;
          color: white !important;
          box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4) !important;
          transform: scale(1.02) !important;
        }
        .rdp-day {
          position: relative;
          cursor: pointer !important;
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
          border-radius: 8px !important;
          min-height: 45px !important;
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
        }
        .rdp-day:hover {
          background-color: #f3f4f6 !important;
          transform: scale(1.05) !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1) !important;
        }
        .rdp-day-positive:hover {
          background: linear-gradient(135deg, #059669 0%, #047857 100%) !important;
          transform: scale(1.08) !important;
        }
        .rdp-day-negative:hover {
          background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%) !important;
          transform: scale(1.08) !important;
        }
        .demand-badge {
          position: absolute;
          top: -6px;
          right: -6px;
          background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
          color: white;
          border-radius: 50%;
          width: 20px;
          height: 20px;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          border: 2px solid white;
          box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .selection-mode-pozitif .rdp-day:hover {
          background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%) !important;
          border: 2px solid #10b981 !important;
        }
        .selection-mode-negatif .rdp-day:hover {
          background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%) !important;
          border: 2px solid #ef4444 !important;
        }
        .stats-card {
          background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
          border: 1px solid #e2e8f0;
        }
        @media (max-width: 768px) {
          .rdp-day {
            min-height: 35px !important;
            font-size: 14px !important;
          }
          .demand-badge {
            width: 16px;
            height: 16px;
            font-size: 10px;
            top: -4px;
            right: -4px;
          }
        }
      `}</style>

      {/* Success Notification */}
      {showSuccess && (
        <div className="fixed top-4 right-4 z-50 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center animate-bounce">
          <CheckCircle2 className="h-5 w-5 mr-2" />
          Tercihleriniz başarıyla kaydedildi!
        </div>
      )}

      {/* İstatistikler (Admin için) */}
      {isAdmin && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="stats-card p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-blue-600">{stats.totalDoctors}</div>
            <div className="text-sm text-gray-600">Toplam Doktor</div>
          </div>
          <div className="stats-card p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-green-600">{stats.completedDoctors}</div>
            <div className="text-sm text-gray-600">Tercih Girilen</div>
          </div>
          <div className="stats-card p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-orange-600">{stats.avgPositive.toFixed(1)}</div>
            <div className="text-sm text-gray-600">Ort. Pozitif</div>
          </div>
          <div className="stats-card p-4 rounded-lg text-center">
            <div className="text-2xl font-bold text-red-600">{stats.avgNegative.toFixed(1)}</div>
            <div className="text-sm text-gray-600">Ort. Negatif</div>
          </div>
        </div>
      )}

      {/* Mod Seçimi ve Bilgilendirme */}
      <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-blue-200 rounded-xl p-6 shadow-sm">
        <h4 className="font-bold text-blue-900 mb-4 flex items-center text-lg">
          <Calendar className="h-5 w-5 mr-2" />
          📅 Tercih Seçimi - Adım Adım Rehber
        </h4>
        
        {/* Mod Seçim Butonları */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <button
            onClick={() => setSelectionMode('pozitif')}
            className={`flex items-center justify-center px-6 py-3 rounded-lg font-bold transition-all duration-300 transform ${
              selectionMode === 'pozitif'
                ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-lg scale-105'
                : 'bg-white text-green-600 border-2 border-green-600 hover:bg-green-50 hover:scale-102'
            }`}
          >
            <CheckCircle2 className="h-5 w-5 mr-2" />
            ✅ 1. Adım: İstediğim Günler
          </button>
          <button
            onClick={() => setSelectionMode('negatif')}
            className={`flex items-center justify-center px-6 py-3 rounded-lg font-bold transition-all duration-300 transform ${
              selectionMode === 'negatif'
                ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg scale-105'
                : 'bg-white text-red-600 border-2 border-red-600 hover:bg-red-50 hover:scale-102'
            }`}
          >
            <AlertTriangle className="h-5 w-5 mr-2" />
            ❌ 2. Adım: İstemediğim Günler
          </button>
        </div>



        {/* Aktif Mod Bilgilendirmesi */}
        <div className={`p-4 rounded-lg border-2 ${
          selectionMode === 'pozitif' 
            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' 
            : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300'
        }`}>
          <p className={`text-sm font-bold ${
            selectionMode === 'pozitif' ? 'text-green-800' : 'text-red-800'
          }`}>
            {selectionMode === 'pozitif' ? (
              <>🟢 Pozitif Seçim Modu: Nöbet tutmak istediğiniz günlere tıklayın</>
            ) : (
              <>🔴 Negatif Seçim Modu: Nöbet tutmak istemediğiniz günlere tıklayın</>
            )}
          </p>
          <p className={`text-xs mt-1 ${
            selectionMode === 'pozitif' ? 'text-green-600' : 'text-red-600'
          }`}>
            • Günlere tıklayarak seçim yapın • Tekrar tıklayarak seçimi kaldırabilirsiniz
            • Mavi sayılar: O günü isteyen doktor sayısı
          </p>
        </div>
      </div>

      {/* Takvim */}
      <div className={`flex justify-center selection-mode-${selectionMode}`}>
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg">
          <DayPicker
            mode="single"
            month={month}
            onDayClick={handleDayClick}
            modifiers={{
              positive: pozitifGunler.map(day => new Date(2025, 6, day)),
              negative: negatifGunler.map(day => new Date(2025, 6, day))
            }}
            modifiersClassNames={{
              positive: 'rdp-day-positive',
              negative: 'rdp-day-negative'
            }}
            components={{
              Day: ({ date, ...props }) => {
                const dayNumber = date.getDate()
                const totalDoctorCount = getTotalDoctorCount(dayNumber)
                const isPozitif = pozitifGunler.includes(dayNumber)
                const isNegatif = negatifGunler.includes(dayNumber)
                
                return (
                  <div 
                    className={`relative rdp-day ${getDayStyle(date)}`}
                    title={`${dayNumber} Temmuz - ${totalDoctorCount} doktor bu günü istiyor`}
                    {...props}
                  >
                    <div className="flex flex-col items-center">
                      <span className="text-sm font-bold">{dayNumber}</span>
                      {isPozitif && <span className="text-xs">✓</span>}
                      {isNegatif && <span className="text-xs">✗</span>}
                    </div>
                    {totalDoctorCount > 0 && (
                      <span className="demand-badge" title={`${totalDoctorCount} doktor bu günü istiyor`}>
                        {totalDoctorCount}
                      </span>
                    )}
                  </div>
                )
              }
            }}
          />
          
          {/* Takvim Alt Bilgi */}
          <div className="mt-6 text-center">
            <div className="flex justify-center space-x-6 text-sm text-gray-600">
              <div className="flex items-center">
                <div className="w-4 h-4 bg-gradient-to-r from-green-500 to-green-600 rounded-full mr-2"></div>
                <span className="font-medium">İstediğim ({pozitifGunler.length})</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-gradient-to-r from-red-500 to-red-600 rounded-full mr-2"></div>
                <span className="font-medium">İstemediğim ({negatifGunler.length})</span>
              </div>
              <div className="flex items-center">
                <div className="w-4 h-4 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full mr-2"></div>
                <span className="font-medium">Diğer doktor sayısı</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
        <div className={`p-6 rounded-xl shadow-lg ${pozitifGunler.length > 15 ? 'bg-gradient-to-br from-red-50 to-red-100 border border-red-200' : 'bg-gradient-to-br from-green-50 to-emerald-100'}`}>
          <div className={`text-3xl font-bold mb-2 ${pozitifGunler.length > 15 ? 'text-red-600' : 'text-green-600'}`}>
            {pozitifGunler.length}
            <span className="text-lg text-gray-500">/15</span>
          </div>
          <div className={`text-sm font-medium ${pozitifGunler.length > 15 ? 'text-red-700' : 'text-green-700'}`}>
            İstediğim Günler
            {pozitifGunler.length > 15 && <div className="text-xs text-red-600 mt-1 animate-pulse">⚠️ Limit aşıldı!</div>}
          </div>
        </div>
        <div className={`p-6 rounded-xl shadow-lg ${negatifGunler.length > 20 ? 'bg-gradient-to-br from-red-50 to-red-100 border border-red-200' : 'bg-gradient-to-br from-red-50 to-rose-100'}`}>
          <div className={`text-3xl font-bold mb-2 ${negatifGunler.length > 20 ? 'text-red-800' : 'text-red-600'}`}>
            {negatifGunler.length}
            <span className="text-lg text-gray-500">/20</span>
          </div>
          <div className={`text-sm font-medium ${negatifGunler.length > 20 ? 'text-red-800' : 'text-red-700'}`}>
            İstemediğim Günler
            {negatifGunler.length > 20 && <div className="text-xs text-red-600 mt-1 animate-pulse">⚠️ Limit aşıldı!</div>}
          </div>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-slate-100 p-6 rounded-xl shadow-lg">
          <div className="text-3xl font-bold text-gray-600 mb-2">
            {31 - pozitifGunler.length - negatifGunler.length}
          </div>
          <div className="text-sm font-medium text-gray-700">Fark Etmeyen</div>
        </div>
      </div>

      {/* Validation Feedback */}
      {(() => {
        const validation = isValidPreferences()
        if (!validation.valid) {
          return (
            <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-lg p-4 animate-pulse">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                <p className="text-sm text-red-700 font-bold">
                  ⚠️ {validation.message}
                </p>
              </div>
            </div>
          )
        } else if (pozitifGunler.length > 0 || negatifGunler.length > 0) {
          return (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 mr-2" />
                <p className="text-sm text-green-700 font-bold">
                  ✅ Tercihleriniz geçerli! Kaydetmek için aşağıdaki butona tıklayın.
                </p>
              </div>
            </div>
          )
        }
        return null
      })()}

      {/* Özel Sebepler */}
      <div className="bg-gradient-to-r from-gray-50 to-slate-50 p-6 rounded-xl border border-gray-200">
        <label htmlFor="ozel-sebepler" className="block text-sm font-bold text-gray-700 mb-3">
          📝 Özel Sebepler ve Mazeretler (İsteğe Bağlı)
        </label>
        <textarea
          id="ozel-sebepler"
          value={ozelSebepler}
          onChange={(e) => setOzelSebepler(e.target.value)}
          placeholder="Örn: 15-20 Temmuz arası tatilde olacağım, Cumartesi günleri mümkünse nöbet tutmak istemiyorum..."
          rows={4}
          className="block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-none transition duration-200"
        />
        <p className="text-xs text-gray-500 mt-2">
          💡 Özel durumlarınızı, mazeretlerinizi veya tercihlerinizle ilgili ek bilgileri buraya yazabilirsiniz.
        </p>
      </div>

      {/* Kullanım Rehberi */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
        <h4 className="font-bold text-blue-900 mb-4 flex items-center text-lg">
          <TrendingUp className="h-5 w-5 mr-2" />
          📖 Kullanım Rehberi
        </h4>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-bold text-blue-800 mb-3">🎯 Seçim Adımları:</h5>
            <ul className="text-sm text-blue-700 space-y-2">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span><strong>1. Adım:</strong> "İstediğim Günler" modunda yeşil butonla seçim yapın</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span><strong>2. Adım:</strong> "İstemediğim Günler" moduna geçip kırmızı butonla seçim yapın</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span><strong>3. Adım:</strong> Özel sebeplerinizi yazın (isteğe bağlı)</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span><strong>4. Adım:</strong> "Kaydet" butonuna tıklayın</span>
              </li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-blue-800 mb-3">💡 İpuçları:</h5>
            <ul className="text-sm text-blue-700 space-y-2">
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Günlerin üzerindeki ✓ ve ✗ işaretlerine dikkat edin</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Mavi sayılar: O günü isteyen toplam doktor sayısı</span>
              </li>
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Tekrar tıklayarak seçimi kaldırabilirsiniz</span>
              </li>

              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>Maksimum 15 pozitif, 20 negatif tercih yapabilirsiniz</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Butonlar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <button
          onClick={resetPreferences}
          className="flex items-center justify-center px-6 py-3 border-2 border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition-all duration-200 transform hover:scale-105"
        >
          <RotateCcw className="h-5 w-5 mr-2" />
          Sıfırla
        </button>
        
        <button
          onClick={handleSave}
          disabled={!isValidPreferences().valid || saving}
          className={`flex items-center justify-center px-8 py-3 rounded-lg font-bold transition-all duration-300 transform ${
            isValidPreferences().valid && !saving
              ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg hover:shadow-xl hover:scale-105'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {saving ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Kaydediliyor...
            </>
          ) : (
            <>
              <Save className="h-5 w-5 mr-2" />
              {isValidPreferences().valid ? 'Tercihlerimi Kaydet' : 'Geçersiz Tercihler'}
            </>
          )}
        </button>
      </div>
    </div>
  )
}

export default ScheduleCalendar 