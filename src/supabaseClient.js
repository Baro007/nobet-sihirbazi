import { createClient } from '@supabase/supabase-js'

// Supabase konfigürasyonu
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

export const supabase = createClient(supabaseUrl, supabaseKey)

// Database operasyonları
export const dbOperations = {
  // Tüm tercihleri getir
  async getPreferences() {
    try {
      const { data, error } = await supabase
        .from('doctor_preferences')
        .select('*')
        .order('created_at', { ascending: false })
      
      if (error) throw error
      
      // Verileri uygun formata çevir
      const preferences = {}
      data?.forEach(row => {
        preferences[row.doctor_name] = {
          pozitif: row.positive_days || [],
          negatif: row.negative_days || [],
          ozelSebepler: row.special_notes || '',
          kayitTarihi: row.created_at
        }
      })
      
      return preferences
    } catch (error) {
      console.error('Tercihler alınırken hata:', error)
      throw error
    }
  },

  // Tercih kaydet/güncelle
  async savePreferences(doctorName, pozitifGunler, negatifGunler, ozelSebepler = '') {
    try {
      const { data, error } = await supabase
        .from('doctor_preferences')
        .upsert({
          doctor_name: doctorName,
          positive_days: pozitifGunler || [],
          negative_days: negatifGunler || [],
          special_notes: ozelSebepler || '',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'doctor_name'
        })
        .select()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Tercih kaydederken hata:', error)
      throw error
    }
  },

  // Doktor tercihini sil
  async deletePreferences(doctorName) {
    try {
      const { data, error } = await supabase
        .from('doctor_preferences')
        .delete()
        .eq('doctor_name', doctorName)
        .select()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Tercih silinirken hata:', error)
      throw error
    }
  },

  // Test verilerini temizle
  async clearTestData() {
    try {
      const { data, error } = await supabase
        .from('doctor_preferences')
        .delete()
        .in('doctor_name', ['Dr. Ahmet Yılmaz', 'Dr. Fatma Demir'])
        .select()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Test verileri silinirken hata:', error)
      throw error
    }
  },

  // Tüm tercihleri sil (dikkatli kullanın)
  async deleteAllPreferences() {
    try {
      const { data, error } = await supabase
        .from('doctor_preferences')
        .delete()
        .neq('id', 0) // Tüm kayıtları sil
        .select()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Tüm tercihler silinirken hata:', error)
      throw error
    }
  },

  // Çizelgeyi getir
  async getSchedule() {
    try {
      const { data, error } = await supabase
        .from('schedule')
        .select('*')
        .order('day_number', { ascending: true })
      
      if (error) throw error
      
      // Verileri uygun formata çevir
      const schedule = {}
      data?.forEach(row => {
        schedule[row.day_number] = row.assigned_doctors || []
      })
      
      return schedule
    } catch (error) {
      console.error('Çizelge alınırken hata:', error)
      throw error
    }
  },

  // Çizelgeyi kaydet
  async saveSchedule(schedule) {
    try {
      // Önce mevcut çizelgeyi temizle
      await supabase.from('schedule').delete().neq('id', 0)
      
      // Yeni çizelgeyi kaydet
      const scheduleData = Object.keys(schedule).map(day => ({
        day_number: parseInt(day),
        assigned_doctors: schedule[day] || [],
        created_at: new Date().toISOString()
      }))
      
      const { data, error } = await supabase
        .from('schedule')
        .insert(scheduleData)
        .select()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Çizelge kaydederken hata:', error)
      throw error
    }
  },

  // Çizelgeyi sil
  async deleteSchedule() {
    try {
      const { data, error } = await supabase
        .from('schedule')
        .delete()
        .neq('id', 0) // Tüm kayıtları sil
        .select()
      
      if (error) throw error
      return data
    } catch (error) {
      console.error('Çizelge silinirken hata:', error)
      throw error
    }
  },

  // Realtime subscription için
  subscribeToPreferences(callback) {
    return supabase
      .channel('doctor_preferences_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'doctor_preferences' }, 
        callback
      )
      .subscribe()
  },

  subscribeToSchedule(callback) {
    return supabase
      .channel('schedule_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'schedule' }, 
        callback
      )
      .subscribe()
  }
} 