import * as glob from 'glob'
import * as path from 'path'
import { readFile, writeFile, readFileSync } from 'fs'

/**
 * Simple Promiseify function that takes a Node API and return a version that supports promises.
 * We use promises instead of synchronized functions to make the process less I/O bound and
 * faster. It also simplifies the code.
 */
function promiseify(fn): (...args) => Promise<any> {
  return function () {
    const args = [].slice.call(arguments, 0)
    return new Promise((resolve, reject) => {
      fn.apply(this, args.concat([function (err, value) {
        if (err) {
          reject(err)
        } else {
          resolve(value)
        }
      }]))
    })
  }
}

const readFilePr = promiseify(readFile)
const writeFilePr = promiseify(writeFile)

export function inlineResources(projectPath: string): Promise<any> {
  // Match only TypeScript files in projectPath
  const files = glob.sync('**/*.ts', { cwd: projectPath })

  // For each file, inline the templates and styles under it and write the new file.
  return Promise.all(files.map(filePath => {
    const fullFilePath = path.join(projectPath, filePath)
    return readFilePr(fullFilePath, 'utf-8')
      .then(content => inlineResourcesFromString(content, url => {
        // Resolve the template url.
        return path.join(path.dirname(fullFilePath), url)
      }))
      .then(content => writeFilePr(fullFilePath, content))
      .catch(err => {
        console.error('An error occured: ', err)
      })
  }))
}

// Inline the resources from a string content
function inlineResourcesFromString(content: string, urlResolver: (url: string) => string): string {
  // Curry through the inlining functions
  return [
    inlineTemplate,
    inlineStyle,
    removeModuleId
  ].reduce((cnt, fn) => fn(cnt, urlResolver), content)
}

// Inline the templates for a sourcefile. Simply serach for instances of `templateUrl: ...` and
// replace with `template: ...` (with the content of the file included).
function inlineTemplate(content: string, urlResolver: (url: string) => string): string {
  return content.replace(/templateUrl:\s*'([^']+?\.html)'/g, (m, templateUrl) => {
    const templateFile = urlResolver(templateUrl)
    const templateContent = readFileSync(templateFile, 'utf-8')
    const shortenedTemplate = templateContent
      .replace(/([\n\r]\s*)+/gm, ' ')
      .replace(/"/g, '\\"')
    return `template: "${shortenedTemplate}"`
  })
}

// Inline the styles for a source file. Simply search for instances of `styleurls: [...]` and
// replace with `styles: [...]` (with the content of the file included).
function inlineStyle(content: string, urlResolver: (url: string) => string): string {
  return content.replace(/styleUrls:\s*(\[[\s\S]*?\])/gm, (m, styleUrls) => {
    const urls = eval(styleUrls)
    return 'styles: ['
      + urls.map(styleUrl => {
        const styleFile = urlResolver(styleUrl)
        const styleContent = readFileSync(styleFile, 'utf-8')
        const shortenedStyle = styleContent
          .replace(/([\n\r]\s*)+/gm, '')
          .replace(/"/g, '\\"')
        return `"${shortenedStyle}"`
      }).join(',\n')
      + ']'
  })
}

// Remove any mention of `moduleId: module.id`
function removeModuleId(content): string {
  return content.replace(/\s*moduleId:\s*module\.id\s*,?\s*/gm, '')
}
