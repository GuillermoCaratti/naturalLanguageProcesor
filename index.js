const fs = require('fs');
const path = require('path');
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
});

let filename = process.argv[2];

const showErrorAndExit = (error) => {
  console.error(error);
  process.exit(-1);
}

if (!filename) showErrorAndExit("File name not found please use `node parse test`");

if (!filename.endsWith('.lang')) {
  filename += '.lang';
}

filename = path.resolve(filename)
if (!fs.existsSync(filename)) showErrorAndExit(`File name ${filename} not found`);

const fileContent = fs.readFileSync(filename, { encoding: 'utf-8' });

const readCharFromStdin = (msg) =>  {
  return new Promise((resolve) => {
    readline.question(msg, awnser => {
      resolve(awnser)
    });
  })
}

class Token {
  constructor(type, value, col, lineNumber, filename) {
    this.type = type;
    this.value = value;
    this.col = col;
    this.lineNumber = lineNumber;
    this.filename = filename;
  }

  toString() {
    if (this.value !== undefined) return this.value;
    if (this.type === Token.E) return 'ε';
    return this.type;
  }

  position() {
    return `${this.filename}:${this.lineNumber + 1}:${this.col + 1}`
  }

  equals(token){
    return this.type === token.type && this.value === token.value;
  }
}

Token.ASIGNATION = 'ASIGNATION'
Token.LETTER = 'LETTER'
Token.GROUP = 'GROUP'
Token.E = 'E'
Token.START = 'S'
Token.OR = '|'
Token.NL = 'New Line'
Token.EOF = 'End Of File'


Token.asignation = (col, lineNumber, filename) => new Token(Token.ASIGNATION, undefined, col, lineNumber, filename);
Token.letter = (value, col, lineNumber, filename) => new Token(Token.LETTER, value, col, lineNumber, filename);
Token.group = (value, col, lineNumber, filename) => new Token(Token.GROUP, value, col, lineNumber, filename);
Token.epsilon = (col, lineNumber, filename) => new Token(Token.E, undefined, col, lineNumber, filename);
Token.or =  (col, lineNumber, filename) => new Token(Token.OR, undefined, col, lineNumber, filename);
Token.start =  (col, lineNumber, filename) => new Token(Token.START, undefined, col, lineNumber, filename);
Token.newLine = (col, lineNumber, filename) => new Token(Token.NL, undefined, col, lineNumber, filename);
Token.eof =  (col, lineNumber, filename) => new Token(Token.EOF, undefined, col, lineNumber, filename);

const tokenizer = (filename, fileContent) => {
  const lines = fileContent.split(/\r?\n/);
  const tokens = [];
  for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
    const line = lines[lineNumber];
    for (let col = 0; col < line.length; col++) {
      const char = line.charAt(col);
      if (char === '' || char === ' ') {
        continue;
      } else if (char === '/' && line.charAt(col + 1) == '/') {
        col++;
        break;
      } else if (char === Token.E) {
        tokens.push(Token.epsilon(col, lineNumber, filename));
      } else if (char === 'ε') {
        tokens.push(Token.epsilon(col, lineNumber, filename));
      } else if (char === 'S') {
        tokens.push(Token.start(col, lineNumber, filename));
      } else if (char === '|') {
        tokens.push(Token.or(col, lineNumber, filename));
      } else if (char.match(/[a-z]/)) {
        tokens.push(Token.letter(char, col, lineNumber, filename));
      } else if (char.match(/[A-Z]/)) {
        tokens.push(Token.group(char, col, lineNumber, filename));
      } else if (char === '=' && line.charAt(col + 1) == '>') {
        col++;
        tokens.push(Token.asignation(col, lineNumber, filename));
      } else if (char === '-' && line.charAt(col + 1) == '>') {
        col++;
        tokens.push(Token.asignation(col, lineNumber, filename));
      } else showErrorAndExit(`Unknown caracter '${char}' at ${filename}:${lineNumber + 1}:${col + 1}`)
    }
    if(lineNumber +1 < lines.length){
      tokens.push(Token.newLine(0, lineNumber, filename))
    }
  }

  const lastLine = lines.length -1;
  const lastColumn = lines[lastLine].length - 1
  tokens.push(Token.eof(lastColumn,lastLine,filename));
  return tokens;
}


const State = {
  // Initial program State
  START_PROGRAM : 'START_PROGRAM',             
  // start group found
  START_GROUP_DEFINITION : 'START_GROUP_DEFINITION',
  BEGGINING_OF_GROUP_DEFINITION : 'BEGGINING_OF_GROUP_DEFINITION',
  LETTER_GROUP_DEFINITION : 'LETTER_GROUP_DEFINITION',
  GROUP_DEFINITION : 'GROUP_DEFINITION',
  OUTPUT_DEFINITION : 'OUTPUT_DEFINITION',
  OUTPUT_DEFINITION_START : 'OUTPUT_DEFINITION_START',
  END_OF_PROGRAM: 'END_OF_PROGRAM',
}

class Group{
  constructor(definition,outputs){
    this.definition = definition;
    this.outputs = outputs;
  }

  toString(){
    const outputsStr = this.outputs.map(o => o.map(t => t.toString()).join('')).join(" | ");
    const definition = this.definition.map(d => d.toString()).join('')
    return `${definition} => ${outputsStr}`
  }

  match(tokens,from = 0){
    tokens: for(let i = from ; i <= tokens.length - this.definition.length; i++){
      for(let j = 0 ; j < this.definition.length ; j++){
        if(!this.definition[j].equals(tokens[i+j])) continue tokens;
      } 
      return i;
    }
    return -1; 
  }
}

const Parser = {
  [State.START_PROGRAM] : {
    [Token.START] : (context,token) => {
      context.currentGroup = {
        definition : [token],
        currentOutput: [],
        outputs:[]
      }
      return State.START_GROUP_DEFINITION
    }
  },
  [State.START_GROUP_DEFINITION] : {
    [Token.ASIGNATION] : () => State.OUTPUT_DEFINITION_START
  },
  [State.BEGGINING_OF_GROUP_DEFINITION]:{
    [Token.NL]: () => State.GROUP_DEFINITION,
    [Token.EOF]: () => State.END_OF_PROGRAM,
    [Token.LETTER]: (context,token) => {
      context.currentGroup= {
        definition: [token],
        currentOutput:[]
      };
      return State.GROUP_DEFINITION;
    },
    [Token.GROUP]: (context,token) => {
      context.currentGroup= {
        definition: [token],
        currentOutput:[]
      };
      return State.GROUP_DEFINITION;
    },
  },
  [State.GROUP_DEFINITION]:{
    [Token.LETTER]: (context,token) => {
      const {currentGroup={}} = context;
      const {definition=[]} = currentGroup;
      const newDefinition = definition.concat(token);
      currentGroup.definition = newDefinition;
      context.currentGroup = currentGroup;
      return State.GROUP_DEFINITION;
    },
    [Token.GROUP]: (context,token) => {
      const {currentGroup={}} = context;
      const {definition=[]} = currentGroup;
      const newDefinition = definition.concat(token);
      currentGroup.definition = newDefinition;
      context.currentGroup = currentGroup;
      return State.GROUP_DEFINITION;
    },
    [Token.ASIGNATION]: (context,token) => {
      const {currentGroup={}} = context;
      const {definition} = currentGroup;
      if(!definition || definition.length === 0) {
        showErrorAndExit(`Unexpected token '${token.toString()}' at ${token.position()}\n No definition found`)
      }
      return State.OUTPUT_DEFINITION_START;
    },
  },
  [State.OUTPUT_DEFINITION_START] : {
    [Token.LETTER] : (context,token) => {
      const {currentOutput = []} = context.currentGroup;
      const newCurrentOutput = currentOutput.concat(token);
      context.currentGroup = {
        ...context.currentGroup,
        currentOutput : newCurrentOutput
      }
      return State.OUTPUT_DEFINITION;
    },
    [Token.GROUP] : (context,token) => {
      const {currentOutput = []} = context.currentGroup;
      const newCurrentOutput = currentOutput.concat(token);
      context.currentGroup = {
        ...context.currentGroup,
        currentOutput : newCurrentOutput
      }
      return State.OUTPUT_DEFINITION;
    },
    [Token.E] : (context,token) => {
      const {currentOutput = []} = context.currentGroup;
      const newCurrentOutput = currentOutput.concat(token);
      context.currentGroup = {
        ...context.currentGroup,
        currentOutput : newCurrentOutput
      }
      return State.OUTPUT_DEFINITION;
    },
  },
  [State.OUTPUT_DEFINITION]:{
    [Token.LETTER] : (context,token) => {
      context.currentGroup = {
        ...context.currentGroup,
        currentOutput : context.currentGroup.currentOutput.concat(token),
      }
      return State.OUTPUT_DEFINITION;
    },
    [Token.GROUP] : (context,token) => {
      context.currentGroup = {
        ...context.currentGroup,
        currentOutput : context.currentGroup.currentOutput.concat(token),
      }
      return State.OUTPUT_DEFINITION;
    },
    [Token.OR] : (context) => {
      const {outputs=[]} = context.currentGroup;
      context.currentGroup = {
        ...context.currentGroup,
        currentOutput : [],
        outputs : outputs.concat([context.currentGroup.currentOutput])
      }
      return State.OUTPUT_DEFINITION_START;
    },
    [Token.EOF] : (context,token) => {
      const {currentGroup} = context;
      const {definition,outputs = [],currentOutput} = currentGroup;
      delete context.currentGroup;
      context.groups.push(new Group(
        definition,
        outputs.concat([currentOutput])
      ));
      return State.END_OF_PROGRAM;
    },
    [Token.NL] : (context,token) => {
      const {currentGroup} = context;
      const {definition,outputs= [],currentOutput = []} = currentGroup;
      delete context.currentGroup;
      context.groups.push(new Group(
        definition,
        outputs.concat([currentOutput])
      ));
      return State.BEGGINING_OF_GROUP_DEFINITION;
    }
  },
}

const parser = (tokens) => {
  const context = {
    groups:[]
  };
  let state = State.START_PROGRAM;
  while(tokens.length > 0){
    const token = tokens.shift();
    const currentParserState = Parser[state];
    if(!currentParserState) showErrorAndExit("INTERNAL ERROR unkoun parser state " + state);
    if(!(token.type in currentParserState)) {
      const expectedTokens = Object.keys(currentParserState);
      showErrorAndExit(`Unexpected token '${token.toString()}' at ${token.position()}\n${expectedTokens.join(' or ')} was expected`)
    }
    state = currentParserState[token.type](context,token);
  }
  return context;
}

const run = async (progarm) => {
  let startSelection = 0;
  let progamSelectionLength = 1;
  const programState = [Token.start()];
  const {groups} = progarm;
  const startOutputs = groups[0].outputs;

  const printState = () => {
    console.log("----------------------------------------------")
    const state = programState.map(t => t.toString()).join('');
    console.log(state);
  }

  const choose = async (outputs) => {
    printState()
    console.log(' '.repeat(startSelection) + "↑".repeat(progamSelectionLength))
    if(outputs.length === 0) {
      showErrorAndExit("INTERNAL ERROR, empty group found");
    }
    if(outputs.length === 1) {
      const newOut = outputs[0]
      console.log(' '.repeat(startSelection) + "|".repeat(progamSelectionLength) +  "__will be replaced by '" + newOut.map( t => t.toString()).join('') + "'\n");
      return  newOut.filter( t => t.type !== Token.E);
    }
    console.log("Choose an option:")
    for(let i = 0 ; i < outputs.length; i ++){
      console.log(`${i+1}) ${outputs[i].map(t => t.toString()).join('')}`)
    }
    const char = await readCharFromStdin(`[1-${outputs.length }] >`);
    if(Number.isNaN(Number.parseInt(char.toString()))) showErrorAndExit("NANI !");
    if(Number.parseInt(char.toString())< 1 || Number.parseInt(char.toString()) >= outputs.length +1) showErrorAndExit("NANI !");
    return outputs[Number.parseInt(char.toString()) - 1].filter( t => t.type !== Token.E);
  }
  
  const startProgram = await choose(startOutputs);
  programState.shift() // remove start
  programState.push(...startProgram);
  prog: do {
    for(let i = 1 ; i < groups.length ; i++){
      const match = groups[i].match(programState,startSelection);
      if(match >= 0){
        startSelection = match;
        progamSelectionLength = groups[i].definition.length
        const newChange = await choose(groups[i].outputs);
        programState.splice(match,progamSelectionLength,...newChange);
        continue prog;
      }
    }
    if(startSelection != 0) {
      startSelection = 0;
    } else {
      printState();
      showErrorAndExit("Error! Not rule found for this state");
    }
  } while(programState.some( t => t.type === Token.GROUP))
  console.log("Final State:")
  console.log("==============================================")
  printState()
  console.log("==============================================")
  readline.close();
}

const tokens = tokenizer(filename, fileContent);
const progarm = parser(tokens)
run(progarm)