# Organiser

Keep every iteration of a code-built prototype in one place, flip back through its history, and pin feedback to any part of any version. Local-first: everything is stored in your browser (IndexedDB); use **Export backup** on the home screen to save a JSON copy.

```
app/                     the Organiser app (Vite + React)
sdk/                     @organiser/sdk, the optional script prototypes include
examples/demo-prototype  a prototype wired up with the SDK
```

## Run

```bash
npm install
npm run dev        # app on http://localhost:5173
npm run dev:demo   # demo prototype on http://localhost:5174
```

## Using it

1. **New project**: paste any prototype URL (localhost, Vercel/Netlify preview, …).
2. **Save version** whenever an iteration is worth keeping, with a note on what changed.
3. In the viewer: press **C** and click to drop a comment, **←/→** to move through versions, **Esc** to stop commenting.

Local URLs always show the code running *now*. With the SDK, Organiser snapshots each version the first time you open it, and older versions on a local URL open on that snapshot. Deploy-preview URLs stay exact.

## Versions straight from git commits

Instead of saving versions by hand, let the companion CLI turn commits into versions. Mark any commit worth reviewing with `[v]` in its message. The companion builds that exact commit in a temporary git worktree (your working copy is never touched) and serves it at its own permanent URL, e.g. `http://f66d1e4.my-proto.localhost:5199/`. Connected projects in Organiser update live.

One-time setup:

```bash
cd cli && npm link            # from this repo: installs the `organiser` command
cd ~/code/my-prototype
organiser init                # detects the build, adds a post-commit hook, starts the companion
```

Then in Organiser choose **Connect a git repo**. From then on:

```bash
git commit -m "Tighter header spacing [v]"   # becomes a version automatically
git commit -m "wip"                          # ignored
```

- `organiser.config.json` (written by `init`, worth committing) holds `marker`, `install`, `build` and `out`. Edit it if the detected build is wrong. Plain HTML repos need no build.
- `organiser backfill` builds older marked commits. **Import older commits** in the app does the same.
- `organiser status` lists versions; `organiser capture <sha> --force` rebuilds one.
- A build that fails shows up as a failed version with its log.
- `organiser serve` restarts the companion if it isn't running (commits start it automatically).
- Builds are served on `*.localhost` subdomains so absolute asset paths keep working. Chrome, Arc, Edge and Firefox resolve these out of the box.
- Using Claude Code or Cursor? Add to the prototype's CLAUDE.md / rules: *"When a design iteration is worth reviewing, end the commit message with `[v]`."*

### Hosted previews (Vercel / Netlify)

If you push to GitHub and Vercel or Netlify already builds every commit, use their preview URLs instead of local builds:

```bash
organiser connect vercel --project prj_123 [--team team_456] --name "Payment prototype" --token $VERCEL_TOKEN
organiser connect netlify --site <site-id> --name "Payment prototype" --token $NETLIFY_TOKEN
```

Tokens are stored in `~/.organiser/config.json` (owner-only), never in the browser. The companion checks for new marked deploys every 30 seconds. Vercel previews with Deployment Protection turned on will ask viewers to sign in inside the frame.

## Adding the SDK to a prototype (optional)

Without the SDK comments are pinned to a spot on the screen. With it they stick to elements as you scroll and navigate, snapshots are captured, and you get the A/B/C variant + state toolbar.

```ts
import { init } from '@organiser/sdk';
import { useOrganiser } from '@organiser/sdk/react';

init({
  variants: ['A', 'B', 'C'],
  states: { mode: ['During', 'Brief', 'Paused', 'Generated'] },
});

function Screen() {
  const { variant, states } = useOrganiser();
  return variant === 'B' ? <LayoutB mode={states.mode} /> : <LayoutA mode={states.mode} />;
}
```

Not using React or npm? `npm run build -w sdk` produces `sdk/dist/organiser-sdk.js`; include it with a `<script>` tag and call `Organiser.init({...})`, `Organiser.subscribe(fn)`.

Add `data-organiser-id="…"` to important elements to keep comment anchors stable when the markup around them changes.
