// Calls the running Next.js dev server to apply the team migration
const http = require('http')

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/admin/setup-teams-v2',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
}

const req = http.request(options, (res) => {
  let data = ''
  res.on('data', chunk => { data += chunk })
  res.on('end', () => {
    try {
      const json = JSON.parse(data)
      if (json.steps) {
        console.log('Migration results:')
        json.steps.forEach(s => console.log(` [${s.status}] ${s.step}`))
      }
      console.log('\nMessage:', json.message || json.error || data)
    } catch {
      console.log('Response:', data)
    }
  })
})

req.on('error', (e) => {
  console.error('Request failed:', e.message)
  console.log('Make sure the dev server is running on port 3000')
})

req.end()
