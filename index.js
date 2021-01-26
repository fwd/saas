module.exports = (config) => {

	try	{
		
		require('./plugins/local')(config)

	} catch (e) {
		console.log("Auth Error:", e.message)
	}

}
