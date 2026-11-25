import type { CosmosState } from './cosmos/cosmos';

/** Mission phase for a given launch progress (matches the shader timeline). */
export function phaseFor(launch: number, singularity: number): string {
  if (singularity < 0.5) return 'Cruise';
  if (launch < 0.04) return 'Standby';
  if (launch < 0.24) return 'Ignition';
  if (launch < 0.62) return 'Approach';
  if (launch < 0.705) return 'Event horizon';
  if (launch < 0.84) return 'Supernova';
  if (launch < 0.95) return 'Warp';
  return 'Cruise';
}

/** Fake but plausible velocity, as a fraction of light speed. */
export function velocityFor(launch: number, singularity: number): number {
  if (singularity < 0.5) return 0.08;
  const climb = Math.min(1, launch / 0.7) ** 2 * 0.99;
  const settle = launch > 0.78 ? (launch - 0.78) / 0.22 : 0;
  return climb - settle * (climb - 0.08);
}

let nodes: { phase: Element; vel: Element; dist: Element; time: Element } | undefined;
let lastWrite = 0;
const startedAt = performance.now();

export function updateTelemetry(state: CosmosState): void {
  const now = performance.now();
  if (now - lastWrite < 100) return;
  lastWrite = now;

  const root = document.querySelector('[data-telemetry]');
  if (!root) return;
  if (!nodes || !nodes.phase.isConnected) {
    const get = (key: string) => root.querySelector(`[data-t="${key}"]`);
    const [phase, vel, dist, time] = ['phase', 'vel', 'dist', 'time'].map(get);
    if (!phase || !vel || !dist || !time) return;
    nodes = { phase, vel, dist, time };
  }

  const seconds = Math.floor((now - startedAt) / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  nodes.phase.textContent = phaseFor(state.launch, state.singularity);
  nodes.vel.textContent = `${velocityFor(state.launch, state.singularity).toFixed(2)}c`;
  nodes.dist.textContent = `${(state.drift * 42.0).toFixed(1)} ly`;
  nodes.time.textContent = `T+${mm}:${ss}`;
}
