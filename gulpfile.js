const gulp = require('gulp')
const iconfont = require('gulp-iconfont')
const fs = require('fs')
const CharacterSet = require('characterset')
const { hashElement } = require('folder-hash')
const unicodeBlocks = require('unicode-blocks')
const rename = require("gulp-rename")
const filter = require("gulp-filter")
const yaml = require('js-yaml')
const crypto = require('crypto')
const acronym = require( '@stdlib/string-acronym' )
const twig = require('gulp-twig')
const zip = require('gulp-zip')

const weights = [
  'normal',
  'bold',
  '100',
  '200',
  '300',
  '400',
  '500',
  '600',
  '700',
  '800',
  '900',
];

for (let unicodeBlock of unicodeBlocks) {
  unicodeBlock.abbr = acronym(unicodeBlock.name.replace(/-/g, ' '), {stopwords: []})
}

const outputDir = 'build';
const svgDir = 'src';

const fonts = {};
const unicode = {};

fontFolders = fs.readdirSync(svgDir)
fontFolders.forEach(fontFolder => {
  const fontDir = `${svgDir}/${fontFolder}`
  const fontName = fontFolder
  let weights = {};
  if (fs.statSync(fontDir).isDirectory()) {
    const weightFolders = fs.readdirSync(fontDir)
    
    weightFolders.forEach(weigthFolder => {
      const weight = weigthFolder
      const weightDir = `${fontDir}/${weigthFolder}`
      let blocks = {}
      if (fs.statSync(weightDir).isDirectory()) {
        const glyphFiles = fs.readdirSync(weightDir)
        for (const blockRange of unicodeBlocks) {
          let glyphs = []
          let files = {}
          for (const glyphFile of glyphFiles) {
            if (glyphFile.match(/\.svg$/)) {
              const sequenceString = glyphFile.slice(0, glyphFile.indexOf("-"))
              const sequence = sequenceString.match(/([0-9A-Fa-f]+)/g)
              let allInRange = true
              for (const codepointSting of sequence) {
                const codePoint = parseInt(codepointSting, 16)
                if (codePoint < blockRange.start || codePoint > blockRange.end) {
                  allInRange = false
                }
              }
              if (allInRange) {
                glyphs.push(sequence.map((i) => String.fromCodePoint(parseInt(i, 16))).join(''))
                const glyphFileName = `${weightDir}/${glyphFile}`
                const fileBuffer = fs.readFileSync(glyphFileName)
                const hashSum = crypto.createHash('sha256')
                hashSum.update(fileBuffer);
                
                files[glyphFileName] = hashSum.digest('base64')
              }
            }
          }
          if (glyphs.length > 0) {
            if (!blocks.hasOwnProperty(blockRange.name)) {
              blocks[blockRange.name] = {}
            }
            if (!unicode.hasOwnProperty(blockRange.name)) {
              unicode[blockRange.name] = []
            }
            const cs = new CharacterSet(glyphs.join(''));
            blocks[blockRange.name].unicodeRange = cs.toHexRangeString()
            blocks[blockRange.name].glyphs = glyphs
            unicode[blockRange.name].push(...glyphs)
            unicode[blockRange.name] = [...new Set(unicode[blockRange.name])]
            blocks[blockRange.name].files = files
            blocks[blockRange.name].abbr = blockRange.abbr
            
            const hashSum = crypto.createHash('sha256')
            hashSum.update(JSON.stringify(files))
            blocks[blockRange.name].hash = hashSum.digest('base64')
          }
        }
      }
      if (!!Object.keys(blocks).length > 0) {
        weights[weight] = blocks
      }
      if (!!Object.keys(blocks).length > 0) {
        fonts[fontName] = weights
      }
    })
  }
})

fs.writeFileSync('fonts.yml', yaml.dump(fonts, { flowLevel: 5 }), { encoding: 'utf-8'})

const buildJobs = []

for (let format of ['web', 'desktop']) {
  for (let font in fonts) {
    for (let weight in fonts[font]) {
      for (let block in fonts[font][weight]) {
        const blockAbbr = fonts[font][weight][block].abbr
        const jobName = `${font}-${weight}-${blockAbbr}-${format}`
        const src = format == 'web' ?
          Object.keys(fonts[font][weight][block].files) :
          Object.keys(fonts[font][weight]).reduce(((prev, current) => {
            if (typeof prev == 'string') {
              return []
            }
            return [...prev, ...Object.keys(fonts[font][weight][current].files)];
          }))
        buildJobs.push(jobName)
        gulp.task(jobName, function (resove) {
          return gulp
            .src(Object.keys(fonts[font][weight][block].files))
            .pipe(iconfont({
              fontName: font,
              fontWeight: weight,
              prependUnicode: true,
              ascent: 800,
              descent: 200,
              fontHeight: 1000,
              fontWeight: weight,
              ligatures: true,
              formats: format == 'web' ? ['woff2'] : ['ttf'],
              timestamp: 0,
            }))
            .pipe(rename(function (path) {
              if (format == 'web') {
                path.dirname = `./${font}/${weight}`
                path.basename = `${blockAbbr}`;
              } else {
                path.dirname = `./download/${font}`
                path.basename =  `./${weight}`;
              }
            }))
            .pipe(gulp.dest(outputDir))
        })
        if (format == 'desktop') {
          continue
        }
      }
    }
    if (format == 'desktop') {
      const jobName = `zip-${font}`
      buildJobs.push(jobName)
      gulp.task(jobName, function () {
        return gulp.src(`build/download/${font}/*.ttf`)
          .pipe(zip(`${font}.zip`))
          .pipe(rename(function (path) {
              path.dirname = `./download`
          }))
          .pipe(gulp.dest(outputDir))
      })
    }
  }
}



gulp.task('css', function () {
  return gulp.src('./template.css.twig')
    .pipe(twig({
        data: {
          fonts: fonts,
        }
    }))
    .pipe(rename(function (path) {
      path.basename = 'loomicons';
      path.extname = ".css";
    }))
    .pipe(gulp.dest(outputDir));
});

buildJobs.push('css')

gulp.task('html', function () {
  return gulp.src('./demo.html.twig')
    .pipe(twig({
        data: {
          fonts: fonts,
          unicode: unicode,
        }
    }))
    .pipe(rename(function (path) {
      path.basename = 'index';
      path.extname = ".html";
    }))
    .pipe(gulp.dest(outputDir));
});

buildJobs.push('html')

gulp.task('build', gulp.series(buildJobs));
