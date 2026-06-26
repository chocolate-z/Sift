import { defineStore } from 'pinia'
import { ref } from 'vue'
import { CURRENT_IR_VERSION } from '@sift/core-ir'

/** App-wide status surfaced in the bottom status bar. */
export const useAppStore = defineStore('app', () => {
  const engineStatus = ref<'ready' | 'busy'>('ready')
  const rulesLoaded = ref(12)
  const irVersion = CURRENT_IR_VERSION
  return { engineStatus, rulesLoaded, irVersion }
})
