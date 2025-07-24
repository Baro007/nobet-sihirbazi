import React, { useState } from 'react'
import { User, Users, AlertCircle, Crown, Search, CheckCircle2, TrendingUp, Info, Clock } from 'lucide-react'
import 'react-day-picker/dist/style.css'

function UserNameInput({ currentUserName, setCurrentUserName, allDoctors, isAdmin }) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState([])

  const handleInputChange = (e) => {
    const value = e.target.value
    setInputValue(value)
    setSuggestions(allDoctors.filter(doctor => doctor.toLowerCase().includes(value.toLowerCase())))
  }

  const selectSuggestion = (doctor) => {
    setInputValue(doctor)
    setSuggestions([])
  }

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
            onChange={(e) => setCurrentUserName(e.target.value)}
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
                  onClick={() => setCurrentUserName(doctor)}
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
      <div className={`p-6 rounded-xl border-2 ${isAdmin ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-800' : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 dark:from-blue-900/20 dark:to-indigo-900/20 dark:border-blue-800'}`}>
        <div className="flex items-start">
          <AlertCircle className={`h-6 w-6 mt-0.5 mr-3 ${isAdmin ? 'text-green-500 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'}`} />
          <div>
            <h4 className={`font-bold text-lg mb-2 ${isAdmin ? 'text-green-800 dark:text-green-200' : 'text-blue-800 dark:text-blue-200'}`}>
              {isAdmin ? '👑 Admin Paneli' : '💡 Bilgilendirme'}
            </h4>
            <div className={`text-sm ${isAdmin ? 'text-green-700 dark:text-green-300' : 'text-blue-700 dark:text-blue-300'}`}>
              {isAdmin ? (
                <>
                  Admin olarak giriş yaptınız. Aşağıdaki input alanından istediğiniz doktoru arayabilir veya seçebilirsiniz. 
                  Seçtiğiniz doktorun tercihlerini görüntüleyebilir ve düzenleyebilirsiniz. 
                  Unutmayın, yaptığınız değişiklikler doğrudan veritabanına kaydedilecektir!
                </>
              ) : (
                <>
                  Nöbet tercihlerinizi girmek için lütfen adınızı ve soyadınızı aşağıdaki kutucuğa yazın. 
                  Eğer daha önce kayıt yaptıysanız, adınızı listeden seçebilirsiniz. 
                  Girdiğiniz bilgiler, adil bir nöbet çizelgesi oluşturmak için kullanılacaktır.
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      <div className="relative">
        <div className="flex items-center bg-white dark:bg-gray-800 border-2 border-transparent rounded-xl shadow-lg focus-within:border-blue-500 transition-all duration-300">
          <User className="h-6 w-6 text-gray-400 dark:text-gray-500 mx-4" />
          <input
            type="text"
            value={inputValue}
            onChange={handleInputChange}
            className="w-full h-full py-4 bg-transparent text-lg text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none"
            placeholder={isAdmin ? "Doktor adı girin veya listeden seçin..." : "Dr. Adınız Soyadınız"}
            onFocus={() => setSuggestions(allDoctors)}
          />
        </div>

        {suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl max-h-60 overflow-y-auto">
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {suggestions.map(doctor => (
                <li 
                  key={doctor} 
                  onClick={() => selectSuggestion(doctor)}
                  className="px-6 py-3 hover:bg-blue-50 dark:hover:bg-blue-900/50 cursor-pointer transition-colors duration-150 text-gray-700 dark:text-gray-300"
                >
                  <div className="flex items-center">
                    <CheckCircle2 className="h-4 w-4 mr-3 text-green-500" />
                    <span>{doctor}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="text-center">
        {currentUserName ? (
          <p className="text-lg">
            Şu anki kullanıcı: <span className="font-bold text-blue-600 dark:text-blue-400">{currentUserName}</span>
          </p>
        ) : (
          <p className="text-lg text-gray-500 dark:text-gray-400">
            Henüz bir kullanıcı seçilmedi.
          </p>
        )}
      </div>
      
      {/* Kullanıcı Rehberi */}
      <div className="p-6 rounded-xl border-2 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200 dark:from-blue-900/20 dark:to-indigo-900/20 dark:border-blue-800">
        <div className="flex items-start">
          <Info className="h-6 w-6 mt-0.5 mr-3 text-blue-500 dark:text-blue-400" />
          <div>
            <h4 className="font-bold text-lg mb-2 text-blue-800 dark:text-blue-200">
              {isAdmin ? 'Admin Kullanım Rehberi' : 'Nasıl Kullanılır?'}
            </h4>
            <div className="text-sm text-blue-700 dark:text-blue-300 space-y-2">
              <p>
                {isAdmin ? 'Görüntülemek veya düzenlemek istediğiniz doktorun adını yazmaya başlayın. Listeden bir doktor seçtiğinizde, takvimde o doktorun mevcut tercihleri gösterilecektir.' : 'Adınızı kutucuğa yazın. Eğer sistemde kayıtlıysanız, adınız listede belirecektir. Adınıza tıklayarak seçiminizi yapın.'}
              </p>
              <p>
                Seçim yaptıktan sonra, aşağıdaki takvim üzerinden nöbet tutmak istediğiniz ve istemediğiniz günleri belirleyebilirsiniz.
              </p>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6 rounded-xl border-2 bg-gradient-to-r from-green-50 to-emerald-50 border-green-200 dark:from-green-900/20 dark:to-emerald-900/20 dark:border-green-800">
        <div className="flex items-start">
          <AlertCircle className="h-6 w-6 mt-0.5 mr-3 text-green-500 dark:text-green-400" />
          <div>
            <h4 className="font-bold text-lg mb-2 text-green-800 dark:text-green-200">
              {isAdmin ? '👑 Admin tarafından görüntüleniyor' : 'Nöbet tercihlerinizi belirleyin'}
            </h4>
            <div className="text-sm text-green-700 dark:text-green-300">
              {currentUserName ? `Şu an ${currentUserName} adlı doktorun tercihlerini görüntülüyorsunuz.` : (isAdmin ? 'Lütfen bir doktor seçin.' : 'Lütfen adınızı girin.')}
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-6 rounded-xl border-2 bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200 dark:from-yellow-900/20 dark:to-amber-900/20 dark:border-yellow-800">
        <div className="flex items-start">
          <Clock className="h-6 w-6 mt-0.5 mr-3 text-yellow-500 dark:text-yellow-400" />
          <div>
            <h4 className="font-bold text-lg mb-2 text-yellow-800 dark:text-yellow-200">
              Son Teslim Tarihi
            </h4>
            <div className="text-sm text-yellow-700 dark:text-yellow-300">
              Lütfen tercihlerinizi en geç <span className="font-bold">25 Temmuz 2025</span> tarihine kadar tamamlayın. Bu tarihten sonra
              Admin çizelgeyi oluşturacaktır.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UserNameInput 