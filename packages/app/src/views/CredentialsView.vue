<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle
} from 'reka-ui'
// 密文存 OS 钥匙串(Windows 凭据管理器 / macOS Keychain),明文仅运行时按 credentialRef 读取。
import { useCredentialsStore, type Cred, type CredType } from '@/stores/credentials'

const store = useCredentialsStore()
// 跨重启恢复凭据元信息(本会话已有则不覆盖)。
onMounted(() => store.restore())

const statusMeta = {
  valid: { label: '有效', cls: 'valid' },
  expiring: { label: '即将过期', cls: 'expiring' },
  invalid: { label: '已失效', cls: 'invalid' }
}
const iconStroke = { amber: '#E0A85A', green: '#5dd9b8', mutedred: '#9a6a72' }
const credIcon = (c: Cred): 'lock' | 'proxy' => (c.type === '代理' ? 'proxy' : 'lock')
const credIconColor = (c: Cred): 'amber' | 'green' | 'mutedred' =>
  c.type === '代理' ? 'green' : c.status === 'invalid' ? 'mutedred' : 'amber'

// 新增 / 编辑对话框
const dialogOpen = ref(false)
const editingId = ref<number | null>(null)
const form = reactive<{ name: string; type: CredType; domain: string; secret: string }>({
  name: '',
  type: 'Cookie',
  domain: '',
  secret: ''
})
const domainLabel = computed(() => (form.type === '代理' ? '地址' : '域名'))
const domainPlaceholder = computed(() => (form.type === '代理' ? 'http://127.0.0.1:7890' : 'www.example.com'))
function openCreate() {
  editingId.value = null
  form.name = ''
  form.type = 'Cookie'
  form.domain = ''
  form.secret = ''
  dialogOpen.value = true
}
function openEdit(c: Cred) {
  editingId.value = c.id
  form.name = c.name
  form.type = c.type
  form.domain = c.domain
  form.secret = ''
  dialogOpen.value = true
}
function submitCred() {
  if (!form.name.trim()) return
  if (editingId.value === null) {
    store.addCred(
      {
        name: form.name.trim(),
        type: form.type,
        domain: form.domain.trim(),
        status: 'valid',
        lastUse: '刚添加'
      },
      form.secret
    )
  } else {
    store.updateCred(
      editingId.value,
      { name: form.name.trim(), type: form.type, domain: form.domain.trim() },
      form.secret
    )
  }
  dialogOpen.value = false
}
</script>

<template>
  <section class="view creds">
    <header class="head">
      <div class="head-row">
        <div>
          <h1>凭据管理</h1>
          <p class="sub">Cookie、Token 与代理凭据 · 系统钥匙串加密,绝不上传</p>
        </div>
        <button type="button" class="btn-new" @click="openCreate">+ 新增凭据</button>
      </div>
    </header>

    <div class="body">
      <div class="info-bar">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#9d83ff" stroke-width="1.5">
          <rect x="3.2" y="7" width="9.6" height="6.5" rx="1.4" />
          <path d="M5.3 7V5a2.7 2.7 0 0 1 5.4 0v2" />
        </svg>
        <span class="ib-text">凭据使用系统密钥链加密存储。明文仅在发起请求时于内存中临时解密。</span>
      </div>

      <div v-if="store.creds.length" class="table">
        <div class="t-head">
          <span>凭据 / 域名</span>
          <span>类型</span>
          <span>状态</span>
          <span>最近使用</span>
          <span class="r">操作</span>
        </div>
        <div v-for="(c, i) in store.creds" :key="c.id" class="t-row" :class="{ last: i === store.creds.length - 1 }">
          <div class="cred-id">
            <svg
              v-if="credIcon(c) === 'lock'"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              :stroke="iconStroke[credIconColor(c)]"
              stroke-width="1.5"
              class="ci">
              <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
              <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
            </svg>
            <svg
              v-else
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              :stroke="iconStroke[credIconColor(c)]"
              stroke-width="1.5"
              class="ci">
              <circle cx="6" cy="6" r="2.6" />
              <path d="M7.9 7.9L12.5 12.5M11 10.5l1.6 1.6" />
            </svg>
            <div class="ci-text">
              <div class="cred-name">{{ c.name }}</div>
              <div class="cred-domain mono">{{ c.domain }}</div>
            </div>
          </div>
          <span class="type-cell">
            <span class="type-chip">{{ c.type }}</span>
          </span>
          <span class="status" :class="statusMeta[c.status].cls">
            <span class="sdot" />
            {{ statusMeta[c.status].label }}
          </span>
          <span class="last-use">{{ c.lastUse }}</span>
          <span class="actions">
            <span class="act-edit" @click="openEdit(c)">编辑</span>
            <span class="act-del" @click="store.removeCred(c.id)">删除</span>
          </span>
        </div>
      </div>

      <div v-else class="empty">
        <div class="empty-ico">
          <svg
            width="26"
            height="26"
            viewBox="0 0 16 16"
            fill="none"
            stroke="#5a4a86"
            stroke-width="1.3"
            stroke-linecap="round"
            stroke-linejoin="round">
            <rect x="3.5" y="7" width="9" height="6" rx="1.2" />
            <path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
          </svg>
        </div>
        <div class="empty-title">还没有凭据</div>
        <div class="empty-desc">新增 Cookie、Token 或代理凭据 —— 密文经系统钥匙串加密存储,绝不上传。</div>
        <button type="button" class="btn-new tall" @click="openCreate">+ 新增凭据</button>
      </div>
    </div>

    <!-- 新增 / 编辑凭据对话框 -->
    <DialogRoot v-model:open="dialogOpen">
      <DialogPortal>
        <DialogOverlay class="cr-overlay" />
        <DialogContent class="cr-dialog" @open-auto-focus.prevent>
          <DialogTitle class="cr-dialog-title">{{ editingId === null ? '新增凭据' : '编辑凭据' }}</DialogTitle>
          <DialogDescription class="cr-dialog-desc">
            密文存系统钥匙串,明文仅在发起请求时于内存临时解密。
          </DialogDescription>
          <div class="cr-field">
            <label>名称</label>
            <input v-model="form.name" placeholder="例如 站点 Cookie" />
          </div>
          <div class="cr-field">
            <label>类型</label>
            <div class="cr-seg">
              <span :class="{ on: form.type === 'Cookie' }" @click="form.type = 'Cookie'">Cookie</span>
              <span :class="{ on: form.type === '代理' }" @click="form.type = '代理'">代理</span>
              <span :class="{ on: form.type === 'Token' }" @click="form.type = 'Token'">Token</span>
            </div>
          </div>
          <div class="cr-field">
            <label>{{ domainLabel }}</label>
            <input class="mono" v-model="form.domain" :placeholder="domainPlaceholder" />
          </div>
          <div class="cr-field">
            <label>凭据值</label>
            <textarea
              class="mono"
              v-model="form.secret"
              rows="3"
              :placeholder="editingId === null ? '粘贴 Cookie / Token / 代理认证…' : '留空表示保持不变'" />
          </div>
          <div class="cr-dialog-foot">
            <DialogClose class="cr-btn-ghost">取消</DialogClose>
            <button type="button" class="cr-btn-primary" :disabled="!form.name.trim()" @click="submitCred">
              {{ editingId === null ? '保存' : '更新' }}
            </button>
          </div>
        </DialogContent>
      </DialogPortal>
    </DialogRoot>
  </section>
</template>

<style scoped>
.creds {
  display: flex;
  flex-direction: column;
  height: 100%;
  line-height: normal;
}
.head {
  flex: none;
  padding: 22px 28px 16px;
}
.head-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
.btn-new {
  height: 38px;
  padding: 0 16px;
  border-radius: 9px;
  border: none;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.3);
}

.body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 28px 28px;
}

/* 加密提示条 */
.info-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(124, 92, 252, 0.07);
  border: 1px solid #2e2747;
  border-radius: 10px;
  padding: 11px 14px;
  margin-bottom: 16px;
}
.ib-text {
  font-size: 12px;
  color: #bdb4d8;
}

/* 表格 */
.table {
  background: #14141b;
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
}
.t-head,
.t-row {
  display: grid;
  grid-template-columns: 1fr 150px 130px 150px 90px;
  align-items: center;
}
.t-head {
  font-size: 11px;
  color: var(--text-dim);
  padding: 11px 16px;
  border-bottom: 1px solid #20202a;
  letter-spacing: 0.03em;
}
.t-head .r {
  text-align: right;
}
.t-row {
  padding: 13px 16px;
  border-bottom: 1px solid #1c1c24;
}
.t-row.last {
  border-bottom: 0;
}
.t-row:hover {
  background: #191921;
}
.cred-id {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.ci {
  flex: none;
}
.ci-text {
  min-width: 0;
}
.cred-name {
  font-size: 13px;
  color: var(--text);
}
.cred-domain {
  font-size: 10.5px;
  color: #8a86a6;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.type-chip {
  font-size: 11px;
  color: #9a9aa6;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 2px 9px;
}
.status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
}
.status.valid {
  color: #5dd9b8;
}
.status.expiring {
  color: #d8b27a;
}
.status.invalid {
  color: #f1837d;
}
.sdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status.valid .sdot {
  background: #34d399;
}
.status.expiring .sdot {
  background: var(--warning);
}
.status.invalid .sdot {
  background: var(--danger);
}
.last-use {
  font-size: 11.5px;
  color: var(--text-secondary);
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  font-size: 11.5px;
  color: #7a7a87;
}
.act-edit {
  cursor: pointer;
}
.act-edit:hover {
  color: var(--accent-text);
}
.act-del {
  color: #cf8a8e;
  cursor: pointer;
}
.act-del:hover {
  color: var(--danger);
}

/* 空态 */
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 70px 20px;
}
.empty-ico {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 15px;
  background: var(--bg-card);
  border: 1px solid var(--border);
  margin-bottom: 16px;
}
.empty-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 6px;
}
.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 360px;
  margin-bottom: 18px;
}
.btn-new.tall {
  height: 38px;
}
</style>

<style>
/* Reka 弹层 portal 到 body 外,scoped 够不着 → 全局样式(cr- 前缀避免外泄) */
.cr-overlay {
  position: fixed;
  inset: 0;
  background: rgba(6, 6, 11, 0.62);
  z-index: 1000;
}
.cr-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 440px;
  max-width: calc(100vw - 40px);
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: #15151d;
  border: 1px solid #2a2a34;
  border-radius: 14px;
  padding: 22px;
  z-index: 1001;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  color: var(--text);
  line-height: normal;
}
.cr-dialog:focus {
  outline: none;
}
.cr-dialog-title {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.cr-dialog-desc {
  margin: -6px 0 2px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
}
.cr-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.cr-field label {
  font-size: 11.5px;
  color: #8a8a99;
}
.cr-field input,
.cr-field textarea {
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 8px;
  padding: 8px 11px;
  color: #cdccd8;
  font-size: 12.5px;
  outline: none;
  resize: none;
}
.cr-field input:focus,
.cr-field textarea:focus {
  border-color: var(--accent);
}
.cr-field input::placeholder,
.cr-field textarea::placeholder {
  color: #56565f;
}
.cr-seg {
  display: flex;
  width: fit-content;
  background: var(--bg);
  border: 1px solid #2a2a34;
  border-radius: 8px;
  padding: 3px;
}
.cr-seg span {
  font-size: 12px;
  color: var(--text-secondary);
  padding: 5px 14px;
  border-radius: 6px;
  cursor: pointer;
}
.cr-seg span.on {
  color: #fff;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
}
.cr-dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 4px;
}
.cr-btn-ghost {
  height: 36px;
  padding: 0 16px;
  border-radius: 9px;
  background: var(--bg-elevated);
  border: 1px solid #2e2e38;
  color: #cdccd8;
  font-size: 13px;
  cursor: pointer;
}
.cr-btn-ghost:hover {
  border-color: #3a3a46;
}
.cr-btn-primary {
  height: 36px;
  padding: 0 20px;
  border-radius: 9px;
  background: linear-gradient(135deg, var(--accent), var(--accent-2));
  border: none;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(124, 92, 252, 0.3);
}
.cr-btn-primary:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  box-shadow: none;
}
</style>
