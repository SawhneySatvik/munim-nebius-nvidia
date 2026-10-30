// Loads a cut's clock in Node (audio scripts, tools, tests). The 4:00 Cup and FalkorDB clocks are edits of the 2:55
// Cup clock (clock-edit.js), so they need it loaded first; SCRIPTS lists the browser order the roots use too.
export const CUTS = ["cup", "cup4", "falkor", "full", "nebius"];
export const SCRIPTS = {
  cup: ["timing-cup.js"],
  full: ["timing-full.js"],
  cup4: ["timing-cup.js", "clock-edit.js", "timing-cup4.js"],
  falkor: ["timing-cup.js", "clock-edit.js", "timing-falkor.js"],
  // The Nebius cut (NB-film) has its own clock and scenes, built on real screens (assets/screens/nebius).
  nebius: ["timing-nebius.js"],
};
export async function loadClock(cut) {
  if (!CUTS.includes(cut)) throw new Error(`--cut must be one of ${CUTS.join(", ")}, not ${cut}`);
  for (const f of SCRIPTS[cut]) await import(`./${f}`);
  return globalThis.TIMING[cut];
}
