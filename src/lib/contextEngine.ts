// Grounded Product Context Engine — stores user context and performs lightweight presets inference.
// No faked semantic intelligence — just deterministic keyword matching on the launch sentence description.

export type LaunchGoal =
  | 'feature-launch'
  | 'beta'
  | 'product-launch'
  | 'redesign'
  | 'growth-update'

export type ProductTone =
  | 'technical'
  | 'founder'
  | 'minimal'
  | 'bold'

export type ProductType =
  | 'developer-tool'
  | 'saas'
  | 'consumer-app'
  | 'ai-product'
  | 'fintech'
  | 'design-tool'
  | 'analytics'
  | 'other'

export interface ProductContext {
  productName: string
  shortDescription: string
  audience?: string
  launchGoal?: LaunchGoal
  tone?: ProductTone
  productType?: ProductType
  primaryCTA?: string
}

const DEV_KEYWORDS = ['api', 'developer', 'sdk', 'cli', 'library', 'code', 'git', 'infra', 'docker', 'kubernetes', 'compiler', 'backend']
const AI_KEYWORDS = ['ai', 'model', 'llm', 'intelligence', 'gpt', 'assistant', 'generate', 'chat', 'copilot', 'agent']
const FINTECH_KEYWORDS = ['billing', 'payment', 'revenue', 'charge', 'invoice', 'stripe', 'transaction', 'fintech', 'finance']
const ANALYTICS_KEYWORDS = ['analytics', 'dashboard', 'metric', 'chart', 'report', 'retention', 'tracking', 'query', 'sql']
const DESIGN_KEYWORDS = ['design', 'figma', 'visual', 'editor', 'video', 'photo', 'canvas', 'beautifier', 'screenshot']
const CONSUMER_KEYWORDS = ['app', 'consumer', 'mobile', 'social', 'lifestyle', 'workout', 'game', 'fitness', 'travel']
const SAAS_KEYWORDS = ['saas', 'platform', 'b2b', 'workflow', 'crm', 'collaboration', 'team', 'enterprise', 'productivity', 'project']

// Strip words after negation markers so "not a SaaS" won't match SaaS keywords
function stripNegations(text: string): string {
  return text.replace(
    /\b(?:not?|never|without|no|isn'?t|aren'?t|don'?t|doesn'?t|won'?t)\s+(?:a(?:n)?\s+)?(?:\w+\s*){1,3}/gi,
    ' '
  )
}

export function inferPresetsFromDescription(description: string): {
  productType: ProductType
  tone: ProductTone
  launchGoal: LaunchGoal
} {
  const rawDesc = description.toLowerCase()
  // Use negation-stripped version for type/keyword matching to avoid false positives
  // e.g. "NOT a SaaS, we are a mobile game" should match consumer-app, not saas
  const desc = stripNegations(rawDesc)
  let productType: ProductType = 'other'
  let tone: ProductTone = 'founder'
  let launchGoal: LaunchGoal = 'product-launch'

  // 1. Infer Product Type
  if (DEV_KEYWORDS.some(k => desc.includes(k))) {
    productType = 'developer-tool'
    tone = 'technical'
  } else if (AI_KEYWORDS.some(k => desc.includes(k))) {
    productType = 'ai-product'
    tone = 'bold'
  } else if (FINTECH_KEYWORDS.some(k => desc.includes(k))) {
    productType = 'fintech'
    tone = 'minimal'
  } else if (ANALYTICS_KEYWORDS.some(k => desc.includes(k))) {
    productType = 'analytics'
    tone = 'minimal'
  } else if (DESIGN_KEYWORDS.some(k => desc.includes(k))) {
    productType = 'design-tool'
    tone = 'bold'
  } else if (CONSUMER_KEYWORDS.some(k => desc.includes(k))) {
    productType = 'consumer-app'
    tone = 'founder'
  } else if (SAAS_KEYWORDS.some(k => desc.includes(k))) {
    productType = 'saas'
    tone = 'founder'
  }

  // 2. Infer Launch Goal — use raw description (negations don't typically affect launch intent words)
  if (rawDesc.includes('beta') || rawDesc.includes('early access') || rawDesc.includes('waitlist')) {
    launchGoal = 'beta'
  } else if (rawDesc.includes('redesign') || rawDesc.includes('rebrand') || rawDesc.includes('revamp')) {
    launchGoal = 'redesign'
  } else if (rawDesc.includes('feature') || rawDesc.includes('shipped') || rawDesc.includes('added') || rawDesc.includes('new version')) {
    launchGoal = 'feature-launch'
  } else if (rawDesc.includes('update') || rawDesc.includes('improved') || rawDesc.includes('announcement')) {
    launchGoal = 'growth-update'
  }

  return { productType, tone, launchGoal }
}
