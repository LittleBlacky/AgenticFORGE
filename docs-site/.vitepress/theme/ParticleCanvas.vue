<template>
  <div class="forge-overlay">
    <canvas ref="canvas" class="forge-canvas" />
    <div class="forge-hero-glow" />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const canvas = ref<HTMLCanvasElement | null>(null)
let animFrame: number

interface Particle {
  x: number; y: number; vx: number; vy: number
  r: number; alpha: number; da: number
}

function initCanvas() {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')!
  let W = el.width = window.innerWidth
  let H = el.height = Math.min(window.innerHeight, 720)

  const N = Math.floor(W / 12)
  const particles: Particle[] = []

  function makeParticle(): Particle {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35,
      vy: -Math.random() * 0.45 - 0.05,
      r: Math.random() * 1.6 + 0.3,
      alpha: Math.random() * 0.45 + 0.08,
      da: (Math.random() - 0.5) * 0.003,
    }
  }

  for (let i = 0; i < N; i++) particles.push(makeParticle())

  function draw() {
    ctx.clearRect(0, 0, W, H)
    for (const p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.alpha += p.da
      if (p.alpha < 0.05 || p.alpha > 0.65) p.da *= -1
      if (p.y < -4) { Object.assign(p, makeParticle()); p.y = H + 4 }
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(249,115,22,${p.alpha})`
      ctx.fill()
    }
    // connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const d = Math.sqrt(dx * dx + dy * dy)
        if (d < 90) {
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.strokeStyle = `rgba(249,115,22,${0.07 * (1 - d / 90)})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }
    }
    animFrame = requestAnimationFrame(draw)
  }

  const onResize = () => {
    W = el.width = window.innerWidth
    H = el.height = Math.min(window.innerHeight, 720)
  }
  window.addEventListener('resize', onResize)
  draw()
}

onMounted(() => { initCanvas() })
onUnmounted(() => { cancelAnimationFrame(animFrame) })
</script>
