import { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { MathUtils } from 'three'

function Box({ position, size, color, ...props }) {
  return <mesh position={position} {...props}><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.65} metalness={0.2} /></mesh>
}

function Arena({ onFailure }) {
  const group = useRef(null)
  const ball = useRef(null)
  const target = useRef({ x: 0, y: 0 })
  const offset = useRef({ x: 0, y: 0 })
  const elapsed = useRef(0)
  const manualYaw = useRef(0)
  const awake = useRef(false)
  const [moving, setMoving] = useState(false)
  const { gl, invalidate } = useThree()
  useEffect(() => {
    const canvas = gl.domElement
    const host = canvas.closest('.hero-arena')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let visible = false
    let drag = null
    const update = () => {
      const next = visible && !document.hidden && !motion.matches
      awake.current = next
      if (host) host.dataset.moving = String(next)
      setMoving(next)
      if (!next) drag = null
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; update() })
    observer.observe(canvas)
    const move = (event) => {
      if (!awake.current) return
      const rect = canvas.getBoundingClientRect()
      if (drag?.id === event.pointerId) {
        manualYaw.current += (event.clientX - drag.x) / rect.width * Math.PI * 2
        drag.x = event.clientX
      } else if (event.pointerType === 'mouse') {
        target.current = { x: ((event.clientX - rect.left) / rect.width - 0.5) * 0.6, y: ((event.clientY - rect.top) / rect.height - 0.5) * 0.2 }
      }
      invalidate()
    }
    const down = (event) => {
      if (!awake.current || (event.pointerType === 'mouse' && event.button !== 0)) return
      drag = { id: event.pointerId, x: event.clientX }
      canvas.setPointerCapture(event.pointerId)
    }
    const up = () => { drag = null }
    const leave = () => { if (!drag) target.current = { x: 0, y: 0 } }
    const lost = (event) => { event.preventDefault(); onFailure() }
    canvas.addEventListener('pointermove', move)
    canvas.addEventListener('pointerdown', down)
    canvas.addEventListener('pointerup', up)
    canvas.addEventListener('pointercancel', up)
    canvas.addEventListener('pointerleave', leave)
    canvas.addEventListener('webglcontextlost', lost)
    motion.addEventListener('change', update)
    document.addEventListener('visibilitychange', update)
    return () => {
      observer.disconnect()
      awake.current = false
      if (host) delete host.dataset.moving
      canvas.removeEventListener('pointermove', move)
      canvas.removeEventListener('pointerdown', down)
      canvas.removeEventListener('pointerup', up)
      canvas.removeEventListener('pointercancel', up)
      canvas.removeEventListener('pointerleave', leave)
      canvas.removeEventListener('webglcontextlost', lost)
      motion.removeEventListener('change', update)
      document.removeEventListener('visibilitychange', update)
    }
  }, [gl, invalidate, onFailure])
  useEffect(() => {
    if (!moving) return
    // Demand rendering keeps the tour at about 24fps instead of the display's 60/120fps.
    invalidate()
    const timer = window.setInterval(invalidate, 1000 / 24)
    return () => window.clearInterval(timer)
  }, [moving, invalidate])
  useFrame((_, delta) => {
    if (!group.current || !awake.current) return
    // Discard a long pause so returning to the hero does not jump the camera.
    const step = delta > 0.25 ? 0 : Math.min(delta, 0.1)
    elapsed.current += step
    const time = elapsed.current
    offset.current.x = MathUtils.damp(offset.current.x, target.current.x, 8, step)
    offset.current.y = MathUtils.damp(offset.current.y, target.current.y, 8, step)
    group.current.rotation.y = time * Math.PI * 2 / 24 + manualYaw.current + offset.current.x
    group.current.rotation.x = Math.sin(time * 0.6) * 0.045 + offset.current.y
    group.current.position.y = -0.2 + Math.sin(time * 0.8) * 0.15
    if (ball.current) {
      ball.current.position.y = 1.65 + Math.sin(time * 1.8) * 0.2
      ball.current.rotation.y = 0.3 + time * 0.5
    }
  })
  return <group ref={group} position={[0, -0.2, 0]}>
    <Box position={[0, -0.35, 0]} size={[7.4, 0.65, 5.2]} color="#123323" />
    <Box position={[0, 0, 0]} size={[7.1, 0.09, 4.9]} color="#20573b" />
    {Array.from({ length: 7 }, (_, i) => <Box key={i} position={[-3 + i, 0.052, 0]} size={[0.97, 0.012, 4.7]} color={i % 2 ? '#367750' : '#2d6846'} />)}
    {[-2.18, 2.18].map(z => <Box key={z} position={[0, 0.075, z]} size={[6.35, 0.02, 0.035]} color="#a7d7ff" />)}
    {[-3.16, 0, 3.16].map(x => <Box key={x} position={[x, 0.075, 0]} size={[0.035, 0.02, 4.4]} color="#a7d7ff" />)}
    <mesh position={[0, 0.085, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.67, 0.7, 48]} /><meshBasicMaterial color="#a7d7ff" /></mesh>
    {[-1, 1].map(side => <group key={side}>
      {[-0.8, 0.8].map(z => <Box key={z} position={[side * 2.6, 0.08, z]} size={[1.1, 0.02, 0.03]} color="#a7d7ff" />)}
      <Box position={[side * 2.05, 0.08, 0]} size={[0.03, 0.02, 1.6]} color="#a7d7ff" />
      {[-0.5, 0.5].map(z => <Box key={z} position={[side * 3.25, 0.4, z]} size={[0.055, 0.7, 0.055]} color="#c9e3ff" />)}
      <Box position={[side * 3.25, 0.75, 0]} size={[0.055, 0.055, 1.05]} color="#c9e3ff" />
    </group>)}
    {[-1, 1].flatMap(x => [-1, 1].map(z => <group key={`${x}-${z}`} position={[x * 3.4, 0, z * 2.35]}>
      <Box position={[0, 0.9, 0]} size={[0.075, 1.8, 0.075]} color="#75a68b" />
      <Box position={[0, 1.8, 0]} size={[0.5, 0.16, 0.18]} color="#ff8e7b" />
    </group>))}
    <group ref={ball} position={[1.35, 1.65, 0.3]} rotation={[0.2, 0.3, 0]}>
      <mesh><icosahedronGeometry args={[0.68, 1]} /><meshStandardMaterial color="#d7e9ff" flatShading roughness={0.45} /></mesh>
      <mesh scale={1.006}><icosahedronGeometry args={[0.68, 1]} /><meshBasicMaterial color="#22513b" wireframe /></mesh>
    </group>
    <mesh position={[0, -0.72, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[4.15, 4.18, 64]} /><meshBasicMaterial color="#67b68b" transparent opacity={0.55} /></mesh>
  </group>
}

export default function ArenaCanvas({ onFailure }) {
  const dpr = (navigator.deviceMemory ?? 8) < 4 ? [1, 1.25] : [1, 1.5]
  return <Canvas className="arena-canvas" frameloop="demand" dpr={dpr} camera={{ position: [8, 7.5, 10], fov: 40 }} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.3} />
    <directionalLight position={[5, 8, 4]} intensity={2.8} color="#d2e5ff" />
    <directionalLight position={[-5, 3, -4]} intensity={3} color="#8bd4a9" />
    <Arena onFailure={onFailure} />
  </Canvas>
}
