export interface Product {
  id: string;
  name: string;
  price: string;
  currency: "USD";
  stock: number;
  limitedDrop: boolean;
}

// Demo store: a small streetwear brand with one limited drop.
export const products: Product[] = [
  { id: "hoodie-night-shift", name: "Night Shift Hoodie", price: "68.00", currency: "USD", stock: 50, limitedDrop: true },
  { id: "tee-static", name: "Static Tee", price: "32.00", currency: "USD", stock: 200, limitedDrop: false },
  { id: "cap-signal", name: "Signal Cap", price: "28.00", currency: "USD", stock: 120, limitedDrop: false },
];

export function findProduct(id: string): Product | undefined {
  return products.find((p) => p.id === id);
}

export function searchProducts(query?: string): Product[] {
  const words = query?.toLowerCase().split(/\s+/).filter(Boolean) ?? [];
  if (words.length === 0) return products;
  return products.filter((p) => words.every((w) => p.name.toLowerCase().includes(w)));
}
