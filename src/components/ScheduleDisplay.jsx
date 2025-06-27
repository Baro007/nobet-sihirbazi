import React, { useState } from 'react'
import { Calendar, Download, Users, TrendingUp, BarChart3, Eye, EyeOff, Filter, RefreshCw } from 'lucide-react'

// Hafta sonlarını belirle (Temmuz 2025)
function isWeekend(day) {
  const firstDayOfJuly2025 = 2 // Salı
  const dayOfWeek = (firstDayOfJuly2025 + day - 1) % 7
  return dayOfWeek === 0 || dayOfWeek === 6 // Pazar veya Cumartesi
}

// Gün adını al
function getDayName(day) {
  const firstDayOfJuly2025 = 2 // Salı
  const dayOfWeek = (firstDayOfJuly2025 + day - 1) % 7
  const days = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
  return days[dayOfWeek]
}

function ScheduleDisplay({ schedule, allDoctors, isAdmin }) {
  const [showStats, setShowStats] = useState(true)
  const [viewMode, setViewMode] = useState('calendar') // 'calendar', 'list', 'stats'
  const [selectedDoctor, setSelectedDoctor] = useState('')

  // Temmuz 2025 ayının günlerini oluştur
  const month = new Date(2025, 6) // Temmuz
  const daysInMonth = new Date(2025, 7, 0).getDate() // 31 gün
  
  const days = Array.from({ length: daysInMonth }, (_, i) => {
    const date = new Date(2025, 6, i + 1)
    return {
      number: i + 1,
      dayName: date.toLocaleDateString('tr-TR', { weekday: 'short' }),
      isWeekend: date.getDay() === 0 || date.getDay() === 6,
      doctors: schedule[i + 1] || []
    }
  })

  // İstatistikleri hesapla
  const stats = {
    totalShifts: Object.values(schedule).reduce((sum, doctors) => sum + doctors.length, 0),
    doctorStats: {},
    weekdayShifts: 0,
    weekendShifts: 0,
    avgDoctorsPerDay: 0
  }

  // Doktor bazlı istatistikler
  allDoctors.forEach(doctor => {
    stats.doctorStats[doctor] = {
      totalShifts: 0,
      weekdayShifts: 0,
      weekendShifts: 0
    }
  })

  days.forEach(day => {
    day.doctors.forEach(doctor => {
      if (stats.doctorStats[doctor]) {
        stats.doctorStats[doctor].totalShifts++
        if (day.isWeekend) {
          stats.doctorStats[doctor].weekendShifts++
          stats.weekendShifts++
        } else {
          stats.doctorStats[doctor].weekdayShifts++
          stats.weekdayShifts++
        }
      }
    })
  })

  stats.avgDoctorsPerDay = stats.totalShifts / daysInMonth

  // Excel export fonksiyonu
  const exportToCSV = () => {
    let csv = 'Gün,Tarih,Gün Adı,Doktorlar,Doktor Sayısı\n'
    
    days.forEach(day => {
      const doctorList = day.doctors.join(' + ')
      csv += `${day.number},${day.number} Temmuz 2025,${day.dayName},"${doctorList}",${day.doctors.length}\n`
    })

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'nobet-cizelgesi-temmuz-2025.csv'
    link.click()
  }

  // Print fonksiyonu
  const printSchedule = () => {
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head>
          <title>Nöbet Çizelgesi - Temmuz 2025</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .weekend { background-color: #ffe6e6; }
            .weekday { background-color: #e6f3ff; }
            h1 { color: #333; text-align: center; }
            .stats { margin-top: 20px; background: #f9f9f9; padding: 15px; }
          </style>
        </head>
        <body>
          <h1>🏥 Doktor Nöbet Çizelgesi - Temmuz 2025</h1>
          <table>
            <thead>
              <tr>
                <th>Gün</th>
                <th>Tarih</th>
                <th>Gün Adı</th>
                <th>Nöbetçi Doktorlar</th>
                <th>Doktor Sayısı</th>
              </tr>
            </thead>
            <tbody>
              ${days.map(day => `
                <tr class="${day.isWeekend ? 'weekend' : 'weekday'}">
                  <td>${day.number}</td>
                  <td>${day.number} Temmuz 2025</td>
                  <td>${day.dayName}</td>
                  <td>${day.doctors.join(', ')}</td>
                  <td>${day.doctors.length}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="stats">
            <h3>📊 İstatistikler</h3>
            <p><strong>Toplam Nöbet:</strong> ${stats.totalShifts}</p>
            <p><strong>Hafta İçi Nöbet:</strong> ${stats.weekdayShifts}</p>
            <p><strong>Hafta Sonu Nöbet:</strong> ${stats.weekendShifts}</p>
            <p><strong>Günlük Ortalama Doktor:</strong> ${stats.avgDoctorsPerDay.toFixed(1)}</p>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  if (!schedule || Object.keys(schedule).length === 0) {
    return (
      <div className="bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl p-8 text-center">
        <div className="max-w-md mx-auto">
          <Calendar className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-gray-600 mb-2">Henüz Çizelge Oluşturulmamış</h3>
          <p className="text-gray-500 mb-6">
            Nöbet çizelgesi görüntülemek için önce çizelgeyi oluşturmanız gerekiyor.
          </p>
          {isAdmin && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-700">
                💡 Admin olarak "Çizelge Oluştur" butonunu kullanarak otomatik çizelge oluşturabilirsiniz.
              </p>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Başlık ve Kontroller */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h3 className="text-2xl font-bold text-gray-900 flex items-center">
            <Calendar className="h-6 w-6 mr-3 text-indigo-600" />
            🗓️ Temmuz 2025 Nöbet Çizelgesi
          </h3>
          <p className="text-gray-600 mt-1">
            {allDoctors.length} doktor için oluşturulmuş çizelge
          </p>
        </div>
        
        <div className="flex flex-wrap gap-3">
          {/* Görünüm Modları */}
          <div className="flex bg-gray-100 rounded-lg p-1">
            {[
              { key: 'calendar', label: 'Takvim', icon: Calendar },
              { key: 'list', label: 'Liste', icon: Users },
              { key: 'stats', label: 'İstatistik', icon: BarChart3 }
            ].map(mode => (
              <button
                key={mode.key}
                onClick={() => setViewMode(mode.key)}
                className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
                  viewMode === mode.key
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-800'
                }`}
              >
                <mode.icon className="h-4 w-4 mr-1" />
                {mode.label}
              </button>
            ))}
          </div>

          {/* İstatistik Toggle */}
          <button
            onClick={() => setShowStats(!showStats)}
            className="flex items-center px-3 py-2 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition duration-200"
          >
            {showStats ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
            İstatistik
          </button>

          {/* Export Butonları */}
          <button
            onClick={exportToCSV}
            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition duration-200"
          >
            <Download className="h-4 w-4 mr-2" />
            CSV İndir
          </button>

          <button
            onClick={printSchedule}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition duration-200"
          >
            <Download className="h-4 w-4 mr-2" />
            Yazdır
          </button>
        </div>
      </div>

      {/* İstatistikler */}
      {showStats && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6">
          <h4 className="font-bold text-blue-900 mb-4 flex items-center">
            <TrendingUp className="h-5 w-5 mr-2" />
            📊 Çizelge İstatistikleri
          </h4>
          
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white p-4 rounded-lg text-center shadow-sm">
              <div className="text-2xl font-bold text-blue-600">{stats.totalShifts}</div>
              <div className="text-sm text-blue-800 font-medium">Toplam Nöbet</div>
            </div>
            <div className="bg-white p-4 rounded-lg text-center shadow-sm">
              <div className="text-2xl font-bold text-green-600">{stats.weekdayShifts}</div>
              <div className="text-sm text-green-800 font-medium">Hafta İçi</div>
            </div>
            <div className="bg-white p-4 rounded-lg text-center shadow-sm">
              <div className="text-2xl font-bold text-purple-600">{stats.weekendShifts}</div>
              <div className="text-sm text-purple-800 font-medium">Hafta Sonu</div>
            </div>
            <div className="bg-white p-4 rounded-lg text-center shadow-sm">
              <div className="text-2xl font-bold text-orange-600">{stats.avgDoctorsPerDay.toFixed(1)}</div>
              <div className="text-sm text-orange-800 font-medium">Günlük Ort.</div>
            </div>
          </div>

          {/* Doktor Bazlı İstatistikler */}
          <div className="bg-white rounded-lg p-4">
            <h5 className="font-bold text-gray-800 mb-3">👥 Doktor Bazlı Dağılım</h5>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(stats.doctorStats).map(([doctor, doctorStats]) => (
                <div key={doctor} className="bg-gray-50 p-3 rounded-lg">
                  <div className="font-medium text-gray-800 mb-1">{doctor}</div>
                  <div className="text-sm text-gray-600 space-x-4">
                    <span className="text-blue-600">Toplam: {doctorStats.totalShifts}</span>
                    <span className="text-green-600">Hafta İçi: {doctorStats.weekdayShifts}</span>
                    <span className="text-purple-600">H.Sonu: {doctorStats.weekendShifts}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Doktor Filtresi */}
      {allDoctors.length > 1 && (
        <div className="bg-white border border-gray-200 rounded-xl p-4">
          <div className="flex items-center space-x-4">
            <Filter className="h-5 w-5 text-gray-500" />
            <label className="text-sm font-medium text-gray-700">Doktora Göre Filtrele:</label>
            <select
              value={selectedDoctor}
              onChange={(e) => setSelectedDoctor(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tüm Doktorlar</option>
              {allDoctors.map(doctor => (
                <option key={doctor} value={doctor}>{doctor}</option>
              ))}
            </select>
            {selectedDoctor && (
              <button
                onClick={() => setSelectedDoctor('')}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                <RefreshCw className="h-4 w-4 inline mr-1" />
                Sıfırla
              </button>
            )}
          </div>
        </div>
      )}

      {/* Ana İçerik */}
      {viewMode === 'calendar' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {days.map(day => {
              const filteredDoctors = selectedDoctor 
                ? day.doctors.filter(doctor => doctor === selectedDoctor)
                : day.doctors

              if (selectedDoctor && filteredDoctors.length === 0) return null

              return (
                <div
                  key={day.number}
                  className={`p-4 rounded-lg border-2 transition-all duration-200 hover:shadow-md ${
                    day.isWeekend
                      ? 'bg-gradient-to-br from-red-50 to-rose-100 border-red-200'
                      : 'bg-gradient-to-br from-blue-50 to-indigo-100 border-blue-200'
                  }`}
                >
                  <div className="flex justify-between items-center mb-2">
                    <div>
                      <div className="text-lg font-bold text-gray-800">{day.number}</div>
                      <div className="text-xs text-gray-600">{day.dayName}</div>
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs font-bold ${
                      day.isWeekend
                        ? 'bg-red-100 text-red-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {day.isWeekend ? 'H.Sonu' : 'H.İçi'}
                    </div>
                  </div>
                  
                  <div className="space-y-1">
                    {(selectedDoctor ? filteredDoctors : day.doctors).map((doctor, index) => (
                      <div
                        key={index}
                        className="bg-white px-3 py-2 rounded-md text-sm font-medium text-gray-800 shadow-sm border border-gray-100"
                      >
                        {doctor}
                      </div>
                    ))}
                    {day.doctors.length === 0 && (
                      <div className="text-sm text-gray-500 italic text-center py-2">
                        Nöbet yok
                      </div>
                    )}
                  </div>
                  
                  {day.doctors.length > 0 && (
                    <div className="mt-2 text-xs text-gray-500 text-center">
                      {day.doctors.length} doktor
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-gray-50 to-slate-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-800">Gün</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-800">Tarih</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-800">Gün Adı</th>
                  <th className="px-6 py-4 text-left text-sm font-bold text-gray-800">Nöbetçi Doktorlar</th>
                  <th className="px-6 py-4 text-center text-sm font-bold text-gray-800">Doktor Sayısı</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {days.map((day, index) => {
                  const filteredDoctors = selectedDoctor 
                    ? day.doctors.filter(doctor => doctor === selectedDoctor)
                    : day.doctors

                  if (selectedDoctor && filteredDoctors.length === 0) return null

                  return (
                    <tr
                      key={day.number}
                      className={`hover:bg-gray-50 transition duration-200 ${
                        day.isWeekend ? 'bg-red-50' : 'bg-blue-50'
                      }`}
                    >
                      <td className="px-6 py-4 text-sm font-bold text-gray-800">{day.number}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">{day.number} Temmuz 2025</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          day.isWeekend
                            ? 'bg-red-100 text-red-800'
                            : 'bg-blue-100 text-blue-800'
                        }`}>
                          {day.dayName}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1">
                          {(selectedDoctor ? filteredDoctors : day.doctors).map((doctor, doctorIndex) => (
                            <span
                              key={doctorIndex}
                              className="inline-block bg-white px-3 py-1 rounded-full text-sm font-medium text-gray-800 border border-gray-200"
                            >
                              {doctor}
                            </span>
                          ))}
                          {day.doctors.length === 0 && (
                            <span className="text-gray-500 italic">Nöbet yok</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 bg-gray-100 text-gray-800 rounded-full text-sm font-bold">
                          {day.doctors.length}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {viewMode === 'stats' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Günlük Dağılım */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-bold text-gray-800 mb-4">📅 Günlük Dağılım</h4>
            <div className="space-y-2">
              {days.map(day => (
                <div key={day.number} className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50">
                  <div className="flex items-center">
                    <span className="w-8 text-center font-medium">{day.number}</span>
                    <span className="ml-2 text-sm text-gray-600">{day.dayName}</span>
                  </div>
                  <div className="flex items-center">
                    <div className={`w-4 h-4 rounded-full mr-2 ${
                      day.doctors.length === 0 ? 'bg-gray-300' :
                      day.doctors.length === 1 ? 'bg-yellow-400' :
                      day.doctors.length === 2 ? 'bg-green-400' :
                      'bg-blue-400'
                    }`}></div>
                    <span className="text-sm font-medium">{day.doctors.length} doktor</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Doktor Performansı */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h4 className="font-bold text-gray-800 mb-4">👨‍⚕️ Doktor Performansı</h4>
            <div className="space-y-3">
              {Object.entries(stats.doctorStats)
                .sort(([,a], [,b]) => b.totalShifts - a.totalShifts)
                .map(([doctor, doctorStats]) => (
                <div key={doctor} className="p-3 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-medium text-gray-800">{doctor}</span>
                    <span className="text-lg font-bold text-blue-600">{doctorStats.totalShifts}</span>
                  </div>
                  <div className="flex space-x-4 text-sm">
                    <span className="text-green-600">Hafta İçi: {doctorStats.weekdayShifts}</span>
                    <span className="text-purple-600">Hafta Sonu: {doctorStats.weekendShifts}</span>
                  </div>
                  <div className="mt-2 bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${(doctorStats.totalShifts / Math.max(...Object.values(stats.doctorStats).map(s => s.totalShifts))) * 100}%` }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScheduleDisplay 