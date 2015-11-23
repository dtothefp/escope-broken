import request from 'superagent';
import cheerio from 'cheerio';
import vo from 'vo';
import {readFile} from 'fs';

/**
 * An example generator
 */
function *gen(init) {
  //confusing because what is stored in `first` variables is not what is returned from
  //3 + variable injected, but instead what is "injected" by the `.next` invocation
  const first = yield (3 + init);
  const second = yield first;

  return first + second;
}

const it = gen(5);

console.log('Log the generator object', it);
console.log('LOG initial dependency injected', it.next()); //8
console.log('LOG `first`', it.next(2)); //2
console.log('LOG generators return value', it.next(3)); //5

/**
 * An example throwing and catching errors for generator
 */
function *foo () {
  try {
    x = yield 'B'; //Error will be thrown
  } catch (err) {
    console.error('Generator Error', err);
  }
}

const bar =  foo();
const {value} = bar.next();

if (value === 'B') {
  bar.throw(new Error('it\'s B!'));
} else {
  console.log('value', value);
}

/**
 * Below is all about making Thunks and generator recursive loops
 */

//lapwing: req('http://lapwinglabs.com'),
//leveredreturns: req('http://leveredreturns.com')

function get(url, fn) {
  request.get(url)
  .end(function(err, res) {
    if (err) return fn(err);
    return fn(null, res.text);
  });
}

function superAgentThunk(url) {
  return (cb) => {
    get(url, cb);
  };
}

/**
 * Create a thunk, basically a function that returns another function
 * a) first returned function takes arguments that are cached within the closure
 * b) second returned function takes a cb as only argument
 *    and calls the "thunkified" function with concated cached args and cb
 */
function thunkify(thunkFn) {
  return (...args) => {
    return (cb) => {
      thunkFn.apply(this, [...args, cb]);
    };
  };
}

/**
 * Create a "thunkfied" `fs.readFile` function
 * a) takes a fp as it's argument
 * b) returns a function that takes the node signature callback as it's argument
 */
const read = thunkify(readFile);
const readAsync = read('./mocks/file-1.js', {encoding: 'utf8'});

readAsync((err, res) => {
  if (err) return console.log('ERR', err);

  console.log('RES', res);
});

/**
 * Go one step further and create a `run` function that takes a `generator` function
 * as it's only argument
 *
 * a) `run` caches the generator object
 * b) contains a private `_next` function that initially starts the generator
 * c) `_next` also acts as the callback to the node callback signature
 *      - first time around it obtains the "thunkified" function from `yield`
 *      - this function represents `readAsync` in the above example
 *      - `_next` is then called recursively with the node callback signature args
 *      - `_next` also advances the generator so the data from the cb is returned from `yield`
 */
function run(genFn) {
  const it = genFn();

  function _next(err, val) {
    if (err) it.throw(err); //throw err to be caught in generator

    //get the generator object
    //a) the first time through val === undefined as yield returns what is returned from the thunk
    //b) next time through `val` will be the value passed as the second arg to the
    //   node callback signature
    //     - essentially this will "dependency inject" the async value from the `yield`
    const cont = it.next(val);

    if (cont.done) return;

    const cb = cont.value; //yielded function from Thunk that takes a callback as only arg

    //call the callback which exposes data inside the generator
    //the "confusing" part is that `_next` is the cb passed as the second arg to `fs.readFile`
    //so it will only be called again when `fs.readFile` calls it's cb
    //therefore, the generator is paused at the yield, until `_next` is called by `fs.readFile`
    //and therefore the generator object `.next` method is called advancing the
    //generator and resulting in generator obj `{value: ..., done: true}`
    cb(_next);
  }

  _next(); //start the generator
}


/**
 * Call the `run` function with a generator as it's first argument
 * notice how we can log returned async data with a seemingly sync API
 */
//run(function *() {
  //try {
    //const file = yield read('./mocks/file-1.js', {encoding: 'utf8'});
    //console.log('Read File', file);

    //const html = yield superAgentThunk('http://lapwinglabs.com');
    //console.log('SuperAgent HTML', html);
  //} catch (err) {
    //console.log('File Read Error', err);
  //}
//});

/**
 * Let's give it a go with promises
 */
function getWithProm(url) {
  return new Promise((res, rej) => {
    request.get(url)
    .end((err, result) => {
      if (err) return rej(err);

      return res(result.text);
    });
  });
}

/**
 * Create a `spawn` function to deal with promises
 */
function spawn(gen) {
  const it = gen(); //instantiate the generator and return the generator object

  function _co(method, arg) {
    let res;

    try {
      //retrieve the promise returned by the http request if `arg` is undefined
      //if `arg` is defined it will be the data from the http request promise
      //and will be "injected" into `yield` and caught in a variable
      res = it[method](arg);
    } catch(err) {
      return Promise.reject(err);
    }

    if (res.done) {
      if (method === 'throw') {
        return arg;
      } else {
        return res.value;
      }
    } else {
      //at this point we may resolve a promise or a value??
      //a) if we are resolving a promise we will inject it's value by calling `.next`
      //b) if we are resolving a value it will be ignored by `.next` as `yield` will be
      //   the returned Promise from the http request
      return Promise.resolve(res.value)
        .then((val) => {
          return _co('next', val);
        }, (err) => {
          return _co('throw', err);
        });
    }
  }

  _co('next'); //start the process by calling `.next` on the generator instance
}

const upTitles = 'http://www.omdbapi.com/?s=up';

spawn(function *() {
  let ids;

  try {
    const moviesWithUpTitle = yield getWithProm(upTitles);
    const {Search} = JSON.parse(moviesWithUpTitle);

    ids = Search.map(data => `http://www.omdbapi.com/?i=${data.imdbID}`);
    console.log('****Movies Id\'s with title "UP"****', ids);
  } catch (err) {
    console.error(`Error making HTTP request for ${upTitles}`, err);
  }

  for (let data of ids.map(getWithProm)) {
    try {
      const dataById = yield data;
      const {Title} = JSON.parse(dataById);

      console.log('***Movie Title***', Title);
    } catch (err) {
      console.err(`Error fetching data for ${err}`);
    }
  }
});
