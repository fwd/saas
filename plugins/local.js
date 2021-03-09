const _ = require('lodash')
const moment = require('moment')
const server = require('@fwd/server')
const api = require('@fwd/api')

moment.suppressDeprecationWarnings = true;

module.exports = (config) => {
	
	if (!config.namespace) {
		console.log("Error: namespace required")
		return
	}

	if (!config.database) {
		console.log("Error: @fwd/database required")
		return
	}

	if (!config.business.name && !config.business.logo) {
		console.log("WARN: Server business is not configured.")
	}

	if (!config.plugins.find(a => a.name == 'mailgun')) {
		console.log("WARN: Server mail service is not configured.")
	}

	const auth = require('./utilities/auth')(config)
	const utilities = require('./utilities')(config)

	api.use(async (req, res, next) => {

		req.auth = auth
		req.database = config.database
		req.namespace = config.namespace
		req.session = req.headers['session']
		req.private_key = req.headers['authorization'] || req.headers['authorization'] || req.query.key || req.query.apiKey
		req.user = await auth.validate(req.session, null, req.private_key, null)

		// record usage at global level
		utilities.usage.global(req)

		if (req.user) {
			
			utilities.usage.user(req)

		} else {

		    var blacklist = server.cache('blacklist') || await req.database.get(`${config.namespace}/blacklist`)
		    	blacklist = blacklist && blacklist.length ? blacklist : []

		    var session = {
		        path: req.originalUrl,
		        timestamp: server.timestamp('LLL', 'us-east'),
		        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
		    }

		    if (blacklist.length && blacklist.find(a => a.ip == session.ip)) {
		    	// providing anything other than 404 gives incentive to keep trying
				res.status(404).send('Nope')
				// end
		        return
		    }
		 
		    if (utilities.checkForOffendingKeyword(session)) {
		        // storage in database
		        blacklist.push(session)
		        // refresh cache 
		        await req.database.set(`${config.namespace}/blacklist`, blacklist)
		        // providing anything but 404 gives incentive to keep trying
				res.status(404).send(`You've been banned from using this service. `)
				// end
		        return
		    }

		}
	    
		next()

	})

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
								message: "Registration is disabled"
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
								message: "Registration is disabled"
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

						delete req.user.password

						resolve({
							user: req.user
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
