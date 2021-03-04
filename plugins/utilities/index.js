const server = require('@fwd/server')

module.exports = (config) => {

	config = config || {}

	return {

		usage: {

			ignore: config.usage && config.usage.ignore ? config.usage.ignore : [ 'admin/assets' ],

			increment(usage, req) {

				var usage = usage || {}

				var day = server.timestamp('LL')

				if (req) {
					usage[day] = usage[day] || {}
					usage[day][req.originalUrl] = usage[day][req.originalUrl] || 0
					usage[day][req.originalUrl]++
				} else {
					usage[day] = usage[day] || 0
					usage[day]++
				}

				return usage 

			},

			async global(req) {

				if (this.ignore.includes(req.originalUrl)) {
					return
				}

				var count = server.cache(`${config.namespace}/count`) || 0
				var usage = await req.database.get(`${config.namespace}/usage`) || {}
				
				usage.usage = this.increment(usage.usage)
				usage.endpoints = this.increment(usage.endpoints, req)

				req.database.set(`${config.namespace}/usage`, usage)

			},

			async user(req) {

				if (this.ignore.includes(req.originalUrl)) {
					return
				}

				var usage = req.user.usage || {}

				await req.database.update('users', req.user.id, {
					usage: this.increment(usage.usage),
					endpoints: this.increment(usage.endpoints, req),
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

		}

	}

}
