```sh
npm i
npm run lint #will see an error with escope 3.3.0
```

```sh
rm -rf node_modules/eslint/node_modules/escope
npm i -S escope@3.2.0
npm run lint #this will work
```

```sh
npm i -S escope@latest #installs 3.3.0
npm run lint #this WON'T work
```

