export type Vibe = 'Cyberpunk' | 'Noir' | 'Fantasy' | 'Historical';

export interface ThemeColors {
  accent: string;
  accentLight: string;
  accentGlow: string;
  background: string;
  surface: string;
  border: string;
  muted: string;
  foreground: string;
  glowColor: string;
}

export const themes: Record<Vibe, ThemeColors> = {
  Cyberpunk: {
    accent: '#3b82f6',
    accentLight: 'rgba(59,130,246,0.10)',
    accentGlow: 'rgba(59,130,246,0.30)',
    background: '#000000',
    surface: '#09090B',
    border: '#27272A',
    muted: '#A1A1AA',
    foreground: '#F4F4F5',
    glowColor: 'rgba(59,130,246,0.05)',
  },
  Noir: {
    accent: '#d4a853',
    accentLight: 'rgba(212,168,83,0.10)',
    accentGlow: 'rgba(212,168,83,0.30)',
    background: '#0a0a0a',
    surface: '#111111',
    border: '#2a2a2a',
    muted: '#777777',
    foreground: '#e8e8e8',
    glowColor: 'rgba(212,168,83,0.05)',
  },
  Fantasy: {
    accent: '#a855f7',
    accentLight: 'rgba(168,85,247,0.10)',
    accentGlow: 'rgba(168,85,247,0.30)',
    background: '#0c0a14',
    surface: '#141020',
    border: '#2d2545',
    muted: '#9b8ec4',
    foreground: '#e8e0f0',
    glowColor: 'rgba(168,85,247,0.05)',
  },
  Historical: {
    accent: '#d97706',
    accentLight: 'rgba(217,119,6,0.10)',
    accentGlow: 'rgba(217,119,6,0.30)',
    background: '#0f0d08',
    surface: '#1a170f',
    border: '#3d3520',
    muted: '#b8a88a',
    foreground: '#f0e6d0',
    glowColor: 'rgba(217,119,6,0.05)',
  },
};
