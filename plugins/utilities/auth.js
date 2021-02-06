// const config = require('../config')
const bcrypt = require('bcrypt')
const server = require('@fwd/server')

function validateEmail(email) {
    var re = /\S+@\S+\.\S+/;
    return re.test(email);
}

module.exports = (config) => {

	const database = config.database

	return {

		database: database,

		async validate(sessionId, user, private_key, public_key) {

			if (public_key) {

				var user = await database.findOne(`${config.namespace}/users`, {
					public_key: public_key
				})

				if (!user) {
					return false
				}

				return user

			}

			if (private_key) {

				var user = await database.findOne(`${config.namespace}/users`, {
					private_key: private_key
				})

				if (!user) {
					return false
				}

				return user

			}

			if (sessionId && !user) {
				
				var session = await database.findOne(`${config.namespace}/sessions`, {
					id: sessionId
				})

				if (!session) {
					return false
				}

				return await database.findOne(`${config.namespace}/users`, {
					id: session.userId
				})

			}

			if (user) {

				var session = {
					id: server.uuid(),
					userId: user.id,
					created_at: server.timestamp('LLL'),
				}
				
				await database.create(`${config.namespace}/sessions`, session)

				return session

			}

			return false

		},

		login(req) {

			var self = this

			var username = req.body.username

			var password = req.body.password

			return new Promise(async (resolve, reject) => {

				if (!validateEmail(username)) {
					reject({
						code: 400,
						error: true,
						message: "Username must be a valid email address."
					})
					return
				}
		
				var user = await database.findOne(`${config.namespace}/users`, {
					username: username
				})
				
				
				if (!user) {
					reject({
						code: 401,
						error: true,
						message: "Account not found."
					})
					return
				}

				if (!user || !await bcrypt.compare(password, user.password)) {
					reject({
						code: 401,
						error: true,
						message: "The password provided does not match."
					})
					return
				}

				var session = await self.validate(null, user)

				resolve({
					sessionId: session.id,
					username: user.username
				})

			})
			

		},

		register(req) {

			var username = req.body.username

			var password = req.body.password

			return new Promise(async (resolve, reject) => {

				if (!validateEmail(username)) {
					reject({
						code: 400,
						error: true,
						message: "Username must be a valid email address."
					})
					return
				}
		
				var user = await database.findOne(`${config.namespace}/users`, {
					username: username
				})

				if (user) {

					reject({
						code: 404,
						error: true,
						message: "Account already exists."
					})
					
					return

				}

				var user = {
					id: server.uuid(),
					username: username,
					password: await bcrypt.hash(password, 10),
					namespace: server.uuid(true).slice(0, 7),
					public_key: `PUBLIC-${server.uuid().split('-').join('').toUpperCase()}`,
					private_key: `PRIVATE-${server.uuid().split('-').join('').toUpperCase()}`,
					created_at: server.timestamp('LLL')
				}

				await database.create(`${config.namespace}/users`, user) 

				var session = await self.validate(null, user)

				resolve({
					sessionId: session.id,
					username: user.username
				})

			})

		},

	}

}
