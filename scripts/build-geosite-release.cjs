const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { execFileSync } = require('node:child_process')
const YAML = require('yaml')

const root = process.cwd()
const coreCommit = '02584861637ebafff55a889b1bcb3224522663d9'
const platform = process.platform
if (!['win32', 'linux'].includes(platform) || process.arch !== 'x64')
  throw Error('Build on Windows or Linux amd64')
fs.mkdirSync(path.join(root, 'out'), { recursive: true })
const stage = fs.mkdtempSync(path.join(root, 'out/geosite-release-'))
const run = (exe, args, cwd = root, env = process.env) =>
  execFileSync(exe, args, { cwd, env, stdio: 'inherit', windowsHide: true })
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
const source = path.join(stage, 'mihomo')
run('git', ['clone', '--no-checkout', 'https://github.com/Huffer342-WSH/mihomo.git', source])
run('git', ['checkout', '--detach', coreCommit], source)
const resources = path.join(stage, 'resources')
fs.cpSync(path.join(root, 'extra'), resources, { recursive: true })
const core = path.join(
  resources,
  'sidecar',
  platform === 'win32' ? 'mihomo-alpha.exe' : 'mihomo-alpha'
)
run(
  'go',
  [
    'build',
    '-tags',
    'with_gvisor',
    '-trimpath',
    '-ldflags',
    '-w -s -buildid= -X github.com/metacubex/mihomo/constant.Version=geosite-02584861',
    '-o',
    core,
    '.'
  ],
  source,
  {
    ...process.env,
    GOOS: platform === 'win32' ? 'windows' : 'linux',
    GOARCH: 'amd64',
    GOAMD64: 'v1',
    CGO_ENABLED: '0'
  }
)
fs.copyFileSync(
  core,
  path.join(resources, 'sidecar', platform === 'win32' ? 'mihomo.exe' : 'mihomo')
)
const env = { ...process.env, SPARKLE_ISOLATED: '0', CSC_IDENTITY_AUTO_DISCOVERY: 'false' }
run(process.execPath, ['node_modules/electron-vite/bin/electron-vite.js', 'build'], root, env)
const config = YAML.parse(fs.readFileSync('electron-builder.yml', 'utf8'))
config.files = ['out/main/**/*', 'out/preload/**/*', 'out/renderer/**/*', 'package.json']
config.extraResources = [{ from: resources, to: '' }]
if (platform === 'linux') config.productName = 'sparkle'
const file = path.join(stage, 'builder.yml')
fs.writeFileSync(file, YAML.stringify(config))
run(
  process.execPath,
  [
    'node_modules/electron-builder/cli.js',
    '--config',
    file,
    platform === 'win32' ? '--win' : '--linux',
    platform === 'win32' ? '7z' : 'deb',
    '--x64',
    '--publish',
    'never'
  ],
  root,
  env
)
if (platform === 'win32') {
  fs.writeFileSync(path.join(stage, 'PORTABLE'), '')
  for (const name of fs.readdirSync('dist').filter((name) => name.endsWith('-portable.7z')))
    run(
      path.join(root, 'extra/files/7za.exe'),
      ['a', path.join(root, 'dist', name), 'PORTABLE'],
      stage
    )
}
const manifest = {
  sparkleCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  coreCommit,
  coreSHA256: hash(core),
  platform,
  arch: 'amd64',
  goVersion: execFileSync('go', ['version'], { encoding: 'utf8' }).trim()
}
fs.writeFileSync(
  `dist/core-manifest-${platform}-amd64.json`,
  JSON.stringify(manifest, null, 2) + '\n'
)
for (const name of fs.readdirSync('dist').filter((name) => /\.(7z|deb)$/.test(name)))
  fs.writeFileSync(
    path.join('dist', name + '.sha256'),
    hash(path.join('dist', name)) + '  ' + name + '\n'
  )
