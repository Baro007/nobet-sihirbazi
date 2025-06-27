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

  // Çizelge oluşturma
  const generateSchedule = async () => {
    if (!confirm('Yeni çizelge oluşturmak istediğinizden emin misiniz? Mevcut çizelge silinecek.')) {
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
        alert('Nöbet çizelgesi başarıyla oluşturuldu!')
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
              <h1 className="text-3xl font-bold text-gray-900">NöbetSihirbazı</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Users className="h-5 w-5 text-gray-500" />
              <span className="text-gray-600">{allDoctors.length} Kayıtlı Doktor</span>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
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
              Tercih Toplama
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
              Nöbet Çizelgesi
            </button>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'preferences' ? (
          <div className="space-y-6">
            {/* Kullanıcı Adı Girişi */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Nöbet Tercihlerinizi Belirtin
              </h2>
              <UserNameInput
                currentUserName={currentUserName}
                onUserNameChange={setCurrentUserName}
                allDoctors={allDoctors}
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
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Çizelge Oluşturma Butonu */}
            <div className="bg-white rounded-lg shadow p-6">
              <div className="flex justify-between items-center">
                <h2 className="text-xl font-semibold text-gray-900">
                  Nöbet Çizelgesi
                </h2>
                <button
                  onClick={generateSchedule}
                  className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md transition duration-200"
                >
                  Çizelge Oluştur
                </button>
              </div>
            </div>

            {/* Çizelge Görüntüleme */}
            <ScheduleDisplay schedule={schedule} />
          </div>
        )}
      </main>
    </div>
  )
}

export default App 