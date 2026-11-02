# SportEvo sports gallery

**Current local state, 27 October 2026:** the previous player artwork has been restored in the large sports display, along with its cinematic movement and transitions. The rolling strip also uses its original sports equipment pictures and card sizes. Seven-second autoplay, phone swipes, keyboard arrows, sport-only captions and motion/data-saving preferences remain. This restoration is included in the 2 November GitHub code release; it has not been deployed to Hostinger.

The 3D experiment is no longer imported by the homepage. Its component and generated stills remain in source for possible later use; they are omitted from the current production build. The homepage stadium in `HeroArena` is unchanged.

## Inactive prototype

The notes below describe the earlier 3D prototype, not the active gallery.

The homepage's “A FIELD FOR EVERY GAME” section used procedural React Three Fiber equipment sculptures instead of generated celebrity portraits:

- Football: curved pentagonal ball panels, goal net and centre-circle stage markings.
- Cricket: wooden bat with wrapped grip, wicket and stitched ball.
- Tennis: framed racket with individual strings, wrapped handle and seamed ball.
- Basketball: seamed ball, backboard, coral hoop and diamond-woven net.

The green, mint and coral palette stays in place. One WebGL canvas displays the current sport with a camera orbit, arrival movement and floating/rotating ball (bouncing for basketball). Automatic changes remain seven seconds apart. Phone horizontal swipes and focused keyboard Left/Right arrows remain supported; no navigation buttons were added. Vertical scrolling is preserved.

`frontend/src/components/SportSculptures.jsx` contains the models and animation. `SportsShowcase.jsx` owns visibility, lazy activation, navigation and the fallback. The small rolling gallery keeps its original sports equipment photographs (`*-card.webp`) and original cover cropping/card sizes, as requested. Only the large stage uses 3D and matching loading/fallback WebP stills in `frontend/src/assets/sports/sculptures/`, captured from these actual models. The four fallback stills total about 86 KB; the lazy sculpture module is about 11 KB minified (plus the already shared Three/R3F runtime). No new dependency or downloaded model is required.

Rendering is requested at approximately 24 fps with DPR capped at 1.35. Off-screen and hidden-tab scenes stop requesting animation frames. Reduced-motion and data-saving preferences use the matching stills and stop automatic switching. Import/render failure, unavailable WebGL or context loss leave the still visible. Nets and racket strings use merged line geometries; shadows use one small procedural texture rather than real-time shadow maps or post-processing.

Validation: production build and lint (existing unrelated warnings), translation audit (922 entries, zero missing literal translations), phone/desktop Chromium and WebKit layout, four sport states, keyboard/swipe navigation, Bangla, both themes, reduced motion and data saving. Moving-scene checks cover lazy loading, autoplay, off-screen pause and context-loss/unavailable-WebGL fallbacks. Browser checks do not write database records. Actual iPhone hardware has not been tested.

Local Laravel preview: `http://127.0.0.1:8001/`. The frontend has been built into `backend/public/build`; no Hostinger upload has been performed for this change. A future explicit deployment can use the existing frontend-only update script.
