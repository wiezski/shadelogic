// Thrift Resale App — Core Types

export interface ThriftItem {
  id: string;
  sku: string;
  title: string;
  description: string;
  aiAnalysis: AIAnalysis | null;
  category: string;
  eraStyle: string;
  materials: string[];
  condition: "excellent" | "good" | "fair" | "poor" | "as-is";
  dimensions: { height?: number; width?: number; depth?: number; weight?: number };
  purchasePrice: number;
  listingPrice: number | null;
  soldPrice: number | null;
  storageLocation: string; // e.g. "A3-Left"
  status: "intake" | "photographed" | "listed" | "sold" | "shipped";
  photos: string[]; // base64 data URLs for prototype
  listingUrls: { platform: string; url: string }[];
  generatedListing: GeneratedListing | null;
  createdAt: string;
  updatedAt: string;
  soldAt: string | null;
  shippedAt: string | null;
}

export interface AIAnalysis {
  itemType: string;
  eraStyle: string;
  materials: string[];
  condition: string;
  makerMarks: string;
  estimatedValue: { low: number; high: number };
  keywords: string[];
  suggestedCategory: string;
  confidence: number;
  notes: string;
}

export interface GeneratedListing {
  title: string;
  description: string;
  keywords: string[];
  suggestedPrice: { low: number; mid: number; high: number };
  platform: "ebay" | "etsy" | "general";
  generatedAt: string;
}

export type ItemStatus = ThriftItem["status"];
export type ItemCondition = ThriftItem["condition"];

export const CATEGORIES = [
  "Lighting", "Vases & Vessels", "Mirrors", "Frames",
  "Furniture", "Tableware", "Figurines", "Textiles",
  "Art & Prints", "Clocks", "Barware", "Jewelry",
  "Books & Ephemera", "Garden & Outdoor", "Other"
] as const;

export const ERA_STYLES = [
  "Art Deco (1920s-1930s)", "Mid-Century Modern (1940s-1960s)",
  "Hollywood Regency", "Victorian", "Art Nouveau",
  "Brutalist", "Postmodern (1970s-1980s)", "Bohemian",
  "Industrial", "French Country", "Chinoiserie",
  "Danish Modern", "Memphis", "Other"
] as const;

export const STORAGE_ROWS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
export const STORAGE_SHELVES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
