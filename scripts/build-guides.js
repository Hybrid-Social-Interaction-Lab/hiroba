#!/usr/bin/env node
/**
 * build-guides.js
 * Compiles markdown files in docs/guides/site/*.md into HTML pages
 * in public/guides/, wrapped in the HIROBA-styled template.
 *
 * Runs at server startup (see package.json `start` script) and on
 * demand via `npm run build:guides`. In Docker dev mode the markdown
 * source is volume-mounted, so re-running this script rebuilds the
 * site without a container rebuild.
 */

const fs = require('fs')
const path = require('path')
const { marked } = require('marked')

const ROOT = path.resolve(__dirname, '..')
const SRC_DIR = path.join(ROOT, 'docs', 'guides', 'site')
const OUT_DIR = path.join(ROOT, 'public', 'guides')
const TEMPLATE_PATH = path.join(SRC_DIR, '_template.html')

// ── Page registry ─────────────────────────────────────────────────────────
const PAGES = [
  {
    slug: 'index',
    title: 'Guides',
    nav: 'Overview',
    file: 'index.md',
    icon: 'book-open'
  },
  {
    slug: 'user-guide',
    title: 'User Guide',
    nav: 'User Guide',
    file: 'user-guide.md',
    icon: 'user'
  },
  {
    slug: 'researcher-guide',
    title: 'Researcher Guide',
    nav: 'Researcher Guide',
    file: 'researcher-guide.md',
    icon: 'flask-conical'
  },
  {
    slug: 'developer-guide',
    title: 'Developer Guide',
    nav: 'Developer Guide',
    file: 'developer-guide.md',
    icon: 'code-2'
  }
]

// ── Marked config with heading anchors ────────────────────────────────────
const slugify = (text) =>
  text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

const renderer = new marked.Renderer()
const originalHeading = renderer.heading.bind(renderer)
renderer.heading = (text, level, raw) => {
  const id = slugify(raw)
  return `<h${level} id="${id}"><a class="heading-anchor" href="#${id}" aria-label="Link to ${raw}">#</a>${text}</h${level}>\n`
}

const originalCode = renderer.code.bind(renderer)
renderer.code = (code, infostring) => {
  const lang = (infostring || '').trim() || 'text'
  const escaped = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  return `<pre class="code-block" data-lang="${lang}"><code>${escaped}</code></pre>\n`
}

marked.setOptions({ renderer, gfm: true, breaks: false })

// ── Extract a sidebar TOC from h2/h3 in the rendered HTML ─────────────────
function buildToc(markdown) {
  const lines = markdown.split('\n')
  const toc = []
  let inFence = false
  for (const line of lines) {
    if (line.startsWith('```')) inFence = !inFence
    if (inFence) continue
    const m = line.match(/^(#{2,3})\s+(.+?)\s*$/)
    if (!m) continue
    const level = m[1].length
    const text = m[2].replace(/`/g, '').trim()
    toc.push({ level, text, id: slugify(text) })
  }
  return toc
}

function renderToc(toc) {
  if (toc.length === 0) return ''
  const items = toc.map(({ level, text, id }) =>
    `<li class="toc-l${level}"><a href="#${id}">${text}</a></li>`
  ).join('\n')
  return `<ul class="page-toc">${items}</ul>`
}

// ── Sidebar navigation ────────────────────────────────────────────────────
function renderSidebar(activeSlug) {
  return PAGES.map(p => {
    const cls = p.slug === activeSlug ? 'sidebar-link active' : 'sidebar-link'
    return `<a href="/guides/${p.slug === 'index' ? '' : p.slug}" class="${cls}" data-slug="${p.slug}">
      <i data-lucide="${p.icon}" class="sidebar-icon"></i>
      <span>${p.nav}</span>
    </a>`
  }).join('\n')
}

// ── Build a single page ──────────────────────────────────────────────────
function buildPage(page, template) {
  const srcFile = path.join(SRC_DIR, page.file)
  if (!fs.existsSync(srcFile)) {
    console.warn(`[build-guides] Missing: ${srcFile} — skipping`)
    return
  }
  const md = fs.readFileSync(srcFile, 'utf8')
  const html = marked.parse(md)
  const toc = renderToc(buildToc(md))
  const sidebar = renderSidebar(page.slug)

  const out = template
    .replace(/__TITLE__/g, `${page.title} · HIROBA`)
    .replace(/__PAGE_TITLE__/g, page.title)
    .replace(/__SIDEBAR__/g, sidebar)
    .replace(/__TOC__/g, toc)
    .replace(/__CONTENT__/g, html)

  // index.md → guides/index.html, user-guide.md → guides/user-guide.html
  const outFile = path.join(OUT_DIR, `${page.slug}.html`)
  fs.writeFileSync(outFile, out, 'utf8')
  console.log(`[build-guides] Built ${path.relative(ROOT, outFile)}`)
}

// ── Build a single page to HTML string (no file write) ───────────────────
function buildPageHtml(page) {
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  const srcFile = path.join(SRC_DIR, page.file)
  if (!fs.existsSync(srcFile)) return null
  const md = fs.readFileSync(srcFile, 'utf8')
  const html = marked.parse(md)
  const toc = renderToc(buildToc(md))
  const sidebar = renderSidebar(page.slug)
  return template
    .replace(/__TITLE__/g, `${page.title} · HIROBA`)
    .replace(/__PAGE_TITLE__/g, page.title)
    .replace(/__SIDEBAR__/g, sidebar)
    .replace(/__TOC__/g, toc)
    .replace(/__CONTENT__/g, html)
}

// ── Main ─────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    console.error(`[build-guides] Missing template: ${TEMPLATE_PATH}`)
    process.exit(1)
  }
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const template = fs.readFileSync(TEMPLATE_PATH, 'utf8')
  for (const page of PAGES) buildPage(page, template)
  console.log(`[build-guides] Done — ${PAGES.length} pages → ${path.relative(ROOT, OUT_DIR)}/`)
}

if (require.main === module) main()

module.exports = { PAGES, buildPageHtml }
