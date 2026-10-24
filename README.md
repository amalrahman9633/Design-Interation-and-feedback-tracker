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
