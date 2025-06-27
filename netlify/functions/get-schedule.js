const { getStore } = require('@netlify/blobs')

exports.handler = async (event, context) => {
  // CORS preflight handler
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '3600'
      },
      body: ''
    }
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false,
        error: 'Method not allowed. Only GET requests are supported.' 
      })
    }
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
    
    return {
      statusCode: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: JSON.stringify(schedule)
    }
  } catch (error) {
    console.error('Get schedule error:', error)
    return {
      statusCode: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        success: false,
        error: 'Failed to load schedule: ' + error.message 
      })
    }
  }
} 