const fs = require('node:fs')
const path = require('node:path')
const net = require('node:net')
const { spawn, spawnSync } = require('node:child_process')
const YAML = require('yaml')

const root = path.resolve(__dirname, '..')
const args = process.argv.slice(2)
const option = (name, fallback) => {
  const index = args.indexOf(name)
  if (index === -1) return fallback
  if (!args[index + 1] || args[index + 1].startsWith('--')) throw Error(name + ' requires a path')
  return args[index + 1]
}
const cache = path.resolve(option('--cache-dir', path.join(root, 'extra/files')))
const input = path.resolve(
  option('--config', path.join(__dirname, 'dev-isolated/profiles/geodata.yaml'))
)
const runDir = path.join(root, 'out/dev')
const coreSource = path.resolve(option('--core-source', path.join(root, 'ref/mihomo')))
const core = path.resolve(option('--core-path', path.join(runDir, 'bin/mihomo.exe')))

function build(exe, argv, cwd) {
  const result = spawnSync(exe, argv, { cwd, windowsHide: true, stdio: 'inherit' })
  if (result.error || result.status !== 0) throw result.error || Error(`Build failed: ${exe}`)
}

async function main() {
  if (process.platform !== 'win32' || !/^[A-Za-z0-9_:\\.-]+$/.test(runDir)) {
    throw Error('This local launcher requires Windows and a workspace path without spaces')
  }
  if (!fs.existsSync(cache) || !fs.existsSync(input))
    throw Error('Pass existing --cache-dir and --config paths')
  if (!args.includes('--core-path') && !args.includes('--skip-build')) {
    if (!fs.existsSync(path.join(coreSource, 'go.mod')))
      throw Error('mihomo source not found: ' + coreSource + '. Pass --core-source or --core-path.')
    fs.mkdirSync(path.dirname(core), { recursive: true })
    build(
      'go',
      [
        'build',
        '-tags',
        'with_gvisor',
        '-trimpath',
        '-ldflags',
        '-w -s -buildid= -X github.com/metacubex/mihomo/constant.Version=test-local',
        '-o',
        core,
        '.'
      ],
      coreSource
    )
  }
  if (!fs.existsSync(core)) throw Error('mihomo executable not found: ' + core)
  console.log('Isolated mihomo: ' + core)
  for (const dir of ['data/profiles', 'data/work'])
    fs.mkdirSync(path.join(runDir, dir), { recursive: true })
  for (const name of [
    'rules',
    'geosite.dat',
    'geoip.dat',
    'geoip.metadb',
    'country.mmdb',
    'ASN.mmdb',
    'BundleMRS.7z'
  ]) {
    const source = path.join(cache, name)
    if (fs.existsSync(source) && !fs.existsSync(path.join(runDir, 'data/work', name)))
      fs.cpSync(source, path.join(runDir, 'data/work', name), { recursive: true })
  }
  const server = net.createServer()
  await new Promise((resolve, reject) => {
    server.on('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = server.address().port
  await new Promise((resolve) => server.close(resolve))
  const config = {
    runDir,
    corePath: core,
    pipe: String.raw`\\.\pipe\SparkleTest-` + process.pid + '-' + Date.now()
  }
  const write = (file, value) => {
    const target = path.join(runDir, 'data', file)
    if (!fs.existsSync(target)) fs.writeFileSync(target, YAML.stringify(value))
  }
  write('config.yaml', {
    core: 'mihomo-alpha',
    corePermissionMode: 'elevated',
    coreStartupMode: 'post-up',
    sysProxy: { enable: false, mode: 'manual', guard: false },
    controlDns: true,
    controlSniff: true,
    disableTray: true,
    useSubStore: false,
    showTraffic: false,
    showFloatingWindow: false,
    autoCheckUpdate: false,
    networkDetection: false,
    gistSyncEnabled: false,
    autoSetDNSMode: 'none',
    autoLightweight: false,
    saveLogs: true,
    closeMode: 'all',
    notificationMode: 'toast',
    silentStart: false,
    safePaths: [path.join(runDir, 'data/work')]
  })
  write('mihomo.yaml', {
    'mixed-port': port,
    port: 0,
    'socks-port': 0,
    'redir-port': 0,
    'tproxy-port': 0,
    'external-controller': '',
    'external-controller-tls': '',
    'external-controller-unix': '',
    'external-controller-pipe': '',
    'external-ui': '',
    'external-ui-url': '',
    secret: '',
    'allow-lan': false,
    'bind-address': '127.0.0.1',
    mode: 'rule',
    'log-level': 'info',
    tun: { enable: false },
    dns: { enable: false, ipv6: false },
    sniffer: { enable: false },
    ntp: { enable: false },
    'geo-auto-update': false
  })
  write('profile.yaml', {
    current: 'small',
    items: [
      { id: 'small', type: 'local', name: 'Test Small', autoUpdate: false },
      { id: 'example', type: 'local', name: 'Test Example', autoUpdate: false }
    ]
  })
  write('override.yaml', { items: [] })
  if (!fs.existsSync(path.join(runDir, 'data/profiles/small.yaml')))
    fs.copyFileSync(
      path.join(__dirname, 'dev-isolated/profiles/small.yaml'),
      path.join(runDir, 'data/profiles/small.yaml')
    )
  if (!fs.existsSync(path.join(runDir, 'data/profiles/example.yaml')))
    fs.copyFileSync(input, path.join(runDir, 'data/profiles/example.yaml'))
  fs.writeFileSync(path.join(runDir, 'test.json'), JSON.stringify(config))
  fs.writeFileSync(
    path.join(runDir, 'bootstrap.cjs'),
    `const {app}=require('electron');app.setName(${JSON.stringify('sparkle-dev')});app.setPath('userData',${JSON.stringify(path.join(runDir, 'data'))});process.argv.push('noadmin');process.env.SPARKLE_TEST_CONFIG=${JSON.stringify(path.join(runDir, 'test.json'))};require(${JSON.stringify(path.join(root, 'out/main/index.js'))});`
  )
  const env = { ...process.env, SPARKLE_ISOLATED: '1' }
  delete env.ELECTRON_RUN_AS_NODE
  console.log(`Isolated development window. Data and core logs: ${path.join(runDir, 'data')}`)
  const child = spawn(
    process.execPath,
    [
      path.join(root, 'node_modules/electron-vite/bin/electron-vite.js'),
      'dev',
      '--watch',
      '--entry',
      path.join(runDir, 'bootstrap.cjs')
    ],
    { cwd: root, env, windowsHide: true, stdio: 'inherit' }
  )
  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  child.on('exit', (code) => {
    process.exitCode = code || 0
  })
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
