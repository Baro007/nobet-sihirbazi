import React, { useState, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { Save, RotateCcw } from 'lucide-react'
import 'react-day-picker/dist/style.css'

function ScheduleCalendar({ currentUserName, preferences, allDoctors, onSave, isAdmin }) {
  const [pozitifGunler, setPozitifGunler] = useState([])
  const [negatifGunler, setNegatifGunler] = useState([])
  const [ozelSebepler, setOzelSebepler] = useState('')
  const [selectionMode, setSelectionMode] = useState('pozitif') // 'pozitif' veya 'negatif'

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

    const success = await onSave(pozitifGunler, negatifGunler, ozelSebepler)
    if (!success) {
      // Hata durumunda tercihleri geri yükle
      if (currentUserName && preferences[currentUserName]) {
        setPozitifGunler(preferences[currentUserName].pozitif || [])
        setNegatifGunler(preferences[currentUserName].negatif || [])
        setOzelSebepler(preferences[currentUserName].ozelSebepler || '')
      }
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

  // Sadece diğer doktorların tercihlerini say (eski fonksiyon)
  const getOtherDoctorCount = (dayNumber) => {
    let count = 0
    Object.keys(preferences).forEach(doctor => {
      if (doctor !== currentUserName && preferences[doctor].pozitif?.includes(dayNumber)) {
        count++
      }
    })
    return count
  }

  return (
    <div className="space-y-6">
      {/* Stil tanımları */}
      <style jsx>{`
        .rdp-day-positive {
          background-color: #10b981 !important;
          color: white !important;
          box-shadow: 0 2px 4px rgba(16, 185, 129, 0.3) !important;
        }
        .rdp-day-negative {
          background-color: #ef4444 !important;
          color: white !important;
          box-shadow: 0 2px 4px rgba(239, 68, 68, 0.3) !important;
        }
        .rdp-day {
          position: relative;
          cursor: pointer !important;
          transition: all 0.2s ease !important;
          border-radius: 6px !important;
        }
        .rdp-day:hover {
          background-color: #e5e7eb !important;
          transform: scale(1.05) !important;
        }
        .rdp-day-positive:hover {
          background-color: #059669 !important;
          transform: scale(1.05) !important;
        }
        .rdp-day-negative:hover {
          background-color: #dc2626 !important;
          transform: scale(1.05) !important;
        }
        .demand-badge {
          position: absolute;
          top: -4px;
          right: -4px;
          background-color: #3b82f6;
          color: white;
          border-radius: 50%;
          width: 18px;
          height: 18px;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          border: 2px solid white;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        }
        .selection-mode-pozitif .rdp-day:hover {
          background-color: #dcfce7 !important;
          border: 2px solid #10b981 !important;
        }
        .selection-mode-negatif .rdp-day:hover {
          background-color: #fef2f2 !important;
          border: 2px solid #ef4444 !important;
        }
      `}</style>

      {/* Mod Seçimi ve Bilgilendirme */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-3">
          📅 Tercih Seçimi - Adım Adım Rehber
        </h4>
        
        {/* Mod Seçim Butonları */}
        <div className="flex space-x-3 mb-4">
          <button
            onClick={() => setSelectionMode('pozitif')}
            className={`flex items-center px-4 py-2 rounded-md font-medium transition duration-200 ${
              selectionMode === 'pozitif'
                ? 'bg-green-600 text-white shadow-md'
                : 'bg-white text-green-600 border border-green-600 hover:bg-green-50'
            }`}
          >
            ✅ 1. Adım: İstediğim Günler
          </button>
          <button
            onClick={() => setSelectionMode('negatif')}
            className={`flex items-center px-4 py-2 rounded-md font-medium transition duration-200 ${
              selectionMode === 'negatif'
                ? 'bg-red-600 text-white shadow-md'
                : 'bg-white text-red-600 border border-red-600 hover:bg-red-50'
            }`}
          >
            ❌ 2. Adım: İstemediğim Günler
          </button>
        </div>

        {/* Aktif Mod Bilgilendirmesi */}
        <div className={`p-3 rounded-md ${
          selectionMode === 'pozitif' ? 'bg-green-100 border border-green-300' : 'bg-red-100 border border-red-300'
        }`}>
          <p className={`text-sm font-medium ${
            selectionMode === 'pozitif' ? 'text-green-800' : 'text-red-800'
          }`}>
            {selectionMode === 'pozitif' ? (
              '🟢 Pozitif Seçim Modu: Nöbet tutmak istediğiniz günlere tıklayın'
            ) : (
              '🔴 Negatif Seçim Modu: Nöbet tutmak istemediğiniz günlere tıklayın'
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
        <div className="bg-white rounded-lg border border-gray-200 p-4 shadow-sm">
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
                  <div className="relative">
                    <button 
                      {...props} 
                      className={`rdp-day ${getDayStyle(date)}`}
                      title={`${dayNumber} Temmuz - ${totalDoctorCount} doktor bu günü istiyor`}
                    >
                      <div className="flex flex-col items-center">
                        <span className="text-sm font-medium">{dayNumber}</span>
                        {isPozitif && <span className="text-xs">✓</span>}
                        {isNegatif && <span className="text-xs">✗</span>}
                      </div>
                      {totalDoctorCount > 0 && (
                        <span className="demand-badge" title={`${totalDoctorCount} doktor bu günü istiyor`}>
                          {totalDoctorCount}
                        </span>
                      )}
                    </button>
                  </div>
                )
              }
            }}
          />
          
          {/* Takvim Alt Bilgi */}
          <div className="mt-4 text-center">
            <div className="flex justify-center space-x-4 text-xs text-gray-600">
              <div className="flex items-center">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-1"></div>
                <span>İstediğim ({pozitifGunler.length})</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-red-500 rounded-full mr-1"></div>
                <span>İstemediğim ({negatifGunler.length})</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 bg-blue-500 rounded-full mr-1"></div>
                <span>Diğer doktor sayısı</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className={`p-4 rounded-lg ${pozitifGunler.length > 15 ? 'bg-red-50 border border-red-200' : 'bg-green-50'}`}>
          <div className={`text-2xl font-bold ${pozitifGunler.length > 15 ? 'text-red-600' : 'text-green-600'}`}>
            {pozitifGunler.length}
          </div>
          <div className={`text-sm ${pozitifGunler.length > 15 ? 'text-red-700' : 'text-green-700'}`}>
            İstediğim Günler
            {pozitifGunler.length > 15 && <div className="text-xs">⚠️ Çok fazla!</div>}
          </div>
        </div>
        <div className={`p-4 rounded-lg ${negatifGunler.length > 20 ? 'bg-red-50 border border-red-200' : 'bg-red-50'}`}>
          <div className={`text-2xl font-bold ${negatifGunler.length > 20 ? 'text-red-800' : 'text-red-600'}`}>
            {negatifGunler.length}
          </div>
          <div className={`text-sm ${negatifGunler.length > 20 ? 'text-red-800' : 'text-red-700'}`}>
            İstemediğim Günler
            {negatifGunler.length > 20 && <div className="text-xs">⚠️ Çok fazla!</div>}
          </div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-gray-600">
            {31 - pozitifGunler.length - negatifGunler.length}
          </div>
          <div className="text-sm text-gray-700">Fark Etmeyen</div>
        </div>
      </div>

      {/* Validation Feedback */}
      {(() => {
        const validation = isValidPreferences()
        if (!validation.valid) {
          return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700 font-medium">
                ⚠️ {validation.message}
              </p>
            </div>
          )
        } else if (pozitifGunler.length > 0 || negatifGunler.length > 0) {
          return (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-700">
                ✅ Tercihleriniz geçerli! Kaydetmek için aşağıdaki butona tıklayın.
              </p>
            </div>
          )
        }
        return null
      })()}

      {/* Özel Sebepler */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <label htmlFor="ozel-sebepler" className="block text-sm font-medium text-gray-700 mb-2">
          Özel Sebepler ve Mazeretler (İsteğe Bağlı)
        </label>
        <textarea
          id="ozel-sebepler"
          value={ozelSebepler}
          onChange={(e) => setOzelSebepler(e.target.value)}
          placeholder="Örn: 15-20 Temmuz arası tatilde olacağım, Cumartesi günleri mümkünse nöbet tutmak istemiyorum..."
          rows={3}
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-none"
        />
        <p className="text-xs text-gray-500 mt-1">
          Özel durumlarınızı, mazeretlerinizi veya tercihlerinizle ilgili ek bilgileri buraya yazabilirsiniz.
        </p>
      </div>

      {/* Kullanım Rehberi */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
        <h4 className="font-medium text-blue-900 mb-3 flex items-center">
          📖 Kullanım Rehberi
        </h4>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <h5 className="font-medium text-blue-800 mb-2">🎯 Seçim Adımları:</h5>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <strong>1. Adım:</strong> "İstediğim Günler" modunda yeşil butonla seçim yapın</li>
              <li>• <strong>2. Adım:</strong> "İstemediğim Günler" moduna geçip kırmızı butonla seçim yapın</li>
              <li>• <strong>3. Adım:</strong> Özel sebeplerinizi yazın (isteğe bağlı)</li>
              <li>• <strong>4. Adım:</strong> "Kaydet" butonuna tıklayın</li>
            </ul>
          </div>
          <div>
            <h5 className="font-medium text-blue-800 mb-2">💡 İpuçları:</h5>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Günlerin üzerindeki ✓ ve ✗ işaretlerine dikkat edin</li>
              <li>• Mavi sayılar: O günü isteyen toplam doktor sayısı</li>
              <li>• Tekrar tıklayarak seçimi kaldırabilirsiniz</li>
              <li>• Maksimum 15 pozitif, 20 negatif tercih yapabilirsiniz</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Butonlar */}
      <div className="flex justify-between">
        <button
          onClick={resetPreferences}
          className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 transition duration-200"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Sıfırla
        </button>
        
        <button
          onClick={handleSave}
          disabled={!isValidPreferences().valid}
          className={`flex items-center px-6 py-2 rounded-md transition duration-200 ${
            isValidPreferences().valid
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          <Save className="h-4 w-4 mr-2" />
          {isValidPreferences().valid ? 'Tercihlerimi Kaydet' : 'Geçersiz Tercihler'}
        </button>
      </div>
    </div>
  )
}

export default ScheduleCalendar 