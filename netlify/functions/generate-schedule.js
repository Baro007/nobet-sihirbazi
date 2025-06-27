const { getStore } = require('@netlify/blobs')

// Dinamik doktor listesi - preferences'tan alınacak

const MAX_SHIFTS_PER_DOCTOR = 8
const TARGET_SHIFTS_PER_DOCTOR = 7

// Temmuz 2025 için gün sayısı
const JULY_2025_DAYS = 31

// Hafta sonlarını belirle (Cumartesi ve Pazar)
function isWeekend(day) {
  // Temmuz 2025'te 1. gün Salı (2)
  // 0: Pazar, 1: Pazartesi, ..., 6: Cumartesi
  const firstDayOfJuly2025 = 2 // Salı
  const dayOfWeek = (firstDayOfJuly2025 + day - 1) % 7
  return dayOfWeek === 0 || dayOfWeek === 6 // Pazar veya Cumartesi
}

// Doktor skorunu hesapla
function calculateDoctorScore(doctor, day, preferences, currentCounts, schedule) {
  let score = 0
  
  // Pozitif tercih bonusu
  if (preferences[doctor]?.pozitif?.includes(day)) {
    score += 50
  }
  
  // Negatif tercih cezası
  if (preferences[doctor]?.negatif?.includes(day)) {
    score -= 100
  }
  
  // Az nöbet sayısı bonusu
  const currentShifts = currentCounts[doctor] || 0
  score += (MAX_SHIFTS_PER_DOCTOR - currentShifts) * 10
  
  // Ardışık nöbet kontrolü
  const yesterday = day - 1
  if (yesterday >= 1 && schedule[yesterday]?.includes(doctor)) {
    score -= 1000 // Çok yüksek ceza
  }
  
  return score
}

// Doktoru günün şartlarına uygun mu kontrol et
function isDoctorEligible(doctor, day, preferences, currentCounts, schedule) {
  // Maksimum nöbet sayısını aştı mı?
  if ((currentCounts[doctor] || 0) >= MAX_SHIFTS_PER_DOCTOR) {
    return false
  }
  
  // Negatif tercih var mı?
  if (preferences[doctor]?.negatif?.includes(day)) {
    return false
  }
  
  // Ardışık nöbet var mı?
  const yesterday = day - 1
  if (yesterday >= 1 && schedule[yesterday]?.includes(doctor)) {
    return false
  }
  
  return true
}

// Dengeleme kuralı uygula
function applyBalancingRule(schedule, currentCounts, DOCTORS) {
  const lowShiftDoctors = DOCTORS.filter(doctor => 
    (currentCounts[doctor] || 0) < TARGET_SHIFTS_PER_DOCTOR
  )
  
  if (lowShiftDoctors.length === 0) return schedule
  
  // Hafta içi günlerde 3. doktor olarak ekle
  for (let day = 1; day <= JULY_2025_DAYS; day++) {
    if (isWeekend(day)) continue // Sadece hafta içi
    
    const currentDoctors = schedule[day] || []
    if (currentDoctors.length >= 3) continue // Zaten 3 doktor var
    
    // Uygun doktorları bul
    const eligibleDoctors = lowShiftDoctors.filter(doctor => {
      // Bu günde zaten nöbetçi değil
      if (currentDoctors.includes(doctor)) return false
      
      // Ardışık nöbet kontrolü
      const yesterday = day - 1
      const tomorrow = day + 1
      
      if (yesterday >= 1 && schedule[yesterday]?.includes(doctor)) return false
      if (tomorrow <= JULY_2025_DAYS && schedule[tomorrow]?.includes(doctor)) return false
      
      // Maksimum nöbet sayısını aşmaz
      return (currentCounts[doctor] || 0) < MAX_SHIFTS_PER_DOCTOR
    })
    
    if (eligibleDoctors.length > 0) {
      // En az nöbeti olan doktoru seç
      const selectedDoctor = eligibleDoctors.reduce((prev, curr) => 
        (currentCounts[curr] || 0) < (currentCounts[prev] || 0) ? curr : prev
      )
      
      schedule[day] = [...currentDoctors, selectedDoctor]
      currentCounts[selectedDoctor] = (currentCounts[selectedDoctor] || 0) + 1
      
      // Bu doktoru listeden çıkar
      const index = lowShiftDoctors.indexOf(selectedDoctor)
      if (index > -1) {
        lowShiftDoctors.splice(index, 1)
      }
    }
  }
  
  return schedule
}

exports.handler = async (event, context) => {
  const req = {
    method: event.httpMethod,
    json: () => JSON.parse(event.body || '{}')
  }
  
  if (req.method !== 'POST') {
    return {
      statusCode: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const store = getStore('nobet-data')
    
    // Tercihleri al
    const rawPreferences = await store.get('preferences')
    const preferences = rawPreferences ? (typeof rawPreferences === 'string' ? JSON.parse(rawPreferences) : rawPreferences) : {}
    
    // Dinamik doktor listesini oluştur
    const DOCTORS = Object.keys(preferences)
    
    if (DOCTORS.length === 0) {
      return {
        statusCode: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        },
        body: JSON.stringify({
          success: false,
          error: 'Henüz hiç doktor tercihi girilmemiş'
        })
      }
    }
    
    // Nöbet sayılarını takip et
    const currentCounts = {}
    DOCTORS.forEach(doctor => {
      currentCounts[doctor] = 0
    })
    
    // Boş çizelge oluştur
    const schedule = {}
    
    // Her gün için nöbetçi ata
    for (let day = 1; day <= JULY_2025_DAYS; day++) {
      const isWeekendDay = isWeekend(day)
      const requiredDoctors = isWeekendDay ? 3 : 2
      
      // Uygun doktorları bul ve skorla
      const eligibleDoctors = DOCTORS.filter(doctor => 
        isDoctorEligible(doctor, day, preferences, currentCounts, schedule)
      )
      
      // Doktorları skorlarına göre sırala
      const scoredDoctors = eligibleDoctors.map(doctor => ({
        doctor,
        score: calculateDoctorScore(doctor, day, preferences, currentCounts, schedule)
      })).sort((a, b) => b.score - a.score)
      
      // En yüksek puanlı doktorları seç
      const selectedDoctors = scoredDoctors
        .slice(0, requiredDoctors)
        .map(item => item.doctor)
      
      if (selectedDoctors.length < requiredDoctors) {
        // Yeterli doktor bulunamadı, zorla atama yap
        const remainingDoctors = DOCTORS.filter(doctor => 
          !selectedDoctors.includes(doctor) && 
          (currentCounts[doctor] || 0) < MAX_SHIFTS_PER_DOCTOR
        )
        
        const additionalNeeded = requiredDoctors - selectedDoctors.length
        const additionalDoctors = remainingDoctors.slice(0, additionalNeeded)
        selectedDoctors.push(...additionalDoctors)
      }
      
      schedule[day] = selectedDoctors
      
      // Nöbet sayılarını güncelle
      selectedDoctors.forEach(doctor => {
        currentCounts[doctor] = (currentCounts[doctor] || 0) + 1
      })
    }
    
    // Dengeleme kuralını uygula
    applyBalancingRule(schedule, currentCounts, DOCTORS)
    
    // Çizelgeyi kaydet
    await store.set('schedule', schedule)
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify({
        success: true,
        schedule,
        statistics: currentCounts,
        message: 'Nöbet çizelgesi başarıyla oluşturuldu'
      })
    }
  } catch (error) {
    console.error('Generate schedule error:', error)
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    }
  }
} 