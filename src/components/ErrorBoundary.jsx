import React from 'react'
import { AlertTriangle, RefreshCw, Home, Database } from 'lucide-react'

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error) {
    // Bir sonraki render'da fallback UI'yi göstermek için state'i güncelle
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Hata detaylarını logla
    console.error('ErrorBoundary yakaladı:', error, errorInfo)
    this.setState({
      error: error,
      errorInfo: errorInfo
    })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-red-50 via-orange-50 to-yellow-50 flex items-center justify-center p-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg border border-red-200 p-8 text-center">
              <div className="bg-red-100 rounded-full p-4 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
                <AlertTriangle className="h-10 w-10 text-red-600" />
              </div>
              
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                🚨 Bir Hata Oluştu
              </h1>
              
              <p className="text-gray-600 mb-6 leading-relaxed">
                NöbetSihirbazı'nda beklenmeyen bir hata oluştu. Bu durumu çözmek için aşağıdaki adımları deneyebilirsiniz.
              </p>

              {/* Hata Detayları (Sadece Development'ta) */}
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 text-left">
                  <h3 className="font-bold text-gray-900 mb-2">🔧 Geliştirici Bilgisi:</h3>
                  <pre className="text-sm text-gray-700 overflow-auto max-h-40">
                    {this.state.error.toString()}
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}

              {/* Çözüm Önerileri */}
              <div className="grid md:grid-cols-2 gap-4 mb-8 text-left">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-bold text-blue-900 mb-2 flex items-center">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    🔄 Sayfayı Yenileyin
                  </h4>
                  <p className="text-blue-700 text-sm">
                    Çoğu zaman sayfa yenilemesi sorunu çözer. F5 tuşuna basın veya tarayıcınızın yenile butonunu kullanın.
                  </p>
                </div>
                
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-bold text-green-900 mb-2 flex items-center">
                    <Database className="h-4 w-4 mr-2" />
                    🌐 Bağlantıyı Kontrol Edin
                  </h4>
                  <p className="text-green-700 text-sm">
                    İnternet bağlantınızı ve Supabase servisinin durumunu kontrol edin.
                  </p>
                </div>
              </div>

              {/* Aksiyon Butonları */}
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  onClick={() => window.location.reload()}
                  className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 transform hover:scale-105 shadow-lg"
                >
                  <RefreshCw className="h-5 w-5 mr-2" />
                  Sayfayı Yenile
                </button>
                
                <button
                  onClick={() => {
                    // Local storage'ı temizle ve ana sayfaya git
                    localStorage.clear()
                    window.location.href = '/'
                  }}
                  className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 transform hover:scale-105 shadow-lg"
                >
                  <Home className="h-5 w-5 mr-2" />
                  Ana Sayfaya Dön
                </button>
              </div>

              {/* İletişim Bilgisi */}
              <div className="mt-8 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">
                  🆘 Sorun devam ederse tarayıcınızın geliştirici araçlarını (F12) açıp hata mesajlarını kontrol edin.
                  Supabase bağlantı sorunu olabilir.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary 