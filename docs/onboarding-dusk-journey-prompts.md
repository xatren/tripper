# Tripper — Dusk Journey Onboarding · Üretim Prompt Seti

Bu doküman, `docs/onboarding-design-brief.md` içindeki eski **Splash → 4 kart carousel → Landing** yapısını **geçersiz kılar**. Yeni akış tek ve kesintisiz bir 2.5D yolculuk sahnesidir.

Kullanım: **Blok A (System)** her Claude Design oturumunun başına birebir yapıştırılır. Sonra üretilecek sahnenin prompt'u (P1…P7) tek başına yapıştırılır. Prompt'lar karar bırakmayacak şekilde yazılmıştır — sayısal değerler tahmin edilmez, uygulanır.

---

## Blok A — System Prompt (her sahnede aynen kullan)

```
You are producing production-ready React + SVG screens for "Tripper", a dark-only mobile
road-trip planner. Target frame is exactly 375 × 812 (iPhone X class). Output React + TypeScript
with Tailwind-compatible inline styles and Framer Motion. No external images, no video, no Lottie,
no WebGL, no raster assets, no icon libraries. All artwork is hand-authored inline SVG.

=== DESIGN SYSTEM — TRIPPER "DUSK EDITION" (dark only) ===

Ground gradient (vertical, top → bottom, applied to the page root):
  0%    #060616   night
  34%   #0a0920   dusk
  62%   #140f2c   horizon
  100%  #241633   ember

Surfaces:      solid #12122b · raised #20203f
Accent:        #f5a623 (brand amber)
Sunset gradient (buttons + accent text), 120deg:
               #ffc766 0% → #f5a623 55% → #e07b1e 100%
Text:          primary #ffffff · secondary rgba(222,220,240,.76) · muted rgba(222,220,240,.58)

Atmosphere — the signature "golden hour on the road" feel:
  A warm ember sun-glow rising from bottom-center, as if the sun sits just below the horizon.
  Radial gradient, center 50% / 58% of the frame, radius 260px,
  rgba(245,150,70,.28) at 0% → rgba(245,150,70,.10) at 45% → transparent at 100%.
  This glow is ALWAYS visible, in every scene, at every step. It never fades out.

Film grain: feTurbulence fractalNoise, baseFrequency 0.8, numOctaves 3, rendered once into a
  full-screen overlay at 5% opacity, mix-blend-mode: overlay, pointer-events: none.
  It is STATIC — never re-generated or animated per frame.

Glass:
  Card       background rgba(255,255,255,.055) · 1px border rgba(255,255,255,.13) ·
             backdrop-filter blur(20px) · radius 20px
  Ghost btn  background rgba(255,255,255,.035) · 1px border rgba(255,255,255,.13) ·
             backdrop-filter blur(12px) · radius 27px (fully rounded pill)

Primary button: pill, height 54, radius 27, fill = sunset gradient, label Inter 16 / weight 600,
  color #1a0800, box-shadow 0 8px 28px rgba(245,166,35,.34).

Typography:
  Fraunces (serif) — hero / step titles only. 34px, line-height 38, weight 600, letter-spacing -0.5.
    The single most emotional word of each title is ITALIC and filled with the sunset gradient
    (background-clip: text). Exactly one accented word per title.
  Inter — everything else.
    Body 15 / 22, color rgba(222,220,240,.76), max-width 300px.
    Step counter 12, weight 600, letter-spacing .18em, uppercase, color rgba(222,220,240,.58).
    Text link 14 / weight 500, color rgba(222,220,240,.76).

Easing: standard cubic-bezier(.4,0,.2,1) · spring cubic-bezier(.34,1.56,.64,1).

HARD PROHIBITIONS — violating any of these is a failed output:
  · No coral, magenta, pink or purple on ANY button, control, pill, dot or border.
    Those hues exist only as far-atmosphere gradient, never on an interactive element.
  · No light mode, no theme toggle.
  · No floating content cards, no carousel, no card stack, no swipeable panels.
    Content is either flat typography over the landscape, or an object inside the landscape.
  · No emoji anywhere.
  · No layout-animating properties. Animate ONLY: transform, opacity, strokeDashoffset,
    and filter intensity. Never animate width/height/top/left/margin/padding.
  · No continuously running blur animation and no per-frame regenerated noise.
  · No third-party dependencies beyond React, Framer Motion and Tailwind.

=== THE SCENE — ONE CONTINUOUS WORLD ===

Every screen in this flow renders the SAME single SVG scene, `<svg viewBox="0 0 375 812">`,
absolutely positioned, filling the frame. Steps do not swap scenes — they move the camera
through one continuous mountain-valley route. Camera is a slightly raised 3/4 view from
BEHIND the vehicle. The road runs from the bottom-centre of the frame to the horizon.

Layer stack, back → front. Each layer is one <g> with its own transform, nothing else:

  L0  sky          y 0–470. The ground gradient stops above, plus a soft horizontal band of
                   rgba(245,150,70,.16) from y 400 to y 470.
  L1  ember sun    radial glow described above, centred at (187, 470).
  L2  far ridge    distant mountain silhouette, fill #171233, ridge line oscillating between
                   y 300 and y 372, 6 peaks, opacity .85.
  L3  mid ridge    closer mountains, fill #1d1436, ridge between y 352 and y 424, 4 peaks.
  L4  fog band     horizontal blur band y 396–470, fill rgba(200,180,220,.10), feGaussianBlur 14.
  L5  valley floor closed path from y 440 down to y 812, fill #120e26.
  L6  road         quadrilateral with vanishing point (187, 452);
                   at y 812 the edges sit at x = -40 and x = 415.
                   Fill = vertical gradient #2a2440 (near) → #1a1530 (horizon).
                   Both road edges carry a 1px rgba(255,255,255,.10) rim.
  L7  road dashes  centre line, 7 dashes, each scaled by perspective: width 5 → 1.4 and
                   height 26 → 4 from bottom to horizon, fill rgba(255,255,255,.22).
                   Drives forward motion via strokeDashoffset / translateY only.
  L8  mid trees    conifer silhouettes flanking the road, fill #16112c, heights 22–58,
                   sitting on the road edge between y 470 and y 600.
  L9  world props  roadside signs, mile reflectors, radar pulses, convoy vehicles.
                   Everything scene-specific lives HERE, inside the world — never above it.
  L10 vehicle      the amber touring SUV (spec below).
  L11 foreground   near bushes and rocks, fill #0d0a1c, occupying y 700–812 at both edges,
                   with 3 blades/branches crossing into the lower 60px of the frame.
  L12 vignette     radial, transparent centre → rgba(6,6,22,.55) at the corners.
  L13 grain        the static 5% noise overlay.

=== THE VEHICLE ===

An unbranded, modern amber touring SUV seen from BEHIND, three-quarter rear view, no logos,
no readable text, no license plate characters. Base placement: centred on the road at
(187, 640), overall width 120, height 86, drawn in pure SVG paths.

  Body          fill = vertical gradient #f2a63a → #c9761f, 12px corner softness.
  Roof + rails  darker cap #a95f18, two thin roof-rail strokes 1.5px #8d4f12.
  Rear glass    large trapezoid, fill rgba(120,160,200,.22), top highlight stroke
                rgba(255,255,255,.28) 1px, occupying the upper 34% of the body.
  Cargo/hatch   a horizontal seam line rgba(0,0,0,.28) across the lower third.
  Tail lights   two rounded bars, w 22 h 7, fill #ff5a2e, plus an outer glow
                blur 6 at rgba(255,90,46,.55). Always lit.
  Ground bond   elliptical shadow beneath, rx 62 ry 9, fill rgba(0,0,0,.5), blur 8.
  Amber bounce  a soft rgba(245,166,35,.18) elliptical glow on the road just ahead-left
                of the vehicle, radius 70 — reflected body light.

=== CHROME (same on every journey step) ===

  Safe areas: top 56, bottom 34, horizontal padding 24.
  Top-left:   step counter "01 / 04" (Inter spec above). Number changes per step.
  Top-right:  "Skip", Inter 14, rgba(222,220,240,.58), 44×44 tap target.
  Copy block: anchored to the BOTTOM of the frame, above the controls.
              Title baseline at y 596, body starting y 616.
  Controls:   primary pill at y 686 (height 54, full width minus 48px padding).
  Milestones: four small roadside reflectors on the LEFT road edge at
              y 700 / 660 / 622 / 590. The reflector matching the current step is filled
              #f5a623 with a 4px amber glow; the others are rgba(255,255,255,.22).
              These REPLACE carousel dots. No dot row exists anywhere.

=== TRANSITION MODEL (identical for every step change) ===

Advancing is USER-DRIVEN ONLY: primary CTA tap, or a horizontal swipe. There is no autoplay,
no timer-based advance. Total duration 880ms, standard easing unless noted.

  0–120ms    outgoing title + body fade to 0 and translate -14px in the direction of travel.
  60–880ms   vehicle travels forward: translateY -22px and scale ×0.975 relative to the
             previous step, with a ±3px lateral drift so the path reads as a curve.
  60–880ms   parallax, per layer, moving with the camera:
               far ridge      2px      mid ridge   6px
               fog            4px      valley     14px
               road texture  40px      trees      26px
               foreground    90px
  60–880ms   road dashes scroll toward the viewer continuously during the move, then settle.
  100–560ms  camera scale 1.00 → 1.04.
  560–880ms  camera scale 1.04 → 1.00, spring easing.
  420–880ms  incoming title + body fade 0 → 1 and translate +14px → 0.
  Swiping BACKWARD plays the same timeline reversed; the vehicle moves back down the road.

=== REDUCED MOTION ===

When prefers-reduced-motion: reduce is set, use the existing motion provider and drop
parallax, road scroll, radar loops, camera scale and the final acceleration entirely.
The vehicle jumps directly to each step's resting position. Only a 160ms opacity crossfade
on the title and body remains. All content, controls, swipe and tap behaviour stay identical.

=== RESPONSIVE ===

375×812 is the reference. Support 320px → 430px width without overflow:
the SVG scales with preserveAspectRatio="xMidYMid slice"; chrome and copy stay in a
max-width 375 column centred horizontally. Below 700px height, reduce the title to 30/34
and lift the copy block by 24px. Never introduce horizontal scrolling.
```

---

## P1 — Sahne 1 · Entegre Açılış

Ayrı bir splash ekranı **yoktur**; açılış bu sahnenin ilk anıdır.

```
Build STEP 01 of the Tripper Dusk Journey, including its integrated opening beat.
Render the full layer stack from the system prompt. There is NO separate splash screen.

OPENING BEAT (plays once, on first mount only, 2100ms total):
  0–520ms      Frame holds on the ember horizon: only L0, L1, L2 visible; everything from
               L3 down is at opacity 0. A Tripper location pin — teardrop, 26×34, sunset
               gradient fill, white 3px inner dot — is born at the horizon point (187, 452),
               scale 0.4 → 1, opacity 0 → 1, spring easing, wrapped in a 40px amber bloom.
  400–1400ms   Camera pulls back: whole scene scale 1.22 → 1.00, translateY -30 → 0,
               standard easing. Layers L3 → L11 fade in staggered 60ms apart in back-to-front
               order. The road unfurls from the horizon toward the viewer by animating the
               road quad's clip from y 452 down to y 812.
  900–1500ms   The pin rises to y 300, shrinks to 0.55 and fades to opacity .35, becoming a
               distant waypoint marker on the horizon. It stays there for the rest of the flow.
  1100–1700ms  The SUV enters: opacity 0 → 1, translateY +40 → 0 at its resting spot (187, 640),
               tail lights igniting at 1250ms.
  1700–2100ms  Chrome appears: step counter, Skip, milestone reflectors, then copy, then CTA,
               staggered 80ms apart, each fading up 12px.

STEP 01 RESTING STATE:
  Counter   "01 / 04"      Milestone reflector 1 active.
  Title     The road is *calling.*        ("calling" italic + sunset gradient)
  Body      Plan the whole trip in one place — the route, the stops, the people,
            and everything you'll spend along the way.
  Primary   "Start the journey"
  Vehicle   (187, 640) scale 1.00.
  World     Road runs straight to the horizon. Trees sparse. Foreground bushes at both edges.

Deliver the reusable components too: JourneyScene (the SVG world, props: step 0–3, camera),
JourneyCopy (title with the italic gradient word, body), JourneyControls (counter, Skip,
primary CTA, milestone reflectors). Steps 2–4 reuse these unchanged.
```

---

## P2 — Sahne 2 · Rota

```
Build STEP 02 of the Tripper Dusk Journey. Reuse JourneyScene / JourneyCopy / JourneyControls
unchanged. Play the standard 880ms forward transition from step 01 into this resting state.

RESTING STATE:
  Counter   "02 / 04"      Milestone reflector 2 active.
  Title     Draw the *road* ahead.        ("road" italic + sunset gradient)
  Body      Trace your route on the map, drop stops where you want them,
            and reorder the whole trip with a drag.
  Primary   "Continue"
  Vehicle   (187, 618) scale 0.975, drifted 3px left.

SCENE-SPECIFIC WORLD ELEMENT — the route light (lives in L9, on top of the road, under the SUV):
  A 2.5px stroke that follows the road's centre from the SUV's nose (187, 600) to the
  vanishing point (187, 452), curving 10px right at its midpoint so it reads as a real bend.
  Stroke = sunset gradient, opacity .9, with a 6px amber outer glow.
  Draw-on: strokeDasharray = path length, strokeDashoffset animates length → 0 over 700ms
  starting at 240ms of the transition, standard easing. It stays drawn afterwards.
  A single 5px amber bead travels the same path horizon-ward every 2600ms, opacity
  0 → 1 → 0 — this is the only looping animation in the scene, and it stops under reduced motion.

MOTION EMPHASIS FOR THIS STEP ONLY:
  During the transition the vehicle accelerates: road-dash scroll speed is 1.35× the standard
  rate between 200ms and 700ms, easing back to normal by 880ms. Foreground parallax is 110px
  instead of 90px. Nothing else changes.
```

---

## P3 — Sahne 3 · Duraklar

```
Build STEP 03 of the Tripper Dusk Journey. Reuse the shared components. Standard 880ms forward
transition from step 02.

RESTING STATE:
  Counter   "03 / 04"      Milestone reflector 3 active.
  Title     Make every stop part of the *story.*   ("story" italic + sunset gradient)
  Body      Save where you'll sleep, what you'll do and the photos you take —
            all attached to the stop they belong to.
  Primary   "Continue"
  Vehicle   (187, 600) scale 0.95, drifted 3px right.
  World     The valley opens: mid-ridge peaks lower by 18px, trees become denser on the
            right side of the road.

SCENE-SPECIFIC WORLD ELEMENTS — three roadside markers (L9). These are part of the LANDSCAPE,
standing on the ground with the correct perspective scale. They are NOT floating UI cards,
NOT glass panels, and they carry no drop-shadowed container.

  Marker A — lodging.    Post at x 96, y 560, sign 30×20, scale 0.9.
  Marker B — activity.   Post at x 268, y 528, sign 26×17, scale 0.78.
  Marker C — photo spot. Post at x 122, y 502, sign 22×14, scale 0.66.

  Each marker: a 1.5px #2a2440 post, a sign plate filled #1a1530 with a 1px
  rgba(245,166,35,.45) border, and a hand-drawn 10px amber line glyph inside —
  a simple bed outline, a pennant, and a camera aperture respectively.
  Each sign emits a 10px amber glow at .35 opacity, and a small pool of amber light
  rgba(245,166,35,.14) sits on the road beneath it.

  Entrance: markers appear during the transition, staggered at 480 / 580 / 680ms,
  opacity 0 → 1 with scale 0.85 → 1 (spring), anchored at the post base.
  As the camera moves in later steps they simply travel with L9 parallax and scale up.
```

---

## P4 — Sahne 4 · Arkadaşlar

```
Build STEP 04 of the Tripper Dusk Journey. Reuse the shared components. Standard 880ms forward
transition from step 03.

RESTING STATE:
  Counter   "04 / 04"      Milestone reflector 4 active.
  Title     The best roads are *shared.*     ("shared" italic + sunset gradient)
  Body      Send one invite code and plan together — everyone edits the same
            trip, live, from their own phone.
  Primary   "Continue"
  Vehicle   (187, 584) scale 0.93, centred.

SCENE-SPECIFIC WORLD ELEMENTS — the convoy joins (L9):
  A side road merges from the LEFT: a narrow quad from (0, 640) converging to (150, 500),
  fill #241d3c, 1px rgba(255,255,255,.07) edges.
  Two more SUVs — identical silhouette to the hero vehicle, at 0.72 and 0.62 scale, bodies
  desaturated to #c98c34 and #b57c2c so the hero SUV stays dominant — drive up that side road
  and settle at (128, 566) and (232, 552), slightly behind and flanking the hero vehicle.
  Entrance: translate along the merge path, 520 → 880ms, staggered 90ms, standard easing.

  Convoy links: two 1.5px amber strokes connecting the hero vehicle's roof point to each
  companion's roof point, sunset gradient, opacity .55, drawn with strokeDashoffset over
  360ms starting at 760ms. Each link carries one 3px amber pulse travelling along it every
  2400ms — stops under reduced motion.

  Avatar signals: above each companion vehicle, a 16px circle, fill #20203f, 1px
  rgba(255,255,255,.18) border, containing a two-letter monogram in Inter 8 / 600 white
  ("AY", "MK"). No photos, no emoji. They pop in with spring easing at 820ms.
```

---

## P5 — Sahne 5 · Konum İzni

Bu sahne journey sayacının **dışındadır** — counter gösterilmez.

```
Build the LOCATION PERMISSION scene of the Tripper Dusk Journey. Reuse the shared components.
Standard 880ms forward transition from step 04, with one addition: between 100ms and 560ms
the camera also lifts — the whole scene translates Y +18px and the horizon line rises 12px,
as if cresting onto a viewpoint.

RESTING STATE:
  Counter   HIDDEN. This scene is outside the 01–04 count. Milestone reflectors are all
            filled amber at .5 opacity, as passed miles.
  Skip      still present, top-right.
  Title     Discover what's *around* you.    ("around" italic + sunset gradient)
  Body      Turn on location so Tripper can surface fuel, food, views and stays
            right where you actually are.
  Primary   "Allow Location"          (sunset-gradient pill, y 686)
  Secondary "Not now"                 (plain text link, Inter 14, rgba(222,220,240,.76),
                                       centred, 44px tap height, at y 754)
  Vehicle   (187, 566) scale 0.92, parked at a viewpoint pull-off on the right.
  World     A gravel pull-off widens the road's right edge between y 540 and y 600.
            The valley below is visible: the ember glow is stronger here, raise the sun-glow
            alpha from .28 to .34 for this scene only.

SCENE-SPECIFIC WORLD ELEMENT — radar (L9, drawn UNDER the vehicle):
  Three ellipses centred on the vehicle's ground point (187, 592), rx:ry ratio 3.4:1 so they
  lie flat on the ground plane. Each expands rx 20 → 150 while opacity goes .55 → 0 over
  2600ms, staggered 860ms apart, looping. Stroke 1.5px #f5a623, no fill.
  Reduced motion: render ONE static ellipse at rx 90, opacity .3, no loop.

  Nearby points: five small amber diamonds, 5px, at (92,556) (268,544) (140,522) (296,566)
  (60,588). Each brightens from opacity .15 to .9 and back over 1800ms, offset from the radar
  sweep so they light up as the wave passes over them. Static at .5 under reduced motion.

PERMISSION BEHAVIOUR — implement exactly:
  · navigator.geolocation is requested ONLY by the "Allow Location" button. Never on mount,
    never on swipe, never on step change.
  · Granted, denied, unsupported, and timeout all resolve the same way: continue to the
    auth scene. Never block, never show an error screen, never re-prompt in this flow.
  · While the browser prompt is open, the primary button shows "Requesting…", opacity .7,
    disabled, with no spinner animation.
  · "Not now" continues to the auth scene immediately without touching the geolocation API.
```

---

## P6 — Final Geçiş + Auth Seçim Sahnesi

```
Build the CINEMATIC FINALE and the AUTH CHOICE scene of the Tripper Dusk Journey.
The scene NEVER goes to black and NEVER unmounts — the auth layer rises over the same
landscape the user has been travelling through.

FINALE TIMELINE (1250ms, fires on Allow Location resolve, on "Not now", or on Skip):
  0–260ms      Copy, counter, Skip and controls fade out and translate -16px.
  0–900ms      Acceleration: road-dash scroll ramps to 2.6× standard. The dashes stretch
               vertically ×2.4 via scaleY. Tail-light glow radius grows 6 → 22 and the two
               tail bars stretch into 46px light trails behind the vehicle.
  120–900ms    The vehicle travels to (187, 500) at scale 0.72, converging on the horizon.
               Companion vehicles trail behind at 0.55 and 0.48 scale.
  200–1000ms   The ember sun-glow expands: radius 260 → 900, alpha .28 → .82, swallowing
               the frame from the bottom up. Landscape layers do NOT fade — they are
               overexposed by the glow, so keep them mounted underneath at full opacity.
  760–1250ms   The Tripper pin re-emerges from inside the glow at (187, 300): scale 0.5 → 1,
               opacity 0 → 1, spring easing, with a single expanding 1px amber ring,
               r 20 → 90, opacity .6 → 0. It plays exactly once — never loops.
  1000–1250ms  The glow settles back to radius 420 / alpha .40 and the landscape resolves
               underneath, now calm: road dashes still, vehicle a small silhouette at the
               horizon, tail lights two distant amber points.

AUTH CHOICE RESTING STATE:
  Background   The settled finale landscape, still live, no black overlay.
  Pin          Tripper pin at (187, 300), scale 1.
  Wordmark     "Tripper", Fraunces 40 / weight 600, white, centred, baseline y 380.
  Tagline      "Plan road trips together", Inter 15, rgba(222,220,240,.76), centred, y 408.
  Controls     Centred column, 24px horizontal padding, 12px gaps, bottom-anchored:
                 1. "Log In"               primary sunset-gradient pill, height 54.
                 2. "Sign Up"              ghost glass pill, height 54, white label.
                 3. "Continue with Google" ghost glass pill, height 54, white label,
                                           with an inline SVG Google "G" in its official
                                           four colours at 18px, 10px to the left of the label.
                                           This is the ONLY non-amber, non-neutral colour
                                           permitted on any control in the entire flow.
               Entrance: staggered 90ms apart from 1150ms, fade up 14px.
  Loading      During Google sign-in the button reads "Signing in…", opacity .6, disabled.

RETURN BEHAVIOUR — implement exactly:
  · Navigating BACK to this scene from login or sign-up renders the auth choice in its
    resting state with NO animation replay. The finale plays once per session only.
  · localStorage key `tripper_onboarding_done` is preserved. A user who completes or skips
    the journey lands directly on this auth choice scene on every later visit, with the
    landscape already settled and no journey steps rendered.
```

---

## P7 — DuskAuthShell (Login + Sign Up)

```
Build DuskAuthShell, the shared wrapper for the Tripper login and sign-up pages. It renders
the CALMED continuation of the finale landscape — the same world, further along, at rest.

SHELL:
  Background   Same layer stack, in its settled state: road dashes still, far and mid ridges
               unchanged, ember sun-glow at radius 420 / alpha .34, the SUV a small silhouette
               at (187, 500) scale 0.72 with two lit tail points. Grain and vignette stay on.
               Nothing in the background animates. No parallax, no loops, ever.
  Scrim        Above the landscape, below the content: a vertical gradient from
               transparent at y 0 → rgba(6,6,22,.62) at y 300 → rgba(6,6,22,.80) at y 812,
               so form fields stay legible without hiding the world.
  Header       Back chevron, 24px, rgba(222,220,240,.76), top-left at the 56px safe area,
               44×44 tap target.
  Title        Fraunces 30 / 34, white, left-aligned, 24px padding, baseline y 190.
                 Login    → "Welcome *back.*"        ("back" italic + sunset gradient)
                 Sign up  → "Start something *new.*" ("new" italic + sunset gradient)
  Subtitle     Inter 15, rgba(222,220,240,.76), 8px below the title.

FIELDS:
  Glass inputs: height 54, radius 16, background rgba(255,255,255,.055),
  1px border rgba(255,255,255,.13), backdrop-filter blur(20px), 16px horizontal padding.
  Label floats as placeholder in rgba(222,220,240,.58), Inter 15.
  Focus state: border becomes rgba(245,166,35,.55) plus a 0 0 0 3px rgba(245,166,35,.12) ring.
  Error state: border rgba(255,90,46,.55), message Inter 13 in #ff8a5e, 6px below the field.
  Vertical rhythm: 14px between fields.

ACTIONS:
  Primary submit  sunset-gradient pill, height 54, full width minus 48.
                  Loading: label swaps to "Signing in…" / "Creating account…", opacity .6,
                  disabled, no spinner.
  Divider         a 1px rgba(255,255,255,.10) rule with the word "or" in Inter 12
                  rgba(222,220,240,.58) centred on it.
  Google          ghost glass pill with the four-colour "G", identical to the auth choice scene.
  Footer link     "Already have an account? Log in" / "New here? Sign up",
                  Inter 14, muted text with the action word in #f5a623.

PRESERVE WITHOUT CHANGE — this is visual work only:
  · All existing Supabase auth calls, session handling and error mapping.
  · The safe-redirect logic after sign-in.
  · The Google OAuth flow.
  · All existing form validation rules and their messages.
Only the presentation layer changes. Do not alter auth logic, routing guards, or storage keys.
```

---

## Kabul Kriterleri (her çıktıda kontrol et)

| # | Kriter |
|---|--------|
| 1 | 375×812 referans; 320–430px genişlikte taşma yok, yatay scroll yok |
| 2 | Araç her ileri step'te gözle görülür ilerliyor; manzara tek kesintisiz rota |
| 3 | Ember horizon glow hiçbir sahnede kaybolmuyor |
| 4 | Hiçbir kontrolde coral/magenta yok — tek istisna Google "G" logosu |
| 5 | Carousel noktası yok; sadece `01 / 04` sayacı + 4 kilometre reflektörü |
| 6 | Floating kart yok; step içeriği manzaranın parçası |
| 7 | Konum izni yalnızca `Allow Location` ile isteniyor; swipe/step geçişi tetiklemiyor |
| 8 | İzin kabul / ret / desteksiz / timeout — hepsi auth sahnesine güvenle devam ediyor |
| 9 | Reduced-motion: parallax, yol akışı, radar, bead/pulse loop, hızlanma yok; sadece 160ms opacity |
| 10 | Sadece `transform` / `opacity` / `strokeDashoffset` / filtre yoğunluğu animasyonu |
| 11 | Grain statik; her frame yeniden üretilmiyor |
| 12 | Finale bir kez oynuyor; auth'tan geri dönüşte tekrar oynamıyor |
| 13 | Yeni bağımlılık yok; mevcut Framer Motion + reduced-motion sağlayıcısı kullanılıyor |
| 14 | `MobileEntryFlow` dış arayüzü ve `tripper_onboarding_done` değişmemiş |

## Varsayımlar

- Arayüz dili İngilizce (mevcut sistemle uyumlu); bu doküman Türkçe rehber.
- Dahili sahne makinesi: `intro | journey | permission | auth`, journey step `0–3`.
- Auth seçim ekranı onboarding'in görsel finali; eski Landing tasarımı kaldırıldı.
- `docs/onboarding-design-brief.md` (Splash + carousel + Landing) bu dokümanla geçersiz kılındı.
