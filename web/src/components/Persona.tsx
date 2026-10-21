import { useMemo } from "react";
import { createAvatar } from "@dicebear/core";
import { personas } from "@dicebear/collection";

// Deterministic, privacy-friendly avatar: seeded by a hash of the lowercased email (or name),
// so the raw address never ends up in the SVG or a URL. Rendered locally, no network.
function fnv(s: string) {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 + c, 2246822519) >>> 0; }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
export const personaSeed = (email?: string | null, name?: string | null) => fnv((email || "").trim().toLowerCase() || `name:${(name || "?").trim().toLowerCase()}`);

const SIZES = { small: 22, medium: 32, large: 44 } as const;
export function Persona({ email, name, size = "medium" }: { email?: string | null; name?: string | null; size?: keyof typeof SIZES | number }) {
  const px = typeof size === "number" ? size : SIZES[size];
  const seed = personaSeed(email, name);
  const uri = useMemo(() => createAvatar(personas, { seed, size: px * 2, backgroundColor: ["f3e8d6", "efe2cf", "f6dfc8", "e9e2d8", "f1d9c4"], radius: 50 }).toDataUri(), [seed, px]);
  return <img className="persona" src={uri} width={px} height={px} alt={name ? `${name}` : "avatar"} style={{ width: px, height: px, borderRadius: "50%", flex: "none", display: "inline-block" }} />;
}
