const moment = require('moment')
const bcrypt = require('bcrypt')
const server = require('@fwd/server')

function validateEmail(email) {
    var re = /\S+@\S+\.\S+/;
    return re.test(email);
}

module.exports = (config) => {

    const utilities = require(__dirname + '/index')(config)
    const database = config.database

    return {

        updatable_keys: [
            'username',
            'password',
            'namespace',
            'public_key',
            'private_key',
            'created_at',
            'updated_at',
            'metadata',
        ],

        database: database,
        
        generateUuid(prepend, length) {
            return `${prepend}${server.uuid().split('-').join('').toLowerCase().slice(0, length)}`
        },

        // TODO cleaner API for validate
        // find: {
        //     async user(userId) {},
        //     async session(sessionId) {},
        //     async privateKey(sessionId) {},
        //     async publicKey(sessionId) {},
        // },
        
        async validate(sessionId, user, private_key, public_key, req) {

            if (public_key) {

                var user = await database.findOne(`users`, {
                    public_key: public_key
                })

                if (!user) {
                    return false
                }

                return user

            }

            if (private_key) {

                var user = await database.findOne(`users`, {
                    private_key: private_key
                })

                if (!user) {
                    return false
                }

                return user

            }

            if (sessionId && !user) {
                
                var session = await database.findOne(`sessions`, {
                    id: sessionId
                })
                
                if (session) {
                    console.log("session: " + session.ipAddress, "req: " + req.ipAddress )
                }

                if (session && moment().isBefore(moment(session.expiration)) && session.ipAddress == req.ipAddress) {
                    return await database.findOne(`users`, {
                        id: session.userId
                    })
                }

                return false

            }

            if (user) {

                var session = {
                    userId: user.id,
                    id: server.uuid(),
                    ipAddress: req.ipAddress,
                    created_at: server.timestamp('LLL'),
                    expiration: moment(server.timestamp('LLL')).add(4, 'hours')
                }
                
                await database.create(`sessions`, session)

                return session

            }

            return false

        },

        login(req) {

            var self = this

            var username = req.body.username

            var password = req.body.password

            return new Promise(async (resolve, reject) => {

                if (!validateEmail(username)) {
                    reject({
                        code: 400,
                        error: true,
                        message: "Username must be a valid email address."
                    })
                    return
                }
        
                var user = await database.findOne(`users`, {
                    username: username
                })
                
                if (!user) {
                    resolve({
                        code: 401,
                        error: true,
                        message: "Account not found."
                    })
                    return
                }

                if (!user || !await bcrypt.compare(password, user.password)) {
                    resolve({
                        code: 401,
                        error: true,
                        message: "The password provided does not match."
                    })
                    return
                }

                // sessionId, user, private_key, public_key, req
                var session = await self.validate(null, user, null, null, req)

                await database.update(`users`, user.id, {
                    last_login: server.timestamp('LLL')
                })

                resolve({
                    session: session.id,
                    exp: session.expiration
                })

            })
            
        },

        refresh(req) {

            var self = this

            return new Promise(async (resolve, reject) => {
                
                await database.remove(`sessions`, req.session)

                var session = await self.validate(null, req.user, null, null, req)

                resolve({
                    session: session.id,
                    exp: session.expiration
                })

            })
            
        },

        forgot(req) {

            var self = this

            var username = req.body.username

            return new Promise(async (resolve, reject) => {

                if (!validateEmail(username)) {
                    reject({
                        code: 400,
                        error: true,
                        message: "Username must be a valid email address."
                    })
                    return
                }
        
                var user = await database.findOne(`users`, {
                    username: username
                })
                
                if (!user) {
                    resolve({
                        code: 401,
                        error: true,
                        message: "Account not found."
                    })
                    return
                }

                var reset = {
                    userId: user.id,
                    type: 'password_reset',
                    id: server.uuid().split('-').join(''),
                    expiration: moment(server.timestamp('LLL')).add(1, 'hour')
                }

                await database.create(`tokens`, reset)

                var host = (req.get('host') == 'localhost' ? 'http://' : 'https://') + req.get('host')
                var resetUrl = host + '?token=' + reset.id + '/#/reset'

                var email = {
                    to: username,
                    subject: 'Password Reset Request',
                    from: `${config.business.name} <${config.business.email}>`,
                    html: await utilities.render('reset.html', {
                        host: host,
                        business: config.business,
                        config: config,
                        resetId: reset.id,
                        resetUrl: resetUrl
                    })
                }

                resolve( await utilities.mail(email) )

            })
            
        },

        verify(type, req) {

            var self = this

            return new Promise(async (resolve, reject) => {

                if (type === 'email') {

                    var token = {
                        id: server.uuid(),
                        userId: req.user.id,
                        type: 'email_verification',
                        expiration: moment(server.timestamp('LLL')).add(15, 'minutes')
                    }

                    var history = await database.find(`tokens`, {
                        userId: req.user.id,
                        type: 'email_verification'
                    })
                    
                    for (var i in history) {
                        await database.remove(`tokens`, history[i].id)
                    }

                    await database.create(`tokens`, token)

                    var host = (req.get('host') == 'localhost' ? 'http://' : 'https://') + req.get('host')
                    var buttonUrl = host + `/user/validate/email/${token.id }`

                    if (config.business.verificationRedirect) {
                        buttonUrl += '?redirect=' + config.business.verificationRedirect
                    }

                    var email = {
                        to: req.user.username,
                        subject: 'Verify Email Address',
                        from: `${config.business.name} <${config.business.email}>`,
                        html: await utilities.render('welcome.html', {
                            host: host,
                            config: config,
                            business: config.business,
                            buttonUrl: buttonUrl
                        })
                    }

                    resolve( await utilities.mail(email) )

                }
                

            })
            
        },

        update(key, user, value) {

            var self = this

            return new Promise(async (resolve, reject) => {

                if (!self.updatable_keys.includes(key)) {
                    resolve({
                        error: true,
                        message: `Updating user.${key} key is not allowed. Store this value in metadata instead.`
                    })
                    return
                }

                if (key === 'password') {
                    user[key] = await bcrypt.hash(value, 10)
                }

                if (key === 'namespace') {
                    user[key] = server.uuid(true).slice(0, 7)
                }

                if (key === 'public_key') {
                    user[key] = self.generateUuid('public-', 14)
                }

                if (key === 'private_key') {
                    user[key] = self.generateUuid('private-', 14)
                }

                if (key === 'metadata') {
                    Object.keys(value).map(key => {
                        user.metadata[key] = value[key]
                    })
                }

                await database.findOne(`users`, { id: user.id })

                user.updated_at = server.timestamp('LLL')
                
                await database.update(`users`, user.id, user)

                resolve()

            })

        },

        reset(req) {

            var self = this

            var resetId = req.body.token
            var password = req.body.password

            return new Promise(async (resolve, reject) => {

                try {
    
                    var reset = await database.findOne(`tokens`, {
                        id: resetId
                    })
                    
                    if (!reset || (reset && reset.used) || (reset && moment().isAfter(moment(reset.expiration)))) {
                        resolve({
                            code: 401,
                            error: true,
                            message: "Invalid token."
                        })
                        return
                    }

                    var user = await database.findOne(`users`, {
                        id: reset.userId
                    })

                    await self.update('password', user, password)

                    // remove all previous sessions
                    var sessions = await database.find(`sessions`, {
                        userId: user.id
                    })
                    
                    for (var i in sessions) {
                        await database.remove(`sessions`, sessions[i].id)
                    }
                    
                    // sessionId, user, private_key, public_key, req
                    var session = await self.validate(null, user, null, null, req)

                    await database.update(`tokens`, reset.id, {
                        used: server.timestamp('LLL'),
                    })

                    resolve({
                        session: session.id,
                        exp: session.expiration
                    })

                } catch(e) {
                    console.log(e)
                }


            })
            
        },

        register(req) {

            var self = this

            var username = req.body.username

            var password = req.body.password

            var metadata = req.body.metadata
            
            var referral = req.body.referral

            return new Promise(async (resolve, reject) => {

                if (!validateEmail(username)) {
                    reject({
                        code: 400,
                        error: true,
                        message: "Username must be a valid email address."
                    })
                    return
                }
        
                var user = await database.findOne(`users`, {
                    username: username
                })

                if (user) {

                    resolve({
                        code: 404,
                        error: true,
                        message: "Account already exists."
                    })
                    
                    return

                }

                var user = {
                    id: server.uuid(true),
                    username: username,
                    password: await bcrypt.hash(password, 10),
                    namespace: server.uuid(true).slice(0, 7),
                    public_key: self.generateUuid('public-', 14),
                    private_key: self.generateUuid('private-', 14),
                    created_at: server.timestamp('LLL'),
                    last_login: server.timestamp('LLL'),
                    referral: referral,
                    metadata: metadata || {}
                }

                await database.create(`users`, user) 

                // sessionId, user, private_key, public_key, req
                var session = await self.validate(null, user, null, null, req)

                resolve({
                    session: session.id,
                    exp: session.expiration
                })

            })

        },

    }

}
