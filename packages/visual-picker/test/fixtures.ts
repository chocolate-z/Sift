// ============================================================================
// Verification fixtures (line A). Constructs the e-commerce list DOM described
// in §6.4 as plain VNode objects with parent references — no real browser.
//
//   body
//   ├── header.site-header
//   ├── div.product-list#list
//   │   └── 5 × div.product-card
//   │       ├── a.title[href]
//   │       ├── span.price
//   │       └── img.cover[data-src]   (lazy-loaded, no src)
//   └── footer.site-footer
// ============================================================================

import type { VNode } from '../src/types'

interface ElOpts {
  id?: string
  class?: string[]
  attrs?: Record<string, string>
  text?: string
}

export function el(tag: string, opts: ElOpts = {}, children: VNode[] = []): VNode {
  const node: VNode = {
    tag,
    classList: opts.class ?? [],
    attrs: opts.attrs ?? {},
    children: [],
    parent: null
  }
  if (opts.id !== undefined) node.id = opts.id
  if (opts.text !== undefined) node.text = opts.text
  for (const c of children) {
    c.parent = node
    node.children.push(c)
  }
  return node
}

export interface Ecommerce {
  body: VNode
  productList: VNode
  cards: VNode[]
  card3: VNode
  card3Title: VNode
  card3Price: VNode
  card3Cover: VNode
  header: VNode
  footer: VNode
}

export function buildEcommerce(): Ecommerce {
  const cards: VNode[] = []
  for (let i = 1; i <= 5; i++) {
    const title = el('a', {
      class: ['title'],
      attrs: { href: `/product/${i}` },
      text: `Product ${i}`
    })
    const price = el('span', { class: ['price'], text: `$${i}9.00` })
    // lazy-loaded image: real URL lives in data-src, no src attribute
    const cover = el('img', { class: ['cover'], attrs: { 'data-src': `/img/${i}.jpg` } })
    cards.push(el('div', { class: ['product-card'] }, [title, price, cover]))
  }
  const productList = el('div', { id: 'list', class: ['product-list'] }, cards)
  const header = el('header', { class: ['site-header'] }, [el('h1', { class: ['logo'], text: 'Shop' })])
  const footer = el('footer', { class: ['site-footer'] }, [el('span', { class: ['copyright'], text: '© 2026' })])
  const body = el('body', {}, [header, productList, footer])

  const card3 = cards[2]!
  return {
    body,
    productList,
    cards,
    card3,
    card3Title: card3.children[0]!,
    card3Price: card3.children[1]!,
    card3Cover: card3.children[2]!,
    header,
    footer
  }
}

/**
 * A small DOM whose cards carry machine-generated ids, to verify the selector
 * generator skips them (item 1): `id="item-a3f9b2c1"` and a pure-numeric id.
 */
export function buildRandomIdDom(): { root: VNode; randomCard: VNode; numericCard: VNode } {
  const randomCard = el('div', { id: 'item-a3f9b2c1', class: ['product-card'] }, [
    el('a', { class: ['title'], attrs: { href: '/x' }, text: 'X' })
  ])
  const numericCard = el('div', { id: '1024', class: ['product-card'] }, [
    el('a', { class: ['title'], attrs: { href: '/y' }, text: 'Y' })
  ])
  const root = el('div', { id: 'grid', class: ['product-list'] }, [randomCard, numericCard])
  return { root, randomCard, numericCard }
}

/**
 * Two sibling product lists (#listA and #listB) under one page, used to prove
 * buildFieldColumns rejects picks that span different containers (item 4).
 */
export function buildTwoListDom(): { root: VNode; aTitle: VNode; bPrice: VNode } {
  const card = (n: number) =>
    el('div', { class: ['product-card'] }, [
      el('a', { class: ['title'], attrs: { href: `/p/${n}` }, text: `P${n}` }),
      el('span', { class: ['price'], text: `$${n}` })
    ])
  const listA = el('div', { id: 'listA', class: ['product-list'] }, [card(1), card(2), card(3)])
  const listB = el('div', { id: 'listB', class: ['product-list'] }, [card(4), card(5), card(6)])
  const root = el('div', { id: 'page' }, [listA, listB])
  return {
    root,
    aTitle: listA.children[0]!.children[0]!, // title of listA's first card
    bPrice: listB.children[0]!.children[1]! // price of listB's first card
  }
}
