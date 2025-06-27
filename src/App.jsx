import React, { useState, useEffect } from 'react'
import { Calendar, Users, Clock, CheckCircle, Shield, TrendingUp, BarChart3, Loader2, AlertCircle, Download, FileText, Database, Wifi, WifiOff, Trash2, UserX } from 'lucide-react'
import UserNameInput from './components/UserNameInput'
import ScheduleCalendar from './components/ScheduleCalendar'
import SubmitButton from './components/SubmitButton'
import ScheduleDisplay from './components/ScheduleDisplay'
import { dbOperations } from './supabaseClient'

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
  const [isOnline, setIsOnline] = useState(true)
  const [realTimeEnabled, setRealTimeEnabled] = useState(false)
  
  // Admin şifresi
  const ADMIN_PASSWORD = 'admin2025'

  // Notification sistemi
  const addNotification = (type, message) => {
    const id = Date.now()
    setNotifications(prev => [...prev, { id, type, message }])
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id))
    }, 5000)
  }

  // Supabase'den veri yükle
  useEffect(() => {
    loadDataFromSupabase()
    
    // Realtime subscriptions
    let preferencesSubscription, scheduleSubscription
    
    if (realTimeEnabled) {
      preferencesSubscription = dbOperations.subscribeToPreferences(() => {
        loadDataFromSupabase()
        addNotification('info', 'Tercihler güncellendi!')
      })
      
      scheduleSubscription = dbOperations.subscribeToSchedule(() => {
        loadScheduleFromSupabase()
        addNotification('info', 'Çizelge güncellendi!')
      })
    }

    return () => {
      preferencesSubscription?.unsubscribe()
      scheduleSubscription?.unsubscribe()
    }
  }, [realTimeEnabled])

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

  const loadDataFromSupabase = async () => {
    try {
      setLoading(true)
      setIsOnline(true)
      
      // Preferences'ları Supabase'den yükle
      const supabasePreferences = await dbOperations.getPreferences()
      setPreferences(supabasePreferences)
      
      // Doktor listesini oluştur
      const doctorList = Object.keys(supabasePreferences)
      setAllDoctors(doctorList)
      
      // Schedule'ı da yükle
      await loadScheduleFromSupabase()
      
      addNotification('success', 'Veriler Supabase\'den başarıyla yüklendi!')
      
    } catch (error) {
      console.error('Supabase veri yükleme hatası:', error)
      setIsOnline(false)
      addNotification('error', 'Database bağlantı hatası: ' + error.message)
      
      // Fallback: localStorage'dan yükle
      try {
        const localPrefs = localStorage.getItem('nobet-preferences-backup')
        if (localPrefs) {
          const parsedPrefs = JSON.parse(localPrefs)
          setPreferences(parsedPrefs)
          setAllDoctors(Object.keys(parsedPrefs))
          addNotification('warning', 'Offline modda çalışıyor - yerel veriler yüklendi')
        }
      } catch (backupError) {
        addNotification('error', 'Hiç veri bulunamadı')
      }
    } finally {
      setLoading(false)
    }
  }

  const loadScheduleFromSupabase = async () => {
    try {
      const supabaseSchedule = await dbOperations.getSchedule()
      setSchedule(supabaseSchedule)
    } catch (error) {
      console.error('Çizelge yükleme hatası:', error)
      const localSchedule = localStorage.getItem('nobet-schedule-backup')
      if (localSchedule) {
        setSchedule(JSON.parse(localSchedule))
      }
    }
  }

  // Tercih kaydetme (Supabase)
  const savePreferences = async (pozitifGunler, negatifGunler, ozelSebepler = '') => {
    if (!currentUserName.trim()) {
      addNotification('warning', 'Lütfen adınızı girin')
      return false
    }

    try {
      // Supabase'e kaydet
      await dbOperations.savePreferences(
        currentUserName.trim(),
        pozitifGunler,
        negatifGunler,
        ozelSebepler
      )

      // Local state'i güncelle
      const newPreferences = {
        ...preferences,
        [currentUserName.trim()]: {
          pozitif: pozitifGunler || [],
          negatif: negatifGunler || [],
          ozelSebepler: ozelSebepler || '',
          kayitTarihi: new Date().toISOString()
        }
      }

      setPreferences(newPreferences)
      setAllDoctors(Object.keys(newPreferences))
      
      // Backup olarak localStorage'a da kaydet
      localStorage.setItem('nobet-preferences-backup', JSON.stringify(newPreferences))
      
      addNotification('success', 'Tercihleriniz Supabase\'e başarıyla kaydedildi!')
      return true
      
    } catch (error) {
      console.error('Supabase tercih kaydetme hatası:', error)
      setIsOnline(false)
      
      // Fallback: localStorage'a kaydet
      try {
        const newPreferences = {
          ...preferences,
          [currentUserName.trim()]: {
            pozitif: pozitifGunler || [],
            negatif: negatifGunler || [],
            ozelSebepler: ozelSebepler || '',
            kayitTarihi: new Date().toISOString()
          }
        }
        
        localStorage.setItem('nobet-preferences-backup', JSON.stringify(newPreferences))
        setPreferences(newPreferences)
        setAllDoctors(Object.keys(newPreferences))
        
        addNotification('warning', 'Database bağlantısı yok - tercihler yerel olarak kaydedildi')
        return true
      } catch (localError) {
        addNotification('error', 'Tercih kaydedilemedi: ' + localError.message)
        return false
      }
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

  // Çizelge oluşturma (Supabase tabanlı)
  const generateSchedule = async () => {
    if (!isAdmin) {
      addNotification('error', 'Bu işlem için admin yetkisi gerekli!')
      return
    }

    try {
      setLoading(true)
      addNotification('info', 'Akıllı çizelge oluşturuluyor...')
      
      const doctors = Object.keys(preferences)
      if (doctors.length === 0) {
        addNotification('error', 'Henüz hiç doktor tercihi girilmemiş!')
        return
      }

      const newSchedule = {}
      const doctorCounts = {}
      doctors.forEach(d => doctorCounts[d] = 0)

      // Gelişmiş çizelge algoritması
      for (let day = 1; day <= 31; day++) {
        const availableDoctors = doctors.filter(doctor => {
          const prefs = preferences[doctor]
          return !prefs.negatif?.includes(day) && doctorCounts[doctor] < 8
        })

        // Pozitif tercih edenleri önceliklendir
        const preferredDoctors = availableDoctors.filter(doctor => {
          const prefs = preferences[doctor]
          return prefs.pozitif?.includes(day)
        })

        const isWeekend = new Date(2025, 6, day).getDay() % 6 === 0
        const requiredDoctors = isWeekend ? 3 : 2

        let selectedDoctors = []
        
        // Önce pozitif tercih edenleri seç
        preferredDoctors.sort((a, b) => doctorCounts[a] - doctorCounts[b])
        for (let i = 0; i < Math.min(preferredDoctors.length, requiredDoctors); i++) {
          selectedDoctors.push(preferredDoctors[i])
          doctorCounts[preferredDoctors[i]]++
        }

        // Eksik varsa diğerlerinden seç
        if (selectedDoctors.length < requiredDoctors) {
          const remaining = availableDoctors.filter(d => !selectedDoctors.includes(d))
          remaining.sort((a, b) => doctorCounts[a] - doctorCounts[b])
          
          for (let i = 0; i < requiredDoctors - selectedDoctors.length && i < remaining.length; i++) {
            selectedDoctors.push(remaining[i])
            doctorCounts[remaining[i]]++
          }
        }

        newSchedule[day] = selectedDoctors
      }

      // Supabase'e kaydet
      await dbOperations.saveSchedule(newSchedule)
      setSchedule(newSchedule)
      
      // Backup olarak localStorage'a da kaydet
      localStorage.setItem('nobet-schedule-backup', JSON.stringify(newSchedule))
      
      addNotification('success', 'Akıllı çizelge Supabase\'e başarıyla kaydedildi!')
      
    } catch (error) {
      console.error('Çizelge oluşturma hatası:', error)
      addNotification('error', 'Çizelge oluşturulurken hata oluştu: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // Verileri export et
  const exportData = () => {
    const data = {
      preferences,
      schedule,
      exportDate: new Date().toISOString(),
      doctorCount: Object.keys(preferences).length,
      source: 'supabase'
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nobet-tercihleri-supabase-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    addNotification('success', 'Veriler başarıyla export edildi!')
  }

  // CSV Export
  const exportCSV = () => {
    let csv = 'Doktor Adı,Pozitif Günler,Negatif Günler,Özel Sebepler,Kayıt Tarihi\n'
    
    Object.keys(preferences).forEach(doctor => {
      const pref = preferences[doctor]
      csv += `"${doctor}","${(pref.pozitif || []).join(', ')}","${(pref.negatif || []).join(', ')}","${pref.ozelSebepler || ''}","${pref.kayitTarihi || ''}"\n`
    })
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `nobet-tercihleri-supabase-${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    
    addNotification('success', 'CSV dosyası başarıyla export edildi!')
  }

  // Supabase'den tüm verileri yeniden yükle
  const refreshFromSupabase = async () => {
    addNotification('info', 'Veriler yeniden yükleniyor...')
    await loadDataFromSupabase()
  }

  // Doktor tercihini sil
  const deleteDoctor = async (doctorName) => {
    if (!isAdmin) {
      addNotification('error', 'Bu işlem için admin yetkisi gerekli!')
      return
    }

    if (confirm(`${doctorName} adlı doktorun TÜM TERCİHLERİ silinecek! Emin misiniz?`)) {
      try {
        // Supabase'den sil
        await dbOperations.deletePreferences(doctorName)
        
        // Local state'i güncelle
        const newPreferences = { ...preferences }
        delete newPreferences[doctorName]
        setPreferences(newPreferences)
        setAllDoctors(Object.keys(newPreferences))
        
        // Local backup'ı güncelle
        localStorage.setItem('nobet-preferences-backup', JSON.stringify(newPreferences))
        
        addNotification('success', `${doctorName} adlı doktorun tercihleri başarıyla silindi!`)
      } catch (error) {
        console.error('Doktor silme hatası:', error)
        addNotification('error', 'Doktor silinirken hata oluştu: ' + error.message)
      }
    }
  }

  // Test verilerini temizle
  const clearTestData = async () => {
    if (!isAdmin) {
      addNotification('error', 'Bu işlem için admin yetkisi gerekli!')
      return
    }

    if (confirm('TEST VERİLERİ (Dr. Ahmet Yılmaz, Dr. Fatma Demir) silinecek! Emin misiniz?')) {
      try {
        await dbOperations.clearTestData()
        
        // Local state'i güncelle
        const newPreferences = { ...preferences }
        delete newPreferences['Dr. Ahmet Yılmaz']
        delete newPreferences['Dr. Fatma Demir']
        setPreferences(newPreferences)
        setAllDoctors(Object.keys(newPreferences))
        
        // Local backup'ı güncelle
        localStorage.setItem('nobet-preferences-backup', JSON.stringify(newPreferences))
        
        addNotification('success', 'Test verileri başarıyla temizlendi!')
      } catch (error) {
        console.error('Test verisi temizleme hatası:', error)
        addNotification('error', 'Test verileri temizlenirken hata: ' + error.message)
      }
    }
  }

  // Verileri temizle
  const clearAllData = async () => {
    if (!isAdmin) {
      addNotification('error', 'Bu işlem için admin yetkisi gerekli!')
      return
    }

    if (confirm('TÜM VERİLER SİLİNECEK! (Supabase + Local) Emin misiniz?')) {
      try {
        // Supabase'den tüm tercihleri sil
        await dbOperations.deleteAllPreferences()
        await dbOperations.deleteSchedule()
        
        // Local storage'ı temizle
        localStorage.removeItem('nobet-preferences-backup')
        localStorage.removeItem('nobet-schedule-backup')
        
        setPreferences({})
        setSchedule({})
        setAllDoctors([])
        
        addNotification('success', 'Tüm veriler başarıyla temizlendi!')
      } catch (error) {
        console.error('Veri temizleme hatası:', error)
        addNotification('error', 'Veri temizlerken hata: ' + error.message)
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-800 mb-2">Supabase'den Veri Yükleniyor...</h2>
          <p className="text-gray-600">Tercihler ve çizelge bilgileri alınıyor</p>
          <div className="flex items-center justify-center mt-4">
            {isOnline ? (
              <div className="flex items-center text-green-600">
                <Wifi className="h-4 w-4 mr-1" />
                <span className="text-sm">Online</span>
              </div>
            ) : (
              <div className="flex items-center text-red-600">
                <WifiOff className="h-4 w-4 mr-1" />
                <span className="text-sm">Offline</span>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Loading state - ilk yükleme
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-blue-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-md mx-auto">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <h2 className="text-xl font-bold text-gray-800 mb-2">NöbetSihirbazı Yükleniyor...</h2>
            <p className="text-gray-600 text-sm mb-4">Supabase bağlantısı kontrol ediliyor</p>
            <div className="flex items-center justify-center text-sm">
              {isOnline ? (
                <div className="flex items-center text-green-600">
                  <Wifi className="h-4 w-4 mr-1" />
                  <span>Bağlantı durumu: Online</span>
                </div>
              ) : (
                <div className="flex items-center text-orange-600">
                  <WifiOff className="h-4 w-4 mr-1" />
                  <span>Bağlantı durumu: Offline</span>
                </div>
              )}
            </div>
          </div>
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
                <p className="text-gray-600 text-sm flex items-center">
                  <Database className="h-4 w-4 mr-1" />
                  Supabase Cloud Database - Temmuz 2025
                  {isOnline ? (
                    <span className="ml-2 flex items-center text-green-600">
                      <Wifi className="h-3 w-3 mr-1" />
                      Online
                    </span>
                  ) : (
                    <span className="ml-2 flex items-center text-red-600">
                      <WifiOff className="h-3 w-3 mr-1" />
                      Offline
                    </span>
                  )}
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
                  <button
                    onClick={refreshFromSupabase}
                    className="px-3 py-2 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition duration-200 text-sm"
                  >
                    <Database className="h-4 w-4 mr-1 inline" />
                    Yenile
                  </button>
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
          
          {/* Tabs */}
          {isAdmin && (
            <div className="border-t border-gray-200 pt-4">
              <nav className="flex space-x-8">
                <button
                  onClick={() => setActiveTab('preferences')}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition duration-200 ${
                    activeTab === 'preferences'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Tercih Toplama
                </button>
                <button
                  onClick={() => setActiveTab('schedule')}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition duration-200 ${
                    activeTab === 'schedule'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Çizelge Yönetimi
                </button>
                <button
                  onClick={() => setActiveTab('admin')}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition duration-200 ${
                    activeTab === 'admin'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <BarChart3 className="h-4 w-4 mr-2" />
                  Admin Panel
                </button>
              </nav>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tercih Toplama Tab */}
        {activeTab === 'preferences' && (
          <div className="space-y-8">
            {/* Info Banner */}
            <div className="bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200 rounded-xl p-6">
              <div className="flex items-center">
                <Database className="h-6 w-6 text-blue-600 mr-3" />
                <div>
                  <h3 className="text-lg font-bold text-blue-900">🚀 Supabase Cloud Database Aktif!</h3>
                  <p className="text-blue-700 text-sm mt-1">
                    Tüm veriler bulutta güvenle saklanıyor. Farklı cihazlardan erişebilir, gerçek zamanlı güncellemeleri görebilirsiniz!
                  </p>
                </div>
                {isOnline ? (
                  <div className="ml-auto flex items-center text-green-600">
                    <Wifi className="h-5 w-5 mr-1" />
                    <span className="text-sm font-bold">Çevrimiçi</span>
                  </div>
                ) : (
                  <div className="ml-auto flex items-center text-orange-600">
                    <WifiOff className="h-5 w-5 mr-1" />
                    <span className="text-sm font-bold">Çevrimdışı</span>
                  </div>
                )}
              </div>
            </div>

            <UserNameInput 
              currentUserName={currentUserName}
              setCurrentUserName={setCurrentUserName}
              allDoctors={allDoctors}
              isAdmin={isAdmin}
            />
            
            <ScheduleCalendar 
              currentUserName={currentUserName}
              preferences={preferences}
              allDoctors={allDoctors}
              onSave={savePreferences}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {/* Çizelge Tab */}
        {activeTab === 'schedule' && isAdmin && (
          <div className="space-y-8">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-900">Nöbet Çizelgesi</h2>
              <button
                onClick={generateSchedule}
                disabled={loading}
                className="flex items-center px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition duration-200 font-medium disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                ) : (
                  <Calendar className="h-5 w-5 mr-2" />
                )}
                {loading ? 'Oluşturuluyor...' : 'Akıllı Çizelge Oluştur'}
              </button>
            </div>
            
            <ScheduleDisplay 
              schedule={schedule}
              preferences={preferences}
              isAdmin={isAdmin}
            />
          </div>
        )}

        {/* Admin Panel Tab */}
        {activeTab === 'admin' && isAdmin && (
          <div className="space-y-8">
            <h2 className="text-2xl font-bold text-gray-900">Supabase Admin Panel</h2>
            
            {/* İstatistikler */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <div className="text-3xl font-bold text-blue-600">{systemStats.totalDoctors}</div>
                <div className="text-sm text-gray-600">Toplam Doktor</div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <div className="text-3xl font-bold text-green-600">{systemStats.completedDoctors}</div>
                <div className="text-sm text-gray-600">Tercih Girilen</div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <div className="text-3xl font-bold text-orange-600">{systemStats.avgPositive}</div>
                <div className="text-sm text-gray-600">Ort. Pozitif Tercih</div>
              </div>
              <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <div className="text-3xl font-bold text-red-600">{systemStats.avgNegative}</div>
                <div className="text-sm text-gray-600">Ort. Negatif Tercih</div>
              </div>
            </div>

            {/* Supabase Kontrol Paneli */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Database İşlemleri</h3>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={refreshFromSupabase}
                  className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition duration-200"
                >
                  <Database className="h-5 w-5 mr-2" />
                  Supabase'den Yenile
                </button>
                
                <button
                  onClick={() => setRealTimeEnabled(!realTimeEnabled)}
                  className={`flex items-center px-6 py-3 rounded-lg transition duration-200 ${
                    realTimeEnabled 
                      ? 'bg-gradient-to-r from-green-600 to-green-700 text-white' 
                      : 'bg-gradient-to-r from-gray-600 to-gray-700 text-white'
                  }`}
                >
                  {realTimeEnabled ? <Wifi className="h-5 w-5 mr-2" /> : <WifiOff className="h-5 w-5 mr-2" />}
                  Gerçek Zamanlı: {realTimeEnabled ? 'Açık' : 'Kapalı'}
                </button>

                <button
                  onClick={clearTestData}
                  className="flex items-center px-6 py-3 bg-gradient-to-r from-orange-600 to-orange-700 text-white rounded-lg hover:from-orange-700 hover:to-orange-800 transition duration-200"
                >
                  <UserX className="h-5 w-5 mr-2" />
                  Test Verilerini Temizle
                </button>
              </div>
            </div>

            {/* Export Butonları */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Veri Export İşlemleri</h3>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={exportData}
                  className="flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition duration-200"
                >
                  <Download className="h-5 w-5 mr-2" />
                  Supabase JSON Export
                </button>
                <button
                  onClick={exportCSV}
                  className="flex items-center px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition duration-200"
                >
                  <FileText className="h-5 w-5 mr-2" />
                  CSV Export
                </button>
                <button
                  onClick={clearAllData}
                  className="flex items-center px-6 py-3 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-lg hover:from-red-700 hover:to-red-800 transition duration-200"
                >
                  <AlertCircle className="h-5 w-5 mr-2" />
                  Tüm Verileri Temizle
                </button>
              </div>
            </div>

            {/* Doktor Listesi */}
            {Object.keys(preferences).length > 0 && (
              <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center justify-between">
                  <span>Kayıtlı Doktorlar (Supabase'den)</span>
                  <span className="text-sm font-normal text-gray-500">
                    {Object.keys(preferences).length} doktor
                  </span>
                </h3>
                <div className="space-y-4">
                  {Object.keys(preferences).map(doctor => {
                    const pref = preferences[doctor]
                    const isTestData = ['Dr. Ahmet Yılmaz', 'Dr. Fatma Demir'].includes(doctor)
                    return (
                      <div key={doctor} className={`border rounded-lg p-4 ${isTestData ? 'border-orange-200 bg-orange-50' : 'border-gray-200 bg-white'}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center">
                              <h4 className="font-bold text-gray-900">{doctor}</h4>
                              {isTestData && (
                                <span className="ml-2 px-2 py-1 text-xs bg-orange-200 text-orange-800 rounded-full">
                                  Test Verisi
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600">
                              Pozitif: {(pref.pozitif || []).length} gün, 
                              Negatif: {(pref.negatif || []).length} gün
                            </p>
                            {pref.ozelSebepler && (
                              <p className="text-sm text-gray-500 mt-1">"{pref.ozelSebepler}"</p>
                            )}
                            <div className="text-xs text-gray-400 mt-2">
                              {pref.kayitTarihi && new Date(pref.kayitTarihi).toLocaleString('tr-TR')}
                            </div>
                          </div>
                          <div className="flex flex-col items-end space-y-2">
                            <button
                              onClick={() => setCurrentUserName(doctor)}
                              className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition duration-200"
                            >
                              Görüntüle
                            </button>
                            <button
                              onClick={() => deleteDoctor(doctor)}
                              className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition duration-200 flex items-center"
                            >
                              <Trash2 className="h-3 w-3 mr-1" />
                              Sil
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                {/* Hızlı İşlemler */}
                {Object.keys(preferences).length > 0 && (
                  <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-bold text-gray-800 mb-3">⚡ Hızlı İşlemler</h4>
                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={() => {
                          const testDoctors = Object.keys(preferences).filter(d => 
                            ['Dr. Ahmet Yılmaz', 'Dr. Fatma Demir'].includes(d)
                          )
                          if (testDoctors.length > 0) {
                            clearTestData()
                          } else {
                            addNotification('info', 'Test verisi bulunamadı')
                          }
                        }}
                        className="px-4 py-2 text-sm bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition duration-200 flex items-center"
                      >
                        <UserX className="h-4 w-4 mr-2" />
                        Test Verilerini Temizle
                      </button>
                      <button
                        onClick={() => {
                          const exported = {
                            doctors: Object.keys(preferences),
                            totalCount: Object.keys(preferences).length,
                            exportTime: new Date().toISOString()
                          }
                          const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' })
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = `doktor-listesi-${new Date().toISOString().split('T')[0]}.json`
                          document.body.appendChild(a)
                          a.click()
                          document.body.removeChild(a)
                          URL.revokeObjectURL(url)
                          addNotification('success', 'Doktor listesi export edildi!')
                        }}
                        className="px-4 py-2 text-sm bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition duration-200 flex items-center"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Doktor Listesi Export
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App 