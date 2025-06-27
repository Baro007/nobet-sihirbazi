import React, { useState } from 'react'
import { Save, Loader2 } from 'lucide-react'

function SubmitButton({ onSave, selectedDoctor, pozitifGunler, negatifGunler, disabled = false }) {
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!selectedDoctor) {
      alert('Lütfen önce bir doktor seçin')
      return
    }

    setSaving(true)
    try {
      await onSave(pozitifGunler, negatifGunler)
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={handleSave}
      disabled={disabled || saving || !selectedDoctor}
      className={`flex items-center justify-center px-6 py-3 rounded-md font-medium transition duration-200 ${
        disabled || saving || !selectedDoctor
          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
          : 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
      }`}
    >
      {saving ? (
        <>
          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          Kaydediliyor...
        </>
      ) : (
        <>
          <Save className="h-4 w-4 mr-2" />
          Tercihlerimi Kaydet
        </>
      )}
    </button>
  )
}

export default SubmitButton 