const fs = require('fs')
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

		var ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || (req.connection.socket ? req.connection.socket.remoteAddress : null);
			ipAddress = ipAddress ? ipAddress.replace('::ffff:', '') : ipAddress

		req.auth = auth
		req.ipAddress = ipAddress
		req.utilities = utilities
		req.database = config.database
		req.session = req.headers['session']
		req.private_key = req.headers['authorization'] || req.query.private_key
		req.user = await auth.validate(req.session, null, req.private_key, null, req)

		if (config.usage || req.user) {
		   utilities.usage(req)
		}
			
		next()

	})

	security.allow = (req) => {
		if (req.user) {
			return true
		}
		return false
	}

	api.use(security.firewall)

	var endpoints = []
	config.auth = config.auth || true
	config.registration = config.registration || true

	if (config.auth) {

		var _auth = ([
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
				path: '/refresh/token',
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

						resolve( await auth.refresh(req) )
						
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
			},
		])

		_auth.map(a => endpoints.push(a))

	}

	if (config.upload) {

		var uploadConfig = {
			endpoint: config.upload.endpoint ? config.upload.endpoint : '/upload',
			public: config.upload.public ? config.upload.public : false,
			folder: config.upload.folder ? config.upload.folder : `./uploads`,
			fileLimit: config.upload.fileLimit ? config.upload.fileLimit : 10,
			sizeLimit: config.upload.sizeLimit ? (1024 * 1000) * config.upload.sizeLimit : (1024 * 1000) * 100,
		}

		if (!fs.existsSync(uploadConfig.folder)){
		    fs.mkdirSync(uploadConfig.folder);
		}

		api.config.uploadFolder = uploadConfig.folder

		var multer = require('multer');

		var storage = multer.diskStorage({
			destination: function (req, file, callback) {
				var path = `${uploadConfig.folder}/${req.user ? req.user.namespace : server.uuid(true)}`
				if (!fs.existsSync(path)){
				    fs.mkdirSync(path);
				}
				callback(null, path);
			},
			filename: function (req, file, callback) {
				var re = /(?:\.([^.]+))?$/;
				callback(null, server.uuid(14, null, null, true) + '.' + re.exec(file.originalname)[1]);
			}
		})

		var upload = multer({ storage : storage, limits: { fileSize: uploadConfig.sizeLimit } }).array('files', uploadConfig.fileLimit)

		endpoints.push({
			auth: !uploadConfig.public,
			path: uploadConfig.endpoint,
			method: 'post',
			limit: [5, 60],
			action: (req) => {
				return new Promise(async (resolve, reject) => {

					var userId = req.user.id

					upload(req, null, async function(err) {

						if (err) {
							return resolve(err)
						}

						var response = []

						for (var file of req.files) {
							file.id = file.filename.split('.')[0]
							file.uri = file.path.replace(uploadConfig.folder.replace('./', ''), '').replace('/', '') // TODO fix this crap
							delete file.fieldname
							delete file.destination
							if (userId) file.userId = userId
							response.push( await req.database.create(`uploads`, file) )
						}

					    resolve(response)

					})

				})

			}

		})

		if (!uploadConfig.public) {

			endpoints.push({
				auth: true,
				path: '/user/uploads',
				method: 'get',
				action: (req) => {
					return new Promise(async (resolve, reject) => {
						var query = req.query || {}
							query.userId = req.user.id
						var files = await req.database.paginate('uploads', query)
							files = files.data.map(a => {
								var protocol = req.get('host').includes('localhost') ? 'http://' : 'https://'
								a.href = `${protocol}${req.get('host')}/${a.filename}`
								return a
							})
						resolve( files )
					})
				}
			})

			endpoints.push({
				auth: true,
				path: '/user/uploads/:id',
				method: 'delete',
				action: (req) => {
					return new Promise(async (resolve, reject) => {

						var file = await req.database.findOne('uploads', { id: req.params.id })

						if (file.userId !== req.user.id) {
							resolve({ error: 401 })
							return
						}
						
						await req.database.remove('uploads', req.params.id)

						fs.unlinkSync(file.path)

						resolve()

					})

				}

			})

		}

	}

	if (config.endpoints) {
		config.endpoints = Array.isArray(config.endpoints) ? config.endpoints : [config.endpoints]
		config.endpoints.map(a => endpoints.push(a))
	}

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
		            resolve("Hello, World.")
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
