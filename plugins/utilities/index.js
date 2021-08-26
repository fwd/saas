const fs = require('fs')
const path = require('path')
const ejs = require('ejs')
const server = require('@fwd/server')

module.exports = (config) => {

	return {

		increment(usage, req) {

			var usage = !Array.isArray(usage) ? usage : {}

			var date = `${server.timestamp('MMMM YYYY')}`

			usage[date] = usage[date] || {}
			usage[date][req.originalUrl] = usage[date][req.originalUrl] || 0
			usage[date][req.originalUrl]++

			return usage 

		},

		async usage(req) {

			if (req.user) {
				req.originalUrl = req.originalUrl.split('/?')[0]
				req.originalUrl = req.originalUrl.split('?')[0]
				var usage = await req.database.get(`usage/${req.user.id}`)
				await req.database.set(`usage/${req.user.id}`, this.increment(usage, req))
				return
			}

			var usage = await req.database.get(`usage/_global`)
			await req.database.set(`usage/_global`, this.increment(usage, req))

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
						try {
							resolve(ejs.render(body, { data: data }))
						} catch (e) {
						   console.log("EJS Rendering Error:", e)
							resolve({ error: true, message: e.message })
						}
					});
				} catch (e) {
					console.log("EJS Rendering Error:", e)
					resolve({ error: true, message: e.message })
				}
			})
		}

	}

}
