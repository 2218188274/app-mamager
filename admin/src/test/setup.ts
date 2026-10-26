import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
afterEach(cleanup)
Object.defineProperty(window, 'matchMedia', { writable: true, value: vi.fn().mockImplementation((query: string) => ({ matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn() })) })
class Observer { observe() {} unobserve() {} disconnect() {} }
globalThis.ResizeObserver = Observer
// jsdom has no layout engine or pseudo-element styles; Ant Design measures both.
const computedStyle = window.getComputedStyle.bind(window)
window.getComputedStyle = element => computedStyle(element)
