require('colors');
var fs = require('fs');
var jsdiff = require('diff');
var readline = require('readline');

var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});


var regexFormula = /(function\s*\([\w\s\,]*\)\s*\{[\w\W\s]*?)\.property\(([\w\W\s]*?)\)/gm;

// rl.question("do I work? answer:", function (answer) {
//     console.log("answer: "+answer);
//     rl.close();
// });

var workingDirectory = process.argv[2];

var filenames = fs.readdirSync(workingDirectory, 'utf-8');

var fileContent, matches;
filenames.forEach(function (filename) {
    fileContent = fs.readFileSync(workingDirectory + '/' + filename).toString();

    while( matches = regexFormula.exec(fileContent) ) {
        
        diff = jsdiff.diffChars(matches[0], `Ember.computed(${matches[2]}, ${matches[1]})`);

        diff.forEach(function(part){
            // green for additions, red for deletions
            // grey for common parts
            var color = part.added ? 'green' :
              part.removed ? 'red' : 'grey';
            process.stderr.write(part.value[color]);
          });
    }
}, 'utf-8');

function parseFile (filename, content) {
    console.log(filename, content);
}

process.exit(0);