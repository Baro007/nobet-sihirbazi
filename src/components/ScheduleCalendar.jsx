import React, { useState, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import { Save, RotateCcw } from 'lucide-react'
import 'react-day-picker/dist/style.css'

function ScheduleCalendar({ currentUserName, preferences, allDoctors, onSave }) {
  const [pozitifGunler, setPozitifGunler] = useState([])
  const [negatifGunler, setNegatifGunler] = useState([])
  const [ozelSebepler, setOzelSebepler] = useState('')

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

  // Gün tıklama işlemi
  const handleDayClick = (day) => {
    const dayNumber = day.getDate()
    
    // Mevcut durumu kontrol et
    const isPozitif = pozitifGunler.includes(dayNumber)
    const isNegatif = negatifGunler.includes(dayNumber)
    
    if (!isPozitif && !isNegatif) {
      // Boş -> Pozitif
      setPozitifGunler([...pozitifGunler, dayNumber])
    } else if (isPozitif) {
      // Pozitif -> Negatif
      setPozitifGunler(pozitifGunler.filter(d => d !== dayNumber))
      setNegatifGunler([...negatifGunler, dayNumber])
    } else if (isNegatif) {
      // Negatif -> Boş
      setNegatifGunler(negatifGunler.filter(d => d !== dayNumber))
    }
  }

  // Tercihleri sıfırla
  const resetPreferences = () => {
    setPozitifGunler([])
    setNegatifGunler([])
    setOzelSebepler('')
  }

  // Kaydet
  const handleSave = async () => {
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

  // Diğer doktorların tercihlerini say
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
        }
        .rdp-day-negative {
          background-color: #ef4444 !important;
          color: white !important;
        }
        .rdp-day {
          position: relative;
          cursor: pointer;
        }
        .rdp-day:hover {
          background-color: #e5e7eb !important;
        }
        .rdp-day-positive:hover {
          background-color: #059669 !important;
        }
        .rdp-day-negative:hover {
          background-color: #dc2626 !important;
        }
        .demand-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          background-color: #3b82f6;
          color: white;
          border-radius: 50%;
          width: 16px;
          height: 16px;
          font-size: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
        }
      `}</style>

      {/* Takvim */}
      <div className="flex justify-center">
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
              const otherDoctorCount = getOtherDoctorCount(dayNumber)
              
              return (
                <div className="relative">
                  <button {...props} className={`rdp-day ${getDayStyle(date)}`}>
                    {dayNumber}
                    {otherDoctorCount > 0 && (
                      <span className="demand-badge">
                        {otherDoctorCount}
                      </span>
                    )}
                  </button>
                </div>
              )
            }
          }}
        />
      </div>

      {/* İstatistikler */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="bg-green-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-green-600">{pozitifGunler.length}</div>
          <div className="text-sm text-green-700">İstediğim Günler</div>
        </div>
        <div className="bg-red-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-red-600">{negatifGunler.length}</div>
          <div className="text-sm text-red-700">İstemediğim Günler</div>
        </div>
        <div className="bg-gray-50 p-4 rounded-lg">
          <div className="text-2xl font-bold text-gray-600">
            {31 - pozitifGunler.length - negatifGunler.length}
          </div>
          <div className="text-sm text-gray-700">Fark Etmeyen</div>
        </div>
      </div>

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

      {/* Açıklama */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">Nasıl Kullanılır:</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Günlere tıklayarak tercihlerinizi belirleyin</li>
          <li>• Yeşil: Nöbet tutmak istediğiniz günler</li>
          <li>• Kırmızı: Nöbet tutmak istemediğiniz günler</li>
          <li>• Mavi sayılar: O günü isteyen diğer doktor sayısı</li>
          <li>• Özel sebepler alanında ek bilgilerinizi yazın</li>
          <li>• Değişiklik sonrası mutlaka "Kaydet" butonuna tıklayın</li>
        </ul>
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
          className="flex items-center px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition duration-200"
        >
          <Save className="h-4 w-4 mr-2" />
          Tercihlerimi Kaydet
        </button>
      </div>
    </div>
  )
}

export default ScheduleCalendar 