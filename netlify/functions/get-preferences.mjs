import { getStore } from '@netlify/blobs'

export default async (request, context) => {
  // CORS preflight handler
  if (request.method === 'OPTIONS') {
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

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Method not allowed. Only GET requests are supported.' 
    }), {
      status: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }

  try {
    console.log('Starting get-preferences function...')
    
    const store = getStore('nobet-data')
    const rawPreferences = await store.get('preferences')
    
    // Parse data if it's a string
    let preferences = {}
    if (rawPreferences) {
      preferences = typeof rawPreferences === 'string' ? JSON.parse(rawPreferences) : rawPreferences
    }
    
    console.log('Preferences loaded successfully, doctors count:', Object.keys(preferences).length)
    
    return new Response(JSON.stringify(preferences), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  } catch (error) {
    console.error('Get preferences error:', error)
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to load preferences: ' + error.message 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
} 