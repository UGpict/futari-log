import { Bath, Building2, CakeSlice, Clapperboard, Coffee, Dumbbell, Gamepad2, Landmark, MapPin, ShoppingBag, Trees, Utensils, Waves, Wine, type LucideIcon } from "lucide-react";

export type SpotVisual = { id: string; label: string; examples: string; pattern: RegExp; image: "museum" | "nature" | "cafe" | null; Icon: LucideIcon; tone: string };

export const spotVisuals: SpotVisual[] = [
  { id: "dining", label: "食事", examples: "レストラン・寿司・焼肉・食堂", pattern: /レストラン|飲食店|料理|食堂|寿司|焼肉|居酒屋|ランチ|ディナー|food|restaurant/i, image: null, Icon: Utensils, tone: "coral" },
  { id: "sweets", label: "スイーツ", examples: "ケーキ・パフェ・パン屋", pattern: /スイーツ|ケーキ|デザート|パフェ|菓子|パン|bakery|dessert/i, image: null, Icon: CakeSlice, tone: "pink" },
  { id: "cafe", label: "カフェ", examples: "カフェ・喫茶・コーヒー", pattern: /カフェ|喫茶|コーヒー|coffee|cafe/i, image: "cafe", Icon: Coffee, tone: "orange" },
  { id: "museum", label: "アート・展示", examples: "美術館・博物館・ギャラリー", pattern: /美術館|博物館|展示|museum|gallery/i, image: "museum", Icon: Landmark, tone: "purple" },
  { id: "nature", label: "散策", examples: "公園・森・庭園・散歩", pattern: /公園|森|庭園|散歩|park|garden/i, image: "nature", Icon: Trees, tone: "green" },
  { id: "shopping", label: "買い物", examples: "ショッピング・雑貨・商業施設", pattern: /ショッピング|買い物|雑貨|百貨店|商業施設|shopping|store/i, image: null, Icon: ShoppingBag, tone: "rose" },
  { id: "cinema", label: "映画・舞台", examples: "映画館・劇場・演劇", pattern: /映画|シネマ|劇場|演劇|cinema|theater/i, image: null, Icon: Clapperboard, tone: "indigo" },
  { id: "aquarium", label: "水族館", examples: "水族館・海の施設", pattern: /水族館|aquarium/i, image: null, Icon: Waves, tone: "blue" },
  { id: "leisure", label: "遊び・体験", examples: "遊園地・ゲーム・ものづくり", pattern: /遊園地|テーマパーク|ゲーム|体験|ものづくり|レジャー|amusement/i, image: null, Icon: Gamepad2, tone: "yellow" },
  { id: "sports", label: "スポーツ", examples: "運動・ボウリング・ジム", pattern: /スポーツ|運動|ボウリング|ジム|sports/i, image: null, Icon: Dumbbell, tone: "mint" },
  { id: "spa", label: "温泉・スパ", examples: "温泉・銭湯・サウナ", pattern: /温泉|銭湯|スパ|サウナ|spa/i, image: null, Icon: Bath, tone: "aqua" },
  { id: "bar", label: "バー・お酒", examples: "バー・ワイン・酒場", pattern: /バー|ワイン|酒場|bar|wine/i, image: null, Icon: Wine, tone: "plum" },
  { id: "town", label: "街・建物", examples: "街歩き・展望台・建築", pattern: /街|展望台|建築|ビル|town|building/i, image: null, Icon: Building2, tone: "slate" },
];

export const fallbackSpotVisual = { id: "other", label: "立ち寄りスポット", examples: "その他", pattern: /(?:)/, image: null, Icon: MapPin, tone: "gray" } satisfies SpotVisual;

export function spotVisual(name: string, categories: string[]) {
  const text = `${name} ${categories.join(" ")}`;
  return spotVisuals.find((visual) => visual.pattern.test(text)) ?? fallbackSpotVisual;
}
