const gulp = require('gulp');
const iconfont = require('gulp-iconfont');
const fs = require('fs');
const CharacterSet = require('characterset');
const { hashElement } = require('folder-hash');
const unicodeBlocks = require('unicode-blocks');
const rename = require('gulp-rename');
const filter = require('gulp-filter');
const yaml = require('js-yaml');
const crypto = require('crypto');
const acronym = require('@stdlib/string-acronym');
const twig = require('gulp-twig');
const zip = require('gulp-zip');
const changeFileContent = require('gulp-change-file-content');
const { reorient } = require('svg-reorient');
const through = require('through2');

// Function to read the file and extract emojis
function extractDefaultEmojiStyle(filePath) {
  try {
    // Read the file content
    const data = fs.readFileSync(filePath, 'utf8');

    // Split the data into lines
    const lines = data.split('\n');

    // Initialize a string to hold the result
    let result = '';

    // Process each line
    lines.forEach((line) => {
      // Ignore comments and empty lines
      if (line.startsWith('#') || line.trim() === '') {
        return;
      }

      // Split the line into components
      const parts = line.split(';');
      if (parts.length >= 2) {
        // Check if the Default_Emoji_Style is 'emoji'
        const defaultEmojiStyle = parts[1].trim();
        if (defaultEmojiStyle === 'emoji') {
          // Extract the codepoint
          const codePoint = parts[0].trim();
          // Ensure only single codepoint entries are processed
          if (!codePoint.includes(' ') && !codePoint.includes('..')) {
            // Convert the codepoint to a character
            const char = String.fromCodePoint(parseInt(codePoint, 16));
            result += char;
          }
        }
      }
    });

    return result;
  } catch (err) {
    console.error('Failed to read the file:', err);
    return '';
  }
}

const emojis = extractDefaultEmojiStyle('./emoji-data.txt');

function isEmoji(string) {
  return emojis.includes(string);
}

const cloneSink = function () {
  const tapStream = through.obj();

  const stream = through.obj(function (file, enc, cb) {
    if (file.isStream()) {
      this.emit(
        'error',
        new PluginError('gulp-clone', 'Streaming not supported'),
      );
      return cb();
    }

    if (file.isNull()) {
      return cb(null, file);
    }

    const codePoints = file.path
      .match(/(u[0-9a-fA-Fu]+)-[^\/]+\.svg$/)[1]
      .split('u');
    let cloneName = [];
    let needsClone = false;
    for (const codePoint of codePoints) {
      if (codePoint != '') {
        if (isEmoji(String.fromCodePoint(parseInt(codePoint, 16)))) {
          needsClone = true;
          cloneName.push(`${codePoint}uEF0F`);
        } else {
          cloneName.push(codePoint);
        }
      }
    }
    if (needsClone) {
      const clone = file.clone();
      clone.path.replace(
        /(u[0-9a-fA-Fu]+)(-[^\/]+)\.svg$/,
        `u${cloneName.join('u')}$2-plain.svg`,
      );
      tapStream.write(clone);
    }
    cb(null, file);
  });

  stream.tap = function () {
    return tapStream;
  };

  return stream;
};

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
  unicodeBlock.abbr = acronym(unicodeBlock.name.replace(/-/g, ' '), {
    stopwords: [],
  });
}

const outputDir = 'build';
const svgDir = 'src';

const fonts = {};
const unicode = {};

fontFolders = fs.readdirSync(svgDir);
fontFolders.forEach((fontFolder) => {
  const fontDir = `${svgDir}/${fontFolder}`;
  const fontName = fontFolder;
  let weights = {};
  if (fs.statSync(fontDir).isDirectory()) {
    const weightFolders = fs.readdirSync(fontDir);

    weightFolders.forEach((weigthFolder) => {
      const weight = weigthFolder;
      const weightDir = `${fontDir}/${weigthFolder}`;
      let blocks = {};
      if (fs.statSync(weightDir).isDirectory()) {
        const glyphFiles = fs.readdirSync(weightDir);
        // First pass: handle glyphs that fit within single blocks
        for (const blockRange of unicodeBlocks) {
          let glyphs = [];
          let files = {};
          for (const glyphFile of glyphFiles) {
            if (glyphFile.match(/\.svg$/)) {
              const sequenceString = glyphFile.slice(0, glyphFile.indexOf('-'));
              const sequence = sequenceString.match(/([0-9A-Fa-f]+)/g);
              let allInRange = true;
              for (const codepointSting of sequence) {
                const codePoint = parseInt(codepointSting, 16);
                if ([8205, 65039].includes(codePoint)) {
                  continue;
                }
                if (
                  codePoint < blockRange.start ||
                  codePoint > blockRange.end
                ) {
                  allInRange = false;
                }
              }
              if (allInRange) {
                glyphs.push(
                  sequence
                    .map((i) => String.fromCodePoint(parseInt(i, 16)))
                    .join(''),
                );
                const glyphFileName = `${weightDir}/${glyphFile}`;
                const fileBuffer = fs.readFileSync(glyphFileName);
                const hashSum = crypto.createHash('sha256');
                hashSum.update(fileBuffer);

                files[glyphFileName] = hashSum.digest('base64');
              }
            }
          }
          for (const k in glyphs) {
            if (isEmoji(glyphs[k])) {
              glyphs[k] += String.fromCodePoint(65038);
            }
          }
          if (glyphs.length > 0) {
            if (!blocks.hasOwnProperty(blockRange.name)) {
              blocks[blockRange.name] = {};
            }
            if (!unicode.hasOwnProperty(blockRange.name)) {
              unicode[blockRange.name] = [];
            }
            const cs = new CharacterSet(glyphs.join(''));
            blocks[blockRange.name].unicodeRange = cs.toHexRangeString();
            blocks[blockRange.name].glyphs = glyphs;
            unicode[blockRange.name].push(...glyphs);
            unicode[blockRange.name] = [...new Set(unicode[blockRange.name])];
            blocks[blockRange.name].files = files;
            blocks[blockRange.name].abbr = blockRange.abbr;

            const hashSum = crypto.createHash('sha256');
            hashSum.update(JSON.stringify(files));
            blocks[blockRange.name].hash = hashSum.digest('base64');
          }
        }

        // Second pass: handle glyphs that span multiple blocks
        const processedFiles = new Set();
        for (const blockRange of unicodeBlocks) {
          if (blocks[blockRange.name]) {
            Object.keys(blocks[blockRange.name].files).forEach(f => processedFiles.add(f));
          }
        }

        for (const glyphFile of glyphFiles) {
          if (glyphFile.match(/\.svg$/)) {
            const glyphFileName = `${weightDir}/${glyphFile}`;
            if (processedFiles.has(glyphFileName)) {
              continue; // Already processed in first pass
            }

            const sequenceString = glyphFile.slice(0, glyphFile.indexOf('-'));
            const sequence = sequenceString.match(/([0-9A-Fa-f]+)/g);
            const involvedBlocks = new Set();

            for (const codepointSting of sequence) {
              const codePoint = parseInt(codepointSting, 16);
              if ([8205, 65039].includes(codePoint)) {
                continue; // Skip joiners and variation selectors
              }

              // Find which block this codepoint belongs to
              for (const blockRange of unicodeBlocks) {
                if (codePoint >= blockRange.start && codePoint <= blockRange.end) {
                  involvedBlocks.add(blockRange.name);
                  break;
                }
              }
            }

            if (involvedBlocks.size > 1) {
              // Create a pseudo block with combined name
              const combinedBlockName = Array.from(involvedBlocks).sort().join(' + ');

              if (!blocks.hasOwnProperty(combinedBlockName)) {
                blocks[combinedBlockName] = {
                  glyphs: [],
                  files: {},
                  abbr: Array.from(involvedBlocks).map(name => {
                    const block = unicodeBlocks.find(b => b.name === name);
                    return block ? block.abbr : '';
                  }).filter(a => a).join('+')
                };
                unicode[combinedBlockName] = [];
              }

              const glyph = sequence
                .map((i) => String.fromCodePoint(parseInt(i, 16)))
                .join('');

              blocks[combinedBlockName].glyphs.push(glyph);
              unicode[combinedBlockName].push(glyph);
              unicode[combinedBlockName] = [...new Set(unicode[combinedBlockName])];

              const fileBuffer = fs.readFileSync(glyphFileName);
              const hashSum = crypto.createHash('sha256');
              hashSum.update(fileBuffer);
              blocks[combinedBlockName].files[glyphFileName] = hashSum.digest('base64');

              // Update unicode range for combined block
              const cs = new CharacterSet(blocks[combinedBlockName].glyphs.join(''));
              blocks[combinedBlockName].unicodeRange = cs.toHexRangeString();

              // Update hash for combined block
              const blockHashSum = crypto.createHash('sha256');
              blockHashSum.update(JSON.stringify(blocks[combinedBlockName].files));
              blocks[combinedBlockName].hash = blockHashSum.digest('base64');
            }
          }
        }
      }
      if (!!Object.keys(blocks).length > 0) {
        weights[weight] = blocks;
      }
      if (!!Object.keys(blocks).length > 0) {
        fonts[fontName] = weights;
      }
    });
  }
});

fs.writeFileSync('fonts.yml', yaml.dump(fonts, { flowLevel: 5 }), {
  encoding: 'utf-8',
});

const buildJobs = [];

function prepareSVG() {
  return gulp
    .src(`src/*/*/*.svg`)
    .pipe(
      changeFileContent((content) => {
        return reorient(content);
      }),
    )
    .pipe(gulp.dest('./src'));
}

buildJobs.push(prepareSVG);

for (let format of ['web', 'desktop']) {
  for (let font in fonts) {
    for (let weight in fonts[font]) {
      for (let block in fonts[font][weight]) {
        const blockAbbr = fonts[font][weight][block].abbr;
        const jobName = `${font}-${weight}-${blockAbbr}-${format}`;
        const src =
          format == 'web'
            ? Object.keys(fonts[font][weight][block].files)
            : Object.keys(fonts[font][weight]).reduce((prev, current) => {
              if (typeof prev == 'string') {
                return [];
              }
              return [
                ...prev,
                ...Object.keys(fonts[font][weight][current].files),
              ];
            });
        buildJobs.push(jobName);
        gulp.task(jobName, function (resove) {
          return gulp
            .src(Object.keys(fonts[font][weight][block].files))
            .pipe(cloneSink())
            .pipe(
              iconfont({
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
              }),
            )
            .pipe(
              rename(function (path) {
                if (format == 'web') {
                  path.dirname = `./${font}/${weight}`;
                  path.basename = `${blockAbbr}`;
                } else {
                  path.dirname = `./download/${font}`;
                  path.basename = `./${weight}`;
                }
              }),
            )
            .pipe(gulp.dest(outputDir));
        });
        if (format == 'desktop') {
          continue;
        }
      }
    }
    if (format == 'desktop') {
      const jobName = `zip-${font}`;
      buildJobs.push(jobName);
      gulp.task(jobName, function () {
        return gulp
          .src(`build/download/${font}/*.ttf`)
          .pipe(zip(`${font}.zip`))
          .pipe(
            rename(function (path) {
              path.dirname = `./download`;
            }),
          )
          .pipe(gulp.dest(outputDir));
      });
    }
  }
}

gulp.task('css', function () {
  return gulp
    .src('./template.css.twig')
    .pipe(
      twig({
        data: {
          fonts: fonts,
        },
      }),
    )
    .pipe(
      rename(function (path) {
        path.basename = 'loomicons';
        path.extname = '.css';
      }),
    )
    .pipe(gulp.dest(outputDir));
});

buildJobs.push('css');

gulp.task('html', function () {
  return gulp
    .src('./demo.html.twig')
    .pipe(
      twig({
        data: {
          fonts: fonts,
          unicode: unicode,
        },
      }),
    )
    .pipe(
      rename(function (path) {
        path.basename = 'index';
        path.extname = '.html';
      }),
    )
    .pipe(gulp.dest(outputDir));
});

buildJobs.push('html');

gulp.task('build', gulp.series(buildJobs));
