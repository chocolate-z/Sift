<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const title = computed(() => String(route.meta.title ?? ''))
</script>

<template>
  <section class="view">
    <header class="view-head">
      <div>
        <h1>{{ title }}</h1>
        <p class="sub">该功能正在建设中。</p>
      </div>
    </header>
    <div class="view-body">
      <div class="placeholder">建设中 · {{ title }}</div>
    </div>
  </section>
</template>
