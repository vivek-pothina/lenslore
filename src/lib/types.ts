export type Vibe = 'Cyberpunk' | 'Noir' | 'Fantasy' | 'Historical';
export type TransitMode = 'transit' | 'car';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'drinks' | 'snacks';
export type StopType = 'landmark' | 'restaurant' | 'activity';
export type LookDirection = 'left' | 'right' | 'up' | 'down' | 'around';
export type HighlightType = 'monument' | 'statue' | 'mural' | 'park' | 'building' | 'landmark';
export type NarrationDuration = 'short' | 'long';

export const CITIES = ['New York City', 'Boston'] as const;
export type City = (typeof CITIES)[number];

export const MEALS: { value: MealType; label: string; icon: string }[] = [
  { value: 'breakfast', label: 'Breakfast', icon: '☕' },
  { value: 'lunch', label: 'Lunch', icon: '🍽️' },
  { value: 'dinner', label: 'Dinner', icon: '🍷' },
  { value: 'drinks', label: 'Drinks', icon: '🍸' },
  { value: 'snacks', label: 'Snacks', icon: '🧁' },
];

export interface JourneyConfig {
  vibe: Vibe;
  city: string;
  groupSize: number;
  numStops: number;
  transitMode: TransitMode;
  meals: MealType[];
  customPrompt: string;
}

export interface NearbySpot {
  name: string;
  type: StopType;
  shortDescription: string;
}

export interface NarrationSnippet {
  script: string;
  lookDirection: LookDirection;
  trivia?: string;
  durationHint: NarrationDuration;
}

export interface RouteHighlight {
  name: string;
  coordinates: string;
  lookDirection: LookDirection;
  type: HighlightType;
  narration: NarrationSnippet;
}

export interface ItineraryStop {
  id: number;
  name: string;
  description: string;
  type: StopType;
  address: string;
  coordinates: string;
  nearbySpots: NearbySpot[];
  narration?: NarrationSnippet;
}

export interface Itinerary {
  title: string;
  summary: string;
  stops: ItineraryStop[];
  routeHighlights?: RouteHighlight[];
  routeSecrets?: {
    name: string;
    coordinates: string;
    lookDirection: string;
    loreSnippet: string;
  }[];
  transitMode?: TransitMode;
}

export interface StopProgress {
  stopId: number;
  arrived: boolean;
  capturedImage: string | null;
  lore: string;
  audioUrl: string | null;
}

export interface JourneyProgress {
  currentStopIndex: number;
  stopProgress: StopProgress[];
  startTime: number | null;
  completedAt: number | null;
}

export type AppStep =
  | 'welcome'
  | 'planning'
  | 'preview'
  | 'hunt'
  | 'analyzing'
  | 'lore'
  | 'exploration'
  | 'log'
  | 'narration';
