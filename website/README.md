# Vantage website

The landing page for Vantage: a Three.js / WebGL scroll experience with macOS and Windows download buttons.

```bash
cd website
npm install
npm run dev      # http://localhost:5173
npm run build    # static output in website/dist — deploy anywhere (Vercel, Netlify, GitHub Pages)
```

## What's on the page

| Section | What happens |
| --- | --- |
| Hero | Glossy 3D shapes (capsules, tori, iris blades) in a rounded card. They scatter away from the cursor and drift back on springs. |
| Cursor ribbon | A glossy teal tube trails the pointer across the light sections. A custom cursor ring grows and labels links. |
| Library | Two marquees of real wallpaper thumbnails. Scrolling faster speeds them up and skews them. |
| Features | Hovering a row brings up a preview image that follows the cursor and tilts with mouse velocity. |
| The dive (pinned, ~760vh) | A 3D monitor plays a wallpaper → the camera pushes into the screen → black void → the chrome Vantage **aperture** floats and turns toward the mouse while "STEP THROUGH YOUR DESKTOP" fades in → the letters spread apart as the aperture opens and falls → a warp tunnel lined with real wallpapers and light streaks → white flash → arrival. |
| Download | The aperture hovers in the middle with wallpaper cards orbiting it. The cards push away from the cursor. Magnetic download buttons. |

The download buttons read the latest GitHub release at runtime and link the right asset: Apple Silicon or Intel `.dmg`, or Windows `.exe`. The visitor's OS gets the primary button. If a release has no `.exe` yet, the Windows button says "Coming soon" instead of linking to a missing file.

## Accessibility & fallbacks

- All copy and download links are plain HTML outside the canvas, so the page still works if WebGL fails.
- `prefers-reduced-motion` or no WebGL → static layout (no smooth scroll, no pinned dive, wrapped thumbnail grid).
- three.js is code-split and lazy-loaded (≈139 KB gzip). First paint ships ≈12 KB of JS/CSS.
- Touch devices skip the custom cursor and ribbon and use lower particle counts and pixel ratio.

## Assets

`public/thumbs/*.jpg` and `public/media/screen.mp4` are downscaled copies of wallpapers from the app catalog (`resources/`). Most catalog artwork comes from MotionBGS and belongs to its creators. Check that you're allowed to use those images on a public marketing page before you deploy it. You can swap in procedural or owned artwork without touching the code.
