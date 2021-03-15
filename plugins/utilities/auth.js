const moment = require('moment')
const bcrypt = require('bcrypt')
const server = require('@fwd/server')

function validateEmail(email) {
    var re = /\S+@\S+\.\S+/;
    return re.test(email);
}

module.exports = (config) => {

	const utilities = require(__dirname + '/index')(config)
	const database = config.database

	return {

		updatable_keys: [
			'username',
			'password',
			'namespace',
			'public_key',
			'private_key',
			'created_at',
			'updated_at',
			'metadata',
		],

		database: database,

		// validate: {
		// 	async user(userId) {},
		// 	async session(sessionId) {},
		// 	async privateKey(sessionId) {},
		// 	async publicKey(sessionId) {},
		// },

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

				if (!session || moment().isAfter(moment(session.expiration))) {
					return false
				}

				return await database.findOne(`${config.namespace}/users`, {
					id: session.userId
				})

			}

			if (user) {

				var session = {
					userId: user.id,
					id: server.uuid(),
					created_at: server.timestamp('LLL'),
					expiration: moment(server.timestamp('LLL')).add(24, 'hours')
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
					resolve({
						code: 401,
						error: true,
						message: "Account not found."
					})
					return
				}

				if (!user || !await bcrypt.compare(password, user.password)) {
					resolve({
						code: 401,
						error: true,
						message: "The password provided does not match."
					})
					return
				}

				var session = await self.validate(null, user)

				resolve({
					session: session.id,
					exp: session.expiration
				})

			})
			
		},

		forgot(req) {

			var self = this

			var username = req.body.username

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
					resolve({
						code: 401,
						error: true,
						message: "Account not found."
					})
					return
				}

				var reset = {
					userId: user.id,
					type: 'password_reset',
					id: server.uuid().split('-').join(''),
					expiration: moment(server.timestamp('LLL')).add(1, 'hour')
				}

				var reset = await database.create(`${config.namespace}/tokens`, reset)

				var host = (req.get('host') == 'localhost' ? 'http://' : 'https://') + req.get('host')
				var resetUrl = host + '?token=' + reset.id + '/#/reset'

				var email = {
					to: username,
					subject: 'Password Reset',
					from: `${config.business.name} <noreply@forward.miami>`,
					html: await utilities.render('reset.html', {
						host: host,
						business: config.business,
						config: config,
						resetId: reset.id,
						resetUrl: resetUrl
					})
				}

				resolve( await utilities.mail(email) )

			})
			
		},

		verify(type, req) {

			var self = this

			return new Promise(async (resolve, reject) => {

				if (type === 'email') {

					var token = {
						id: server.uuid(),
						userId: req.user.id,
						type: 'email_verification',
						expiration: moment(server.timestamp('LLL')).add(15, 'minutes')
					}

					var history = await database.find(`${config.namespace}/tokens`, {
						userId: req.user.id,
						type: 'email_verification'
					})
					
					for (var i in history) {
						await database.remove(`${config.namespace}/tokens`, history[i].id)
					}

					await database.create(`${config.namespace}/tokens`, token)

					var host = (req.get('host') == 'localhost' ? 'http://' : 'https://') + req.get('host')
					var buttonUrl = host + '/user/validate/email/' + token.id

					var email = {
						to: req.user.username,
						subject: 'Verify Email Address',
						from: `${config.business.name} <noreply@forward.miami>`,
						html: await utilities.render('welcome.html', {
							host: host,
							config: config,
							business: config.business,
							buttonUrl: buttonUrl
						})
					}

					resolve( await utilities.mail(email) )

				}
				

			})
			
		},

		update(key, user, value) {

			var self = this

			return new Promise(async (resolve, reject) => {

				if (!self.updatable_keys.includes(key)) {
					resolve({
						error: true,
						message: `Updating user.${key} key is not allowed. Store this value in metadata instead.`
					})
					return
				}

				if (key === 'password') {
					user[key] = await bcrypt.hash(password, 10)
				}

				if (key === 'namespace') {
					user[key] = server.uuid(true).slice(0, 7)
				}

				if (key === 'public_key') {
					user[key] = `PUBLIC-${server.uuid().split('-').join('').toUpperCase()}`
				}

				if (key === 'private_key') {
					user[key] = `PRIVATE-${server.uuid().split('-').join('').toUpperCase()}`
				}

				if (key === 'metadata') {
					Object.keys(value).map(key => {
						user.metadata[key] = value[key]
					})
				}

				// TODO find out why this fixes the bug of records no updating
				// unless we findOne first...wtf?
				await database.findOne(`${config.namespace}/users`, {
					id: user.id
				})

				user.updated_at = server.timestamp('LLL')
				
				await database.update(`${config.namespace}/users`, user.id, user)

				resolve()

			})

		},

		reset(req) {

			var self = this

			var resetId = req.body.token
			var password = req.body.password

			return new Promise(async (resolve, reject) => {
		
				var reset = await database.findOne(`${config.namespace}/tokens`, {
					id: resetId
				})
				
				if (!reset || (reset && reset.used) || (reset && moment().isAfter(moment(reset.expiration)))) {
					resolve({
						code: 401,
						error: true,
						message: "Invalid token."
					})
					return
				}

				var user = await database.findOne(`${config.namespace}/users`, {
					id: reset.userId
				})

				await this.update('password', user, password)

				// remove all previous sessions
				var sessions = await database.find(`${config.namespace}/sessions`, {
					userId: user.id
				})
				
				for (var i in sessions) {
					await database.remove(`${config.namespace}/sessions`, sessions[i].id)
				}

				// remove all previous tokens
				var resets = await database.find(`${config.namespace}/tokens`, {
					userId: user.id
				})

				for (var i in resets) {
					await database.remove(`${config.namespace}/tokens`, resets[i].id)
				}

				var session = await self.validate(null, user)

				await database.update(`${config.namespace}/tokens`, reset.id , {
					used: server.timestamp('LLL'),
				})

				resolve({
					session: session.id,
					exp: session.expiration
				})

			})
			
		},

		register(req) {

			var self = this

			var username = req.body.username

			var password = req.body.password

			return new Promise(async (resolve, reject) => {

				if (!validateEmail(username)) {
					resolve({
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

					resolve({
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
					created_at: server.timestamp('LLL'),
					metadata: {}
				}

				await database.create(`${config.namespace}/users`, user) 

				var session = await self.validate(null, user)

				resolve({
					session: session.id,
					exp: session.expiration
				})

			})

		},

	}

}
