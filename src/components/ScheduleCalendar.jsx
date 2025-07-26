import React, { useState, useEffect, useRef } from 'react'
import { DayPicker } from 'react-day-picker'
import { Save, RotateCcw, TrendingUp, Users, Calendar, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react'
import 'react-day-picker/dist/style.css'

function ScheduleCalendar({ currentUserName, preferences, allDoctors, onSave, isAdmin, selectedMonth }) {
  const [pozitifGunler, setPozitifGunler] = useState([])
  const [negatifGunler, setNegatifGunler] = useState([])
  const [ozelSebepler, setOzelSebepler] = useState('')
  const [selectionMode, setSelectionMode] = useState('pozitif') // 'pozitif' veya 'negatif'
  const [saving, setSaving] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [dragStartDay, setDragStartDay] = useState(null)
  const isDraggingRef = useRef(false)

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
  const handleDaySelection = (dayNumber) => {
    if (selectionMode === 'pozitif') {
      if (pozitifGunler.includes(dayNumber)) {
        setPozitifGunler(pozitifGunler.filter(d => d !== dayNumber))
      } else {
        setNegatifGunler(negatifGunler.filter(d => d !== dayNumber))
        setPozitifGunler([...pozitifGunler, dayNumber])
      }
    } else if (selectionMode === 'negatif') {
      if (negatifGunler.includes(dayNumber)) {
        setNegatifGunler(negatifGunler.filter(d => d !== dayNumber))
      } else {
        setPozitifGunler(pozitifGunler.filter(d => d !== dayNumber))
        setNegatifGunler([...negatifGunler, dayNumber])
      }
    }
  }

  // Sürükleme ve tıklama olaylarını yönet
  const handleMouseDown = (dayNumber) => {
    isDraggingRef.current = false; // Her tıklamada sürükleme durumunu sıfırla
    setDragStartDay(dayNumber)
  }

  const handleMouseEnter = (dayNumber) => {
    if (dragStartDay === null) return // Fare basılı değilse bir şey yapma

    // Fare basılıyken başka bir güne girildi, bu bir sürüklemedir.
    isDraggingRef.current = true

    const start = Math.min(dragStartDay, dayNumber)
    const end = Math.max(dragStartDay, dayNumber)
    const newSelectedDays = []
    for (let i = start; i <= end; i++) {
      newSelectedDays.push(i)
    }

    if (selectionMode === 'pozitif') {
      const otherDays = negatifGunler.filter(d => !newSelectedDays.includes(d))
      setNegatifGunler(otherDays)
      const combined = [...new Set([...pozitifGunler, ...newSelectedDays])]
      setPozitifGunler(combined)
    } else {
      const otherDays = pozitifGunler.filter(d => !newSelectedDays.includes(d))
      setPozitifGunler(otherDays)
      const combined = [...new Set([...negatifGunler, ...newSelectedDays])]
      setNegatifGunler(combined)
    }
  }

  const handleMouseUp = (dayNumber) => {
    // Eğer sürükleme referansı false ise, bu bir sürükleme değil, tek tıklamadır.
    if (isDraggingRef.current === false) {
      handleDaySelection(dayNumber)
    }

    // Sürükleme durumunu sıfırla
    setDragStartDay(null)
    isDraggingRef.current = false
  }
  
  const handleMouseLeaveContainer = () => {
    // Eğer fare takvim alanından çıkarsa sürüklemeyi iptal et
    setDragStartDay(null)
    isDraggingRef.current = false
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
    if (pozitifGunler.length > 9) {
      return { valid: false, message: 'Çok fazla pozitif tercih! Maksimum 9 gün seçebilirsiniz.' }
    }
    if (negatifGunler.length > 9) {
      return { valid: false, message: 'Çok fazla negatif tercih! Maksimum 9 gün seçebilirsiniz.' }
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
      {/* Tailwind CSS ile özel style'lar */}
      <style dangerouslySetInnerHTML={{
        __html: `
          .dark .rdp {
            color: #d1d5db; /* gray-300 */
          }
          .dark .rdp-day_selected {
            background-color: #3b82f6 !important; /* blue-500 */
          }
          .dark .rdp-day_today {
            color: #fb923c; /* orange-400 */
            font-weight: bold;
          }
          .dark .rdp-button:hover:not([disabled]):not(.rdp-day_selected) {
            background-color: #374151; /* gray-700 */
          }
          .dark .rdp-head_cell {
            color: #9ca3af; /* gray-400 */
          }
          .calendar-day-positive {
            background: linear-gradient(135deg, #10b981 0%, #059669 100%) !important;
            color: white !important;
            box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4) !important;
            transform: scale(1.02) !important;
          }
          .calendar-day-negative {
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
          .calendar-day-positive:hover {
            background: linear-gradient(135deg, #059669 0%, #047857 100%) !important;
            transform: scale(1.08) !important;
          }
          .calendar-day-negative:hover {
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
            z-index: 10;
          }
          .selection-mode-pozitif .rdp-day:hover {
            background: linear-gradient(135deg, #dcfce7 0%, #bbf7d0 100%) !important;
            border: 2px solid #10b981 !important;
          }
          .selection-mode-negatif .rdp-day:hover {
            background: linear-gradient(135deg, #fef2f2 0%, #fecaca 100%) !important;
            border: 2px solid #ef4444 !important;
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
        `
      }} />

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
          <div className="bg-gradient-to-br from-gray-50 to-slate-100 border border-gray-200 p-4 rounded-lg text-center shadow-sm dark:from-gray-800 dark:to-gray-900 dark:border-gray-700">
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.totalDoctors}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Toplam Doktor</div>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-slate-100 border border-gray-200 p-4 rounded-lg text-center shadow-sm dark:from-gray-800 dark:to-gray-900 dark:border-gray-700">
            <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.completedDoctors}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Tercih Girilen</div>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-slate-100 border border-gray-200 p-4 rounded-lg text-center shadow-sm dark:from-gray-800 dark:to-gray-900 dark:border-gray-700">
            <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.avgPositive.toFixed(1)}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Ort. Pozitif</div>
          </div>
          <div className="bg-gradient-to-br from-gray-50 to-slate-100 border border-gray-200 p-4 rounded-lg text-center shadow-sm dark:from-gray-800 dark:to-gray-900 dark:border-gray-700">
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.avgNegative.toFixed(1)}</div>
            <div className="text-sm text-gray-600 dark:text-gray-400">Ort. Negatif</div>
          </div>
        </div>
      )}

      {/* Mod Seçimi ve Bilgilendirme */}
      <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 border border-blue-200 rounded-xl p-6 shadow-sm dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-purple-900/20 dark:border-blue-800">
        <h4 className="font-bold text-blue-900 dark:text-blue-200 mb-4 flex items-center text-lg">
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
                : 'bg-white text-green-600 border-2 border-green-600 hover:bg-green-50 dark:bg-gray-800 dark:text-green-400 dark:border-green-500 dark:hover:bg-gray-700 hover:scale-102'
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
                : 'bg-white text-red-600 border-2 border-red-600 hover:bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-500 dark:hover:bg-gray-700 hover:scale-102'
            }`}
          >
            <AlertTriangle className="h-5 w-5 mr-2" />
            ❌ 2. Adım: İstemediğim Günler
          </button>
        </div>

        {/* Aktif Mod Bilgilendirmesi */}
        <div className={`p-4 rounded-lg border-2 ${
          selectionMode === 'pozitif' 
            ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300 dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-700' 
            : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300 dark:from-red-900/20 dark:to-rose-900/20 dark:border-red-700'
        }`}>
          <p className={`text-sm font-bold ${
            selectionMode === 'pozitif' ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
          }`}>
            {selectionMode === 'pozitif' ? (
              <>🟢 Pozitif Seçim Modu: Nöbet tutmak istediğiniz günlere tıklayın</>
            ) : (
              <>🔴 Negatif Seçim Modu: Nöbet tutmak istemediğiniz günlere tıklayın</>
            )}
          </p>
          <p className={`text-xs mt-1 ${
            selectionMode === 'pozitif' ? 'text-green-600 dark:text-green-300' : 'text-red-600 dark:text-red-300'
          }`}>
            • Günlere tıklayarak seçim yapın • Tekrar tıklayarak seçimi kaldırabilirsiniz
            • Mavi sayılar: O günü isteyen doktor sayısı
          </p>
        </div>
      </div>

      {/* Takvim */}
      <div className={`flex justify-center selection-mode-${selectionMode}`} onMouseLeave={handleMouseLeaveContainer}>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 md:p-6 shadow-lg w-full max-w-lg">
          <DayPicker
            mode="single"
            month={selectedMonth}
            onDayClick={() => {}} // onClick'i devre dışı bırak, mouse event'leri ile yöneteceğiz
            modifiers={{
              positive: pozitifGunler.map(day => new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day)),
              negative: negatifGunler.map(day => new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day))
            }}
            modifiersClassNames={{
              positive: 'calendar-day-positive',
              negative: 'calendar-day-negative'
            }}
            components={{
              Day: ({ date, displayMonth, ...props }) => {
                const dayNumber = date.getDate()
                const totalDoctorCount = getTotalDoctorCount(dayNumber)
                const isPozitif = pozitifGunler.includes(dayNumber)
                const isNegatif = negatifGunler.includes(dayNumber)
                
                return (
                  <button 
                    {...props}
                    className={`rdp-day relative ${isPozitif ? 'calendar-day-positive' : ''} ${isNegatif ? 'calendar-day-negative' : ''}`}
                    onMouseDown={(e) => { e.preventDefault(); handleMouseDown(dayNumber); }}
                    onMouseEnter={(e) => { e.preventDefault(); handleMouseEnter(dayNumber); }}
                    onMouseUp={(e) => { e.preventDefault(); handleMouseUp(dayNumber); }}
                    title={`${dayNumber} ${selectedMonth.toLocaleString('tr-TR', { month: 'long' })} - ${totalDoctorCount} doktor bu günü istiyor`}
                    type="button"
                  >
                    <div className="flex flex-col items-center relative w-full h-full">
                      <span className="text-sm font-bold">{dayNumber}</span>
                      {isPozitif && <span className="text-xs">✓</span>}
                      {isNegatif && <span className="text-xs">✗</span>}
                    </div>
                    {totalDoctorCount > 0 && (
                      <span className="demand-badge" title={`${totalDoctorCount} doktor bu günü istiyor`}>
                        {totalDoctorCount}
                      </span>
                    )}
                  </button>
                )
              }
            }}
          />
          
          {/* Takvim Alt Bilgi */}
          <div className="mt-6 text-center">
            <div className="flex justify-center flex-wrap gap-3 text-sm text-gray-600">
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
        <div className={`p-6 rounded-xl shadow-lg ${pozitifGunler.length > 9 ? 'bg-gradient-to-br from-red-50 to-red-100 border border-red-200 dark:from-red-900/30 dark:to-red-900/40 dark:border-red-800' : 'bg-gradient-to-br from-green-50 to-emerald-100 dark:from-green-900/20 dark:to-emerald-900/30'}`}>
          <div className={`text-3xl font-bold mb-2 ${pozitifGunler.length > 9 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
            {pozitifGunler.length}
            <span className="text-lg text-gray-500 dark:text-gray-400">/9</span>
          </div>
          <div className={`text-sm font-medium ${pozitifGunler.length > 9 ? 'text-red-700 dark:text-red-300' : 'text-green-700 dark:text-green-300'}`}>
            İstediğim Günler
            {pozitifGunler.length > 9 && <div className="text-xs text-red-600 dark:text-red-400 mt-1 animate-pulse">⚠️ Limit aşıldı!</div>}
          </div>
        </div>
        <div className={`p-6 rounded-xl shadow-lg ${negatifGunler.length > 9 ? 'bg-gradient-to-br from-red-50 to-red-100 border border-red-200 dark:from-red-900/30 dark:to-red-900/40 dark:border-red-800' : 'bg-gradient-to-br from-red-50 to-rose-100 dark:from-red-900/20 dark:to-rose-900/30'}`}>
          <div className={`text-3xl font-bold mb-2 ${negatifGunler.length > 9 ? 'text-red-800 dark:text-red-400' : 'text-red-600 dark:text-red-400'}`}>
            {negatifGunler.length}
            <span className="text-lg text-gray-500 dark:text-gray-400">/9</span>
          </div>
          <div className={`text-sm font-medium ${negatifGunler.length > 9 ? 'text-red-800 dark:text-red-300' : 'text-red-700 dark:text-red-300'}`}>
            İstemediğim Günler
            {negatifGunler.length > 9 && <div className="text-xs text-red-600 dark:text-red-400 mt-1 animate-pulse">⚠️ Limit aşıldı!</div>}
          </div>
        </div>
        <div className="bg-gradient-to-br from-gray-50 to-slate-100 p-6 rounded-xl shadow-lg dark:from-gray-800 dark:to-gray-900">
          <div className="text-3xl font-bold text-gray-600 dark:text-gray-300 mb-2">
            {new Date(selectedMonth.getFullYear(), selectedMonth.getMonth() + 1, 0).getDate() - pozitifGunler.length - negatifGunler.length}
          </div>
          <div className="text-sm font-medium text-gray-700 dark:text-gray-400">Fark Etmeyen</div>
        </div>
      </div>

      {/* Validation Feedback */}
      {(() => {
        const validation = isValidPreferences()
        if (!validation.valid) {
          return (
            <div className="bg-gradient-to-r from-red-50 to-rose-50 border border-red-200 rounded-lg p-4 animate-pulse dark:from-red-900/20 dark:to-rose-900/20 dark:border-red-800">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 mr-2" />
                <p className="text-sm text-red-700 dark:text-red-300 font-bold">
                  ⚠️ {validation.message}
                </p>
              </div>
            </div>
          )
        } else if (pozitifGunler.length > 0 || negatifGunler.length > 0) {
          return (
            <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-800">
              <div className="flex items-center">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" />
                <p className="text-sm text-green-700 dark:text-green-300 font-bold">
                  ✅ Tercihleriniz geçerli! Kaydetmek için aşağıdaki butona tıklayın.
                </p>
              </div>
            </div>
          )
        }
        return null
      })()}

      {/* Özel Sebepler */}
      <div className="bg-gradient-to-r from-gray-50 to-slate-50 p-6 rounded-xl border border-gray-200 dark:from-gray-800 dark:to-gray-900 dark:border-gray-700">
        <label htmlFor="ozel-sebepler" className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">
          📝 Özel Sebepler ve Mazeretler (İsteğe Bağlı)
        </label>
        <textarea
          id="ozel-sebepler"
          value={ozelSebepler}
          onChange={(e) => setOzelSebepler(e.target.value)}
          placeholder="Örn: 15-20 Temmuz arası tatilde olacağım, Cumartesi günleri mümkünse nöbet tutmak istemiyorum..."
          rows={4}
          className="block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm resize-none transition duration-200 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-500 dark:placeholder-gray-400"
        />
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
          💡 Özel durumlarınızı, mazeretlerinizi veya tercihlerinizle ilgili ek bilgileri buraya yazabilirsiniz.
        </p>
      </div>

      {/* Kullanım Rehberi */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 dark:from-blue-900/20 dark:to-indigo-900/20 dark:border-blue-800">
        <h4 className="font-bold text-blue-900 dark:text-blue-200 mb-4 flex items-center text-lg">
          <TrendingUp className="h-5 w-5 mr-2" />
          📖 Kullanım Rehberi
        </h4>
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h5 className="font-bold text-blue-800 dark:text-blue-300 mb-3">🎯 Seçim Adımları:</h5>
            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-2">
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
            <h5 className="font-bold text-blue-800 dark:text-blue-300 mb-3">💡 İpuçları:</h5>
            <ul className="text-sm text-blue-700 dark:text-blue-400 space-y-2">
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
                <span>Maksimum 9 pozitif, 9 negatif tercih yapabilirsiniz</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Butonlar */}
      <div className="flex flex-col sm:flex-row justify-between gap-4">
        <button
          onClick={resetPreferences}
          className="flex items-center justify-center px-6 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-500 transition-all duration-200 transform hover:scale-105"
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
              : 'bg-gray-300 text-gray-500 dark:bg-gray-600 dark:text-gray-400 cursor-not-allowed'
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