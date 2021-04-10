const _ = require('lodash')
const moment = require('moment')
const server = require('@fwd/server')
const api = require('@fwd/api')
const security = require('@fwd/security')

moment.suppressDeprecationWarnings = true;

module.exports = (config) => {

	if (!config.database) {
		console.log("Error: @fwd/database required")
		return
	}

	if (!config.business.name && !config.business.logo) {
		if (config.debug) console.log("WARN: Server business is not configured.")
	}

	if (!config.plugins.find(a => a.name == 'mailgun')) {
		if (config.debug) console.log("WARN: Server mail service is not configured.")
	}

	const auth = require('./utilities/auth')(config)
	const utilities = require('./utilities')(config)

	api.use(async (req, res, next) => {

		req.auth = auth
		req.database = config.database
		req.session = req.headers['session']
		req.private_key = req.headers['authorization'] || req.headers['authorization'] || req.query.private_key
		req.user = await auth.validate(req.session, null, req.private_key, null)

		utilities.usage(req)
	    
		next()

	})

	security.allow = (req) => {
		if (req.user) {
			return true
		}
		return false
	}

	api.use(security.firewall)

	config.auth = config.auth || true
	config.registration = config.registration || true

	if (config.auth) {

		api.add([
			{
				path: '/login',
				method: 'post',
				limit: [5, 60],
				parameters: [
					{
						type: "string",
						name: "username",
						required: true
					},
					{
						name: "password",
						type: "string",
						required: true
					},
				],
				action: (req) => {
					return new Promise(async (resolve, reject) => {
						try	{
							resolve( await auth.login(req) )
						} catch (error) {
							resolve(error)
						}
					})
				}
			},
			{
				path: '/register',
				method: 'post',
				limit: [5, 60],
				parameters: [
					{
						type: "string",
						name: "username",
						required: true
					},
					{
						name: "password",
						type: "string",
						required: true
					},
				],
				action: (req) => {
					return new Promise(async (resolve, reject) => {
						if (!config.registration || config.private) {
							resolve({
								code: 401,
								error: true,
								message: "Registration is not allowed."
							})
							return 
						}
						try	{
							resolve( await auth.register(req) )
						} catch (error) {
							resolve(error)
						}
					})
				}
			},
			{
				path: '/forgot',
				method: 'post',
				limit: [5, 60],
				parameters: [
					{
						type: "string",
						name: "username",
						required: true
					}
				],
				action: (req) => {
					return new Promise(async (resolve, reject) => {
						try	{
							resolve( await auth.forgot(req) )
						} catch (error) {
							resolve(error)
						}
					})
				}
			},
			{
				path: '/reset',
				method: 'post',
				limit: [5, 60],
				parameters: [
					{
						name: "token",
						type: "string",
						required: true
					},
					{
						name: "password",
						type: "string",
						required: true
					},
				],
				action: (req) => {
					return new Promise(async (resolve, reject) => {
						try	{
							resolve( await auth.reset(req) )
						} catch (error) {
							resolve(error)
						}
					})
				}
			},

			{
				auth: true,
				path: '/logout',
				method: 'post',
				action: (req) => {
					return new Promise(async (resolve, reject) => {

						resolve( await req.database.remove('sessions', req.headers.session) )
						
					})
				}
			},
			
			{
				auth: true,
				path: '/user',
				method: 'get',
				action: (req) => {
					return new Promise(async (resolve, reject) => {

						if (!req.user) {
							resolve({
								error: true,
								code: 401,
							})
							return
						}

						var user = JSON.parse(JSON.stringify(req.user))

						delete user.password

						resolve({
							user: user
						})
						
					})
				}
			},

			{
				auth: true,
				path: '/user',
				method: 'post',
				parameters: auth.updatable_keys.map(key => {
					return {
						name: key,
						type: "string"
					}
				}),
				action: (req) => {
					return new Promise(async (resolve, reject) => {

						if (!req.user) {
							resolve({
								error: true,
								code: 401,
							})
							return
						}

						var keys = Object.keys(req.body)

						for (var i in keys) {
							
							if (!auth.updatable_keys.includes(keys[i])) {
								resolve({
									error: true,
									message: `'${keys[i]}' key is not supported. Store this value in metadata instead.`
								})
								return
							}
							
							await auth.update(keys[i], req.user, req.body[keys[i]])

						}

						resolve({
							success: true
						})

					})

				}

			},

			{
				auth: true,
				path: '/user/validate/email',
				method: 'post',
				action: (req) => {
					return new Promise(async (resolve, reject) => {

						if (!req.user) {
							resolve({
								error: true,
								code: 401,
							})
							return
						}

						resolve( await auth.verify('email', req) )

					})

				}

			},

			{
				method: 'get',
				path: '/user/validate/email/:token',
				action: (req) => {
					return new Promise(async (resolve, reject) => {

						var token = await req.database.findOne(`tokens`, {
							id: req.params.token
						})

						if (!token && (token && moment().isAfter(moment(token.expiration)))) {
							resolve( "Not Ok" )
							return
						}

						await req.database.update(`users`, token.userId, {
							verified_email: true
						})

						resolve({
							redirect: req.query.redirect || '/'
						})

					})

				}

			}

		])

	}

	var endpoints = config.endpoints || []

		endpoints = endpoints.map(a => {

			a.method = a.method || 'get'

			if (a.auth && typeof a.auth == 'boolean') {
				a.auth = async (req) => {
					if (!req.user) return false
					return true
				}
			} 

			return a

		})

	api.add(endpoints)

	if (!endpoints.find(a => a.path == '/')) {	
		api.add({
		    path: '/',
		    method: 'get',
		    action: (req) => {
		        return new Promise((resolve, reject) => {
		            resolve("Hello, World")
		        })
		    }
		})
	}

	if (!endpoints.find(a => a.path == '*')) {	
		api.add({
		    path: '*',
		    method: 'get',
		    action: (req) => {
		        return new Promise((resolve, reject) => {
		            resolve({
		                'Content-Type': 'text/html',
		                statusCode: 404,
		                data: "Not found. This request has been recorded."
		            })
		        })
		    }
		})
	}

	return api

}
