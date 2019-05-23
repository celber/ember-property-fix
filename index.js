require('colors');
var fs = require('fs');
var path = require('path');
var jsdiff = require('diff');
var inquirer = require('inquirer');

/*----- Tasks */
// 1) buildFileList
// 2) filter by files that contain interesting part
// 3) iterate every file with question unless automatic merge was was chosen.
// 4) add processing job: {file: name, start: 0, end: 0, replaceWith: changed text}
// 5) process jobs
// My notes are at the end

/*---- Initialize CLI */
var argv = require('yargs')
  .example('$0 -d ./src --dry-run', 'outputs proposed changes')
  .demandOption(['directory', 'output-directory'])
  .option('directory', {
    alias: 'd',
    describe: 'Source files directory'
  })
  .option('output-directory', {
    alias: 'o',
    describe: 'Output files directory'
  })
  .option('dry-run', {
    describe: 'Outputs result to stdout instead of writing to a file'
  })
  .help('h')
  .alias('h', 'help')
  .argv

var ui = new inquirer.ui.BottomBar();

var regexFormula = /(function\s*\([\w\s\,]*\)\s*\{[\w\W\s]*?)\.property\(([\w\W\s]*?)\)/gm;
var workingDirectory = argv.directory;

ui.updateBottomBar('Building file list...');

/*---- Build file list */
function getFiles(dir, files) {
  var currentDirectory = fs.readdirSync(dir, 'utf-8');

  currentDirectory.forEach(function (file) {
    if (fs.statSync(dir + "/" + file).isDirectory()) {
      files = getFiles(dir + "/" + file, files);
    } else {
      files.push(dir + "/" + file);
    };
  });

  return files;
}

var files = getFiles(workingDirectory, []);

/*---- Filter files */
var filteredFilesCount = 0;
ui.updateBottomBar('Found files: ' + filteredFilesCount);
var fileContent; // allocate memory only once and reuse it
files = files.filter(function (file) {
  fileContent = fs.readFileSync(file).toString();
  if (regexFormula.test(fileContent)) {
    ++filteredFilesCount;
    ui.updateBottomBar('Found files: ' + filteredFilesCount);
    return true
  } else {
    return false
  }
});



/*----- Iterate every file and take action */
var tasks = [];
function createReplaceTask(file, start, end, replaceWith) {
  tasks.push({
    file,
    start,
    end,
    replaceWith
  });
}

async function pollMatch(match, content, fileName, doNotAsk) {
  var previewStart = content.substr(0, match.index);
  var previewEnd =  content.substr(match.index + match[0].length, content.length);
  //console.log(previewStart, previewEnd);
  preview = `Ember.computed(${match[2]}, ${match[1]})`; 
  var diff = jsdiff.diffWords(match[0], preview);



  // i decided to not show chunks on --dry-run as it will be shown at end anyways
  if (doNotAsk && !argv["dry-run"]) {
    console.log(`file: ${fileName} character: ${match.index}`);
    console.log(/* empty line */);
    diff.forEach(function(part){
      // green for additions, red for deletions
      // grey for common parts
      var color = part.added ? 'green' :
        part.removed ? 'red' : 'grey';
      process.stderr.write(part.value[color]);
    });
  }


  // TODO for some reason if you do not add empty line then red part of diff is not preserved on next poll
  console.log(/* empty line */);
  console.log(/* empty line */);

  if (!doNotAsk) {
    return inquirer
    .prompt([
      {
        type: 'list',
        name: 'action',
        message: 'Merge this section?',
        choices: [
          'Merge',
          'Decline',
          'Edit',
          new inquirer.Separator(),
          'Quit'
        ]
      }
    ]).then(function (answer) {
      console.log(/* empty line */);
      if (answer.action == 'Merge') {
        createReplaceTask(fileName, match.index, match.index + match[0].length, preview);
      } else if (answer.action == 'Edit') {
        return inquirer
          .prompt([
            {
              type: 'editor',
              name: 'change',
              message: 'Edit proposed change.',
              default: preview
            }
          ]).then(function (answer) {
            console.log(/* empty line */);
            createReplaceTask(fileName, match.index, match.index + match[0].length, answer.change);
          })
      } else if (answer.action == 'Quit') {
        process.exit(0);
      }

      // Decline action is ignored, it does nothing
    });
  } else {
    return createReplaceTask(fileName, match.index, match.index + match[0].length, preview);
  }
}

async function pollFile(fileName, doNotAsk) {
  var match, matches = [], tasks = [];
  var fileContent = fs.readFileSync(fileName).toString();
  
  while (match = regexFormula.exec(fileContent)) {
    matches.push(match);
  }

  regexFormula.lastIndex = 0; // reset regex state for next file

  while (match = matches.shift()) {
    tasks.push(await pollMatch(match, fileContent, fileName, doNotAsk));
  }
}

ui.clean(); // this does not work as expected
ui.updateBottomBar(''); // so i clean prompt like this 

var poll = inquirer
  .prompt([
    {
      type: 'list',
      name: 'action',
      message: 'I have found '+ filteredFilesCount +' files. What do you want to do with them?',
      choices: [
        'Review changes',
        'Merge automatically',
        new inquirer.Separator(),
        'Quit'
      ]
    }
  ])
  .then(async function (answer) {
    if (answer.action == 'Quit') {
      process.exit(0);
    } else if (answer.action == "Review changes") {
      for (var i = 0; i<=files.length; ++i) {
        console.log(/* empty line */);
        await pollFile(files[i], false);
      }
    } else {
      for (var i = 0; i<files.length; ++i) {
        console.log(/* empty line */);
        await pollFile(files[i], true);
      }
    }
  });


/*----- Run tasks */

poll.then(function () {
  files.forEach(function (file) {
    var fileTasks = tasks.filter(task => task.file === file);
        fileTasks = fileTasks.sort((taskA, taskB) => taskA.start < taskB.start); // it is safer to run replacements from the end of the file so i do not have indexes mixed up
    var fileContent = fs.readFileSync(file).toString();

    fileTasks.forEach(function (task) {
      fileContent = fileContent.substr(0, task.start) + task.replaceWith + fileContent.substr(task.end, fileContent.length);
    });

    
    var diff = jsdiff.diffLines(fs.readFileSync(file).toString(), fileContent);

    if (argv["dry-run"]) {

      console.log(`\r\nfile: ${file}`);
      console.log(/* empty line */);
    
      diff.forEach(function(part){
        // green for additions, red for deletions
        // grey for common parts
        var color = part.added ? 'green' :
          part.removed ? 'red' : 'grey';
        process.stderr.write(part.value[color]);
      });
    
      console.log(/* empty line */);
    } else {
        // credits to https://stackoverflow.com/a/34509653
        let newFile = argv["output-directory"]+'/'+file.replace(argv['input-directory'], '');
        let dirname = path.dirname(newFile);

        if (!fs.existsSync(dirname)) {
          fs.mkdirSync(dirname, {recursive: true});
        }

        fs.writeFileSync(newFile, fileContent);
    }
  });
});

// TODO I was thinking about processing in threads but that would be an overkill
// TODO i would love to show change position as a line instead of character
// TODO i am not sure if use case covers nested functions, i hope not. It will be a bit more complicated then
// TODO i misused inquire.prompt.name property, it was not needed after all
// TODO i do not like the part on applying changes where i need to filter tasks by a file multiple times,
//      but this wat i do not consume memory for holding every file content at once
// TODO i used synchronous filesystem operations only for better readability
