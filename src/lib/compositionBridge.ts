// Story ↔ Editor bridge — module-level singleton that survives React navigation.
// File objects and data URLs are used (not blob URLs, which die on component unmount).

import type { StoryRole, FrameType } from './composition'

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface BridgeSlideData {
  slideIndex: number
  slideId: string
  role: StoryRole
  roleLabel: string
  title: string
  callout: string
  selection: { x: number; y: number; w: number; h: number } | null
  imageDataUrl: string  // stable canvas data URL (not blob URL — survives unmount)
}

export interface StorySessionSnapshot {
  intentId: string
  themeIndex: number
  frameType: FrameType
  padding: number
  slides: Array<{
    id: string
    assetId: string
    role: StoryRole
    roleLabel: string
    title: string
    callout: string
    selection: { x: number; y: number; w: number; h: number } | null
    userDefinedPosition?: number
  }>
  assetFiles: Record<string, File>      // File objects survive component unmount
  assetDataUrls: Record<string, string> // data URLs for stable re-rendering
}

export interface BridgeData {
  sourceSlide: BridgeSlideData
  session: StorySessionSnapshot
  timestamp: number
}

// ─── Module-level singleton ───────────────────────────────────────────────────

let bridgeData: BridgeData | null = null
let returnData: BridgeSlideData | null = null

// ─── Story → Editor ───────────────────────────────────────────────────────────

export function saveBridgeToEditor(data: BridgeData): void {
  bridgeData = data
  returnData = null
}

export function loadBridgeFromStory(): BridgeData | null {
  return bridgeData
}

export function hasBridgeData(): boolean {
  return bridgeData !== null
}

// ─── Editor → Story ───────────────────────────────────────────────────────────

export function saveReturnToStory(data: BridgeSlideData): void {
  returnData = data
}

export function loadReturnFromEditor(): BridgeSlideData | null {
  return returnData
}

export function hasReturnData(): boolean {
  return returnData !== null
}

export function clearBridge(): void {
  bridgeData = null
  returnData = null
}

export function clearReturn(): void {
  returnData = null
}
