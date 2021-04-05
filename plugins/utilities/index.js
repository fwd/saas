const fs = require('fs')
const path = require('path')
const ejs = require('ejs')
const server = require('@fwd/server')

module.exports = (config) => {

	return {

		usage: {

			ignore: config.usage && config.usage.ignore ? config.usage.ignore : [ 'admin/assets' ],

			increment(usage, req) {

				var usage = usage || {}

				var date = `${server.timestamp('MMMM YYYY')}`

				if (req) {
					usage[date] = usage[date] || {}
					usage[date][req.originalUrl] = usage[date][req.originalUrl] || 0
					usage[date][req.originalUrl]++
				} else {
					usage[date] = usage[date] || 0
					usage[date]++
				}

				return usage 

			},

			async global(req) {

				if (this.ignore.includes(req.originalUrl)) {
					return
				}

				var count = server.cache(`count`) || 0
				var usage = await req.database.get(`usage`) || {}
				
				usage.usage = this.increment(usage.usage)
				usage.endpoints = this.increment(usage.endpoints, req)

				req.database.set(`usage`, usage)

			},

			async user(req) {

				if (this.ignore.includes(req.originalUrl)) {
					return
				}

				var usage = req.user.usage || {}

				req.database.update(`users`, req.user.id, {
					usage: {
						requests: this.increment(usage.requests),
						endpoints: this.increment(usage.endpoints, req),
					}
				})

			}

		}, 

		checkForOffendingKeyword(session) {

		    var blacklist = config.blacklist || [
		        '.php',
		        '.cgi',
		        '.jsp',
		        '.env',
		        '.HNAP1',
		        'joomla',
		        'phpstorm',
		        'mysql',
		        'formLogin',
		        'phpunit',
		        'muieblackcat',
		        'wp-includes',
		        'wp-content',
		        'jsonws',
		        'phpmyadmin',
		        'phpadmin',
		    ]

		    for (var i in blacklist) {
		        if (session.path.includes(blacklist[i])) {
		            return true
		        }
		    }

		    return false

		},

		mail(email) {
			
			return new Promise((resolve, reject) => {

				var plugin = config.plugins.find(a => a.name == 'mailgun')

				if (!plugin) {
					resolve({
						error: true,
						message: "Server mail service is not configured."
					})
					return
				}

				var mailgun = require('mailgun-js')(plugin)
				 
				var data = {
					to: email.to,
					from: email.from,
					subject: email.subject,
				}

				if (email.html) {
					data.html = email.html
				} else {
					data.text = email.text
				}
				 
				mailgun.messages().send(data, function (error, body) {
				  resolve({ 
				  	success: "Email sent." 
				  })
				})
				
			})

		},

		render(template, data) {
			return new Promise((resolve, reject) => {
				try	{
					var templatePath = template && template.includes('/') ? template : __dirname + `/../views/${template}`
					fs.readFile(templatePath, 'utf-8', function(err, body) {
						resolve(ejs.render(body, {
							data: data
						}))
					});
				} catch (e) {
					console.log("Error:", e)
					resolve({
						error: true
					})
				}
			})
		}

	}

}
