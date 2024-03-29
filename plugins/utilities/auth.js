const _ = require('lodash')
const moment = require('moment')
const bcrypt = require('bcrypt')
const server = require('@fwd/server')
const twofactor = require("node-2fa")

function validateEmail(email) {
    var re = /\S+@\S+\.\S+/;
    return re.test(email);
}

function fingerprint(ipAddress, userAgent) {
    return `${ipAddress}-${userAgent ? userAgent.toLowerCase().split(' ').join('-') : '[no-user-agent]'}`
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

        async validate(sessionId, user, private_key, public_key, req) {

            if (config.public_key && public_key) {

                var user = await database.findOne(`users`, {
                    public_key: public_key
                })

                if (!user) {
                    return false
                }

                return user

            }

            if (config.private_key && private_key) {

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
                
                if (!session) {
                    return false
                }
                
                // expired session
                if ( moment(server.timestamp('LLL', config.timezone)).isAfter(moment(session.expiration)) ) {
                    return false
                }
                   
                // not original ip and user-agent
                // if (session.fingerprint !== fingerprint(req.ipAddress, req.get('User-Agent'))) {
                //     return false
                // }
                
                return await database.findOne(`users`, { id: session.userId })

            }

            if (user) {

                var twoFactorEnabled = await this.has2Factor(req)

                var session = {
                    userId: user.id,
                    id: server.uuid(),
                    ipAddress: req.ipAddress,
                    created_at: server.timestamp('LLL', config.timezone),
                    expiration: moment(server.timestamp('LLL', config.timezone)).add((config.lockout || 24), 'hours'),
                    fingerprint: fingerprint(req.ipAddress, req.get('User-Agent'))
                }
                
                await database.create(`sessions`, session)

                return session

            }

            return false

        },

        login(req) {

            var self = this

            var username = req.body.username.toLowerCase()

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
                    return reject({ code: 401, error: true, message: "Account not found." })
                }

                if (!user || !await bcrypt.compare(password, user.password)) {
                    return reject({ code: 401, error: true, message: "Password does not match." })
                }

                if (config.events && config.events.beforeLogin) {
                    var beforeLogin = await config.events.beforeLogin(req, user)
                    if (!beforeLogin || beforeLogin.error) return resolve(beforeLogin)
                }

                var session = await self.validate(null, user, null, null, req)

                await database.update(`users`, user.id, {
                    last_login: server.timestamp('LLL', config.timezone)
                })

                if (config.events && config.events.login) {
                    config.events.login(user, session)
                }

                resolve({ 
                    userId: user.id, 
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

                var host = config.business.host ? config.business.host : (req.get('host') == 'localhost' ? 'http://' : 'https://') + req.get('host')
                var resetUrl = host + '?token=' + reset.id + '/#/reset'

                var email = {
                    to: username,
                    subject: 'Password Reset',
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
                        expiration: moment(server.timestamp('LLL', config.timezone)).add(15, 'minutes')
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
                    var buttonUrl = host + `/user/validate/email/${token.id}`

                    if (config.business.verificationRedirect) {
                        buttonUrl += '?redirect=' + (config.business.verificationRedirect || '/#/login')
                    }

                    var email = {
                        to: req.user.username,
                        subject: 'Verify Email Address',
                        from: `${config.business.name} <${config.business.email}>`,
                        html: await utilities.render(config.business && config.business.template && config.business.template.verify ? config.business.template.verify : 'welcome.html', {
                            host: host,
                            config: config,
                            business: config.business,
                            buttonUrl: buttonUrl
                        })
                    }

                    if (config.events && config.events.verify) {
                        config.events.verify(req.user)
                    }

                    try {
                        resolve( await utilities.mail(email) )
                    } catch (e) {
                         console.log(e)
                         resolve({ error: true, message: e.message }) 
                    }

                }
                
            })
            
        },

        update(user, key, value) {

            var self = this

            return new Promise(async (resolve, reject) => {

                if (!self.updatable_keys.includes(key)) {
                    resolve({
                        error: true,
                        message: `Updating user.${key} key is not allowed. Store this value in metadata instead.`
                    })
                    return
                }

                if (key === 'username' && value) {

                    var exists = await database.findOne(`users`, {
                        username: value
                    })

                    if (exists && exists.id !== user.id) {
                        resolve({
                            error: true,
                            message: `Account with that username already exists.`
                        })
                        return
                    }

                    if (exists && exists.username !== value) {
                        user.verified_email = false
                    }

                    user[key] = value

                }

                if (key === 'password' && value) {
                    user[key] = await bcrypt.hash(value, 10)
                }

                if (key === 'namespace') {
                    user[key] = server.uuid(true).slice(0, 7)
                }

                if (key === 'public_key') {
                    user[key] = self.generateUuid('public-', 15)
                }

                if (key === 'private_key') {
                    user[key] = self.generateUuid('private-', 30)
                }

                if (key === 'metadata') {
                    Object.keys(value).map(key => {
                        user.metadata[key] = value[key]
                    })
                }

                // TODO remove this hack of having to fetch model before updating
                await database.findOne(`users`, { id: user.id })
                
                await database.update(`users`, user.id, user)

                if (config.events && config.events.update) {
                    config.events.update(user)
                }

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
                        used: server.timestamp('LLL', config.timezone),
                    })

                    if (config.events && config.events.reset) {
                        config.events.reset(user)
                    }

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

            var username = req.body.username.toLowerCase()

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
                    public_key: self.generateUuid('PUBLIC-', 15),
                    private_key: self.generateUuid('PRIVATE-', 30),
                    created_at: server.timestamp('LLL', config.timezone),
                    last_login: server.timestamp('LLL', config.timezone),
                    referral: referral,
                    metadata: metadata || {}
                }

                if (config.events && config.events.beforeRegister) {
                    var beforeRegister = await config.events.beforeRegister(req, user)
                    if (!beforeRegister || beforeRegister.error) return resolve(beforeRegister)
                    if (beforeRegister.id && user.id === beforeRegister.id) user = beforeRegister
                }

                await database.create(`users`, user) 

                // sessionId, user, private_key, public_key, req
                var session = await self.validate(null, user, null, null, req)

                if (config.events && config.events.register) {
                    config.events.register(user, session)
                }

                resolve({
                    session: session.id,
                    exp: session.expiration
                })

            })

        },

        async has2Factor(req) {
            return await database.findOne('two-factor', { userId: req.user.id })
        },

        async check2Factor(req, code) {

            if (!req || !req.user || !req.user.id) return console.error("No user provided for two-factor check.")

            var twoFactorEnabled = await this.has2Factor(req)

            if (!twoFactorEnabled) return false

            return twofactor.verifyToken(twoFactorEnabled.secret, code)

        },

    }

}
