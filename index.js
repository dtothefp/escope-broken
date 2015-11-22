const {first, second, ...rest} = {
  first: 'first',
  second: 'second',
  more: 'more',
  stuff: 'stuff',
};

console.log(first);
console.log(second);
console.log(rest);
