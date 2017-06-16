import * as path from 'path'
import * as glob from 'glob'
import * as camelCase from 'camelcase'
import * as sourcemaps from 'rollup-plugin-sourcemaps'
import * as sass from 'node-sass'
import { rollup } from 'rollup'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { inlineResources } from './inline-resources'

const ngc = require('@angular/compiler-cli/src/main').main

export class Build {
  private compilationFolder: string
  private distFolder: string
  private es5OutputFolder: string
  private es2015OutputFolder: string
  private libName: string
  private rootFolder: string
  private srcFolder: string
  private style: string
  private tempLibFolder: string

  constructor(rootFolder: string, style: string) {
    this.rootFolder = path.join(rootFolder)
    this.style = style
    this.libName = require(`${this.rootFolder}/package.json`).name
    this.compilationFolder = path.join(this.rootFolder, 'out-tsc')
    this.srcFolder = path.join(this.rootFolder, 'src')
    this.distFolder = path.join(this.rootFolder, 'dist')
    this.tempLibFolder = path.join(this.compilationFolder, 'lib')
    this.es5OutputFolder = path.join(this.compilationFolder, 'lb-es5')
    this.es2015OutputFolder = path.join(this.compilationFolder, 'lib-es2015')

    this.init()
  }

  init() {
    Promise.resolve()
      // Copy library to temporary folder and inline html/css
      .then(() => this.relativeCopy('**/*', this.srcFolder, this.tempLibFolder)
        // TODO: pass correct extension from cli argument
        .then(() => this.compilePreprocessor('**/*.scss', this.tempLibFolder))
        .then(() => inlineResources(this.tempLibFolder))
        .then(() => console.log('Inlining succeeded.'))
      )
      // Compile to ES2015
      .then(() => ngc({ project: `${this.tempLibFolder}/tsconfig.build.json` })
        .then(exitCode => exitCode === 0 ? Promise.resolve() : Promise.reject(new Error('Unable to compile ES2015')))
        .then(() => console.log('ES2015 compilation succeeded.'))
      )
      // Compile to ES5
      .then(() => ngc({ project: `${this.tempLibFolder}/tsconfig.es5.json` })
        .then(exitCode => exitCode === 0 ? Promise.resolve() : Promise.reject(new Error('Unable to compile ES5')))
        .then(() => console.log('ES5 compilation succeeded.'))
      )
      // Copy typings and metadata to `dist/` folder.
      .then(() => Promise.resolve()
        .then(() => this.relativeCopy('**/*.d.ts', this.es2015OutputFolder, this.distFolder))
        .then(() => this.relativeCopy('**/*.metadata.json', this.es2015OutputFolder, this.distFolder))
        .then(() => console.log('Typings and metadata copy succeeded.'))
      )
      // Bundle lib.
      .then(() => {
        const es5Entry = path.join(this.es5OutputFolder, `${this.libName}.js`)
        const es2015Entry = path.join(this.es2015OutputFolder, `${this.libName}.js`)
        const rollupBaseConfig = {
          moduleName: camelCase(this.libName),
          sourceMap: true,
          // ATTENTION:
          // add any dependency or peer dependency your library to `globals` and `external`.
          // This is required for UMD bundle users.
          globals: {
            // The key here is library name, and the value is the the name of the global variable name
            // the window object.
            // See https://github.com/rollup/rollup/wiki/JavaScript-API#globals for more.
            '@angular/core': 'ng.core'
          },
          external: [
            // List of dependencies
            // See https://github.com/rollup/rollup/wiki/JavaScript-API#external for more.
            '@angular/core'
          ],
          plugins: [
            sourcemaps()
          ]
        }

        const fesm5config = Object.assign({}, rollupBaseConfig, {
          entry: es5Entry,
          dest: path.join(this.distFolder, `${this.libName}.es5.js`),
          format: 'es'
        })

        const fesm2015config = Object.assign({}, rollupBaseConfig, {
          entry: es2015Entry,
          dest: path.join(this.distFolder, `${this.libName}.js`),
          format: 'es'
        })

        const allBundles = [
          fesm5config,
          fesm2015config
        ].map(cfg => rollup(cfg).then(bundle => bundle.write(cfg)))

        return Promise.all(allBundles)
          .then(() => console.log('All bundles generated successfully.'))
      })
      // Copy package files
      .then(() => Promise.resolve()
        .then(() => this.relativeCopy('LICENSE', this.rootFolder, this.distFolder))
        .then(() => this.relativeCopy('package.json', this.srcFolder, this.distFolder))
        .then(() => this.relativeCopy('README.md', this.rootFolder, this.distFolder))
        .then(() => console.log('Package files copy succeeded'))
      )
      .catch(e => {
        console.error('\Build failed. See below for errors.\n')
        console.error(e)
        process.exit(1)
      })
  }

  // TODO: need to get correct extension and preprocessor compiler from cli argument
  private compilePreprocessor(fileGlob: string, dir: string): Promise<any> {
    return new Promise((resolve, reject) => {
      glob(fileGlob, { cwd: dir, nodir: true }, (err: Error, files: string[]) => {
        if (err) {
          reject(err)
        }
        let outFile: string
        files.forEach(file => {
          file = path.join(dir, file)
          outFile = file.replace('scss', 'css')
          sass.render({
            file: file,
            outFile: outFile,
            includePaths: [dir],
            outputStyle: 'compressed'
          }, (error: Error, result) => {
            if (error || !result) {
              reject(error)
            }
            writeFileSync(outFile, result.css, (wfError: Error) => {
              if (wfError) {
                reject(wfError)
              }
              resolve()
            })
          })
        })
      })
    })
  }

  private relativeCopy(fileGlob: string, from: string, to: string): Promise<{} | Error> {
    return new Promise((resolve, reject) => {
      glob(fileGlob, { cwd: from, nodir: true }, (err: Error, files: string[]) => {
        if (err) {
          reject(err)
        }
        let origin: string,
          dest: string,
          data: string
        files.forEach(file => {
          origin = path.join(from, file)
          dest = path.join(to, file)
          data = readFileSync(origin, 'utf-8')
          this.recursiveMkDir(path.dirname(dest))
          writeFileSync(dest, data)
          resolve()
        })
      })
    })
  }

  private recursiveMkDir(dir: string) {
    if (!existsSync(dir)) {
      this.recursiveMkDir(path.dirname(dir))
      mkdirSync(dir)
    }
  }

}
