![Cover](https://raw.githubusercontent.com/fwd/sass/master/.github/cover.png)

<h1 align="center">@fwd/sass 🔐</h1>

> A NodeJS library to bootstrap node saas.

## Install

```sh
npm install @fwd/sass
```

## Usage

```js

const database = require('@fwd/database')('local', {
	database: "database.json"
})

const saas = require('@fwd/sass')({
	database: database,
	namespace: 'sass'
})

saas.start(80, __dirname)

```

## 👤 Author

**Forward Miami**

* Github: [@fwd](https://github.com/fwd)
* Website: [https://forward.miami](https://forward.miami)

## 🤝 Contributing

Contributions, issues and feature requests are welcome! Feel free to check [issues page](https://github.com/fwd/auth/issues).

## ⭐️ Show your support

Give a star if this project helped you, and help us continue maintaining this project by contributing to it or becoming a sponsor.

[Become a sponsor to fwd](https://github.com/sponsors/fwd)

## 📝 License

Copyright © 2020 [Forward Miami](https://forward.miami). This project is [Apache-2.0](https://spdx.org/licenses/Apache-2.0.html) licensed.
