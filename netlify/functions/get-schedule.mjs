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
    console.log('Starting get-schedule function...')
    
    const store = getStore('nobet-data')
    const rawSchedule = await store.get('schedule')
    
    // Parse data if it's a string
    let schedule = {}
    if (rawSchedule) {
      schedule = typeof rawSchedule === 'string' ? JSON.parse(rawSchedule) : rawSchedule
    }
    
    console.log('Schedule loaded successfully, days count:', Object.keys(schedule).length)
    
    return new Response(JSON.stringify(schedule), {
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    })
  } catch (error) {
    console.error('Get schedule error:', error)
    return new Response(JSON.stringify({ 
      success: false,
      error: 'Failed to load schedule: ' + error.message 
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    })
  }
} 