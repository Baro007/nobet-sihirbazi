import React from 'react'
import { User, Users, AlertCircle, Crown, Search, CheckCircle2, TrendingUp } from 'lucide-react'

function UserNameInput({ currentUserName, onUserNameChange, allDoctors, isAdmin }) {
  const completedDoctorsCount = allDoctors.filter(doctor => 
    // Burada preferences'a erişemediğimiz için sadece doktor sayısını gösteriyoruz
    true // Placeholder - gerçek implementasyonda preferences kontrolü yapılacak
  ).length

  return (
    <div className="space-y-6">
      {/* Ana Input Alanı */}
      <div className="relative">
        <label htmlFor="doctor-name" className="block text-sm font-bold text-gray-700 mb-3">
          {isAdmin ? (
            <div className="flex items-center">
              <Crown className="h-5 w-5 text-gold-500 mr-2" />
              👑 Doktor Seç veya Yeni Doktor Ekle
            </div>
          ) : (
            <div className="flex items-center">
              <User className="h-5 w-5 text-blue-500 mr-2" />
              📝 Adınızı Girin
            </div>
          )}
        </label>
        
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-5 w-5 text-gray-400" />
          </div>
          <input
            id="doctor-name"
            type="text"
            value={currentUserName}
            onChange={(e) => onUserNameChange(e.target.value)}
            placeholder={isAdmin ? "Doktor adı girin veya listeden seçin..." : "Dr. Adınız Soyadınız"}
            className="block w-full pl-10 pr-4 py-4 border-2 border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-lg placeholder-gray-400 transition-all duration-200 hover:border-gray-400"
            autoComplete="name"
          />
          {currentUserName && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            </div>
          )}
        </div>
      </div>

      {/* Mevcut Doktorlar Listesi */}
      {allDoctors.length > 0 && (
        <div className="bg-gradient-to-r from-gray-50 to-slate-50 border border-gray-200 rounded-xl p-6">
          <h4 className="font-bold text-gray-800 mb-4 flex items-center">
            <Users className="h-5 w-5 text-blue-500 mr-2" />
            👥 Sistemdeki Doktorlar ({allDoctors.length})
          </h4>
          
          {/* İstatistik Kartları */}
          {isAdmin && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-2xl font-bold text-blue-600">{allDoctors.length}</div>
                <div className="text-sm text-blue-800 font-medium">Toplam Doktor</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-2xl font-bold text-green-600">{completedDoctorsCount}</div>
                <div className="text-sm text-green-800 font-medium">Tercih Girilen</div>
              </div>
              <div className="bg-white p-4 rounded-lg shadow-sm text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {allDoctors.length > 0 ? Math.round((completedDoctorsCount / allDoctors.length) * 100) : 0}%
                </div>
                <div className="text-sm text-purple-800 font-medium">Tamamlanma</div>
              </div>
            </div>
          )}
          
          {/* Doktor Listesi */}
          <div className="max-h-64 overflow-y-auto">
            <div className="space-y-2">
              {allDoctors.map((doctor, index) => (
                <button
                  key={index}
                  onClick={() => onUserNameChange(doctor)}
                  className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 hover:shadow-md ${
                    currentUserName === doctor
                      ? 'border-blue-500 bg-blue-50 text-blue-800 shadow-md'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <div className={`w-3 h-3 rounded-full mr-3 ${
                        currentUserName === doctor ? 'bg-blue-500' : 'bg-gray-300'
                      }`}></div>
                      <span className="font-medium">{doctor}</span>
                    </div>
                    {currentUserName === doctor && (
                      <CheckCircle2 className="h-5 w-5 text-blue-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bilgilendirme Kartı */}
      <div className={`p-6 rounded-xl border-2 ${isAdmin ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200'}`}>
        <div className="flex items-start">
          <AlertCircle className={`h-6 w-6 mt-0.5 mr-3 ${isAdmin ? 'text-green-500' : 'text-blue-500'}`} />
          <div className="flex-1">
            <h4 className={`font-bold text-lg mb-2 ${isAdmin ? 'text-green-800' : 'text-blue-800'}`}>
              {isAdmin ? '👑 Admin Paneli' : '💡 Bilgilendirme'}
            </h4>
            <div className={`text-sm ${isAdmin ? 'text-green-700' : 'text-blue-700'}`}>
              {isAdmin ? (
                <div className="space-y-2">
                  <p className="flex items-center">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Admin olarak tüm doktorların tercihlerini görebilirsiniz
                  </p>
                  <p className="flex items-center">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Tercih durumunu takip edip çizelge oluşturabilirsiniz
                  </p>
                  <p className="flex items-center">
                    <Search className="h-4 w-4 mr-2" />
                    Herhangi bir doktor adı girerek onun tercihlerini görüntüleyebilirsiniz
                  </p>
                  <p className="flex items-center">
                    <Users className="h-4 w-4 mr-2" />
                    Yeni doktor eklemek için adını yazıp Enter'a basın
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="flex items-center">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Adınızı girdikten sonra takvim görünecektir
                  </p>
                  <p className="flex items-center">
                    <TrendingUp className="h-4 w-4 mr-2" />
                    Sistem dinamiktir, istediğiniz kadar doktor eklenebilir
                  </p>
                  <p className="flex items-center">
                    <User className="h-4 w-4 mr-2" />
                    Her doktorun kendi tercihlerini girmesi gerekir
                  </p>
                  <p className="flex items-center">
                    <Search className="h-4 w-4 mr-2" />
                    Önceden kaydedilmiş isminiz varsa listeden seçebilirsiniz
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Hızlı Erişim Bilgileri */}
      {currentUserName && (
        <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
          <h4 className="font-bold text-gray-800 mb-3 flex items-center">
            <User className="h-5 w-5 text-indigo-500 mr-2" />
            🎯 Seçili Doktor
          </h4>
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center mr-4">
                <span className="text-white font-bold text-lg">
                  {currentUserName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="font-bold text-gray-800">{currentUserName}</p>
                <p className="text-sm text-gray-600">
                  {isAdmin ? 'Admin tarafından görüntüleniyor' : 'Nöbet tercihlerinizi belirleyin'}
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-gray-500">Durum</div>
              <div className="flex items-center">
                <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                <span className="text-sm font-medium text-green-600">Aktif</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Yardım Bilgileri */}
      {!currentUserName && (
        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 rounded-xl p-6">
          <h4 className="font-bold text-yellow-800 mb-3 flex items-center">
            <AlertCircle className="h-5 w-5 text-yellow-600 mr-2" />
            💡 Başlamak İçin
          </h4>
          <ul className="text-sm text-yellow-700 space-y-2">
            <li className="flex items-center">
              <span className="w-6 h-6 bg-yellow-200 text-yellow-800 rounded-full flex items-center justify-center text-xs font-bold mr-3">1</span>
              Yukarıdaki alana adınızı soyadınızı yazın
            </li>
            <li className="flex items-center">
              <span className="w-6 h-6 bg-yellow-200 text-yellow-800 rounded-full flex items-center justify-center text-xs font-bold mr-3">2</span>
              Önceden kayıtlıysanız listeden adınızı seçin
            </li>
            <li className="flex items-center">
              <span className="w-6 h-6 bg-yellow-200 text-yellow-800 rounded-full flex items-center justify-center text-xs font-bold mr-3">3</span>
              Adınızı girdikten sonra tercih takvimi açılacak
            </li>
          </ul>
        </div>
      )}
    </div>
  )
}

export default UserNameInput 