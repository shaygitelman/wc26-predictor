export interface AvatarDef {
  id:       string
  emoji:    string
  label:    string
  gradient: string   // CSS gradient — safe in inline style
}

export const AVATARS: AvatarDef[] = [
  // ── Football
  { id: 'pitch',     emoji: '⚽', label: 'Pitch',    gradient: 'linear-gradient(135deg,#16a34a 0%,#14532d 100%)' },
  { id: 'trophy',    emoji: '🏆', label: 'Trophy',   gradient: 'linear-gradient(135deg,#d97706 0%,#78350f 100%)' },
  { id: 'star',      emoji: '⭐', label: 'Star',     gradient: 'linear-gradient(135deg,#1d4ed8 0%,#1e3a8a 100%)' },
  { id: 'fire',      emoji: '🔥', label: 'Fire',     gradient: 'linear-gradient(135deg,#dc2626 0%,#7f1d1d 100%)' },
  // ── World Cup energy
  { id: 'globe',     emoji: '🌍', label: 'Globe',    gradient: 'linear-gradient(135deg,#0891b2 0%,#164e63 100%)' },
  { id: 'target',    emoji: '🎯', label: 'Precision',gradient: 'linear-gradient(135deg,#7c3aed 0%,#4c1d95 100%)' },
  { id: 'lightning', emoji: '⚡', label: 'Lightning',gradient: 'linear-gradient(135deg,#ca8a04 0%,#713f12 100%)' },
  { id: 'lion',      emoji: '🦁', label: 'Champion', gradient: 'linear-gradient(135deg,#b45309 0%,#451a03 100%)' },
  // ── Premium
  { id: 'diamond',   emoji: '💎', label: 'Diamond',  gradient: 'linear-gradient(135deg,#1e293b 0%,#0f172a 100%)' },
  { id: 'moon',      emoji: '🌙', label: 'Moon',     gradient: 'linear-gradient(135deg,#6d28d9 0%,#2e1065 100%)' },
  { id: 'wave',      emoji: '🌊', label: 'Wave',     gradient: 'linear-gradient(135deg,#0369a1 0%,#0c4a6e 100%)' },
  { id: 'medal',     emoji: '🏅', label: 'Medal',    gradient: 'linear-gradient(135deg,#be123c 0%,#4c0519 100%)' },
  // ── Minimal
  { id: 'leaf',      emoji: '🌿', label: 'Nature',   gradient: 'linear-gradient(135deg,#059669 0%,#064e3b 100%)' },
  { id: 'rocket',    emoji: '🚀', label: 'Rocket',   gradient: 'linear-gradient(135deg,#ea580c 0%,#431407 100%)' },
  { id: 'crown',     emoji: '👑', label: 'Crown',    gradient: 'linear-gradient(135deg,#a16207 0%,#451a03 100%)' },
  { id: 'comet',     emoji: '💫', label: 'Comet',    gradient: 'linear-gradient(135deg,#475569 0%,#1e293b 100%)' },
]

export function getAvatarById(id: string): AvatarDef | undefined {
  return AVATARS.find(a => a.id === id)
}
