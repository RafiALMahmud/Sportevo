import { useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, IcosahedronGeometry, Vector3 } from 'three'

const mint = '#bcefd6'
const coral = '#ff977f'

function Solid({ color = mint, ...props }) {
  return <meshStandardMaterial color={color} roughness={0.42} metalness={0.25} {...props} />
}

function Box({ position, size, color, ...props }) {
  return <mesh position={position} {...props}><boxGeometry args={size} /><Solid color={color} /></mesh>
}

// Merge each set of strings, seams or netting into one draw call.
function Lines({ segments, color = mint, opacity = 1 }) {
  const geometry = useMemo(() => {
    const result = new BufferGeometry()
    result.setAttribute('position', new Float32BufferAttribute(segments.flat(2), 3))
    return result
  }, [segments])
  useEffect(() => () => geometry.dispose(), [geometry])
  return <lineSegments geometry={geometry}><lineBasicMaterial color={color} transparent opacity={opacity} /></lineSegments>
}

function Ring({ radius, tube = 0.018, color = mint, ...props }) {
  return <mesh {...props}><torusGeometry args={[radius, tube, 8, 64]} /><Solid color={color} /></mesh>
}

function StageShadow() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')
    const gradient = ctx.createRadialGradient(32, 32, 2, 32, 32, 32)
    gradient.addColorStop(0, '#0009')
    gradient.addColorStop(1, '#0000')
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 64, 64)
    return new CanvasTexture(canvas)
  }, [])
  useEffect(() => () => texture.dispose(), [texture])
  return <mesh position={[0, -0.805, 0]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[4.1, 3.5]} /><meshBasicMaterial map={texture} transparent depthWrite={false} /></mesh>
}

function Football() {
  const patches = useMemo(() => {
    const ico = new IcosahedronGeometry(1, 0)
    const points = ico.attributes.position
    const unique = new Map()
    for (let i = 0; i < points.count; i++) {
      const normal = new Vector3().fromBufferAttribute(points, i).normalize()
      unique.set(normal.toArray().map(n => n.toFixed(4)).join(','), normal)
    }
    ico.dispose()
    const vertices = []
    for (const normal of unique.values()) {
      const right = new Vector3(0, 1, 0).cross(normal).normalize()
      const up = normal.clone().cross(right).normalize()
      const rim = Array.from({ length: 5 }, (_, i) => normal.clone().multiplyScalar(0.94)
        .addScaledVector(right, Math.cos(i * Math.PI * 2 / 5) * 0.35)
        .addScaledVector(up, Math.sin(i * Math.PI * 2 / 5) * 0.35).normalize())
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 4; j++) {
          const a = rim[i].clone().lerp(rim[(i + 1) % 5], j / 4).normalize()
          const b = rim[i].clone().lerp(rim[(i + 1) % 5], (j + 1) / 4).normalize()
          const point = (u, v) => normal.clone().multiplyScalar(1 - u - v).addScaledVector(a, u).addScaledVector(b, v).normalize().multiplyScalar(1.008).toArray()
          for (let u = 0; u < 4; u++) {
            for (let v = 0; v < 4 - u; v++) {
              vertices.push(...point(u / 4, v / 4), ...point((u + 1) / 4, v / 4), ...point(u / 4, (v + 1) / 4))
              if (u + v < 3) vertices.push(...point((u + 1) / 4, v / 4), ...point((u + 1) / 4, (v + 1) / 4), ...point(u / 4, (v + 1) / 4))
            }
          }
        }
      }
    }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.computeVertexNormals()
    return geometry
  }, [])
  useEffect(() => () => patches.dispose(), [patches])
  return <group rotation={[0.2, 0.3, 0.1]}>
    <mesh><sphereGeometry args={[1, 48, 32]} /><Solid color="#f0f5e9" roughness={0.65} /></mesh>
    <mesh geometry={patches}><Solid color="#123d30" roughness={0.7} side={2} /></mesh>
  </group>
}

function Goal() {
  const net = useMemo(() => {
    const segments = []
    for (let x = -1.55; x <= 1.56; x += 0.155) segments.push([[x, 0, -0.48], [x, 1.7, 0]], [[x, 0, -0.48], [x, 0, 0]])
    for (let y = 0; y <= 1.71; y += 0.17) segments.push([[-1.55, y, -0.48 + y / 1.7 * 0.48], [1.55, y, -0.48 + y / 1.7 * 0.48]])
    return segments
  }, [])
  return <group position={[-0.35, -0.65, -1.05]} rotation={[0, -0.15, 0]}>
    {[-1.55, 1.55].map(x => <Box key={x} position={[x, 0.85, 0]} size={[0.07, 1.7, 0.07]} />)}
    <Box position={[0, 1.7, 0]} size={[3.17, 0.07, 0.07]} />
    <Lines segments={net} opacity={0.34} />
  </group>
}

function CricketBall() {
  const stitches = useMemo(() => Array.from({ length: 44 }, (_, i) => {
    const a = i / 44 * Math.PI * 2
    return [[Math.cos(a) * 0.501, Math.sin(a) * 0.501, -0.042], [Math.cos(a + 0.015) * 0.501, Math.sin(a + 0.015) * 0.501, 0.042]]
  }), [])
  return <group rotation={[0.35, 0.6, -0.4]}>
    <mesh><sphereGeometry args={[0.5, 40, 28]} /><Solid color="#d65d4e" roughness={0.5} /></mesh>
    {[-0.03, 0.03].map(z => <Ring key={z} radius={0.5} tube={0.009} color="#ffe0bf" position={[0, 0, z]} />)}
    <Lines segments={stitches} color="#ffe4ca" />
  </group>
}

function CricketKit() {
  return <>
    <group position={[0.65, -0.65, -0.65]} rotation={[0, -0.2, 0]}>
      {[-0.24, 0, 0.24].map(x => <mesh key={x} position={[x, 0.95, 0]}><cylinderGeometry args={[0.045, 0.045, 1.9, 12]} /><Solid color="#e6d1a4" /></mesh>)}
      {[-0.12, 0.12].map(x => <Box key={x} position={[x, 1.92, 0]} size={[0.28, 0.045, 0.06]} color="#f7e5bb" />)}
    </group>
    <group position={[-0.8, 0.45, 0.1]} rotation={[0, 0.22, -0.38]}>
      <Box position={[0, -0.2, 0]} size={[0.57, 1.75, 0.17]} color="#e7c89a" />
      <Box position={[0, -0.35, 0.095]} size={[0.07, 1.35, 0.02]} color="#c59c6a" />
      <Box position={[0, 0.3, 0.097]} size={[0.46, 0.24, 0.025]} color="#164a39" />
      <mesh position={[0, 1.05, 0]}><cylinderGeometry args={[0.07, 0.075, 0.85, 16]} /><Solid color="#173d32" /></mesh>
      {Array.from({ length: 11 }, (_, i) => <Ring key={i} radius={0.073} tube={0.008} color="#58957c" rotation={[Math.PI / 2, 0, 0]} position={[0, 0.73 + i * 0.06, 0]} />)}
    </group>
  </>
}

function TennisRacket() {
  const strings = useMemo(() => {
    const segments = []
    for (let x = -0.66; x < 0.67; x += 0.11) {
      const y = Math.sqrt(1 - (x / 0.8) ** 2) * 1.04
      segments.push([[x, -y, 0], [x, y, 0]])
    }
    for (let y = -0.91; y < 0.92; y += 0.13) {
      const x = Math.sqrt(1 - (y / 1.04) ** 2) * 0.8
      segments.push([[-x, y, 0], [x, y, 0]])
    }
    return segments
  }, [])
  return <group position={[-0.35, 1.35, -0.15]} rotation={[0.05, -0.3, -0.35]}>
    <Ring radius={1} tube={0.065} color="#1b8062" scale={[0.86, 1.12, 1]} />
    <Ring radius={1} tube={0.015} color={mint} scale={[0.8, 1.055, 1]} position={[0, 0, 0.02]} />
    <Lines segments={strings} color="#b9dacb" opacity={0.7} />
    {[-1, 1].map(side => <Box key={side} position={[side * 0.21, -1.15, 0]} size={[0.06, 0.85, 0.07]} rotation={[0, 0, side * -0.47]} color="#1d805f" />)}
    <Box position={[0, -1.89, 0]} size={[0.17, 0.85, 0.16]} color="#e49683" />
    {Array.from({ length: 9 }, (_, i) => <Box key={i} position={[0, -1.55 - i * 0.08, 0.085]} size={[0.175, 0.02, 0.015]} color="#884e42" rotation={[0, 0, -0.17]} />)}
    <Box position={[0, -2.33, 0]} size={[0.21, 0.06, 0.19]} color="#f0c0a9" />
  </group>
}

function TennisBall() {
  const seam = useMemo(() => {
    const segments = []
    const point = a => [Math.cos(a) * Math.cos(0.62 * Math.cos(2 * a)) * 0.43, Math.sin(a) * Math.cos(0.62 * Math.cos(2 * a)) * 0.43, Math.sin(0.62 * Math.cos(2 * a)) * 0.43]
    for (let i = 0; i < 160; i++) segments.push([point(i / 160 * Math.PI * 2), point((i + 1) / 160 * Math.PI * 2)])
    return segments
  }, [])
  return <group rotation={[0.5, 0.3, 0]}>
    <mesh><sphereGeometry args={[0.425, 40, 28]} /><Solid color="#c4df89" roughness={0.95} metalness={0} /></mesh>
    <Lines segments={seam} color="#f4f4d7" />
  </group>
}

function Basketball() {
  return <group rotation={[0.15, 0.2, 0.3]}>
    <mesh><sphereGeometry args={[0.81, 48, 32]} /><Solid color="#e18c64" roughness={0.85} metalness={0} /></mesh>
    {[0, Math.PI / 2].map(y => <Ring key={y} radius={0.812} tube={0.012} color="#422e27" rotation={[0, y, 0]} />)}
    <Ring radius={0.812} tube={0.012} color="#422e27" rotation={[Math.PI / 2, 0, 0]} />
    {[-1, 1].map(side => <Ring key={side} radius={0.703} tube={0.012} color="#422e27" position={[side * 0.405, 0, 0]} rotation={[0, Math.PI / 2, 0]} />)}
  </group>
}

function Hoop() {
  const net = useMemo(() => {
    const segments = []
    for (let row = 0; row < 5; row++) {
      const r1 = 0.55 - row * 0.055, r2 = r1 - 0.055
      for (let i = 0; i < 16; i++) {
        const a = i / 16 * Math.PI * 2, b = a + Math.PI / 16
        const start = [Math.cos(a) * r1, -row * 0.14, Math.sin(a) * r1]
        segments.push([start, [Math.cos(b) * r2, -(row + 1) * 0.14, Math.sin(b) * r2]], [start, [Math.cos(a - Math.PI / 16) * r2, -(row + 1) * 0.14, Math.sin(a - Math.PI / 16) * r2]])
      }
    }
    return segments
  }, [])
  return <group position={[0.5, 1.75, -0.5]}>
    <Box position={[0, -1.2, -0.72]} size={[0.09, 2.8, 0.09]} color="#60917b" />
    <Box position={[0, 0.45, -0.64]} size={[2.3, 1.4, 0.09]} color="#133d32" />
    <Box position={[0, 0.45, -0.58]} size={[2.12, 1.23, 0.025]} color="#3b7160" />
    <Lines segments={[[[-0.4, 0.1, -0.54], [-0.4, 0.65, -0.54]], [[-0.4, 0.65, -0.54], [0.4, 0.65, -0.54]], [[0.4, 0.65, -0.54], [0.4, 0.1, -0.54]], [[-0.4, 0.1, -0.54], [0.4, 0.1, -0.54]]]} />
    <Ring radius={0.55} tube={0.035} rotation={[-Math.PI / 2, 0, 0]} color={coral} />
    <Lines segments={net} color="#e2edda" opacity={0.9} />
  </group>
}

function Sculpture({ sport, playing, onReady, onFailure }) {
  const model = useRef(null)
  const ball = useRef(null)
  const elapsed = useRef(0)
  const ready = useRef(false)
  const { gl, camera, invalidate } = useThree()
  useEffect(() => {
    invalidate()
    if (!playing) return
    const timer = window.setInterval(invalidate, 1000 / 24)
    return () => window.clearInterval(timer)
  }, [playing, invalidate])
  useEffect(() => {
    const lost = event => { event.preventDefault(); onFailure() }
    const canvas = gl.domElement
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl, onFailure])
  useFrame((_, delta) => {
    if (!ready.current) { ready.current = true; onReady() }
    if (playing) elapsed.current += delta > 0.25 ? 0 : Math.min(delta, 0.1)
    const time = elapsed.current
    const arrival = playing ? Math.max(0, 1 - time / 1.1) ** 3 : 0
    const angle = 0.2 + Math.sin(time * 0.23) * 0.22
    camera.position.set(Math.sin(angle) * 8.8, 3.1 + Math.sin(time * 0.3) * 0.25, Math.cos(angle) * 8.8)
    camera.lookAt(0, 0.7, 0)
    model.current.rotation.y = -0.18 + Math.sin(time * 0.25) * 0.15 + arrival * 0.65
    model.current.position.y = 0.35 - arrival * 0.35
    model.current.scale.setScalar(1 - arrival * 0.12)
    if (ball.current) {
      ball.current.position.y = sport === 'basketball' ? 0.15 + Math.abs(Math.sin(time * 1.3)) * 0.5 : 0.8 + Math.sin(time * 1.1) * 0.15
      ball.current.rotation.y = time * 0.35
      ball.current.rotation.z = Math.sin(time * 0.4) * 0.1
    }
  })
  return <group ref={model}>
    <mesh position={[0, -0.99, 0]}><cylinderGeometry args={[2.38, 2.48, 0.3, 80]} /><Solid color="#113c2d" roughness={0.5} /></mesh>
    <mesh position={[0, -0.83, 0]}><cylinderGeometry args={[2.36, 2.36, 0.025, 80]} /><Solid color="#205943" roughness={0.6} /></mesh>
    <Ring radius={2.38} tube={0.012} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.82, 0]} color="#82c2a1" />
    <Ring radius={2.52} tube={0.012} rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.22, 0]} color="#477c64" />
    <StageShadow />
    {sport === 'football' && <>
      <Ring radius={0.6} tube={0.009} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.8, 0]} color="#75a992" />
      <Box position={[0, -0.8, 0]} size={[0.018, 0.012, 3.8]} color="#75a992" />
    </>}
    {sport === 'cricket' && <Box position={[0, -0.8, 0]} size={[0.85, 0.012, 3.25]} color="#758d66" />}
    {sport === 'tennis' && [-0.9, 0.9].map(x => <Box key={x} position={[x, -0.8, 0]} size={[0.016, 0.012, 3.55]} color="#75a992" />)}
    {sport === 'basketball' && <Ring radius={1.5} tube={0.009} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.8, 0]} color="#b88970" />}
    {sport === 'football' && <><Goal /><group ref={ball} position={[0.55, 0.8, 0.65]}><Football /></group></>}
    {sport === 'cricket' && <><CricketKit /><group ref={ball} position={[0.8, 0.8, 0.6]} scale={1.25}><CricketBall /></group></>}
    {sport === 'tennis' && <><TennisRacket /><group ref={ball} position={[1.1, 0.8, 0.65]} scale={1.3}><TennisBall /></group></>}
    {sport === 'basketball' && <><Hoop /><group ref={ball} position={[-0.65, 0.15, 0.7]}><Basketball /></group></>}
  </group>
}

export default function SportSculptures({ sport, playing, onReady, onFailure }) {
  return <Canvas className="sport-sculpture-canvas" frameloop="demand" dpr={[1, 1.35]} camera={{ position: [1.8, 3.1, 9], fov: 43 }} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.1} />
    <hemisphereLight args={['#d8f7e8', '#10281f', 1.4]} />
    <directionalLight position={[3, 5, 6]} intensity={3.3} color="#e5f8e8" />
    <directionalLight position={[-4, 2, -1]} intensity={2.8} color="#75d2ae" />
    <directionalLight position={[4, 1, -3]} intensity={2.3} color="#ffad94" />
    <Sculpture key={sport} sport={sport} playing={playing} onReady={onReady} onFailure={onFailure} />
  </Canvas>
}
