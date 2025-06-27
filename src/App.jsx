import React, { useState, useEffect } from 'react'
import { Calendar, Users, Clock, CheckCircle, Shield, TrendingUp, BarChart3, Loader2, AlertCircle } from 'lucide-react'
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
  const [notifications, setNotifications] = useState([])
  const [systemStats, setSystemStats] = useState({})
  
  // Admin şifresi - production'da environment variable olmalı
  const ADMIN_PASSWORD = 'admin2025'

  // API base URL'i
  const API_BASE = '/api'

  // Notification sistemi
  const addNotification = (type, message) => {
    const id = Date.now()
    setNotifications(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }

  // Sayfa yüklendiğinde tercihleri ve çizelgeyi çek
  useEffect(() => {
    fetchData()
  }, [])

  // Sistem istatistiklerini hesapla
  useEffect(() => {
    const totalDoctors = Object.keys(preferences).length
    const completedDoctors = Object.keys(preferences).filter(d => 
      preferences[d].pozitif?.length > 0 || preferences[d].negatif?.length > 0
    ).length
    
    const avgPositive = totalDoctors > 0 
      ? Object.keys(preferences).reduce((sum, d) => sum + (preferences[d].pozitif?.length || 0), 0) / totalDoctors
      : 0
    
    const avgNegative = totalDoctors > 0
      ? Object.keys(preferences).reduce((sum, d) => sum + (preferences[d].negatif?.length || 0), 0) / totalDoctors  
      : 0

    const completionRate = totalDoctors > 0 ? (completedDoctors / totalDoctors) * 100 : 0

    setSystemStats({
      totalDoctors,
      completedDoctors,
      avgPositive: avgPositive.toFixed(1),
      avgNegative: avgNegative.toFixed(1),
      completionRate: completionRate.toFixed(1)
    })
  }, [preferences])

  const fetchData = async () => {
    try {
      setLoading(true)
      
      // Tercihleri çek
      const preferencesResponse = await fetch(`${API_BASE}/get-preferences`)
      if (!preferencesResponse.ok) {
        console.error('Preferences API Error - Status:', preferencesResponse.status)
        addNotification('warning', 'Tercihler yüklenemedi, boş başlatılıyor')
        setPreferences({})
        setAllDoctors([])
      } else {
        const preferencesData = await preferencesResponse.json()
        setPreferences(preferencesData || {})
        
        // Doktor listesini tercihlere göre oluştur
        const doctorList = Object.keys(preferencesData || {})
        setAllDoctors(doctorList)
      }
      
      // Çizelgeyi çek
      const scheduleResponse = await fetch(`${API_BASE}/get-schedule`)
      if (!scheduleResponse.ok) {
        console.error('Schedule API Error - Status:', scheduleResponse.status)
        addNotification('warning', 'Çizelge yüklenemedi, boş başlatılıyor')
        setSchedule({})
      } else {
        const scheduleData = await scheduleResponse.json()
        setSchedule(scheduleData || {})
      }
      
      addNotification('success', 'Veriler başarıyla yüklendi!')
      
    } catch (error) {
      console.error('Veri çekme hatası:', error)
      addNotification('error', 'Veri yüklenirken hata oluştu: ' + error.message)
      
      // Fallback olarak boş data set et
      setPreferences({})
      setAllDoctors([])
      setSchedule({})
    } finally {
      setLoading(false)
    }
  }

  // Tercih kaydetme
  const savePreferences = async (pozitifGunler, negatifGunler, ozelSebepler = '') => {
    if (!currentUserName.trim()) {
      addNotification('warning', 'Lütfen adınızı girin')
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

      // Response status kontrolü
      if (!response.ok) {
        const errorText = await response.text()
        console.error('API Error - Status:', response.status, 'Text:', errorText)
        addNotification('error', `Sunucu hatası (${response.status}): Lütfen tekrar deneyin`)
        return false
      }

      const result = await response.json()
      
      if (result.success) {
        // Tercihleri yeniden çek
        await fetchData()
        addNotification('success', 'Tercihleriniz başarıyla kaydedildi!')
        return true
      } else {
        console.error('API Business Logic Error:', result.error)
        addNotification('error', 'Hata: ' + (result.error || 'Bilinmeyen hata'))
        return false
      }
    } catch (error) {
      console.error('Tercih kaydetme hatası:', error)
      
      // Network hatası mı, JSON parse hatası mı?
      if (error instanceof TypeError && error.message.includes('fetch')) {
        addNotification('error', 'Bağlantı hatası: İnternet bağlantınızı kontrol edin')
      } else if (error instanceof SyntaxError) {
        addNotification('error', 'Sunucu yanıt formatı hatası: Lütfen sayfayı yenileyin')
      } else {
        addNotification('error', 'Bilinmeyen hata oluştu: ' + error.message)
      }
      return false
    }
  }

  // Admin giriş kontrolü
  const handleAdminLogin = () => {
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAdmin(true)
      setAdminPassword('')
      addNotification('success', 'Admin olarak giriş yaptınız!')
    } else {
      addNotification('error', 'Yanlış admin şifresi!')
      setAdminPassword('')
    }
  }

  // Admin çıkış
  const handleAdminLogout = () => {
    setIsAdmin(false)
    setActiveTab('preferences')
    addNotification('info', 'Admin oturumu kapatıldı')
  }

  // Çizelge oluşturma (sadece admin)
  const generateSchedule = async () => {
    if (!isAdmin) {
      addNotification('error', 'Bu işlem için admin yetkisi gerekli!')
      return
    }

    try {
      setLoading(true)
      addNotification('info', 'Çizelge oluşturuluyor...')
      
      const response = await fetch(`${API_BASE}/generate-schedule`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          preferences: preferences
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Generate Schedule API Error - Status:', response.status, 'Text:', errorText)
        addNotification('error', `Çizelge oluşturma sunucu hatası (${response.status}): Lütfen tekrar deneyin`)
        return
      }

      const result = await response.json()
      
      if (result.success) {
        setSchedule(result.schedule || {})
        addNotification('success', 'Çizelge başarıyla oluşturuldu!')
      } else {
        console.error('Generate Schedule Business Logic Error:', result.error)
        addNotification('error', 'Çizelge oluşturma hatası: ' + (result.error || 'Bilinmeyen hata'))
      }
    } catch (error) {
      console.error('Çizelge oluşturma hatası:', error)
      
      if (error instanceof TypeError && error.message.includes('fetch')) {
        addNotification('error', 'Çizelge oluşturma bağlantı hatası: İnternet bağlantınızı kontrol edin')
      } else if (error instanceof SyntaxError) {
        addNotification('error', 'Çizelge oluşturma yanıt hatası: Lütfen sayfayı yenileyin')
      } else {
        addNotification('error', 'Çizelge oluşturulurken hata oluştu: ' + error.message)
      }
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Sistem Yükleniyor...</h2>
          <p className="text-gray-600">Tercihler ve çizelge bilgileri alınıyor</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50">
      {/* Notification System */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {notifications.map(notification => (
          <div
            key={notification.id}
            className={`px-6 py-3 rounded-lg shadow-lg flex items-center transition-all duration-300 ${
              notification.type === 'success' ? 'bg-green-500 text-white' :
              notification.type === 'error' ? 'bg-red-500 text-white' :
              notification.type === 'warning' ? 'bg-yellow-500 text-white' :
              'bg-blue-500 text-white'
            }`}
          >
            {notification.type === 'success' && <CheckCircle className="h-5 w-5 mr-2" />}
            {notification.type === 'error' && <AlertCircle className="h-5 w-5 mr-2" />}
            {notification.type === 'warning' && <AlertCircle className="h-5 w-5 mr-2" />}
            {notification.type === 'info' && <Loader2 className="h-5 w-5 mr-2 animate-spin" />}
            {notification.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="bg-white shadow-lg border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div className="flex items-center">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-3 rounded-xl mr-4">
                <Calendar className="h-8 w-8 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  NöbetSihirbazı
                </h1>
                <p className="text-gray-600 text-sm">
                  Akıllı Doktor Nöbet Çizelge Sistemi - Temmuz 2025
                </p>
              </div>
            </div>
            
            {/* Admin Panel */}
            <div className="flex items-center space-x-4">
              {!isAdmin ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="password"
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Admin şifresi"
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && handleAdminLogin()}
                  />
                  <button
                    onClick={handleAdminLogin}
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition duration-200 text-sm font-medium"
                  >
                    <Shield className="h-4 w-4 mr-1 inline" />
                    Admin
                  </button>
                </div>
              ) : (
                <div className="flex items-center space-x-3">
                  <div className="flex items-center bg-green-100 px-3 py-2 rounded-lg">
                    <Shield className="h-4 w-4 text-green-600 mr-2" />
                    <span className="text-sm font-bold text-green-800">Admin</span>
                  </div>
                  <button
                    onClick={handleAdminLogout}
                    className="px-3 py-2 text-sm bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition duration-200"
                  >
                    Çıkış
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* System Stats (Global) */}
      {isAdmin && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-white rounded-xl shadow-lg p-6 border border-gray-200">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              📊 Sistem İstatistikleri
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{systemStats.totalDoctors || 0}</div>
                <div className="text-sm text-blue-800 font-medium">Toplam Doktor</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{systemStats.completedDoctors || 0}</div>
                <div className="text-sm text-green-800 font-medium">Tercih Girilen</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{systemStats.completionRate || 0}%</div>
                <div className="text-sm text-purple-800 font-medium">Tamamlanma</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">{systemStats.avgPositive || 0}</div>
                <div className="text-sm text-orange-800 font-medium">Ort. Pozitif</div>
              </div>
              <div className="text-center p-4 bg-gradient-to-br from-red-50 to-red-100 rounded-lg">
                <div className="text-2xl font-bold text-red-600">{systemStats.avgNegative || 0}</div>
                <div className="text-sm text-red-800 font-medium">Ort. Negatif</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation Tabs - Sadece Admin İçin */}
      {isAdmin && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-1">
            <nav className="flex space-x-1">
              <button
                onClick={() => setActiveTab('preferences')}
                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 flex items-center justify-center ${
                  activeTab === 'preferences'
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-md'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <Clock className="h-4 w-4 mr-2" />
                Tercih Toplama Durumu
              </button>
              <button
                onClick={() => setActiveTab('schedule')}
                className={`flex-1 py-3 px-4 rounded-lg font-bold text-sm transition-all duration-200 flex items-center justify-center ${
                  activeTab === 'schedule'
                    ? 'bg-gradient-to-r from-green-600 to-green-700 text-white shadow-md'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Nöbet Çizelgesi Yönetimi
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {!isAdmin || activeTab === 'preferences' ? (
          <div className="space-y-8">
            {/* Sistem Bilgisi */}
            {!isAdmin && (
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-6 shadow-sm">
                <h2 className="text-xl font-bold text-blue-900 mb-3 flex items-center">
                  <Users className="h-6 w-6 mr-2" />
                  🏥 Doktor Nöbet Tercih Sistemi
                </h2>
                <p className="text-blue-700 mb-4">
                  Bu sistem ile Temmuz 2025 ayı nöbet tercihlerinizi belirtebilirsiniz. 
                  Tercihleriniz toplanarak en adil nöbet çizelgesi oluşturulacaktır.
                </p>
                <div className="grid md:grid-cols-3 gap-4 mt-4">
                  <div className="flex items-center text-sm text-blue-600">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Kolay kullanım
                  </div>
                  <div className="flex items-center text-sm text-blue-600">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Adil dağılım
                  </div>
                  <div className="flex items-center text-sm text-blue-600">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Gerçek zamanlı
                  </div>
                </div>
              </div>
            )}

            {/* Kullanıcı Adı Girişi */}
            <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
                {isAdmin ? (
                  <>
                    <Shield className="h-6 w-6 mr-3 text-green-600" />
                    👑 Admin - Tercih Toplama Durumu
                  </>
                ) : (
                  <>
                    <Users className="h-6 w-6 mr-3 text-blue-600" />
                    📝 Nöbet Tercihlerinizi Belirtin
                  </>
                )}
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
              <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
                  <Calendar className="h-6 w-6 mr-3 text-indigo-600" />
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
            {isAdmin && systemStats.totalDoctors > 0 && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl p-6">
                <h3 className="text-lg font-bold text-green-900 mb-4 flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  📈 Tercih Toplama Özeti
                </h3>
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="font-bold text-green-800 mb-2">Doktor Durumu:</h4>
                    <ul className="text-sm text-green-700 space-y-1">
                      {Object.keys(preferences).map(doctor => (
                        <li key={doctor} className="flex justify-between">
                          <span>{doctor}</span>
                          <span className="flex space-x-2">
                            <span className="text-green-600">+{preferences[doctor].pozitif?.length || 0}</span>
                            <span className="text-red-600">-{preferences[doctor].negatif?.length || 0}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-bold text-green-800 mb-2">Sistem Durumu:</h4>
                    <div className="text-sm text-green-700 space-y-2">
                      <div className="flex justify-between">
                        <span>Tercih Tamamlama:</span>
                        <span className="font-bold">{systemStats.completionRate}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ortalama Pozitif:</span>
                        <span className="font-bold text-green-600">{systemStats.avgPositive}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Ortalama Negatif:</span>
                        <span className="font-bold text-red-600">{systemStats.avgNegative}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          // Çizelge Yönetimi Sekmesi
          <div className="space-y-8">
            <div className="bg-white rounded-xl shadow-lg p-8 border border-gray-200">
              <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center">
                <CheckCircle className="h-6 w-6 mr-3 text-green-600" />
                🗓️ Nöbet Çizelgesi Yönetimi
              </h2>
              
              {/* Çizelge Oluşturma Butonu */}
              <div className="mb-6">
                <button
                  onClick={generateSchedule}
                  disabled={loading || Object.keys(preferences).length === 0}
                  className={`flex items-center px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 transform ${
                    loading || Object.keys(preferences).length === 0
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-green-600 to-green-700 text-white hover:from-green-700 hover:to-green-800 shadow-lg hover:shadow-xl hover:scale-105'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-6 w-6 mr-3 animate-spin" />
                      Çizelge Oluşturuluyor...
                    </>
                  ) : (
                    <>
                      <Calendar className="h-6 w-6 mr-3" />
                      🎯 Akıllı Çizelge Oluştur
                    </>
                  )}
                </button>
                {Object.keys(preferences).length === 0 && (
                  <p className="text-sm text-gray-500 mt-2">
                    Çizelge oluşturmak için en az bir doktorun tercih girmesi gerekir.
                  </p>
                )}
              </div>

              {/* Çizelge Görüntüleme */}
              <ScheduleDisplay 
                schedule={schedule} 
                allDoctors={allDoctors}
                isAdmin={isAdmin}
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <p className="text-gray-600 text-sm">
              © 2025 NöbetSihirbazı - Akıllı Doktor Nöbet Çizelge Sistemi
            </p>
            <p className="text-gray-500 text-xs mt-2">
              Geliştirildi: AI Assistant • Temmuz 2025 için özel tasarlandı
            </p>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App 