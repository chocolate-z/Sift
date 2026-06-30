import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Rule } from '@sift/core-ir'

/** 数据预览的一列(由规则 output 列驱动)。 */
export interface DatasetColumn {
  name: string
  field: string
  type?: string
}

export type DatasetRow = Record<string, string | null>

// 引擎 run_rule 跑出的真实数据集。active=true 表示"已跑过一轮"(即便 0 条),
// 用于区分「未跑 → 显示 1:1 种子演示」与「跑过但无结果 → 提示空」。
export const useDatasetStore = defineStore('dataset', () => {
  const active = ref(false)
  const columns = ref<DatasetColumn[]>([])
  const rows = ref<DatasetRow[]>([])
  const sourceName = ref('')
  const warnings = ref<string[]>([])
  // 当前展示的数据集对应的已存库 id(供历史列表高亮);新跑出/未落库时为 null。
  const currentId = ref<number | null>(null)
  // 最近一次运行的规则与输入(供调试台「开始调试」复用重跑、逐步可视)。
  const lastRule = ref<Rule | null>(null)
  const lastInputs = ref<Record<string, string>>({})

  function setLastRun(rule: Rule, inputs: Record<string, string>) {
    lastRule.value = rule
    lastInputs.value = inputs
  }

  function setResult(cols: DatasetColumn[], data: DatasetRow[], source: string, warns: string[] = []) {
    active.value = true
    columns.value = cols
    rows.value = data
    sourceName.value = source
    warnings.value = warns
    currentId.value = null
  }

  function setCurrentId(id: number | null) {
    currentId.value = id
  }

  function clear() {
    active.value = false
    columns.value = []
    rows.value = []
    sourceName.value = ''
    warnings.value = []
    currentId.value = null
  }

  return {
    active,
    columns,
    rows,
    sourceName,
    warnings,
    currentId,
    lastRule,
    lastInputs,
    setResult,
    setCurrentId,
    setLastRun,
    clear
  }
})
