const path = require('path')

/**
 * PageRoutes
 * HTML page delivery routes
 */
class PageRoutes {
  constructor(app, publicDir) {
    this.app = app
    this.publicDir = publicDir
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
      const html = require('fs').readFileSync(path.join(this.publicDir, 'admin.html'), 'utf8')
      const injected = html.replace(
        'window.__ADMIN_PASSWORD__ || \'admin\'',
        JSON.stringify(adminPassword)
      )
      res.setHeader('Content-Type', 'text/html')
      res.send(injected)
    })

  }
}

module.exports = PageRoutes
