// Thrift Resale App — Client-side data store (localStorage for prototype)
// Swap this out for Supabase later

import { ThriftItem } from "./thrift-types";

const STORAGE_KEY = "thrift_items";

function generateSKU(): string {
  const now = new Date();
  const datePart = `${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, "0")}`;
  const randPart = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `TR-${datePart}-${randPart}`;
}

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() :
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
}

export function getAllItems(): ThriftItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as ThriftItem[];
  } catch {
    return [];
  }
}

export function getItem(id: string): ThriftItem | null {
  return getAllItems().find((item) => item.id === id) || null;
}

export function createItem(partial: Partial<ThriftItem>): ThriftItem {
  const now = new Date().toISOString();
  const item: ThriftItem = {
    id: generateId(),
    sku: generateSKU(),
    title: partial.title || "Untitled Item",
    description: partial.description || "",
    aiAnalysis: partial.aiAnalysis || null,
    category: partial.category || "Other",
    eraStyle: partial.eraStyle || "",
    materials: partial.materials || [],
    condition: partial.condition || "good",
    dimensions: partial.dimensions || {},
    purchasePrice: partial.purchasePrice || 0,
    listingPrice: partial.listingPrice || null,
    soldPrice: partial.soldPrice || null,
    storageLocation: partial.storageLocation || "",
    status: partial.status || "intake",
    photos: partial.photos || [],
    listingUrls: partial.listingUrls || [],
    generatedListing: partial.generatedListing || null,
    createdAt: now,
    updatedAt: now,
    soldAt: null,
    shippedAt: null,
  };
  const items = getAllItems();
  items.unshift(item);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  return item;
}

export function updateItem(id: string, updates: Partial<ThriftItem>): ThriftItem | null {
  const items = getAllItems();
  const idx = items.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  items[idx] = { ...items[idx], ...updates, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  return items[idx];
}

export function deleteItem(id: string): boolean {
  const items = getAllItems();
  const filtered = items.filter((item) => item.id !== id);
  if (filtered.length === items.length) return false;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  return true;
}

export function getStats() {
  const items = getAllItems();
  const totalItems = items.length;
  const listed = items.filter((i) => i.status === "listed").length;
  const sold = items.filter((i) => i.status === "sold" || i.status === "shipped").length;
  const totalInvested = items.reduce((sum, i) => sum + (i.purchasePrice || 0), 0);
  const totalRevenue = items.reduce((sum, i) => sum + (i.soldPrice || 0), 0);
  const totalListedValue = items
    .filter((i) => i.status === "listed")
    .reduce((sum, i) => sum + (i.listingPrice || 0), 0);
  return { totalItems, listed, sold, totalInvested, totalRevenue, totalListedValue, profit: totalRevenue - totalInvested };
}
