import React from 'react'
import { User, Users, AlertCircle } from 'lucide-react'

function UserNameInput({ currentUserName, onUserNameChange, allDoctors, isAdmin }) {
  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="user-name" className="block text-sm font-medium text-gray-700 mb-2">
          <User className="inline h-4 w-4 mr-2" />
          Adınız ve Soyadınız
        </label>
        <input
          type="text"
          id="user-name"
          value={currentUserName}
          onChange={(e) => onUserNameChange(e.target.value)}
          placeholder="Örn: Dr. Ahmet Yılmaz"
          className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
        />
      </div>
      
      {currentUserName.trim() && (
        <div className="p-3 bg-green-50 rounded-md">
          <p className="text-sm text-green-700">
            <strong>Hoş geldiniz:</strong> {currentUserName}
          </p>
          <p className="text-xs text-green-600 mt-1">
            Aşağıdaki takvimde tercihlerinizi belirleyebilirsiniz.
          </p>
        </div>
      )}

      {allDoctors.length > 0 && (
        <div className="bg-blue-50 p-4 rounded-lg">
          <h4 className="font-medium text-blue-900 mb-2 flex items-center">
            <Users className="h-4 w-4 mr-2" />
            Kayıtlı Doktorlar ({allDoctors.length})
          </h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {allDoctors.map((doctor, index) => (
              <span 
                key={index}
                className="text-xs bg-white px-2 py-1 rounded text-blue-700 border border-blue-200"
              >
                {doctor}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={`p-4 rounded-lg ${isAdmin ? 'bg-green-50' : 'bg-yellow-50'}`}>
        <div className="flex items-start">
          <AlertCircle className={`h-5 w-5 mt-0.5 mr-2 ${isAdmin ? 'text-green-400' : 'text-yellow-400'}`} />
          <div>
            <h4 className={`font-medium ${isAdmin ? 'text-green-800' : 'text-yellow-800'}`}>
              {isAdmin ? '👑 Admin Paneli' : 'Bilgilendirme'}
            </h4>
            <p className={`text-sm mt-1 ${isAdmin ? 'text-green-700' : 'text-yellow-700'}`}>
              {isAdmin ? (
                <>
                  • Admin olarak tüm doktorların tercihlerini görebilirsiniz<br/>
                  • Tercih durumunu takip edip çizelge oluşturabilirsiniz<br/>
                  • Herhangi bir doktor adı girerek onun tercihlerini görüntüleyebilirsiniz
                </>
              ) : (
                <>
                  • Adınızı girdikten sonra takvim görünecektir<br/>
                  • Sistem dinamiktir, istediğiniz kadar doktor eklenebilir<br/>
                  • Her doktorun kendi tercihlerini girmesi gerekir
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserNameInput 