// Product photography for Static Supply, served from /products. The photos are
// from Pexels and Unsplash under their free licenses; see public/products/CREDITS.md.
import type { CSSProperties } from "react";

const PHOTOS: Record<string, string> = {
  "hoodie-night-shift": "/products/night-shift-hoodie.jpg",
  "tee-static": "/products/static-tee.jpg",
  "cap-signal": "/products/signal-cap.jpg",
};

export const DROP_HERO = { src: "/products/night-shift-hoodie-hero.jpg", alt: "A man in the black Night Shift Hoodie on a street at night" };

// The photo sits next to the product's name everywhere, so it's decorative unless an alt is given.
export function ProductPhoto({ productId, alt = "", style }: { productId: string | undefined; alt?: string; style?: CSSProperties }) {
  const src = productId ? PHOTOS[productId] : undefined;
  const base: CSSProperties = { display: "block", flex: "none", objectFit: "cover", background: "#ECEAE4", ...style };
  return src ? (
    <img src={src} alt={alt} loading="lazy" decoding="async" style={base} />
  ) : (
    <div aria-hidden="true" style={{ ...base, background: "repeating-linear-gradient(135deg,#ECEAE4 0 6px,#F4F3EF 6px 12px)" }} />
  );
}
