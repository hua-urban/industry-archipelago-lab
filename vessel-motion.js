// Analytic timeline: all vessels share the scene clock, so pausing freezes every phase.
export const DOCK_HOLD_SECONDS = 1.7;
export const TURN_SECONDS = 1.8;
const ease = t => t*t*t*(t*(6*t-15)+10);
const easeSpeed = t => 30*t*t*(t-1)*(t-1);
export function sampleVesselMotion(time, phase = 0, highlight = false) {
  const travel = highlight ? 5.6 : 8.8;
  const leg = travel + DOCK_HOLD_SECONDS + TURN_SECONDS;
  const cycle = ((time + phase*leg) % (2*leg) + 2*leg) % (2*leg);
  const outbound = cycle < leg;
  const local = cycle % leg;
  if (local < travel) {
    const u = local/travel;
    const progress = ease(u);
    return {
      state: u < .2 ? 'departing' : u > .8 ? 'arriving' : 'sailing',
      progress: outbound ? progress : 1-progress,
      headingOffset: outbound ? 0 : Math.PI,
      speedFraction: easeSpeed(u)/1.875
    };
  }
  const dockTime = local-travel;
  const turning = dockTime >= DOCK_HOLD_SECONDS;
  const turn = turning ? ease(Math.min(1,(dockTime-DOCK_HOLD_SECONDS)/TURN_SECONDS)) : 0;
  return {
    state: turning ? 'turning' : 'holding',
    progress: outbound ? 1 : 0,
    // At either end, take a smooth half-turn while the vessel's centre stays still.
    headingOffset: Math.PI*(outbound ? turn : 1-turn),
    speedFraction: 0
  };
}
