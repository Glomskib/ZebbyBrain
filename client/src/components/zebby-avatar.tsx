import zebbyAvatarImage from "@/assets/zebby-avatar.png";
import { useAuth } from "@/hooks/useAuth";

export type ZebbyVariant =
  | "zebby_classic"
  | "zebby_cozy"
  | "zebby_spoonie"
  | "zebby_sparkle"
  | "zebby_sleepy"
  | "zebby_brave";

interface ZebbyAvatarProps {
  size?: "small" | "medium" | "large" | "xl";
  className?: string;
  variant?: ZebbyVariant;
  /** If true (default), falls back to the current user's avatarKey when variant is absent */
  followUser?: boolean;
  showBadge?: boolean;
}

const SIZE_CLASS = {
  small: "w-8 h-8",
  medium: "w-16 h-16",
  large: "w-32 h-32",
  xl: "w-40 h-40",
};

// Costume emoji size (scales with avatar)
const COSTUME_SIZE = {
  small: "text-[10px]",
  medium: "text-base",
  large: "text-3xl",
  xl: "text-4xl",
};

const BADGE_SIZE = {
  small: "text-[10px] w-4 h-4",
  medium: "text-sm w-6 h-6",
  large: "text-lg w-9 h-9",
  xl: "text-xl w-10 h-10",
};

type VariantMeta = {
  label: string;
  emoji: string; // shown in the badge
  ring: string; // outer ring colour classes
  tint: string; // gradient bg
  filter: string; // CSS filter applied to the base PNG
  costumes: Array<{
    /** emoji or glyph rendered as costume overlay */
    char: string;
    /** absolute position classes */
    pos: string;
    /** extra classes (rotation, animation) */
    extra?: string;
  }>;
};

const VARIANT_META: Record<ZebbyVariant, VariantMeta> = {
  zebby_classic: {
    label: "Zebby",
    emoji: "🦓",
    ring: "ring-2 ring-white",
    tint: "bg-white",
    filter: "",
    costumes: [],
  },
  zebby_cozy: {
    label: "Cozy Zebby",
    emoji: "🧣",
    ring: "ring-4 ring-orange-200/70",
    tint: "bg-gradient-to-br from-orange-50 to-rose-50",
    filter: "sepia(0.12) saturate(1.1)",
    costumes: [
      { char: "🧣", pos: "left-[10%] bottom-[6%]", extra: "rotate-[-12deg]" },
    ],
  },
  zebby_spoonie: {
    label: "Spoonie Zebby",
    emoji: "🥄",
    ring: "ring-4 ring-emerald-200/70",
    tint: "bg-gradient-to-br from-emerald-50 to-teal-50",
    filter: "saturate(0.95) brightness(1.02)",
    costumes: [
      { char: "🥄", pos: "right-[6%] top-[44%]", extra: "rotate-[22deg]" },
    ],
  },
  zebby_sparkle: {
    label: "Sparkle Zebby",
    emoji: "✨",
    ring: "ring-4 ring-amber-200/80",
    tint: "bg-gradient-to-br from-amber-50 to-pink-50",
    filter: "saturate(1.2) brightness(1.05)",
    costumes: [
      { char: "✨", pos: "top-[4%] right-[8%]", extra: "animate-pulse" },
      { char: "✨", pos: "bottom-[10%] left-[4%]", extra: "animate-pulse" },
      { char: "✨", pos: "top-[45%] left-[-4%]", extra: "animate-pulse" },
    ],
  },
  zebby_sleepy: {
    label: "Sleepy Zebby",
    emoji: "🌙",
    ring: "ring-4 ring-indigo-200/70",
    tint: "bg-gradient-to-br from-indigo-50 to-violet-50",
    filter: "saturate(0.8) brightness(0.95)",
    costumes: [
      { char: "🌙", pos: "top-[2%] left-[4%]", extra: "rotate-[-18deg]" },
      { char: "💤", pos: "top-[8%] right-[6%]" },
    ],
  },
  zebby_brave: {
    label: "Brave Zebby",
    emoji: "💪",
    ring: "ring-4 ring-rose-300/70",
    tint: "bg-gradient-to-br from-rose-50 to-red-50",
    filter: "saturate(1.15) contrast(1.08)",
    costumes: [
      { char: "⚡", pos: "top-[3%] right-[3%]", extra: "rotate-[18deg]" },
      { char: "💪", pos: "bottom-[4%] left-[4%]" },
    ],
  },
};

function resolveVariant(v?: string | null): ZebbyVariant {
  if (v && v in VARIANT_META) return v as ZebbyVariant;
  return "zebby_classic";
}

export default function ZebbyAvatar({
  size = "medium",
  className = "",
  variant,
  followUser = true,
  showBadge,
}: ZebbyAvatarProps) {
  const { user } = useAuth() as { user?: { avatarKey?: string | null } };
  const resolvedKey = variant
    ? variant
    : followUser
      ? resolveVariant(user?.avatarKey)
      : "zebby_classic";
  const meta = VARIANT_META[resolvedKey];
  const badge = showBadge ?? size !== "small";

  return (
    <div
      className={`${SIZE_CLASS[size]} relative rounded-full flex items-center justify-center shadow-lg border-2 border-white ${meta.ring} ${meta.tint} ${size === "large" || size === "xl" ? "floating-animation" : ""} ${className}`}
      data-testid={`zebby-avatar-${size}`}
      data-avatar-key={resolvedKey}
      aria-label={meta.label}
      title={meta.label}
    >
      <img
        src={zebbyAvatarImage}
        alt={meta.label}
        className={`${SIZE_CLASS[size]} object-contain rounded-full`}
        style={meta.filter ? { filter: meta.filter } : undefined}
      />

      {/* Costume overlays — absolutely positioned within the avatar bounds */}
      {meta.costumes.length > 0 && size !== "small" && (
        <div className="absolute inset-0 pointer-events-none overflow-visible">
          {meta.costumes.map((c, i) => (
            <span
              key={i}
              className={`absolute ${c.pos} ${COSTUME_SIZE[size]} select-none drop-shadow ${c.extra ?? ""}`}
              aria-hidden
            >
              {c.char}
            </span>
          ))}
        </div>
      )}

      {/* Corner badge for identification — hidden for classic since it's the default */}
      {badge && resolvedKey !== "zebby_classic" && (
        <span
          className={`absolute -bottom-1 -right-1 ${BADGE_SIZE[size]} rounded-full bg-white shadow flex items-center justify-center border border-border`}
          aria-hidden
        >
          {meta.emoji}
        </span>
      )}
    </div>
  );
}

export function ZebbyVariantLabel({ variant }: { variant?: string | null }) {
  const key = resolveVariant(variant);
  return <>{VARIANT_META[key].label}</>;
}

export { VARIANT_META as ZEBBY_VARIANTS };
