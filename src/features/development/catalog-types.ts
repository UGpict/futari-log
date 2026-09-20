export type ComponentEntry = {
  name: string;
  file: string;
  kind: string;
  usages: { file: string; count: number }[];
};
export type CatalogData = {
  inventory: ComponentEntry[];
  literalColors: { color: string; count: number; files: string[] }[];
  colorTokens: { token: string; value: string }[];
};
