// Generate PNG favicons from favicon-source.svg using sharp (already a dep of Astro).
// Run once: node scripts/generate-favicons.mjs

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const svgPath = path.join(root, 'src', 'assets', 'favicon-source.svg')
const publicDir = path.join(root, 'public')

const svg = fs.readFileSync(svgPath)

await sharp(svg).resize(16, 16).png().toFile(path.join(publicDir, 'favicon-16.png'))
console.log('✓ favicon-16.png')

await sharp(svg).resize(32, 32).png().toFile(path.join(publicDir, 'favicon-32.png'))
console.log('✓ favicon-32.png')

await sharp(svg).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'))
console.log('✓ apple-touch-icon.png')

await sharp(svg).resize(512, 512).png().toFile(path.join(publicDir, 'android-chrome-512x512.png'))
console.log('✓ android-chrome-512x512.png')

console.log('Favicons regenerated ✓')
