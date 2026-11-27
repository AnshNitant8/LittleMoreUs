import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach } from 'vitest'
import { setAiClient } from '../services/gemini'

/** Tests never call the real Gemini API. Individual tests install fakes. */
export const offlineAi = {
  available: false,
  generateStory: () => Promise.reject(new Error('no_api_key')),
  classifyDistress: () => Promise.reject(new Error('no_api_key')),
}

beforeEach(() => setAiClient(offlineAi))
afterEach(() => cleanup())
window.scrollTo = () => {}
