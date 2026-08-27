<script setup lang="ts">
import { useId } from 'vue'

withDefaults(defineProps<{ size?: number }>(), { size: 40 })

const gid = useId()
</script>

<template>
  <svg
    class="cs2-logo"
    :width="size"
    :height="size"
    viewBox="0 0 64 64"
    fill="none"
    aria-hidden="true"
  >
    <defs>
      <linearGradient
        :id="`cs2lg-gold-${gid}`"
        x1="8"
        y1="6"
        x2="56"
        y2="58"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stop-color="#ffd27a" />
        <stop offset="1" stop-color="#ff9d00" />
      </linearGradient>
    </defs>

    <!-- 外六边形徽章 -->
    <path
      d="M32 2.5 56.5 16.75v30.5L32 61.5 7.5 47.25v-30.5Z"
      :stroke="`url(#cs2lg-gold-${gid})`"
      stroke-width="2.5"
      stroke-linejoin="round"
      fill="rgba(255, 176, 32, 0.06)"
    />
    <!-- 内层六边形 -->
    <path
      d="M32 9 49.5 19v26L32 55 14.5 45V19Z"
      stroke="rgba(255, 176, 32, 0.3)"
      stroke-width="1"
      fill="none"
    />

    <!-- CS2 字标（Counter-Strike 2） -->
    <text
      x="32"
      y="33"
      text-anchor="middle"
      dominant-baseline="central"
      :fill="`url(#cs2lg-gold-${gid})`"
      font-family="Rajdhani, Oswald, 'Arial Narrow', Arial, sans-serif"
      font-size="21"
      font-weight="800"
      letter-spacing="1"
    >CS2</text>

    <!-- 字标下方准星短线（模拟战术准星） -->
    <g :stroke="`url(#cs2lg-gold-${gid})`" stroke-width="2" stroke-linecap="round">
      <line x1="24" y1="46" x2="29" y2="46" />
      <line x1="35" y1="46" x2="40" y2="46" />
    </g>
    <circle cx="32" cy="46" r="1.6" :fill="`url(#cs2lg-gold-${gid})`" />
  </svg>
</template>

<style scoped>
.cs2-logo {
  display: block;
  flex-shrink: 0;
  filter: drop-shadow(0 0 10px rgba(255, 176, 32, 0.35));
}

.cs2-logo text {
  font-variant-ligatures: none;
}
</style>
