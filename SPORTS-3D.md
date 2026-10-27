# SportEvo sports gallery

Implemented locally on 27 October 2026; **not published**. The last online release remains the navbar search update.

The homepage's “A FIELD FOR EVERY GAME” section now displays procedural React Three Fiber equipment sculptures instead of generated celebrity portraits:

- Football: curved pentagonal ball panels, goal net and centre-circle stage markings.
- Cricket: wooden bat with wrapped grip, wicket and stitched ball.
- Tennis: framed racket with individual strings, wrapped handle and seamed ball.
- Basketball: seamed ball, backboard, coral hoop and diamond-woven net.

The green, mint and coral palette stays in place. One WebGL canvas displays the current sport with a camera orbit, arrival movement and floating/rotating ball (bouncing for basketball). Automatic changes remain seven seconds apart. Phone horizontal swipes and focused keyboard Left/Right arrows remain supported; no navigation buttons were added. Vertical scrolling is preserved.

`frontend/src/components/SportSculptures.jsx` contains the models and animation. `SportsShowcase.jsx` owns visibility, lazy activation, navigation and the fallback. The miniature gallery uses matching WebP stills in `frontend/src/assets/sports/sculptures/`, captured from these actual models, rather than player pictures. The four stills total about 86 KB; the lazy sculpture module is about 11 KB minified (plus the already shared Three/R3F runtime). No new dependency or downloaded model is required.

Rendering is requested at approximately 24 fps with DPR capped at 1.35. Off-screen and hidden-tab scenes stop requesting animation frames. Reduced-motion and data-saving preferences use the matching stills and stop automatic switching. Import/render failure, unavailable WebGL or context loss leave the still visible. Nets and racket strings use merged line geometries; shadows use one small procedural texture rather than real-time shadow maps or post-processing.

Validation: production build and lint (existing unrelated warnings), translation audit (922 entries, zero missing literal translations), phone/desktop Chromium and WebKit layout, four sport states, keyboard/swipe navigation, Bangla, both themes, reduced motion and data saving. Moving-scene checks cover lazy loading, autoplay, off-screen pause and context-loss/unavailable-WebGL fallbacks. Browser checks do not write database records. Actual iPhone hardware has not been tested.

Local Laravel preview: `http://127.0.0.1:8001/`. The frontend has been built into `backend/public/build`; no Hostinger upload has been performed for this change. A future explicit deployment can use the existing frontend-only update script.
