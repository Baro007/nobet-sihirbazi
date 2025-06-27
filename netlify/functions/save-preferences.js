import { getStore } from '@netlify/blobs'

export default async (req, context) => {
  // CORS preflight handler
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600'
      }
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Method not allowed. Only POST requests are supported.' 
    }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  try {
    console.log('Starting save-preferences function...')
    
    // Request body parsing
    let body
    try {
      body = await req.json()
      console.log('Request body parsed:', JSON.stringify(body, null, 2))
    } catch (parseError) {
      console.error('JSON parse error:', parseError)
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Invalid JSON in request body' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    const { doktorAdi, pozitifGunler, negatifGunler, ozelSebepler } = body

    // Validation
    if (!doktorAdi || typeof doktorAdi !== 'string' || !doktorAdi.trim()) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Doktor adı gerekli ve boş olamaz' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Array validation
    if (pozitifGunler && !Array.isArray(pozitifGunler)) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Pozitif günler array formatında olmalı' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    if (negatifGunler && !Array.isArray(negatifGunler)) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Negatif günler array formatında olmalı' 
      }), {
        status: 400,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Store initialization
    let store
    try {
      store = getStore('nobet-data')
      console.log('Store initialized successfully')
    } catch (storeError) {
      console.error('Store initialization error:', storeError)
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Database connection failed' 
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    // Get existing preferences
    let preferences
    try {
      const existingData = await store.get('preferences')
      preferences = existingData ? (typeof existingData === 'string' ? JSON.parse(existingData) : existingData) : {}
      console.log('Existing preferences loaded:', Object.keys(preferences))
    } catch (getError) {
      console.error('Error getting existing preferences:', getError)
      preferences = {} // Start fresh if can't load existing
    }
    
    // Update doctor's preferences
    const newPreference = {
      pozitif: pozitifGunler || [],
      negatif: negatifGunler || [],
      ozelSebepler: ozelSebepler || '',
      kayitTarihi: new Date().toISOString()
    }

    preferences[doktorAdi.trim()] = newPreference
    console.log('Updated preferences for:', doktorAdi.trim(), newPreference)

    // Save updated preferences
    try {
      await store.set('preferences', preferences)
      console.log('Preferences saved successfully')
    } catch (saveError) {
      console.error('Error saving preferences:', saveError)
      return new Response(JSON.stringify({ 
        success: false,
        error: 'Database save failed: ' + saveError.message 
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      })
    }

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Tercihler başarıyla kaydedildi',
      data: {
        doktor: doktorAdi.trim(),
        pozitifCount: (pozitifGunler || []).length,
        negatifCount: (negatifGunler || []).length
      }
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
    console.error('Unexpected error in save-preferences:', error)
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Internal server error: ' + error.message 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
} 