# EverCraft 3: Lattice — development notes

## Server
- Never run the dev server. The user runs it manually. Test against `vite build` output served statically.

## Shape of the game
- A hex board. Wells emit beams of light. Pieces in a beam change it (gems add or multiply, prisms split, mirrors turn).
  Beams that end in a Foundry cut gems; in a Basin they bank mana; amber light in a Lectern earns Insight.
- Crystallize fuses a finished board into a Keystone that is set in the next, larger layer.
- Design rules: nothing is hidden (every lock shows `Requires X/Y`), no action is automatic that spends something the
  player is saving, every placement can be previewed before it is committed, and nothing ships with only one use.

## Architecture
- `src/config.ts` — every balance number and both layer maps. Sim and UI never hard-code tuning values.
- `src/sim/` — pure simulation, no DOM. `trace.ts` (where light goes), `rates.ts` (production per second),
  `step.ts` (advance time), `actions.ts` (player actions; each validates, mutates, returns whether it happened).
- `src/game.ts` — controller: live state `G.s`, current rates `G.r`, selection, held piece, placement preview, undo.
- `src/ui/board.ts` — canvas rendering and pointer input. `src/ui/panels.ts` — DOM panels and dialogs.
- `src/state.ts` — default state, localStorage save, base64 export/import.
- `scripts/bot.ts` — headless pacing check (`npm run bot`). Run it after any balance change.

## Rules carried over from EverCraft 2
- Game loop uses `requestAnimationFrame`; elapsed time comes from the wall clock so tabbed-out and offline time is
  simulated on return (capped at one week). The simulation renders nothing.
- Save to localStorage no more than once per 5 seconds.
- Black background, bright colours only. All colours are CSS variables in `src/styles.css` (mirrored in `ui/draw.ts`
  for the canvas). No opacity for disabled buttons: dashed borders and dim text instead. No transitions on progress bars.
- Multiplier prefix format: `x` before the number (x4, x1.3).
- Panels must not re-render under a pressed button (`put()` in `panels.ts` handles this).

## Balance guardrail
- The only power laws are the Shard lens (`SHARD_EXP`) and foundry settings (`SET_EXP`); their sum must stay below 1.
  Every multiplier is logarithmic in gem count. Break this and production blows up in finite time.

## Deploying
- `npm run deploy` builds and commits `dist/` to the `gh-pages` branch. The build uses a relative base path.
