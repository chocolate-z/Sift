<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

let uid = 0
const mkId = () => ++uid

// 请求头;lock 类型=加密凭据,只读掩码
interface HeaderRow {
  id: number
  key: string
  type: 'text' | 'lock'
  value?: string
  masked?: string
  note?: string
}
const DEFAULT_HEADERS: Omit<HeaderRow, 'id'>[] = [
  { key: 'User-Agent', value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', type: 'text' },
  { key: 'Referer', value: 'https://www.qimao.com/', type: 'text' },
  { key: 'Cookie', masked: '•••••••••••••••••••••••', note: '来自 Cookie 区', type: 'lock' },
  { key: 'Authorization', masked: 'Bearer ••••••••••••••••', type: 'lock' }
]

// Cookie 按域名隔离,本地加密
interface CookieGroup {
  id: number
  domain: string
  value: string
  plain: string
  keys: number
  revealed: boolean
  editable: boolean
}
const DEFAULT_COOKIES: Omit<CookieGroup, 'id' | 'revealed' | 'editable'>[] = [
  {
    domain: 'www.qimao.com',
    value: 'u_id=•••••••••; sajssdk=••••••••••••••; token=••••••',
    plain: 'u_id=884213097; sajssdk=9f8a7b6c5d4e3f; token=a1b2c3d4',
    keys: 3
  },
  {
    domain: 'www.jiugangbi.com',
    value: 'PHPSESSID=••••••••••••••••••••••••',
    plain: 'PHPSESSID=k3j9d8s7a6f5g4h3j2k1l0p9',
    keys: 1
  }
]

interface ProxyCfg {
  enabled: boolean
  type: 'http' | 'socks5'
  host: string
  port: string
  user: string
  pass: string
}
const makeProxy = (): ProxyCfg => ({ enabled: true, type: 'http', host: '127.0.0.1', port: '7890', user: '', pass: '' })

const cloneHeaders = (): HeaderRow[] => DEFAULT_HEADERS.map((h) => ({ id: mkId(), ...h }))
const cloneCookies = (): CookieGroup[] =>
  DEFAULT_COOKIES.map((c) => ({ id: mkId(), revealed: false, editable: false, ...c }))

const headers = ref<HeaderRow[]>(cloneHeaders())
const cookieGroups = ref<CookieGroup[]>(cloneCookies())
const proxy = ref<ProxyCfg>(makeProxy())
const advOpen = ref(false)
const concurrency = ref(2)
const interval = ref(800)
const intervalEnabled = ref(true)
const timeout = ref('6000ms')
const retry = ref('2')

function addHeader() {
  headers.value.push({ id: mkId(), key: '', value: '', type: 'text' })
}
function removeHeader(i: number) {
  headers.value.splice(i, 1)
}
function addCookie() {
  cookieGroups.value.push({ id: mkId(), domain: '', value: '', plain: '', keys: 0, revealed: true, editable: true })
}
function removeCookie(i: number) {
  cookieGroups.value.splice(i, 1)
}
function groupKeys(g: CookieGroup): number {
  if (!g.editable) return g.keys
  return g.plain
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.includes('=')).length
}

// 限速并发滑块
interface SliderOpts {
  get: () => number
  set: (v: number) => void
  min: number
  max: number
  step: number
}
const concurrencyOpts: SliderOpts = {
  get: () => concurrency.value,
  set: (v) => (concurrency.value = v),
  min: 1,
  max: 8,
  step: 1
}
const intervalOpts: SliderOpts = {
  get: () => interval.value,
  set: (v) => (interval.value = v),
  min: 0,
  max: 2000,
  step: 50
}
const fillPct = (v: number, o: SliderOpts) => ((v - o.min) / (o.max - o.min)) * 100
const concFill = computed(() => fillPct(concurrency.value, concurrencyOpts))
const intervalFill = computed(() => fillPct(interval.value, intervalOpts))

function clampStep(raw: number, o: SliderOpts): number {
  const stepped = Math.round(raw / o.step) * o.step
  return Math.min(o.max, Math.max(o.min, stepped))
}
function dragSlider(e: PointerEvent, o: SliderOpts) {
  const track = e.currentTarget as HTMLElement
  const rect = track.getBoundingClientRect()
  const apply = (x: number) => {
    const f = Math.min(1, Math.max(0, (x - rect.left) / rect.width))
    o.set(clampStep(o.min + f * (o.max - o.min), o))
  }
  apply(e.clientX)
  const move = (ev: PointerEvent) => apply(ev.clientX)
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
}
function keySlider(e: KeyboardEvent, o: SliderOpts) {
  let delta = 0
  if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') delta = -o.step
  else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') delta = o.step
  else if (e.key === 'Home') {
    e.preventDefault()
    return o.set(o.min)
  } else if (e.key === 'End') {
    e.preventDefault()
    return o.set(o.max)
  } else return
  e.preventDefault()
  o.set(clampStep(o.get() + delta, o))
}

// 底部动作
const saved = ref(false)
let savedTimer: ReturnType<typeof setTimeout> | undefined
function resetDefaults() {
  headers.value = cloneHeaders()
  cookieGroups.value = cloneCookies()
  proxy.value = makeProxy()
  concurrency.value = 2
  interval.value = 800
  intervalEnabled.value = true
  timeout.value = '6000ms'
  retry.value = '2'
}
function saveConfig() {
  saved.value = true
  if (savedTimer) clearTimeout(savedTimer)
  savedTimer = setTimeout(() => (saved.value = false), 1500)
}
onBeforeUnmount(() => {
  if (savedTimer) clearTimeout(savedTimer)
})
</script>

<template>
  <section class="view config">
    <header class="head">
      <h1>请求配置</h1>
      <p class="sub">统一管理请求头、Cookie、代理与限速 · 凭据本地加密存储</p>
    </header>

    <div class="body">
      <div class="stack">
        <!-- 合规信息条 -->
        <div class="info-bar">
          <svg
            width="17"
            height="17"
            viewBox="0 0 16 16"
            fill="none"
            stroke="#9d83ff"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            class="ib-ico">
            <rect x="3.2" y="7" width="9.6" height="6.5" rx="1.4" />
            <path d="M5.3 7V5a2.7 2.7 0 0 1 5.4 0v2" />
          </svg>
          <span class="ib-text">
            Sift 是本地优先的中立工具,请仅填入你
            <b>有权访问</b>
            的凭据。所有凭据
            <b>本地加密存储,绝不上传</b>
            。
          </span>
        </div>

        <!-- 请求头 -->
        <div class="panel">
          <div class="card-head">
            <span class="card-title">请求头</span>
            <span class="count mono">{{ headers.length }}</span>
            <span class="card-note">对所有请求生效</span>
          </div>
          <div class="card-body gap8">
            <div v-for="(h, i) in headers" :key="h.id" class="hrow">
              <input class="hkey mono" v-model="h.key" />
              <input v-if="h.type === 'text'" class="hval mono" v-model="h.value" />
              <div v-else class="hlock">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="#E0A85A"
                  stroke-width="1.5"
                  class="lock-ico">
                  <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                </svg>
                <span class="hmask mono">{{ h.masked }}</span>
                <span v-if="h.note" class="hnote">{{ h.note }}</span>
              </div>
              <span class="del" @click="removeHeader(i)">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="1.4"
                  stroke-linecap="round">
                  <path d="M3.5 4.5h9M6.5 4.5V3.2h3v1.3M5 4.5l.6 8h4.8l.6-8" />
                </svg>
              </span>
            </div>
            <button type="button" class="add-dashed" @click="addHeader">+ 添加请求头</button>
          </div>
        </div>

        <!-- Cookie -->
        <div class="panel">
          <div class="card-head">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="#E0A85A" stroke-width="1.5">
              <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
            <span class="card-title">Cookie</span>
            <span class="count mono">{{ cookieGroups.length }} 组</span>
            <span class="card-note">按域名隔离</span>
          </div>
          <div class="card-body gap10">
            <div v-for="(g, i) in cookieGroups" :key="g.id" class="ck-group">
              <div class="ck-top">
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="#5dd9b8" stroke-width="1.5">
                  <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
                  <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                </svg>
                <input
                  v-if="g.editable"
                  class="ck-domain-inp mono"
                  v-model="g.domain"
                  placeholder="域名,如 www.example.com" />
                <span v-else class="ck-domain mono">{{ g.domain }}</span>
                <span class="enc-tag">
                  <svg
                    width="9"
                    height="9"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="#34D399"
                    stroke-width="2.2"
                    stroke-linecap="round"
                    stroke-linejoin="round">
                    <path d="M3 8.5l3 3 7-7" />
                  </svg>
                  已加密
                </span>
                <span class="ck-keys">{{ groupKeys(g) }} 个键</span>
                <span v-if="g.editable" class="ck-del" @click="removeCookie(i)">×</span>
              </div>
              <div class="ck-val">
                <input
                  v-if="g.editable"
                  class="ckv-inp mono"
                  v-model="g.plain"
                  placeholder="粘贴 Cookie 字符串,如 key=value; key2=value2" />
                <span v-else class="ckv-mask mono">{{ g.revealed ? g.plain : g.value }}</span>
                <span v-if="!g.editable" class="eye" @click="g.revealed = !g.revealed">
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4">
                    <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
                    <circle cx="8" cy="8" r="2" />
                    <path v-if="g.revealed" d="M2.5 2.5l11 11" />
                  </svg>
                </span>
              </div>
            </div>
            <button type="button" class="add-dashed" @click="addCookie">+ 添加 Cookie 组</button>
          </div>
        </div>

        <!-- 高级设置(折叠) -->
        <div class="adv-bar" @click="advOpen = !advOpen">
          <svg
            width="15"
            height="15"
            viewBox="0 0 16 16"
            fill="none"
            stroke="#9d83ff"
            stroke-width="1.4"
            stroke-linecap="round"
            stroke-linejoin="round">
            <circle cx="8" cy="8" r="2" />
            <path
              d="M8 1.6v2M8 12.4v2M14.4 8h-2M3.6 8h-2M12.5 3.5l-1.4 1.4M4.9 11.1l-1.4 1.4M12.5 12.5l-1.4-1.4M4.9 4.9L3.5 3.5" />
          </svg>
          <span class="card-title">高级设置</span>
          <span class="card-note light">代理 · 认证</span>
          <span class="adv-chevron" :class="{ open: advOpen }">▾</span>
        </div>

        <!-- 代理(展开时) -->
        <div v-if="advOpen" class="panel">
          <div class="card-head">
            <span class="card-title">代理</span>
            <span class="proxy-toggle">
              <span class="pt-label" :class="{ off: !proxy.enabled }">{{ proxy.enabled ? '已启用' : '已禁用' }}</span>
              <span class="toggle" :class="{ on: proxy.enabled }" @click="proxy.enabled = !proxy.enabled"><i /></span>
            </span>
          </div>
          <div class="proxy-body" :class="{ disabled: !proxy.enabled }">
            <div class="field">
              <span class="field-label">类型</span>
              <div class="seg">
                <span :class="{ on: proxy.type === 'http' }" @click="proxy.type = 'http'">HTTP</span>
                <span :class="{ on: proxy.type === 'socks5' }" @click="proxy.type = 'socks5'">SOCKS5</span>
              </div>
            </div>
            <div class="field grow">
              <span class="field-label">地址</span>
              <input class="inp mono" v-model="proxy.host" />
            </div>
            <div class="field w100">
              <span class="field-label">端口</span>
              <input class="inp mono" v-model="proxy.port" />
            </div>
            <div class="field grow2">
              <span class="field-label">认证(可选)</span>
              <div class="auth-row">
                <input class="inp mono" placeholder="用户名" v-model="proxy.user" />
                <input class="inp mono" type="password" placeholder="密码" v-model="proxy.pass" />
              </div>
            </div>
          </div>
        </div>

        <!-- 限速与并发 -->
        <div class="panel">
          <div class="card-head">
            <span class="card-title">限速与并发</span>
            <span class="rate-warn">
              <svg
                width="12"
                height="12"
                viewBox="0 0 16 16"
                fill="none"
                stroke="#E0A85A"
                stroke-width="1.5"
                stroke-linecap="round">
                <circle cx="8" cy="8" r="6" />
                <path d="M8 5v3.5M8 10.7v.01" />
              </svg>
              默认限速以保护目标站点并降低账号风险
            </span>
          </div>
          <div class="rate-grid">
            <div>
              <div class="slider-head">
                <span class="sl-label">并发数</span>
                <span class="sl-val mono">{{ concurrency }}</span>
              </div>
              <div
                class="slider"
                role="slider"
                tabindex="0"
                :aria-valuemin="concurrencyOpts.min"
                :aria-valuemax="concurrencyOpts.max"
                :aria-valuenow="concurrency"
                aria-label="并发数"
                @pointerdown="dragSlider($event, concurrencyOpts)"
                @keydown="keySlider($event, concurrencyOpts)">
                <div class="sl-fill" :style="{ width: concFill + '%' }" />
                <div class="sl-thumb" :style="{ left: `calc(${concFill}% - 7px)` }" />
              </div>
              <div class="sl-scale">
                <span>1</span>
                <span>8</span>
              </div>
            </div>
            <div>
              <div class="slider-head">
                <span class="sl-label">请求间隔</span>
                <span class="sl-right">
                  <span class="sl-val mono">{{ interval }}ms</span>
                  <span class="toggle sm" :class="{ on: intervalEnabled }" @click="intervalEnabled = !intervalEnabled">
                    <i />
                  </span>
                </span>
              </div>
              <div
                class="slider"
                role="slider"
                tabindex="0"
                :aria-valuemin="intervalOpts.min"
                :aria-valuemax="intervalOpts.max"
                :aria-valuenow="interval"
                aria-label="请求间隔(毫秒)"
                @pointerdown="dragSlider($event, intervalOpts)"
                @keydown="keySlider($event, intervalOpts)">
                <div class="sl-fill" :style="{ width: intervalFill + '%' }" />
                <div class="sl-thumb" :style="{ left: `calc(${intervalFill}% - 7px)` }" />
              </div>
              <div class="sl-scale">
                <span>0</span>
                <span>2000ms</span>
              </div>
            </div>
            <div class="field">
              <span class="sl-label">超时</span>
              <input class="inp mono" v-model="timeout" />
            </div>
            <div class="field">
              <span class="sl-label">重试次数</span>
              <input class="inp mono" v-model="retry" />
            </div>
          </div>
        </div>

        <!-- 底部动作 -->
        <div class="foot">
          <button type="button" class="btn-soft" @click="resetDefaults">恢复默认</button>
          <button type="button" class="btn-primary" @click="saveConfig">{{ saved ? '已保存 ✓' : '保存配置' }}</button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.config {
  display: flex;
  flex-direction: column;
  height: 100%;
  line-height: normal;
}
.head {
  flex: none;
  padding: 22px 28px 16px;
}
.head h1 {
  margin: 0 0 3px;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.head .sub {
  font-size: 13px;
  color: var(--text-secondary);
}
.body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px 28px;
}
.stack {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 合规信息条 */
.info-bar {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  background: rgba(124, 92, 252, 0.08);
  border: 1px solid #2e2747;
  border-radius: 10px;
  padding: 13px 15px;
}
.ib-ico {
  flex: none;
  margin-top: 1px;
}
.ib-text {
  font-size: 12.5px;
  color: #bdb4d8;
  line-height: 1.5;
}
.ib-text b {
  color: var(--text);
  font-weight: 400;
}

/* 卡片通用 */
.panel {
  background: #14141b;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.card-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 13px 16px;
  border-bottom: 1px solid #20202a;
}
.card-title {
  font-size: 14px;
  font-weight: 600;
}
.count {
  font-size: 10.5px;
  color: #8a86a6;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 1px 7px;
}
.card-note {
  margin-left: auto;
  font-size: 11.5px;
  color: #7a7a87;
}
.card-note.light {
  margin-left: 0;
}
.card-body {
  display: flex;
  flex-direction: column;
  padding: 13px 16px;
}
.card-body.gap8 {
  gap: 8px;
}
.card-body.gap10 {
  gap: 10px;
}

/* 请求头行 */
.hrow {
  display: flex;
  align-items: center;
  gap: 9px;
}
.hkey {
  width: 160px;
  flex: none;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 7px;
  padding: 7px 9px;
  color: #cdccd8;
  font-size: 11.5px;
  outline: none;
}
.hval {
  flex: 1;
  min-width: 0;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 7px;
  padding: 7px 9px;
  color: #a9a4c9;
  font-size: 11.5px;
  outline: none;
  text-overflow: ellipsis;
}
.hkey:focus,
.hval:focus,
.inp:focus {
  border-color: var(--accent);
}
.hlock {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 7px;
  padding: 7px 9px;
}
.lock-ico {
  flex: none;
}
.hmask {
  flex: 1;
  font-size: 11.5px;
  color: #8a86a6;
  letter-spacing: 1px;
}
.hnote {
  flex: none;
  font-size: 10px;
  color: #5dd9b8;
}
.del {
  flex: none;
  display: flex;
  padding: 6px;
  color: var(--text-dim);
  cursor: pointer;
}
.del:hover {
  color: var(--danger);
}
.add-dashed {
  align-self: flex-start;
  height: 32px;
  padding: 0 13px;
  margin-top: 3px;
  border-radius: 8px;
  background: none;
  border: 1px dashed #33333f;
  color: #9a9aa6;
  font-size: 12px;
  cursor: pointer;
}
.add-dashed:hover {
  border-color: var(--accent);
  color: #cdccd8;
}

/* Cookie 组 */
.ck-group {
  background: var(--bg);
  border: 1px solid #24242e;
  border-radius: 9px;
  padding: 11px 13px;
}
.ck-top {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 9px;
}
.ck-domain {
  font-size: 12px;
  color: var(--text);
}
.ck-domain-inp {
  width: 220px;
  background: none;
  border: none;
  outline: none;
  font-size: 12px;
  color: var(--text);
}
.ck-domain-inp::placeholder {
  color: #56565f;
}
.enc-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: #5dd9b8;
  background: rgba(45, 212, 191, 0.1);
  border: 1px solid rgba(45, 212, 191, 0.3);
  border-radius: 5px;
  padding: 1px 7px;
}
.ck-keys {
  margin-left: auto;
  font-size: 11px;
  color: #7a7a87;
}
.ck-del {
  flex: none;
  font-size: 15px;
  line-height: 1;
  color: var(--text-dim);
  cursor: pointer;
  padding: 0 2px;
}
.ck-del:hover {
  color: var(--danger);
}
.ck-val {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-card);
  border: 1px solid #24242e;
  border-radius: 7px;
  padding: 7px 10px;
}
.ckv-mask {
  flex: 1;
  font-size: 11.5px;
  color: #8a86a6;
  letter-spacing: 1px;
}
.ckv-inp {
  flex: 1;
  min-width: 0;
  background: none;
  border: none;
  outline: none;
  font-size: 11.5px;
  color: #cdccd8;
}
.ckv-inp::placeholder {
  color: #56565f;
  letter-spacing: 0;
}
.eye {
  flex: none;
  display: flex;
  color: #7a7a87;
  cursor: pointer;
}
.eye:hover {
  color: var(--accent-text);
}

/* 高级设置折叠条 */
.adv-bar {
  display: flex;
  align-items: center;
  gap: 9px;
  background: #14141b;
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 13px 16px;
  cursor: pointer;
}
.adv-bar:hover {
  border-color: #33333f;
}
.adv-chevron {
  margin-left: auto;
  font-size: 13px;
  color: var(--text-secondary);
  width: 14px;
  text-align: center;
  transition: transform 0.15s;
}
.adv-chevron.open {
  transform: rotate(180deg);
}

/* 代理 */
.proxy-toggle {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pt-label {
  font-size: 11.5px;
  color: var(--accent-text);
}
.pt-label.off {
  color: var(--text-secondary);
}
.toggle {
  width: 30px;
  height: 17px;
  border-radius: 9px;
  background: #3a3a46;
  position: relative;
  flex: none;
  cursor: pointer;
  transition: background 0.15s;
}
.toggle i {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
  transition: left 0.15s;
}
.toggle.on {
  background: var(--accent);
}
.toggle.on i {
  left: 15px;
}
.toggle.sm {
  width: 28px;
  height: 16px;
}
.toggle.sm i {
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  box-shadow: none;
}
.toggle.sm.on i {
  left: 14px;
}
.proxy-body {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: flex-end;
  padding: 14px 16px;
}
.proxy-body.disabled {
  opacity: 0.5;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field.grow {
  flex: 1;
  min-width: 200px;
}
.field.grow2 {
  flex: 1;
  min-width: 160px;
}
.field.w100 {
  width: 100px;
}
.field-label {
  font-size: 11px;
  color: #7a7a87;
}
.inp {
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 8px;
  padding: 8px 11px;
  color: #cdccd8;
  font-size: 12px;
  outline: none;
}
.auth-row {
  display: flex;
  gap: 8px;
}
.auth-row .inp {
  flex: 1;
  min-width: 0;
}
.seg {
  display: flex;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 8px;
  padding: 3px;
}
.seg span {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 5px 13px;
  border-radius: 6px;
  cursor: pointer;
}
.seg span.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}

/* 限速与并发 */
.rate-warn {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: #d8b27a;
}
.rate-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px 28px;
  padding: 16px;
}
.slider-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 9px;
}
.sl-label {
  font-size: 12.5px;
  color: #cdccd8;
}
.sl-val {
  font-size: 12px;
  color: var(--accent-text);
}
.sl-right {
  display: flex;
  align-items: center;
  gap: 7px;
}
.slider {
  position: relative;
  height: 5px;
  background: var(--border);
  border-radius: 3px;
  cursor: pointer;
  touch-action: none;
}
.slider:focus-visible {
  outline: none;
}
.slider:focus-visible .sl-thumb {
  box-shadow:
    0 1px 4px rgba(0, 0, 0, 0.5),
    0 0 0 4px rgba(124, 92, 252, 0.3);
}
.sl-fill {
  position: absolute;
  left: 0;
  top: 0;
  height: 5px;
  background: linear-gradient(90deg, var(--accent), var(--accent-2));
  border-radius: 3px;
}
.sl-thumb {
  position: absolute;
  top: -5px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}
.sl-scale {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 10px;
  color: #56565f;
}
.rate-grid .field .inp {
  font-family: var(--font-mono);
}

/* 底部动作 */
.foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding-top: 2px;
}
.btn-soft {
  height: 38px;
  padding: 0 16px;
  border-radius: 9px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
  font-size: 13px;
  cursor: pointer;
}
.btn-soft:hover {
  border-color: #3a3a46;
}
.btn-primary {
  height: 38px;
  padding: 0 22px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border: none;
  color: #fff;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.32);
}
</style>
