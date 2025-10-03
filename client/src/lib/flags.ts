export const FF_RAG =
  (import.meta.env.VITE_FF_RAG ?? "false").toString().toLowerCase() === "true";

export const FF_GROUPS =
  (import.meta.env.VITE_FF_GROUPS ?? "false").toString().toLowerCase() === "true";

export const FF_HERD =
  (import.meta.env.VITE_FF_HERD ?? "false").toString().toLowerCase() === "true";

export const FF_MOBILE_UX =
  (import.meta.env.VITE_FF_MOBILE_UX ?? "false").toString().toLowerCase() === "true";

export const FF_REWARDS =
  (import.meta.env.VITE_FF_REWARDS ?? "false").toString().toLowerCase() === "true";

export const FF_REFERRALS =
  (import.meta.env.VITE_FF_REFERRALS ?? "false").toString().toLowerCase() === "true";
