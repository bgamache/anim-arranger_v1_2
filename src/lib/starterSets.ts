// src/lib/starterSets.ts
// Starter ACTION sets used by the library/gallery.
// Added `characterSet` on each set so CSV export can label rows correctly.

export const STARTER_ACTION_SETS = {
  Strider: {
    id: "Strider",
    name: "Strider - Actions",
    characterSet: "Strider",
    items: [
      // NOTE: keep/tweak as needed to match your assets
      { id: "walk", name: "Walk", type: "bounce", duration: 2.0, image: "walk.png", description: "Walk cycle" },
      { id: "jump", name: "Jump", type: "elastic", duration: 1.2, image: "jump.png", description: "Jump action" },
    ],
  },

  Brave: {
    id: "Brave",
    name: "Brave - Actions",
    characterSet: "Brave",
    items: [
      { id: "Arm_Finger_PointHead_01", name: "Arm_Finger_PointHead_01", type: "point", duration: 0.8, image: "Arm_Finger_PointHead_01.png" },
      { id: "Arm_PointUp_02", name: "Arm_PointUp_02", type: "point", duration: 0.8, image: "Arm_PointUp_02.png" },
      { id: "Arm_Touch_Chest_01", name: "Arm_Touch_Chest_01", type: "arm", duration: 0.8, image: "Arm_Touch_Chest_01.png" },
      { id: "Arms_Profess_Intent_01", name: "Arms_Profess_Intent_01", type: "arms", duration: 0.8, image: "Arms_Profess_Intent_01.png" },
      { id: "Arms_Strong_01", name: "Arms_Strong_01", type: "arms", duration: 0.8, image: "Arms_Strong_01.png" },
      { id: "Arm_PumpDown_01", name: "Arm_PumpDown_01", type: "arm", duration: 0.8, image: "Arm_PumpDown_01.png" },
    ],
  },

  Dash: {
    id: "Dash",
    name: "Dash - Actions",
    characterSet: "Dash",
    items: [
      { id: "zoom-in", name: "Zoom In", type: "zoom", duration: 0.8, image: "zoom_in.png" },
      { id: "zoom-out", name: "Zoom Out", type: "zoom", duration: 0.8, image: "zoom_out.png" },
    ],
  },
} as const;

// (Optional helpers — safe to keep; nothing else depends on them)
export type StarterSetsDict = typeof STARTER_ACTION_SETS;
export type StarterSetKey = keyof StarterSetsDict;

export function getCharacterSetForActionId(actionId: string): string | undefined {
  for (const setKey in STARTER_ACTION_SETS) {
    const set = (STARTER_ACTION_SETS as any)[setKey];
    const label = set.characterSet || set.id || set.name;
    if (Array.isArray(set.items) && set.items.some((it: any) => it?.id === actionId)) {
      return String(label);
    }
  }
  return undefined;
}
