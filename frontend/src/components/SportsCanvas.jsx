import { useEffect, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'

function Block({ position, size, color = '#cbe6d6' }) {
  return <mesh position={position}><boxGeometry args={size} /><meshStandardMaterial color={color} roughness={0.8} /></mesh>
}

function Court({ sport }) {
  const tennis = sport === 'tennis'
  const cricket = sport === 'cricket'
  const basketball = sport === 'basketball'
  const surface = tennis ? '#247880' : basketball ? '#b86446' : '#2f7650'
  return <group>
    <Block position={[0, -0.27, 0]} size={[7.8, 0.5, 5.3]} color="#133c2b" />
    <Block position={[0, 0, 0]} size={[7.5, 0.06, 5]} color={surface} />
    {!tennis && !basketball && Array.from({ length: 7 }, (_, i) => <Block key={i} position={[i - 3, 0.036, 0]} size={[0.95, 0.01, 4.9]} color={i % 2 ? '#39825a' : '#30754d'} />)}
    {cricket ? <>
      <mesh position={[0, 0.05, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1.4, 1, 1]}><ringGeometry args={[2.1, 2.125, 64]} /><meshBasicMaterial color="#d5ebda" /></mesh>
      <Block position={[0, 0.06, 0]} size={[3.8, 0.04, 0.85]} color="#d3b987" />
      {[-1.65, 1.65].map(x => <group key={x}>{[-0.15, 0, 0.15].map(z => <Block key={z} position={[x, 0.3, z]} size={[0.045, 0.46, 0.045]} color="#ffe4b5" />)}<Block position={[x, 0.55, 0]} size={[0.055, 0.03, 0.38]} color="#ffe4b5" /></group>)}
    </> : <>
      {[-2.12, 2.12].map(z => <Block key={z} position={[0, 0.06, z]} size={[6.5, 0.015, 0.035]} />)}
      {[-3.25, 0, 3.25].map(x => <Block key={x} position={[x, 0.06, 0]} size={[0.035, 0.015, 4.25]} />)}
      {!tennis && <mesh position={[0, 0.07, 0]} rotation={[-Math.PI / 2, 0, 0]}><ringGeometry args={[0.65, 0.68, 40]} /><meshBasicMaterial color="#d5ebda" /></mesh>}
      {tennis ? <>
        {[-1.5, 1.5].map(x => <Block key={x} position={[x, 0.06, 0]} size={[0.035, 0.015, 3.6]} />)}
        <Block position={[0, 0.5, 0]} size={[0.04, 0.9, 4.1]} color="#d0e3df" />
        <Block position={[0, 0.55, 0]} size={[0.045, 0.7, 4]} color="#25423c" />
        {[-1, 1].map(side => <Block key={side} position={[side * 0.76, 0.06, 0]} size={[1.5, 0.015, 0.035]} />)}
      </> : [-1, 1].map(side => <group key={side}>
        <Block position={[side * 2.6, 0.06, 0]} size={[0.035, 0.015, 1.65]} />
        {basketball ? <>
          <Block position={[side * 3.45, 0.85, 0]} size={[0.06, 1.7, 0.06]} color="#b6d1c5" />
          <Block position={[side * 3.4, 1.65, 0]} size={[0.08, 0.65, 0.95]} color="#d9f0e4" />
          <mesh position={[side * 3.04, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]}><torusGeometry args={[0.23, 0.025, 6, 24]} /><meshStandardMaterial color="#ff957e" /></mesh>
        </> : <>
          {[-0.55, 0.55].map(z => <Block key={z} position={[side * 3.3, 0.4, z]} size={[0.06, 0.75, 0.06]} />)}
          <Block position={[side * 3.3, 0.8, 0]} size={[0.06, 0.06, 1.15]} />
        </>}
      </group>)}
    </>}
    {[-1, 1].flatMap(x => [-1, 1].map(z => <group key={`${x}-${z}`} position={[x * 3.65, 0, z * 2.4]}><Block position={[0, 0.9, 0]} size={[0.055, 1.8, 0.055]} color="#8ebba0" /><Block position={[0, 1.8, 0]} size={[0.4, 0.12, 0.17]} color="#ffad91" /></group>))}
    <group position={[1.4, 1.5, 0.3]}>
      <mesh><sphereGeometry args={[0.52, 24, 16]} /><meshStandardMaterial color={cricket ? '#be3e45' : tennis ? '#d2e752' : basketball ? '#e58b49' : '#e6f4eb'} roughness={0.65} /></mesh>
      {sport === 'football' ? <mesh><icosahedronGeometry args={[0.525, 1]} /><meshBasicMaterial color="#275e43" wireframe /></mesh> : <mesh rotation={[0.7, 0.3, 0.2]}><torusGeometry args={[0.522, 0.009, 6, 48]} /><meshBasicMaterial color={basketball ? '#55382e' : '#f8f4dc'} /></mesh>}
    </group>
  </group>
}

function Flight({ sport, playing, onFailure }) {
  const elapsed = useRef(0)
  const { camera, gl, invalidate } = useThree()
  useEffect(() => { elapsed.current = 0; invalidate() }, [sport, invalidate])
  useEffect(() => {
    if (!playing) return
    const timer = window.setInterval(() => { if (!document.hidden) invalidate() }, 1000 / 30)
    return () => window.clearInterval(timer)
  }, [playing, invalidate])
  useEffect(() => {
    const lost = (event) => { event.preventDefault(); onFailure() }
    const canvas = gl.domElement
    canvas.addEventListener('webglcontextlost', lost)
    return () => canvas.removeEventListener('webglcontextlost', lost)
  }, [gl, onFailure])
  useFrame((_, delta) => {
    if (playing) elapsed.current += Math.min(delta, 0.1)
    const angle = 0.55 + Math.sin(elapsed.current / 3.5) * 0.45
    camera.position.set(Math.sin(angle) * 12, 8.5 + Math.sin(elapsed.current / 4) * 1.2, Math.cos(angle) * 12)
    camera.lookAt(0, 0.3, 0)
  })
  return <Court sport={sport} />
}

export default function SportsCanvas({ sport, playing, onFailure }) {
  return <Canvas frameloop="demand" dpr={[1, 1.2]} camera={{ position: [8, 9, 10], fov: 40 }} gl={{ alpha: true, antialias: true, powerPreference: 'low-power' }}>
    <ambientLight intensity={1.7} /><directionalLight position={[4, 8, 5]} intensity={2.5} color="#d6f4de" /><directionalLight position={[-5, 3, -3]} intensity={1.5} color="#8ed9ad" />
    <Flight sport={sport} playing={playing} onFailure={onFailure} />
  </Canvas>
}
