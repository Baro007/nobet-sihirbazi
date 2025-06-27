import React, { useState, useEffect } from 'react'
import { Calendar, Users, Clock, CheckCircle } from 'lucide-react'
import UserNameInput from './components/UserNameInput'
import ScheduleCalendar from './components/ScheduleCalendar'
import SubmitButton from './components/SubmitButton'
import ScheduleDisplay from './components/ScheduleDisplay'

// Dinamik doktor listesi - artırılabilir/azaltılabilir

function App() {
  const [currentUserName, setCurrentUserName] = useState('')
  const [allDoctors, setAllDoctors] = useState([])
  const [preferences, setPreferences] = useState({})
  const [schedule, setSchedule] = useState({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('preferences')
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  
  // Admin şifresi - production'da environment variable olmalı
  const ADMIN_PASSWORD = 'admin2025'

  // API base URL'i
  const API_BASE = '/api'

  // Sayfa yüklendiğinde tercihleri ve çizelgeyi çek
  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Tercihleri çek
      const preferencesResponse = await fetch(`${API_BASE}/get-preferences`)
      const preferencesData = await preferencesResponse.json()
      setPreferences(preferencesData)
      
      // Doktor listesini tercihlere göre oluştur
      const doctorList = Object.keys(preferencesData || {})
      setAllDoctors(doctorList)
      
      // Çizelgeyi çek
      const scheduleResponse = await fetch(`${API_BASE}/get-schedule`)
      const scheduleData = await scheduleResponse.json()
      setSchedule(scheduleData)
      
    } catch (error) {
      console.error('Veri çekme hatası:', error)
    } finally {
      setLoading(false)
    }
  }

  // Tercih kaydetme
  const savePreferences = async (pozitifGunler, negatifGunler, ozelSebepler = '') => {
    if (!currentUserName.trim()) {
      alert('Lütfen adınızı girin')
      return false
    }

    try {
      const response = await fetch(`${API_BASE}/save-preferences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          doktorAdi: currentUserName.trim(),
          pozitifGunler,
          negatifGunler,
          ozelSebepler
        })
      })

      const result = await response.json()
      
      if (result.success) {
        // Tercihleri yeniden çek
        await fetchData()
        alert('Tercihleriniz başarıyla kaydedildi!')
        return true
      } else {
        alert('Hata: ' + result.error)
        return false
      }
    } catch (error) {
      console.error('Tercih kaydetme hatası:', error)
      alert('Tercih kaydederken bir hata oluştu')
      return false
    }
  }

  // Admin giriş kontrolü
  const handleAdminLogin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAdmin(true)
      setAdminPassword('')
      alert('Admin olarak giriş yaptınız!')
    } else {
      alert('Yanlış admin şifresi!')
      setAdminPassword('')
    }
  }

  // Admin çıkış
  const handleAdminLogout = () => {
    setIsAdmin(false)
    setActiveTab('preferences')
  }

  // Çizelge oluşturma (sadece admin)
  const generateSchedule = async () => {
    if (!isAdmin) {
      alert('Bu işlem için admin yetkisi gerekli!')
      return
    }

    if (allDoctors.length < 3) {
      alert('En az 3 doktor tercihi gerekli!')
      return
    }

    if (!confirm(`${allDoctors.length} doktorun tercihlerini kullanarak yeni çizelge oluşturmak istediğinizden emin misiniz? Mevcut çizelge silinecek.`)) {
      return
    }

    try {
      setLoading(true)
      
      const response = await fetch(`${API_BASE}/generate-schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()
      
      if (result.success) {
        await fetchData()
        alert(`Nöbet çizelgesi başarıyla oluşturuldu!\n${allDoctors.length} doktor için optimal dağılım yapıldı.`)
      } else {
        alert('Hata: ' + result.error)
      }
    } catch (error) {
      console.error('Çizelge oluşturma hatası:', error)
      alert('Çizelge oluştururken bir hata oluştu')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">Yükleniyor...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <Calendar className="h-8 w-8 text-blue-600 mr-3" />
              <div>
                <h1 className="text-3xl font-bold text-gray-900">NöbetSihirbazı</h1>
                <p className="text-sm text-gray-500">Doktor Nöbet Planlama Sistemi</p>
              </div>
            </div>
            <div className="flex items-center space-x-6">
              {/* Doktor Sayısı */}
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-gray-500" />
                <span className="text-gray-600">{allDoctors.length} Kayıtlı Doktor</span>
              </div>
              
              {/* Admin Panel */}
              {!isAdmin ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Admin şifresi"
                    className="px-3 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                  />
                  <button
                    onClick={handleAdminLogin}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition duration-200"
                  >
                    Admin
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-green-600">👑 Admin</span>
                  <button
                    onClick={handleAdminLogout}
                    className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition duration-200"
                  >
                    Çıkış
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs - Sadece Admin İçin */}
      {isAdmin && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('preferences')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'preferences'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <Clock className="inline h-4 w-4 mr-2" />
                Tercih Toplama Durumu
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'schedule'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <CheckCircle className="inline h-4 w-4 mr-2" />
                Nöbet Çizelgesi Yönetimi
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isAdmin || activeTab === 'preferences' ? (
          <div className="space-y-6">
            {/* Sistem Bilgisi */}
            {!isAdmin && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h2 className="text-lg font-medium text-blue-900 mb-2">
                  🏥 Doktor Nöbet Tercih Sistemi
                </h2>
                <p className="text-sm text-blue-700">
                  Bu sistem ile Temmuz 2025 ayı nöbet tercihlerinizi belirtebilirsiniz. 
                  Tercihleriniz toplanarak en adil nöbet çizelgesi oluşturulacaktır.
                </p>
              </div>
            )}

            {/* Kullanıcı Adı Girişi */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                {isAdmin ? '👑 Admin - Tercih Toplama Durumu' : '📝 Nöbet Tercihlerinizi Belirtin'}
              </h2>
              <UserNameInput
                currentUserName={currentUserName}
                onUserNameChange={setCurrentUserName}
                allDoctors={allDoctors}
                isAdmin={isAdmin}
              />
            </div>

            {/* Takvim ve Tercih Formu */}
            {currentUserName.trim() && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">
                  {currentUserName} - Temmuz 2025 Nöbet Tercihleri
                </h3>
                <ScheduleCalendar
                  currentUserName={currentUserName}
                  preferences={preferences}
                  allDoctors={allDoctors}
                  onSave={savePreferences}
                  isAdmin={isAdmin}
                />
              </div>
            )}

            {/* Admin Özet Bilgileri */}
            {isAdmin && allDoctors.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <h3 className="text-lg font-medium text-green-900 mb-4">
                  📊 Tercih Toplama Özeti
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{allDoctors.length}</div>
                    <div className="text-sm text-green-700">Toplam Doktor</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {allDoctors.filter(doctor => preferences[doctor]?.pozitif?.length > 0).length}
                    </div>
                    <div className="text-sm text-blue-700">Pozitif Tercih Veren</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-red-600">
                      {allDoctors.filter(doctor => preferences[doctor]?.negatif?.length > 0).length}
                    </div>
                    <div className="text-sm text-red-700">Negatif Tercih Veren</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {allDoctors.filter(doctor => preferences[doctor]?.ozelSebepler?.trim()).length}
                    </div>
                    <div className="text-sm text-purple-700">Özel Sebep Yazan</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Çizelge Oluşturma Kontrol Paneli */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    👑 Admin - Nöbet Çizelgesi Yönetimi
                  </h2>
                  <p className="text-sm text-gray-600 mt-1">
                    {allDoctors.length} doktorun tercihleri kullanılarak çizelge oluşturun
                  </p>
                </div>
                <button
                  onClick={generateSchedule}
                  disabled={allDoctors.length < 3}
                  className={`font-medium py-3 px-6 rounded-md transition duration-200 ${
                    allDoctors.length < 3
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl'
                  }`}
                >
                  🎯 Çizelge Oluştur
                </button>
              </div>
              
              {allDoctors.length < 3 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <p className="text-sm text-yellow-700">
                    ⚠️ Çizelge oluşturmak için en az 3 doktor tercihi gerekli. 
                    Şu anda {allDoctors.length} doktor kayıtlı.
                  </p>
                </div>
              )}
            </div>

            {/* Çizelge Görüntüleme */}
            <ScheduleDisplay schedule={schedule} isAdmin={isAdmin} />
          </div>
        )}
      </main>
    </div>
  )
}

export default App 