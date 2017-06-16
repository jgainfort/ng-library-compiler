#!/usr/bin/env node

import * as program from 'commander'

program
  .version('0.0.1')
  .option('-r, --rootfolder <rootFolder>', 'Project root folder')
  .option('-s, --style <style>', 'Project style')
  .action(() => {
    console.log(`rootfolder: ${program.rootFolder}`)
  })
  .parse(process.argv)
