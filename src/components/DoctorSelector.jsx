import React from 'react'
import { UserCheck } from 'lucide-react'

function DoctorSelector({ doctors, selectedDoctor, onDoctorChange }) {
  return (
    <div className="space-y-3">
      <label htmlFor="doctor-select" className="block text-sm font-medium text-gray-700">
        <UserCheck className="inline h-4 w-4 mr-2" />
        Doktor Seçin
      </label>
      <select
        id="doctor-select"
        value={selectedDoctor}
        onChange={(e) => onDoctorChange(e.target.value)}
        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
      >
        <option value="">-- Doktor Seçin --</option>
        {doctors.map((doctor) => (
          <option key={doctor} value={doctor}>
            {doctor}
          </option>
        ))}
      </select>
      
      {selectedDoctor && (
        <div className="mt-3 p-3 bg-blue-50 rounded-md">
          <p className="text-sm text-blue-700">
            <strong>Seçili Doktor:</strong> {selectedDoctor}
          </p>
          <p className="text-xs text-blue-600 mt-1">
            Takvimde günlere tıklayarak tercihlerinizi belirleyin:
            <br />
            • <span className="text-green-600 font-medium">Yeşil</span>: Nöbet tutmak istediğiniz günler
            <br />
            • <span className="text-red-600 font-medium">Kırmızı</span>: Nöbet tutmak istemediğiniz günler
            <br />
            • <span className="text-gray-600 font-medium">Gri</span>: Fark etmeyen günler
          </p>
        </div>
      )}
    </div>
  )
}

export default DoctorSelector 