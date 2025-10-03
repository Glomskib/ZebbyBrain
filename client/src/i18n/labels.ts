export const L = {
  pastures: "Pastures",
  spoonies: "Spoonies",
  pouch: "Zebby's Pouch",
  askZebby: "Ask Zebby",
  tracker: "Tracker",
  dashboard: "Dashboard",
  settings: "Settings",
} as const;

export type LabelKey = keyof typeof L;
