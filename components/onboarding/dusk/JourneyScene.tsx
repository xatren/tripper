'use client'

import { useEffect } from 'react'
import {
  AnimatePresence,
  motion,
  animate,
  useMotionValue,
  useTransform,
  useAnimationControls,
  type MotionValue,
} from 'framer-motion'
import {
  DUSK, EASE_STANDARD, EASE_SPRING, FRAME_H, PARALLAX,
  STEP_DURATION, FINALE_DURATION, VP_X, VP_Y,
} from './tokens'

/* ─────────────────────────────────────────────────────────────────────
   JourneyScene — the one continuous 2.5D world.
   Every stage of the entry flow renders THIS scene; steps move the
   camera along a single mountain-valley route rather than swapping art.
   Only transform / opacity / pathLength are animated.
───────────────────────────────────────────────────────────────────── */

export type SceneStage = 'intro' | 'journey' | 'permission' | 'finale' | 'auth'

interface JourneySceneProps {
  stage: SceneStage
  /** 0–3 while stage is 'journey'. */
  step: number
  reduced: boolean
  /** True only while the one-shot opening beat is playing. */
  intro: boolean
  /** The auth-choice screen shows the waypoint pin; the login/sign-up shell's
   *  calmed background does not. Defaults to true for every other stage. */
  showPin?: boolean
  /** Override for the settled vehicle's y position. The auth-choice screen's
   *  content sits below the vehicle, but the login/sign-up shell's form fills
   *  most of the frame, so it parks the SUV lower to stay clear of it. */
  vehicleY?: number
  /** Moves foreground subjects above the copy region on short phone screens. */
  compact?: boolean
}

/** Camera index — how far down the route we are. */
function cameraIndex(stage: SceneStage, step: number) {
  if (stage === 'journey') return step
  if (stage === 'permission') return 4
  if (stage === 'finale' || stage === 'auth') return 5
  return 0
}

/** Vehicle resting state per camera index. Kept above the copy block. */
const VEHICLE_STOPS = [
  { y: 566, scale: 0.84, dx: 0 },
  { y: 550, scale: 0.81, dx: -3 },
  { y: 532, scale: 0.77, dx: 3 },
  { y: 512, scale: 0.74, dx: 0 },
  { y: 500, scale: 0.71, dx: 0 },
  { y: 492, scale: 0.5, dx: 0 },
] as const

/* ── Perspective helper ───────────────────────────────────────────── */
/** Maps a normalised depth t (0 = at the viewer, 1 = horizon) to y + scale. */
function perspective(t: number) {
  const u = 1 - t
  return { y: VP_Y + (FRAME_H - VP_Y) * u * u, s: 0.16 + 0.84 * u * u }
}

/** Fixed star scatter above the ridgeline: [x, y, radius, twinkle-delay]. */
const STARS = [
  [30, 90, 1.1, 0], [64, 140, 0.9, 0.4], [96, 70, 1.3, 1.1], [132, 160, 0.8, 1.8],
  [168, 100, 1.1, 0.7], [206, 60, 0.9, 1.4], [244, 150, 1.2, 0.2], [278, 90, 0.8, 2.1],
  [312, 130, 1.1, 1.0], [346, 75, 0.9, 1.7], [18, 200, 0.7, 2.4], [222, 190, 0.8, 0.9],
] as const

/* ═══════════════════════════════════════════════════════════════════
   ROAD DASHES — L7
═══════════════════════════════════════════════════════════════════ */
const DASH_COUNT = 7

function Dash({ travel, base, stretch }: { travel: MotionValue<number>; base: number; stretch: MotionValue<number> }) {
  const transform = useTransform([travel, stretch], ([v, st]: number[]) => {
    const t = (((base + v) % 1) + 1) % 1
    const { y, s } = perspective(t)
    return `translate(${VP_X - 2.5 * s}px, ${y}px) scale(${s}, ${s * st})`
  })
  return (
    <motion.rect
      width={5}
      height={26}
      rx={2}
      fill="rgba(255,255,255,.22)"
      style={{ transform, transformBox: 'fill-box', transformOrigin: '0 0' }}
    />
  )
}

/* ═══════════════════════════════════════════════════════════════════
   VEHICLE — L10
═══════════════════════════════════════════════════════════════════ */
function TouringSUV({ tint, trail = 0 }: { tint?: { light: string; dark: string }; trail?: number }) {
  const light = tint?.light ?? DUSK.bodyLight
  const dark = tint?.dark ?? DUSK.bodyDark
  const gid = `suv-${light.replace('#', '')}`

  return (
    <g>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={light} />
          <stop offset="62%" stopColor={dark} />
          <stop offset="100%" stopColor={dark} />
        </linearGradient>
      </defs>

      {/* centred contact shadow + reflected body light keep the SUV bonded to the road */}
      <ellipse cx={0} cy={1} rx={50} ry={7} fill="rgba(2,2,10,.76)" filter="url(#contactBlur)" />
      <ellipse cx={0} cy={-3} rx={62} ry={12} fill="rgba(245,166,35,.12)" filter="url(#softBlur8)" />

      {/* wheels — drawn first so the fenders tuck over their upper half */}
      <g fill="#0b0818">
        <circle cx={-40} cy={-8} r={13} />
        <circle cx={40} cy={-8} r={13} />
      </g>
      <g fill="none" stroke="rgba(255,255,255,.10)" strokeWidth={1.5}>
        <circle cx={-40} cy={-8} r={13} />
        <circle cx={40} cy={-8} r={13} />
      </g>
      <g fill={dark} opacity={0.6}>
        <circle cx={-40} cy={-8} r={5} />
        <circle cx={40} cy={-8} r={5} />
      </g>

      {/* body + roof — one continuous silhouette on one gradient, no glued-on cap */}
      <path
        d="M -24 -84 L 24 -84 Q 40 -84 40 -68 L 40 -62 Q 47 -46 46 -28 Q 48 -14 40 -6
           L -40 -6 Q -48 -14 -46 -28 Q -47 -46 -40 -62 L -40 -68 Q -40 -84 -24 -84 Z"
        fill={`url(#${gid})`}
      />

      {/* rear glass */}
      <path d="M -19 -80 L 19 -80 L 25 -63 L -25 -63 Z" fill="rgba(120,160,200,.22)" />
      <path d="M -19 -80 L 19 -80" stroke="rgba(255,255,255,.28)" strokeWidth={1} fill="none" />
      {/* roofline seam reads as the glass edge, not a second part */}
      <path d="M -24 -84 Q 0 -88 24 -84" stroke="rgba(0,0,0,.22)" strokeWidth={1} fill="none" />

      {/* hatch seam + license recess + bumper */}
      <path d="M -38 -40 Q 0 -37 38 -40" stroke="rgba(0,0,0,.22)" strokeWidth={1.5} fill="none" />
      <rect x={-9} y={-15} width={18} height={9} rx={2} fill="rgba(0,0,0,.32)" />
      <path d="M -40 -6 L 40 -6" stroke="rgba(0,0,0,.3)" strokeWidth={4} strokeLinecap="round" />

      {/* tail-light trails (finale only) */}
      {trail > 0 && (
        <g opacity={0.75}>
          <rect x={-45} y={-38} width={13} height={7} rx={3} fill={DUSK.tailLight}
            transform={`scale(1 ${1 + trail * 5.6})`} filter="url(#softBlur8)" />
          <rect x={32} y={-38} width={13} height={7} rx={3} fill={DUSK.tailLight}
            transform={`scale(1 ${1 + trail * 5.6})`} filter="url(#softBlur8)" />
        </g>
      )}

      {/* tail lights — integrated at the rear corners, linked by a thin light bar */}
      <g filter="url(#tailGlow)">
        <rect x={-45} y={-38} width={13} height={7} rx={3} fill={DUSK.tailLight} />
        <rect x={32} y={-38} width={13} height={7} rx={3} fill={DUSK.tailLight} />
        <rect x={-24} y={-36} width={48} height={2} rx={1} fill={DUSK.tailLight} opacity={0.45} />
      </g>
    </g>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   WORLD PROPS — L9
═══════════════════════════════════════════════════════════════════ */

/** Wraps a prop so it recedes past the viewer as the camera advances. */
function WorldProp({
  introducedAt, cam, reduced, children,
}: { introducedAt: number; cam: number; reduced: boolean; children: React.ReactNode }) {
  const passed = Math.max(0, cam - introducedAt)
  return (
    <motion.g
      initial={reduced ? false : { opacity: 0, scale: 0.85 }}
      animate={{
        opacity: 1,
        scale: 1 + passed * 0.12,
        y: reduced ? 0 : passed * PARALLAX.trees,
      }}
      transition={{
        duration: reduced ? 0 : STEP_DURATION,
        ease: reduced ? 'linear' : EASE_SPRING,
        delay: reduced ? 0 : 0.48,
      }}
      style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
    >
      {children}
    </motion.g>
  )
}

const MARKER_GLYPHS = {
  /* bed outline */
  lodging: <path d="M -5 2 L -5 -3 M -5 -1 L 5 -1 L 5 2 M -5 -3 L -1 -3 L -1 -1" stroke={DUSK.amber} strokeWidth={1} fill="none" strokeLinecap="round" />,
  /* pennant */
  activity: <path d="M -3 3 L -3 -4 L 4 -2 L -3 0" stroke={DUSK.amber} strokeWidth={1} fill="none" strokeLinejoin="round" />,
  /* camera: body + viewfinder bump + lens */
  photo: (
    <g stroke={DUSK.amber} strokeWidth={1} fill="none" strokeLinejoin="round">
      <rect x={-4.2} y={-2.4} width={8.4} height={5.2} rx={1} />
      <rect x={-1.5} y={-3.7} width={2} height={1.4} />
      <circle cx={0} cy={0.2} r={1.6} />
    </g>
  ),
} as const

function RoadsideMarker({
  x, y, w, h, scale, glyph,
}: { x: number; y: number; w: number; h: number; scale: number; glyph: keyof typeof MARKER_GLYPHS }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {/* light pooled on the road below the sign */}
      <ellipse cx={0} cy={2} rx={28} ry={7} fill="rgba(245,166,35,.18)" filter="url(#softBlur8)" />
      {/* post */}
      <path d={`M 0 0 L 0 ${-h - 10}`} stroke="rgba(245,166,35,.28)" strokeWidth={1.6} />
      {/* sign plate */}
      <g filter="url(#signGlow)">
        <rect x={-w / 2} y={-h - 10 - h / 2} width={w} height={h} rx={3}
          fill={DUSK.roadFar} stroke="rgba(245,166,35,.58)" strokeWidth={1} />
      </g>
      <g transform={`translate(0 ${-h - 10})`}>{MARKER_GLYPHS[glyph]}</g>
    </g>
  )
}

function CrewSignal({
  x, y, monogram, delay, reduced,
}: {
  x: number
  y: number
  monogram: string
  delay: number
  reduced: boolean
}) {
  return (
    <motion.g
      initial={reduced ? { opacity: 0, x, y } : { opacity: 0, x, y: y + 8, scale: 0.82 }}
      animate={{ opacity: 1, x, y, scale: 1 }}
      transition={{ duration: reduced ? 0.16 : 0.34, delay: reduced ? 0 : delay, ease: EASE_SPRING }}
      style={{ transformBox: 'view-box', originX: 0, originY: 0 }}
    >
      <circle r={25} fill="rgba(245,166,35,.08)" filter="url(#softBlur8)" />
      <circle r={18} fill="rgba(32,32,63,.9)" stroke="rgba(255,255,255,.18)" strokeWidth={1} />
      <circle r={14} fill="rgba(18,18,43,.92)" stroke="rgba(245,166,35,.22)" strokeWidth={1} />
      <circle cx={12} cy={12} r={3.5} fill={DUSK.amber} stroke={DUSK.roadFar} strokeWidth={1.5} />
      <text
        x={0}
        y={3.5}
        textAnchor="middle"
        fontSize={10}
        fontWeight={700}
        fill="#ffffff"
        style={{ fontFamily: "var(--font-inter), Inter, sans-serif" }}
      >
        {monogram}
      </text>
    </motion.g>
  )
}

function RadarPulse({
  index, reduced, cx, cy,
}: { index: number; reduced: boolean; cx: number; cy: number }) {
  if (reduced) {
    return index === 0
      ? <ellipse cx={cx} cy={cy} rx={90} ry={26} stroke={DUSK.amber} strokeWidth={1.5} fill="none" opacity={0.3} />
      : null
  }
  return (
    <motion.ellipse
      cx={cx} cy={cy} rx={150} ry={44}
      stroke={DUSK.amber} strokeWidth={1.5} fill="none"
      initial={{ scale: 0.133, opacity: 0.55 }}
      animate={{ scale: [0.133, 1], opacity: [0.55, 0] }}
      transition={{ duration: 2.6, repeat: Infinity, delay: index * 0.86, ease: 'linear' }}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    />
  )
}

const NEARBY_POINTS = [
  { dx: -92, dy: -16 }, { dx: 70, dy: -28 }, { dx: -46, dy: -44 },
  { dx: 98, dy: 4 }, { dx: -128, dy: 16 },
] as const

/* ═══════════════════════════════════════════════════════════════════
   THE SCENE
═══════════════════════════════════════════════════════════════════ */
export function JourneyScene({
  stage,
  step,
  reduced,
  intro,
  showPin = true,
  vehicleY,
  compact = false,
}: JourneySceneProps) {
  const cam = cameraIndex(stage, step)
  const isFinale = stage === 'finale'
  const isSettled = stage === 'auth'
  const showRoute = stage === 'journey' && (step === 1 || step === 2)
  const routeIsPrimary = stage === 'journey' && step === 1
  const showMarkers = stage === 'journey' && step === 2
  const showCrew = stage === 'journey' && step === 3
  const showRadar = stage === 'permission'
  const baseVehicle = VEHICLE_STOPS[cam]
  const compactLift = compact && !isFinale && !isSettled ? 104 : 0
  const vehicle = {
    ...baseVehicle,
    y: vehicleY === undefined ? baseVehicle.y - compactLift : vehicleY,
  }
  const radarX = VP_X + vehicle.dx
  const radarY = vehicle.y

  /* Road-dash travel + finale stretch, as motion values (transform only). */
  const travel = useMotionValue(0)
  const stretch = useMotionValue(1)
  const camControls = useAnimationControls()

  useEffect(() => {
    if (reduced || isSettled) { travel.set(0); stretch.set(1); return }
    const run = animate(travel, travel.get() + (isFinale ? 9 : 3), {
      duration: isFinale ? FINALE_DURATION : STEP_DURATION,
      ease: isFinale ? 'easeIn' : EASE_STANDARD,
    })
    const st = animate(stretch, isFinale ? 2.4 : 1, { duration: 0.6, ease: EASE_STANDARD })
    return () => { run.stop(); st.stop() }
  }, [cam, isFinale, isSettled, reduced, travel, stretch])

  /* Camera scale pulse 1.00 → 1.04 → 1.00 on every step change. */
  useEffect(() => {
    if (reduced || intro || isFinale || isSettled) {
      camControls.stop()
      camControls.set({ scale: 1 })
      return
    }
    void camControls.start({
      scale: [1, 1.04, 1],
      transition: { duration: STEP_DURATION, times: [0, 0.55, 1], ease: EASE_STANDARD },
    })
  }, [cam, reduced, intro, isFinale, isSettled, camControls])

  /* Layer reveal during the opening beat, back to front. */
  const reveal = (order: number) => ({
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: {
      duration: intro && !reduced ? 0.5 : 0,
      delay: intro && !reduced ? 0.4 + order * 0.06 : 0,
      ease: EASE_STANDARD,
    },
  })

  const parallax = (amount: number) => ({
    y: reduced ? 0 : amount * cam,
    transition: { duration: reduced ? 0 : STEP_DURATION, ease: EASE_STANDARD },
  })

  /* Permission scene crests onto a viewpoint: the camera rises, so the
     world sits higher in frame and clears the two-line headline. */
  const cameraLift = stage === 'permission' ? -30 : 0

  /* yMax anchors the road to the bottom edge, so short viewports crop empty
     sky instead of pushing the vehicle up into the headline. */
  return (
    <svg
      viewBox="0 0 375 812"
      preserveAspectRatio="xMidYMax slice"
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="skyBand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(245,150,70,0)" />
          <stop offset="100%" stopColor="rgba(245,150,70,.16)" />
        </linearGradient>

        <radialGradient id="emberGlow">
          <stop offset="0%" stopColor="rgba(245,150,70,.28)" />
          <stop offset="45%" stopColor="rgba(245,150,70,.10)" />
          <stop offset="100%" stopColor="rgba(245,150,70,0)" />
        </radialGradient>

        <radialGradient id="emberFlare">
          <stop offset="0%" stopColor="rgba(245,150,70,.82)" />
          <stop offset="45%" stopColor="rgba(245,150,70,.30)" />
          <stop offset="100%" stopColor="rgba(245,150,70,0)" />
        </radialGradient>

        <radialGradient id="valleyFill" cx="50%" cy="0%" r="88%">
          <stop offset="0%" stopColor="#211638" />
          <stop offset="32%" stopColor={DUSK.valley} />
          <stop offset="100%" stopColor="#0b0819" />
        </radialGradient>

        <linearGradient id="roadFill" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={DUSK.roadNear} />
          <stop offset="100%" stopColor={DUSK.roadFar} />
        </linearGradient>

        <linearGradient id="routeLight" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={DUSK.amberLight} />
          <stop offset="55%" stopColor={DUSK.amber} />
          <stop offset="100%" stopColor={DUSK.amberDeep} />
        </linearGradient>

        <radialGradient id="vignette">
          <stop offset="55%" stopColor="rgba(6,6,22,0)" />
          <stop offset="100%" stopColor="rgba(6,6,22,.55)" />
        </radialGradient>

        <filter id="softBlur8" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="8" />
        </filter>
        <filter id="contactBlur" x="-45%" y="-180%" width="190%" height="460%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
        <filter id="fogBlur" x="-30%" y="-120%" width="160%" height="340%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
        <filter id="tailGlow" x="-160%" y="-260%" width="420%" height="620%">
          <feGaussianBlur stdDeviation="6" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="signGlow" x="-140%" y="-140%" width="380%" height="380%">
          <feGaussianBlur stdDeviation="3.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="pinBloom" x="-200%" y="-200%" width="500%" height="500%">
          <feGaussianBlur stdDeviation="12" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* ── CAMERA ────────────────────────────────────────────────── */}
      <motion.g
        animate={camControls}
        style={{ transformBox: 'view-box', transformOrigin: '187px 520px' }}
      >
        <motion.g
          animate={{ y: cameraLift }}
          transition={{ duration: reduced ? 0 : STEP_DURATION, ease: EASE_STANDARD }}
        >
          <motion.g
            initial={intro && !reduced ? { scale: 1.22, y: -30 } : false}
            animate={{ scale: 1, y: 0 }}
            transition={{ duration: intro && !reduced ? 1.0 : 0, delay: intro && !reduced ? 0.4 : 0, ease: EASE_STANDARD }}
            style={{ transformBox: 'view-box', transformOrigin: '187px 520px' }}
          >
            {/* L0 — sky band above the horizon */}
            <rect x={0} y={400} width={375} height={70} fill="url(#skyBand)" />

            {/* L1 — ember sun-glow (always visible) */}
            <circle cx={187} cy={470} r={260} fill="url(#emberGlow)" />
            <motion.g
              initial={{ scale: 0.001, opacity: 0 }}
              animate={
                isFinale
                  ? { scale: [0.001, 3.46, 1.6], opacity: [0, 1, 0.62] }
                  : isSettled
                    ? { scale: 1.6, opacity: 0.62 }
                    : { scale: 0.001, opacity: 0 }
              }
              transition={{
                duration: reduced ? 0.16 : FINALE_DURATION,
                times: isFinale ? [0, 0.8, 1] : undefined,
                ease: EASE_STANDARD,
              }}
              style={{ transformBox: 'view-box', transformOrigin: '187px 470px' }}
            >
              <circle cx={187} cy={470} r={260} fill="url(#emberFlare)" />
            </motion.g>

            {/* L1.5 — a scatter of stars, dusk sky catching a little life */}
            <motion.g {...reveal(0)} opacity={0.7}>
              {STARS.map(([sx, sy, sr, sd], i) => (
                <motion.circle
                  key={i} cx={sx} cy={sy} r={sr} fill="#ffffff"
                  initial={{ opacity: 0.25 }}
                  animate={reduced ? { opacity: 0.55 } : { opacity: [0.25, 0.85, 0.25] }}
                  transition={reduced ? { duration: 0.16 } : { duration: 3.2 + sd, repeat: Infinity, delay: sd, ease: 'easeInOut' }}
                />
              ))}
            </motion.g>

            {/* L2 — far ridge */}
            <motion.g {...reveal(0)}>
              <motion.g animate={parallax(PARALLAX.farRidge)}>
                <path
                  d="M -20 390 L 18 350 L 58 382 L 98 354 L 140 410 L 184 426 L 226 408 L 270 362 L 316 400 L 356 358 L 395 388 L 395 472 L -20 472 Z"
                  fill={DUSK.farRidge} opacity={0.8}
                />
                <path
                  d="M -20 390 L 18 350 L 58 382 L 98 354 L 140 410 L 184 426 L 226 408 L 270 362 L 316 400 L 356 358 L 395 388"
                  stroke="rgba(255,190,140,.09)" strokeWidth={1.2} fill="none"
                />
              </motion.g>
            </motion.g>

            {/* L3 — mid ridge */}
            <motion.g {...reveal(1)}>
              <motion.g animate={parallax(PARALLAX.midRidge)}>
                <path
                  d="M -20 432 L 42 382 L 90 424 L 134 400 L 176 440 L 220 414 L 260 430 L 314 376 L 354 414 L 395 426 L 395 474 L -20 474 Z"
                  fill={DUSK.midRidge}
                />
                <path
                  d="M -20 432 L 42 382 L 90 424 L 134 400 L 176 440 L 220 414 L 260 430 L 314 376 L 354 414 L 395 426"
                  stroke="rgba(255,190,140,.12)" strokeWidth={1.2} fill="none"
                />
              </motion.g>
            </motion.g>

            {/* L4 — fog band */}
            <motion.g {...reveal(2)}>
              <motion.g animate={parallax(PARALLAX.fog)}>
                <rect x={-20} y={396} width={415} height={74} fill="rgba(200,180,220,.10)" filter="url(#fogBlur)" />
              </motion.g>
            </motion.g>

            {/* L5 — valley floor */}
            <motion.g {...reveal(3)}>
              <motion.g animate={parallax(PARALLAX.valley)}>
                <path
                  d={`M -20 ${448 - PARALLAX.valley * cam} L 395 ${448 - PARALLAX.valley * cam} L 395 830 L -20 830 Z`}
                  fill="url(#valleyFill)"
                />
                {/* haze where the valley meets the ridge line */}
                <rect
                  x={-20}
                  y={432 - PARALLAX.valley * cam}
                  width={415}
                  height={30}
                  fill="rgba(140,120,180,.07)"
                  filter="url(#fogBlur)"
                />
              </motion.g>
            </motion.g>

            {/* L6 + L7 — road and its centre dashes, unfurling from the horizon */}
            <motion.g {...reveal(4)}>
              <motion.g
                initial={intro && !reduced ? { scaleY: 0 } : false}
                animate={{ scaleY: 1 }}
                transition={{ duration: intro && !reduced ? 0.9 : 0, delay: intro && !reduced ? 0.4 : 0, ease: EASE_STANDARD }}
                style={{ transformBox: 'view-box', transformOrigin: '187px 452px' }}
              >
                {/* pull-off shoulder for the permission viewpoint */}
                <AnimatePresence initial={false}>
                  {showRadar && (
                    <motion.path
                      key="pull-off"
                      d="M 221 482 L 286 546 L 221 546 Z"
                      fill={DUSK.roadNear}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.75 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduced ? 0.16 : 0.22, ease: EASE_STANDARD }}
                    />
                  )}
                </AnimatePresence>
                <path d="M 187 452 L 415 812 L -40 812 Z" fill="url(#roadFill)" />
                <path d="M 187 452 L 415 812" stroke="rgba(255,190,120,.16)" strokeWidth={1.5} fill="none" />
                <path d="M 187 452 L -40 812" stroke="rgba(255,190,120,.16)" strokeWidth={1.5} fill="none" />
                {Array.from({ length: DASH_COUNT }, (_, i) => (
                  <Dash key={i} travel={travel} stretch={stretch} base={i / DASH_COUNT} />
                ))}
              </motion.g>
            </motion.g>

            {/* L8 — flanking conifers */}
            <motion.g {...reveal(5)}>
              <motion.g animate={parallax(PARALLAX.trees)}>
                {[
                  { x: 44, y: 596, h: 58 }, { x: 92, y: 548, h: 44 }, { x: 124, y: 512, h: 32 },
                  { x: 146, y: 486, h: 24 }, { x: 236, y: 486, h: 22 },
                  { x: 262, y: 512, h: 34 }, { x: 292, y: 546, h: 46 }, { x: 336, y: 592, h: 56 },
                  { x: 310, y: 500, h: 26 }, { x: 68, y: 500, h: 28 },
                ].map((t, i) => (
                  <path
                    key={i}
                    d={`M ${t.x} ${t.y} L ${t.x - t.h * 0.28} ${t.y} L ${t.x} ${t.y - t.h} L ${t.x + t.h * 0.28} ${t.y} Z`}
                    fill={DUSK.trees}
                    stroke="rgba(190,160,215,.055)"
                    strokeWidth={0.6}
                  />
                ))}
              </motion.g>
            </motion.g>

            {/* L9 — exactly one narrative layer owns the scene at a time. */}
            <AnimatePresence initial={false}>
              {showRoute && (() => {
                const routeX = VP_X + vehicle.dx + 14
                const routeStartY = vehicle.y - 94 * vehicle.scale
                const midY = (routeStartY + VP_Y) / 2
                const routeDepth = routeStartY - VP_Y
                const routeOpacity = routeIsPrimary ? 0.9 : 0.2
                return (
                  <motion.g
                    key="route"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: reduced ? 0.16 : 0.22, ease: EASE_STANDARD }}
                  >
                    <motion.path
                      d={`M ${routeX} ${routeStartY} Q ${routeX + 12} ${midY} ${VP_X} ${VP_Y}`}
                      stroke="url(#routeLight)"
                      strokeWidth={2.5}
                      fill="none"
                      strokeLinecap="round"
                      opacity={routeOpacity}
                      initial={{ pathLength: reduced ? 1 : routeIsPrimary ? 0 : 1 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: reduced ? 0 : 0.7, delay: reduced ? 0 : 0.18, ease: EASE_STANDARD }}
                      filter={routeIsPrimary ? 'url(#signGlow)' : undefined}
                    />
                    {routeIsPrimary && (
                      <g opacity={0.78}>
                        {[
                          { x: routeX + 5, y: routeStartY - routeDepth * 0.3, r: 3.2 },
                          { x: routeX + 4, y: routeStartY - routeDepth * 0.68, r: 2.4 },
                        ].map((point, index) => (
                          <g key={index}>
                            <circle cx={point.x} cy={point.y} r={point.r + 3} fill="rgba(245,166,35,.1)" />
                            <circle
                              cx={point.x}
                              cy={point.y}
                              r={point.r}
                              fill={DUSK.roadFar}
                              stroke={DUSK.amber}
                              strokeWidth={1}
                            />
                          </g>
                        ))}
                      </g>
                    )}
                    {routeIsPrimary && !reduced && (
                      <motion.circle
                        r={2.5}
                        fill={DUSK.amberLight}
                        initial={{ opacity: 0 }}
                        animate={{
                          opacity: [0, 1, 0],
                          cx: [routeX, routeX + 12, VP_X],
                          cy: [routeStartY, midY, VP_Y],
                        }}
                        transition={{ duration: 2.6, repeat: Infinity, ease: 'easeIn' }}
                      />
                    )}
                  </motion.g>
                )
              })()}

              {showMarkers && (
                <motion.g
                  key="markers"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0.16 : 0.22, ease: EASE_STANDARD }}
                >
                  <WorldProp introducedAt={2} cam={cam} reduced={reduced}>
                    <RoadsideMarker x={82} y={528} w={30} h={20} scale={1.03} glyph="lodging" />
                    <RoadsideMarker x={294} y={516} w={26} h={17} scale={0.9} glyph="activity" />
                    <RoadsideMarker x={126} y={486} w={22} h={14} scale={0.76} glyph="photo" />
                  </WorldProp>
                </motion.g>
              )}

              {showCrew && (
                <motion.g
                  key="crew"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0.16 : 0.22, ease: EASE_STANDARD }}
                >
                  {[
                    `M 119 474 Q 150 446 ${vehicle.dx + VP_X} ${vehicle.y - 86 * vehicle.scale}`,
                    `M ${vehicle.dx + VP_X} ${vehicle.y - 86 * vehicle.scale} Q 224 446 255 474`,
                    'M 119 474 Q 187 500 255 474',
                  ].map((path, index) => (
                    <motion.path
                      key={index}
                      d={path}
                      stroke={index === 2 ? 'rgba(232,226,240,.18)' : 'url(#routeLight)'}
                      strokeWidth={index === 2 ? 1 : 1.35}
                      strokeDasharray={index === 2 ? '3 7' : undefined}
                      fill="none"
                      opacity={index === 2 ? 0.65 : 0.5}
                      initial={{ pathLength: reduced ? 1 : 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{
                        duration: reduced ? 0 : 0.42,
                        delay: reduced ? 0 : 0.34 + index * 0.07,
                        ease: EASE_STANDARD,
                      }}
                    />
                  ))}
                  <CrewSignal x={119} y={474} monogram="C" delay={0.42} reduced={reduced} />
                  <CrewSignal x={255} y={474} monogram="G" delay={0.5} reduced={reduced} />
                </motion.g>
              )}

              {showRadar && (
                <motion.g
                  key="radar"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: reduced ? 0.16 : 0.22, ease: EASE_STANDARD }}
                >
                  {[0, 1, 2].map(index => (
                    <RadarPulse key={index} index={index} reduced={reduced} cx={radarX} cy={radarY} />
                  ))}
                  {NEARBY_POINTS.map((point, index) => {
                    const pointX = radarX + point.dx
                    const pointY = radarY + point.dy
                    return (
                      <motion.rect
                        key={index}
                        x={pointX - 2.5}
                        y={pointY - 2.5}
                        width={5}
                        height={5}
                        fill={DUSK.amber}
                        transform={`rotate(45 ${pointX} ${pointY})`}
                        initial={{ opacity: 0.15 }}
                        animate={reduced ? { opacity: 0.5 } : { opacity: [0.15, 0.9, 0.15] }}
                        transition={reduced
                          ? { duration: 0.16 }
                          : { duration: 1.8, repeat: Infinity, delay: index * 0.34, ease: 'easeInOut' }}
                      />
                    )
                  })}
                </motion.g>
              )}
            </AnimatePresence>

            {/* Tripper pin — born at the horizon, then a distant waypoint.
                Not part of the login/sign-up shell's calmed background. */}
            {showPin && !isFinale && !isSettled && (
              <motion.path
                d={`M ${VP_X} 304 L ${VP_X} 438`}
                stroke="url(#routeLight)"
                strokeWidth={0.8}
                strokeDasharray="2 8"
                fill="none"
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.12 }}
                transition={{ duration: reduced ? 0.16 : 0.46, ease: EASE_STANDARD }}
              />
            )}
            {showPin && (
              <motion.g
                initial={intro && !reduced ? { scale: 0.4, opacity: 0, y: 0 } : false}
                animate={
                  isFinale || isSettled
                    ? { y: -152, scale: 1, opacity: 1 }
                    : { y: -152, scale: 0.6, opacity: 0.45 }
                }
                transition={{
                  duration: reduced ? 0 : 0.6,
                  delay: reduced ? 0 : isFinale ? 0.76 : intro ? 0.9 : 0,
                  ease: EASE_SPRING,
                }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center bottom' }}
              >
                <g filter="url(#pinBloom)" transform="translate(187 452)">
                  <path d="M 0 0 C -13 -14 -13 -22 0 -34 C 13 -22 13 -14 0 0 Z" fill="url(#routeLight)" />
                  <circle cx={0} cy={-22} r={4.5} fill="#ffffff" />
                </g>
              </motion.g>
            )}

            {/* L10 — the hero vehicle */}
            <motion.g
              initial={intro && !reduced
                ? { opacity: 0, x: 187, y: VEHICLE_STOPS[0].y + 40, scale: 1 }
                : false}
              animate={{
                opacity: 1,
                x: 187 + vehicle.dx,
                y: vehicle.y,
                scale: vehicle.scale,
              }}
              transition={{
                duration: reduced ? 0 : isFinale ? FINALE_DURATION * 0.62 : STEP_DURATION,
                delay: reduced ? 0 : intro ? 1.1 : isFinale ? 0.12 : 0.06,
                ease: EASE_STANDARD,
              }}
              /* Anchor every translate/scale to TouringSUV's local (0, 0).
                 Using the painted bounding box here makes the asymmetric amber
                 road glow part of the scale origin and pulls the car left as
                 it gets smaller. */
              style={{ transformBox: 'view-box', originX: 0, originY: 0 }}
            >
              <TouringSUV trail={isFinale ? 1 : 0} />
            </motion.g>

            {/* L11 — foreground bushes and rocks */}
            <motion.g {...reveal(6)}>
              <motion.g animate={parallax(PARALLAX.foreground)}>
                <path d="M -20 812 L -20 726 Q 14 704 40 744 Q 62 712 88 760 L 92 812 Z" fill={DUSK.foreground} />
                <path d="M 395 812 L 395 716 Q 356 700 330 748 Q 308 718 286 764 L 282 812 Z" fill={DUSK.foreground} />
                <path d="M 30 812 L 44 752 M 300 812 L 288 758 M 152 812 L 140 782"
                  stroke={DUSK.foreground} strokeWidth={4} strokeLinecap="round" fill="none" />
              </motion.g>
            </motion.g>
          </motion.g>
        </motion.g>
      </motion.g>

      {/* L12 — vignette, outside the camera so it never scales */}
      <rect x={0} y={0} width={375} height={812} fill="url(#vignette)" />
    </svg>
  )
}
