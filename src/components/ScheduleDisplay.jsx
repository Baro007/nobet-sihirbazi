import React from 'react'
import { Calendar, Clock, Users, AlertCircle } from 'lucide-react'

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

function ScheduleDisplay({ schedule }) {
  // Çizelge boşsa
  if (!schedule || Object.keys(schedule).length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-8 text-center">
        <AlertCircle className="h-16 w-16 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          Henüz Nöbet Çizelgesi Oluşturulmamış
        </h3>
        <p className="text-gray-600">
          Doktorların tercihlerini topladıktan sonra "Çizelge Oluştur" butonuna tıklayarak 
          nöbet çizelgesini oluşturabilirsiniz.
        </p>
      </div>
    )
  }

  // İstatistikleri hesapla
  const statistics = {}
  Object.values(schedule).forEach(doctors => {
    doctors.forEach(doctor => {
      statistics[doctor] = (statistics[doctor] || 0) + 1
    })
  })

  return (
    <div className="space-y-6">
      {/* İstatistikler */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
          <Users className="h-5 w-5 mr-2" />
          Nöbet Dağılımı
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.entries(statistics).map(([doctor, count]) => (
            <div key={doctor} className="bg-gray-50 p-3 rounded-lg">
              <div className="font-medium text-gray-900">{doctor}</div>
              <div className="text-2xl font-bold text-blue-600">{count} nöbet</div>
            </div>
          ))}
        </div>
      </div>

      {/* Çizelge */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Calendar className="h-5 w-5 mr-2" />
            Temmuz 2025 Nöbet Çizelgesi
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tarih
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gün
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nöbetçi Doktorlar
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Doktor Sayısı
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {Object.entries(schedule).map(([day, doctors]) => {
                const dayNum = parseInt(day)
                const isWeekendDay = isWeekend(dayNum)
                const dayName = getDayName(dayNum)
                
                return (
                  <tr 
                    key={day} 
                    className={isWeekendDay ? 'bg-blue-50' : 'bg-white'}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {dayNum} Temmuz 2025
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        isWeekendDay 
                          ? 'bg-blue-100 text-blue-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        <Clock className="h-3 w-3 mr-1" />
                        {dayName}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {doctors.map((doctor, index) => (
                          <span 
                            key={index}
                            className="inline-block bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full mr-2"
                          >
                            {doctor}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        doctors.length === (isWeekendDay ? 3 : 2)
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {doctors.length} doktor
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Açıklama */}
      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">Açıklama:</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Mavi renkli satırlar hafta sonu günlerini gösterir</li>
          <li>• Hafta içi günlerde 2, hafta sonu günlerde 3 doktor nöbetçidir</li>
          <li>• Yeşil etiketler normal nöbetçi sayısını, sarı etiketler eksik doktor sayısını gösterir</li>
          <li>• Her doktor ayda maksimum 8 nöbet tutabilir</li>
        </ul>
      </div>
    </div>
  )
}

export default ScheduleDisplay 