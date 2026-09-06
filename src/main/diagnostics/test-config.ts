import { app } from 'electron'
import { readFileSync } from 'fs'
import path from 'path'

interface TestConfig {
  runDir: string
  corePath: string
  pipe: string
}
function load(): TestConfig | undefined {
  const file = process.env.SPARKLE_TEST_CONFIG
  if (!file || app.isPackaged) return
  const config = JSON.parse(readFileSync(file, 'utf8')) as TestConfig
  if (
    !path.isAbsolute(config.runDir) ||
    !path.isAbsolute(config.corePath) ||
    app.getPath('userData') !== path.join(config.runDir, 'data') ||
    !config.pipe.startsWith(String.raw`\\.\pipe\SparkleTest-`)
  )
    throw new Error('Invalid isolated test configuration')
  return config
}
export const testConfig = __SPARKLE_ISOLATED__ ? load() : undefined
