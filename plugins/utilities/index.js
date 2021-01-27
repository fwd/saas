// const config = require('../config')

const server = require('@fwd/server')

module.exports = (config) => {

	const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
	const months = ["January", "February", "March", "April", "May","June","July", "August", "September", "October", "November","December"];

	const ignore = [
		'/',
		'admin/assets'
	]

	return {

		current: {
			day: days[(new Date).getDate()],
			month: months[(new Date).getMonth()],
			year: (new Date).getFullYear(),
			hour: (new Date).getHours()
		},

		usage: {

			increment(usage, req) {

				var usage = usage || {}

				var year = (new Date).getFullYear()
				var month = months[(new Date).getMonth()]
				var day = server.timestamp('LL')
				
				usage[year] = usage[year] || {}
				usage[year][month] = usage[year][month] || {}

				if (req) {
					usage[year][month][day] = usage[year][month][day] || {}
					usage[year][month][day][req.originalUrl] = usage[year][month][day][req.originalUrl] || 0
					usage[year][month][day][req.originalUrl]++
				} else {
					usage[year][month][day] = usage[year][month][day] || 0
					usage[year][month][day]++
				}

				return usage 

			},

			async global(req) {

		
				if (ignore.includes(req.originalUrl)) {
					return
				}

				var count = server.cache(`${config.namespace}/count`)
				
				var usage = server.cache(`${config.namespace}/usage`)
				
				if (!usage) {
					usage = await req.database.get(`${config.namespace}/usage`) || {}
				}
				
				usage.usage = this.increment(usage.usage)
				usage.endpoints = this.increment(usage.endpoints)
				
				count++
				
				server.cache(`${config.namespace}/count`, count)
				
				server.cache(`${config.namespace}/usage`, usage)
				
				if (count >= 10) {
					server.cache(`${config.namespace}/count`, 0)
					await req.database.set(`${config.namespace}/usage`, usage)
				}

			},

			async user(req) {

				if (ignore.includes(req.originalUrl)) {
					return
				}

				var usage = req.user.usage || {}

				await req.database.set(`${config.namespace}/usage`, {
					usage: this.increment(usage.usage),
					endpoints: this.increment(usage.endpoints, req),
				})

			}

		}, 

		checkForOffendingKeyword(session) {

		    var known_bullshit = [
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

		    for (var i in known_bullshit) {
		        if (session.path.includes(known_bullshit[i])) {
		            return true
		        }
		    }

		    return false

		}

	}

}
