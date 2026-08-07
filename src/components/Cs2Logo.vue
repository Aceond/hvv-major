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
    <!-- 六边形徽章 -->
    <path
      d="M32 2.5 56.5 16.75v30.5L32 61.5 7.5 47.25v-30.5Z"
      :stroke="`url(#cs2lg-gold-${gid})`"
      stroke-width="2.5"
      stroke-linejoin="round"
      fill="rgba(255, 176, 32, 0.05)"
    />
    <!-- 内层六边形 -->
    <path
      d="M32 9 49.5 19v26L32 55 14.5 45V19Z"
      stroke="rgba(255, 176, 32, 0.3)"
      stroke-width="1"
      fill="none"
    />
    <!-- 十字准星 -->
    <g :stroke="`url(#cs2lg-gold-${gid})`" stroke-width="3" stroke-linecap="round">
      <line x1="32" y1="16" x2="32" y2="25" />
      <line x1="32" y1="39" x2="32" y2="48" />
      <line x1="16" y1="32" x2="25" y2="32" />
      <line x1="39" y1="32" x2="48" y2="32" />
    </g>
    <circle cx="32" cy="32" r="3" :fill="`url(#cs2lg-gold-${gid})`" />
  </svg>
</template>

<style scoped>
.cs2-logo {
  display: block;
  flex-shrink: 0;
  filter: drop-shadow(0 0 10px rgba(255, 176, 32, 0.35));
}
</style>
