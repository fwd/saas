const fs = require('fs')
const _ = require('lodash')
const glob = require('glob')
const server = require('@fwd/server')

const api = require('@fwd/api')

const utilities = require('./utilities')

module.exports = (config) => {
	
	if (!config.namespace) {
		console.log("Error: namespace required")
		return
	}

	if (!config.database) {
		console.log("Error: Database required")
		return
	}

	const auth = require('./utilities/auth')(config.database)

	api.use(async (req, res, next) => {

		req.database = config.database

		utilities.usage.global(req)

	    var session = {
	        path: req.originalUrl,
	        createdAt: server.timestamp('LLL', 'us-east'),
	        ip: req.headers['x-forwarded-for'] || req.connection.remoteAddress,
	    }
	 
	    if (utilities.checkForOffendingKeyword(session)) {
	        config.database.create(`${config.namespace}/blacklist`, session)
	        server.cache('blacklist', await config.database.get(`${config.namespace}/blacklist`))
	        denied(res)
	        return
	    }
	   
	    var blacklist = server.cache('blacklist') || []

	    if (blacklist.length && blacklist.find(a => a.ip === session.ip)) {
	        denied(res)
	        return
	    }
	    
	    req.auth = auth
		
		req.session = req.headers['session']
		req.private_key = req.headers['authorization'] || req.headers['authorization'] || req.query.key || req.query.apiKey
		
		req.user = await auth.validate(req.session, null, req.private_key, null)

		if (req.user) {
			utilities.usage.user(req)
		}

		next()

	})

	api.add([
		{
			path: '/__login',
			method: 'post',
			limit: [30, 60],
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
			path: '/__register',
			method: 'post',
			limit: [30, 60],
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
					if (config.private) {
						resolve({
							code: 401,
							error: true
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
			path: '/__user',
			method: 'get',
			action: (req) => {
				return new Promise(async (resolve, reject) => {


					if (!req.user) {
						resolve({
							error: true,
							code: 401
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

	var endpoints = config.endpoints || []

		endpoints = endpoints.map(a => {

			if (a.auth && typeof a.auth == 'boolean') {
				a.auth = async (req) => {
					if (!req.user) {
						return false
					}
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
				return new Promise(async (resolve, reject) => {
					resolve( 
						api.render(__dirname + '/views/admin.ejs', {
							config: config
						}) 
					)
				})
			}
		})
	}

	if (!endpoints.find(a => a.path == '/admin')) {	
		api.add({
			path: '/admin',
			method: 'get',
			action: (req) => {
				return new Promise(async (resolve, reject) => {
					resolve( 
						api.render(__dirname + '/views/admin.ejs', {
							config: config
						}) 
					)
				})
			}
		})
	}

	if (!endpoints.find(a => a.path == '/')) {	
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