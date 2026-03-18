<template>
  <div class="forge-home">
    <!-- Particle canvas background -->
    <canvas ref="canvas" class="forge-canvas" />

    <!-- Hero -->
    <section class="forge-hero">
      <div class="forge-hero-glow" />
      <div class="forge-hero-content">
        <div class="forge-badge">v1.1.2 · MIT License</div>
        <h1 class="forge-title">
          <span class="forge-title-main">AgenticFORGE</span>
          <span class="forge-title-sub">{{ displayText }}<span class="forge-cursor">|</span></span>
        </h1>
        <p class="forge-tagline">
          Build production-ready AI agents driven by tool invocation —
          ReAct, Plan-and-Solve, Reflection, FunctionCall, and more.
        </p>
        <div class="forge-actions">
          <a href="/guide/introduction" class="forge-btn forge-btn-brand">Get Started →</a>
          <a href="https://github.com/LittleBlacky/AgenticFORGE" target="_blank" class="forge-btn forge-btn-outline">GitHub</a>
          <a href="https://www.npmjs.com/package/@agenticforge/kit" target="_blank" class="forge-btn forge-btn-outline">npm</a>
        </div>
        <div class="forge-stats">
          <div class="forge-stat">
            <span class="forge-stat-num">8</span>
            <span class="forge-stat-label">Packages</span>
          </div>
          <div class="forge-stat-divider" />
          <div class="forge-stat">
            <span class="forge-stat-num">5</span>
            <span class="forge-stat-label">Agent Workflows</span>
          </div>
          <div class="forge-stat-divider" />
          <div class="forge-stat">
            <span class="forge-stat-num">4</span>
            <span class="forge-stat-label">Memory Types</span>
          </div>
          <div class="forge-stat-divider" />
          <div class="forge-stat">
            <span class="forge-stat-num">100%</span>
            <span class="forge-stat-label">TypeScript</span>
          </div>
        </div>
      </div>
    </section>

    <!-- Features -->
    <section class="forge-features" ref="featuresRef">
      <div class="forge-features-inner">
        <div
          v-for="(f, i) in features"
          :key="f.title"
          class="forge-card"
          :class="{visible: visibleCards.has(i)}"
          :style="{transitionDelay: (i * 80) + 'ms'}"
        >
          <div class="forge-card-icon">{{ f.icon }}</div>
          <h3 class="forge-card-title">{{ f.title }}</h3>
          <p class="forge-card-desc">{{ f.desc }}</p>
        </div>
      </div>
    </section>

    <!-- Code showcase -->
    <section class="forge-code-section" ref="codeRef">
      <div class="forge-code-inner" :class="{visible: codeVisible}">
        <div class="forge-code-label">60-second quickstart</div>
        <pre class="forge-code"><code>{{ codeExample }}</code></pre>
      </div>
    </section>

    <!-- Default slot for markdown content -->
    <Content />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Content } from 'vitepress'

// ── Typewriter ──────────────────────────────────────────────────────────────
const phrases = [
  'TypeScript Agent Framework',
  'Tool-Driven AI Agents',
  'ReAct · Plan · Reflect',
  'Pluggable Memory & RAG',
]
const displayText = ref('')
let phraseIdx = 0, charIdx = 0, deleting = false
let typerTimer: ReturnType<typeof setTimeout>

function typeStep() {
  const phrase = phrases[phraseIdx]
  if (!deleting) {
    displayText.value = phrase.slice(0, ++charIdx)
    if (charIdx === phrase.length) { deleting = true; typerTimer = setTimeout(typeStep, 1800); return }
  } else {
    displayText.value = phrase.slice(0, --charIdx)
    if (charIdx === 0) { deleting = false; phraseIdx = (phraseIdx + 1) % phrases.length }
  }
  typerTimer = setTimeout(typeStep, deleting ? 40 : 75)
}

// ── Particle canvas ─────────────────────────────────────────────────────────
const canvas = ref<HTMLCanvasElement | null>(null)
let animFrame: number

interface Particle {
  x: number; y: number; vx: number; vy: number
  r: number; alpha: number; da: number
}

function initCanvas() {
  const el = canvas.value; if (!el) return
  const ctx = el.getContext('2d')!
  let W = el.width = window.innerWidth
  let H = el.height = Math.min(window.innerHeight, 700)
  const particles: Particle[] = []
  const N = Math.floor(W / 10)

  for (let i = 0; i < N; i++) particles.push(makeParticle(W, H))

  function makeParticle(w: number, h: number): Particle {
    return {
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4, vy: -Math.random() * 0.5 - 0.1,
      r: Math.random() * 1.8 + 0.4,
      alpha: Math.random() * 0.5 + 0.1,
      da: (Math.random() - 0.5) * 0.003,
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H)
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.alpha += p.da
      if (p.alpha < 0.05 || p.alpha > 0.7) p.da *= -1
      if (p.y < -4) { Object.assign(p, makeParticle(W, H)); p.y = H + 4 }
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(249,115,22,${p.alpha})`
      ctx.fill()
    }
    // draw connecting lines
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x
        const dy = particles[i].y - particles[j].y
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist < 80) {
          ctx.beginPath()
          ctx.moveTo(particles[i].x, particles[i].y)
          ctx.lineTo(particles[j].x, particles[j].y)
          ctx.strokeStyle = `rgba(249,115,22,${0.06 * (1 - dist / 80)})`
          ctx.lineWidth = 0.5
          ctx.stroke()
        }
      }
    }
    animFrame = requestAnimationFrame(draw)
  }

  const onResize = () => {
    W = el.width = window.innerWidth
    H = el.height = Math.min(window.innerHeight, 700)
  }
  window.addEventListener('resize', onResize)
  draw()
}

// ── Scroll reveal ────────────────────────────────────────────────────────────
const featuresRef = ref<HTMLElement | null>(null)
const codeRef = ref<HTMLElement | null>(null)
const visibleCards = ref(new Set<number>())
const codeVisible = ref(false)
let observer: IntersectionObserver

function initObserver() {
  observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.target === codeRef.value && entry.isIntersecting) {
        codeVisible.value = true
      }
    })
  }, { threshold: 0.2 })

  const cardObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const idx = Number((entry.target as HTMLElement).dataset.idx)
        visibleCards.value = new Set([...visibleCards.value, idx])
      }
    })
  }, { threshold: 0.15 })

  if (featuresRef.value) {
    const cards = featuresRef.value.querySelectorAll('.forge-card')
    cards.forEach((card, i) => {
      ;(card as HTMLElement).dataset.idx = String(i)
      cardObserver.observe(card)
    })
  }
  if (codeRef.value) observer.observe(codeRef.value)
}

// ── Data ─────────────────────────────────────────────────────────────────────
const features = [
  { icon: '⚡', title: 'Tool-Driven', desc: 'Unified Tool / ToolRegistry / ToolChain abstractions with Zod validation and async support.' },
  { icon: '🧠', title: '5 Agent Workflows', desc: 'ReAct, Plan-and-Solve, Reflection, FunctionCall, Simple — pick the right loop for your task.' },
  { icon: '🗄️', title: 'Multi-Layer Memory', desc: 'Working, episodic, semantic, and perceptual memory types under one MemoryManager API.' },
  { icon: '🔌', title: 'Pluggable Storage', desc: 'In-memory, Qdrant, Neo4j — swap backends without changing application code.' },
  { icon: '📖', title: 'Built-in RAG', desc: 'Index documents, run semantic search, and generate grounded answers out of the box.' },
  { icon: '🛡️', title: 'Full Type Safety', desc: 'Complete TypeScript declarations, strict-mode compatible, zero any on the public API.' },
]

const codeExample = `import { FunctionCallAgent, LLMClient, Tool, toolAction } from "@agenticforge/kit";
import { z } from "zod";

const weatherTool = new Tool({
  name: "get_weather",
  description: "Get the current weather for a city",
  parameters: [{ name: "city", type: "string", required: true }],
  action: toolAction(z.object({ city: z.string() }), async ({ city }) => {
    return \`\${city}: sunny, 25°C\`;
  }),
});

const agent = new FunctionCallAgent({
  llm: new LLMClient({ provider: "openai", model: "gpt-4o" }),
  tools: [weatherTool],
});

const result = await agent.run("What's the weather in Tokyo?");
console.log(result);`

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  typeStep()
  initCanvas()
  setTimeout(initObserver, 100)
})

onUnmounted(() => {
  clearTimeout(typerTimer)
  cancelAnimationFrame(animFrame)
  observer?.disconnect()
})
</script>
