module.exports = (config) => {

	try	{

		config = config || {}

		config.plugins = config.plugins || []
		config.plugins = config.plugins.filter(a => a.name)
		config.plugins = config.plugins.map(a => {
			a.name = a.name.toLowerCase()
			return a
		})

		config.business = config.business || {}
		
		return require('./plugins/local')(config)

	} catch (e) {

		console.log("Error:", e)
		
	}

}
