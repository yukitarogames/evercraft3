#!/usr/bin/env node
// Builds the game and publishes dist/ to the gh-pages branch.
// Usage: npm run deploy
// The branch is updated with a normal commit on top of its history (no force push).
import { execSync } from 'child_process'
import { cpSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const run = (cmd, cwd) => execSync(cmd, { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] }).trim()
const version = JSON.parse(readFileSync('package.json', 'utf-8')).version
const sha = run('git rev-parse --short HEAD')
const origin = run('git remote get-url origin')

console.log(`==> Building v${version} (${sha})`)
execSync('npm run build', { stdio: 'inherit' })

const dir = mkdtempSync(join(tmpdir(), 'evercraft3-pages-'))
try {
  let fresh = false
  try {
    run(`git clone --quiet --depth 1 --branch gh-pages --single-branch ${origin} "${dir}"`)
  } catch {
    fresh = true
    run('git init --quiet', dir)
    run('git checkout --quiet --orphan gh-pages', dir)
    run(`git remote add origin ${origin}`, dir)
  }
  for (const f of readdirSync(dir)) if (f !== '.git') rmSync(join(dir, f), { recursive: true, force: true })
  cpSync('dist', dir, { recursive: true })
  writeFileSync(join(dir, '.nojekyll'), '')
  run('git add -A', dir)
  if (!run('git status --porcelain', dir)) { console.log('==> Nothing changed, gh-pages is already up to date'); process.exit(0) }
  const suffix = process.env.DEPLOY_MESSAGE_SUFFIX ? `\n\n${process.env.DEPLOY_MESSAGE_SUFFIX}` : ''
  writeFileSync(join(dir, '.git', 'DEPLOY_MSG'), `Deploy v${version} (${sha})${suffix}\n`)
  for (const k of ['user.name', 'user.email']) { try { run(`git config ${k} "${run(`git config ${k}`)}"`, dir) } catch { /* use global identity */ } }
  run('git commit --quiet -F .git/DEPLOY_MSG', dir)
  run('git push --quiet -u origin gh-pages', dir)
  console.log(`==> Pushed gh-pages${fresh ? ' (new branch)' : ''}`)
} finally {
  rmSync(dir, { recursive: true, force: true })
}
