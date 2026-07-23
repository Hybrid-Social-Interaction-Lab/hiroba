const path = require('path')
const fs = require('fs')
const { PAGES, buildPageHtml } = require('../../scripts/build-guides')

const GUIDE_SLUGS = ['user-guide', 'researcher-guide', 'developer-guide', 'index']

/**
 * PageRoutes
 * HTML page delivery routes
 */
class PageRoutes {
  constructor(app, publicDir) {
    this.app = app
    this.publicDir = publicDir
    this.guidesDir = path.join(publicDir, 'guides')
  }

  /**
   * Register all page routes
   */
  register() {
    // Main app — lobby screen + call room
    this.app.get('/', (req, res) => {
      res.sendFile(path.join(this.publicDir, 'index.html'))
    })

    // Admin page — injects password from env so the client can gate locally
    this.app.get('/admin', (req, res) => {
      const adminPassword = process.env.ADMIN_PASSWORD
      const html = fs.readFileSync(path.join(this.publicDir, 'admin.html'), 'utf8')
      const injected = html.replace(
        'window.__ADMIN_PASSWORD__ || \'admin\'',
        JSON.stringify(adminPassword)
      )
      res.setHeader('Content-Type', 'text/html')
      res.send(injected)
    })

    // Guides — rendered fresh from markdown on every request
    const serveGuide = (slug, res, next) => {
      const page = PAGES.find(p => p.slug === slug)
      if (!page) return next()
      try {
        const html = buildPageHtml(page)
        if (!html) return next()
        res.setHeader('Content-Type', 'text/html')
        res.send(html)
      } catch (err) {
        next(err)
      }
    }

    this.app.get('/guides', (req, res, next) => serveGuide('index', res, next))
    this.app.get('/guides/:slug', (req, res, next) => serveGuide(req.params.slug, res, next))
  }
}

module.exports = PageRoutes
