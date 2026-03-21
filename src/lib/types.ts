export type Vibe = 'Cyberpunk' | 'Noir' | 'Fantasy' | 'Historical';
export type TransitMode = 'transit' | 'car';
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'drinks' | 'snacks';
export type StopType = 'landmark' | 'restaurant' | 'activity';

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

export interface ItineraryStop {
  id: number;
  name: string;
  description: string;
  type: StopType;
  address: string;
  coordinates: string;
  nearbySpots: NearbySpot[];
}

export interface Itinerary {
  title: string;
  summary: string;
  stops: ItineraryStop[];
  routeSecrets?: {
    name: string;
    coordinates: string;
    lookDirection: string;
    loreSnippet: string;
  }[];
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
  | 'log';
