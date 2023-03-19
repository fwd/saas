const fs = require('fs')
const path = require('path')
const ejs = require('ejs')
const server = require('@fwd/server')

module.exports = (config) => {

	return {

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
