# fwd/saas

> NPM package for bootstrapping Node SaaS applications.

## Install

```sh
npm install fwd/saas
```

## Usage

```js
const database = require('@fwd/database')('local')

const saas = require('@fwd/saas')({
    database: database,
})

saas.start(8080)
```

## 👤 Author

[@nano2dev](https://twitter.com/nano2dev)

## 🤝 Contributing

Contributions, issues and feature requests are welcome! Feel free to check [issues page](https://github.com/fwd/auth/issues).

## 📝 License

MIT License