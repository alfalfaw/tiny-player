import { defineStore } from 'pinia'
import { ref } from 'vue'
import en from '@/locales/en'
import zh from '@/locales/zh'

const locales = { en, zh }

export const useLocaleStore = defineStore(
  'locale',
  () => {
    const locale = ref('en')

    function detect() {
      const lang = navigator.language || ''
      if (lang.startsWith('zh')) return 'zh'
      return 'en'
    }

    function init() {
      // 如果已有持久化的用户选择，不覆盖
      try {
        const stored = localStorage.getItem('locale')
        if (stored) {
          const parsed = JSON.parse(stored)
          if (parsed.locale && locales[parsed.locale]) return
        }
      } catch {}
      locale.value = detect()
    }

    function setLocale(lang) {
      if (locales[lang]) locale.value = lang
    }

    function t(key, params = {}) {
      const keys = key.split('.')
      let value = locales[locale.value]
      for (const k of keys) {
        if (value == null) return key
        value = value[k]
      }
      if (typeof value === 'string') {
        return value.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`)
      }
      return value ?? key
    }

    function relativeTime(timestamp) {
      if (!timestamp) return ''
      const diff = Date.now() - timestamp

      if (diff < 60000) return t('time.justNow')
      if (diff < 3600000) return `${Math.floor(diff / 60000)} ${t('time.minutesAgo')}`
      if (diff < 86400000) return `${Math.floor(diff / 3600000)} ${t('time.hoursAgo')}`
      if (diff < 604800000) return `${Math.floor(diff / 86400000)} ${t('time.daysAgo')}`

      return new Date(timestamp).toLocaleDateString(
        locale.value === 'zh' ? 'zh-CN' : 'en-US',
        { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' },
      )
    }

    return {
      locale,
      init,
      setLocale,
      t,
      relativeTime,
    }
  },
  {
    persist: {
      paths: ['locale'],
    },
  },
)
