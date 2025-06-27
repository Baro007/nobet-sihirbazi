import { getStore } from '@netlify/blobs'

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const store = getStore('nobet-data')
    const body = await req.json()
    const { doktorAdi, pozitifGunler, negatifGunler, ozelSebepler } = body

    if (!doktorAdi) {
      return new Response(JSON.stringify({ error: 'Doktor adı gerekli' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Mevcut tercihleri al
    let preferences = await store.get('preferences') || {}
    
    // Doktorun tercihlerini güncelle
    preferences[doktorAdi] = {
      pozitif: pozitifGunler || [],
      negatif: negatifGunler || [],
      ozelSebepler: ozelSebepler || '',
      kayitTarihi: new Date().toISOString()
    }

    // Güncellenmiş tercihleri kaydet
    await store.set('preferences', preferences)

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Tercihler başarıyla kaydedildi' 
    }), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  } catch (error) {
    console.error('Save preferences error:', error)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
} 