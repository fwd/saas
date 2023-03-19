const database = require('@fwd/database')('local')

const saas = require('./index')({
    database: database,
    endpoints: [
    	{
    		path: '/',
    		action: async (req, res) => saas.endpoints
    	}
    ]
})

saas.use((req, res, next) => {
	console.log( req.ip )
	next()
})

saas.start(8080, __dirname, {
    response: "raw"
})