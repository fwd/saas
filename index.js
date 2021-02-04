module.exports = (config) => {

	try	{
		
		return require('./plugins/local')(config)

	} catch (e) {

		console.log("Auth Error:", e.message)
		
	}

}
