import { Bath, Building2, CakeSlice, Clapperboard, Coffee, Dumbbell, Gamepad2, Landmark, MapPin, ShoppingBag, Trees, Utensils, Waves, Wine, type LucideIcon } from "lucide-react";
import { SPOT_KIND_DEFS, SPOT_KIND_DISPLAY_ORDER, SPOT_KIND_OTHER, classifySpotKind, type SpotKindId } from "@/contracts/spotKinds";

export type SpotVisual = {
  id: SpotKindId;
  label: string;
  examples: string;
  image: "museum" | "nature" | "cafe" | null;
  Icon: LucideIcon;
  tone: string;
};

const ICONS: Record<Exclude<SpotKindId, "other">, { Icon: LucideIcon; tone: string; image: SpotVisual["image"] }> = {
  dining: { Icon: Utensils, tone: "coral", image: null },
  sweets: { Icon: CakeSlice, tone: "pink", image: null },
  cafe: { Icon: Coffee, tone: "orange", image: "cafe" },
  museum: { Icon: Landmark, tone: "purple", image: "museum" },
  nature: { Icon: Trees, tone: "green", image: "nature" },
  shopping: { Icon: ShoppingBag, tone: "rose", image: null },
  cinema: { Icon: Clapperboard, tone: "indigo", image: null },
  aquarium: { Icon: Waves, tone: "blue", image: null },
  leisure: { Icon: Gamepad2, tone: "yellow", image: null },
  sports: { Icon: Dumbbell, tone: "mint", image: null },
  spa: { Icon: Bath, tone: "aqua", image: null },
  bar: { Icon: Wine, tone: "plum", image: null },
  town: { Icon: Building2, tone: "slate", image: null },
};

export const spotVisuals: SpotVisual[] = SPOT_KIND_DISPLAY_ORDER.map((id) => ({
  id,
  label: SPOT_KIND_DEFS[id].label,
  examples: SPOT_KIND_DEFS[id].examples,
  ...ICONS[id],
}));

export const fallbackSpotVisual: SpotVisual = {
  id: SPOT_KIND_OTHER.id,
  label: SPOT_KIND_OTHER.label,
  examples: SPOT_KIND_OTHER.examples,
  image: null,
  Icon: MapPin,
  tone: "gray",
};

export function spotVisual(name: string, categories: string[]) {
  const id = classifySpotKind(name, categories);
  return spotVisuals.find((visual) => visual.id === id) ?? fallbackSpotVisual;
}
