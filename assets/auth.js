window.app = {

	store: {},

	base_url: '<%- host %>',

	session: {
		get() {
			return localStorage.getItem('<%- config.session_key || "fwd.auth.token" %>')
		},
		set(token) {
			localStorage.setItem('<%- config.session_key || "fwd.auth.token" %>', token)
		},
		clear() {
			localStorage.clear()
		}
	},

	query(name, url) {
	    if (!url) url = window.location.href;
	    name = name.replace(/[\[\]]/g, '\\$&');
	    var regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)'),
	        results = regex.exec(url);
	    if (!results) return null;
	    if (!results[2]) return '';
	    return decodeURIComponent(results[2].replace(/\+/g, ' '));
	},

	serialize(form) {

		var arr = [];

		Array.prototype.slice.call(form.elements).forEach(function (field) {
			if (!field.name || field.disabled || ['file', 'reset', 'submit', 'button'].indexOf(field.type) > -1) return;
			if (field.type === 'select-multiple') {
				Array.prototype.slice.call(field.options).forEach(function (option) {
					if (!option.selected) return;
					arr.push({
						name: field.name,
						value: option.value
					});
				});
				return;
			}
			if (['checkbox', 'radio'].indexOf(field.type) >-1 && !field.checked) return;
			arr.push({
				name: field.name,
				value: field.value
			});
		});

		var response = {}

		arr = arr.map(a => {
			response[a.name] = a.value
		})

		return response;

	},

	http: {

		get(path) {
			return new Promise((resolve, reject) => {
				var xhr = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject('Microsoft.XMLHTTP');
				xhr.open('GET', url);
				xhr.onreadystatechange = function() {
					if (xhr.readyState > 3 && xhr.status == 200) {
						resolve(xhr.responseText)
					} else {
						reject(xhr)
					}
				};
				xhr.setRequestHeader('Content-Type', 'application/json');
				xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
				xhr.send();
				return xhr;
				// $.get(path + `${path.includes('?') ? '&' : '?'}session=` + app.session.get()).then((response) => resolve(response))
			})
		},

		post(path, data) {
			return new Promise((resolve) => {
				$.ajax({
				    type: "POST",
				    url: path,
				    headers: { "Content-Type": "application/json" },
				    data: JSON.stringify(data),
				    contentType:"application/json",
				    dataType:"json",
				    success: function(response) {
						resolve(response)
					}
			    });
			})
		}
	},

	login(form) {
		return new Promise((resolve) => {
			form = this.serialize(form)
			if (form.__honey) {
				$('#login #message').text("Nope").show()
				return
			}
			app.http.post(app.base_url + '/auth/login', form).then((res) => {
				if (res.response.sessionId) {
					app.session.set(res.response.sessionId)
					setTimeout(() => {
						window.location.href = '<%- config.redirect || "/admin" %>'
					}, 500)
				} else {
					$('#login #message').text(res.message).show()
				}
			})
		})
	},

	register(form) {
		return new Promise((resolve) => {
			form = this.serialize(form)
			if (form.__honey) {
				$('#login #message').text("Nope").show()
				return
			}
			if (form.password_confirmation && (form.password !== form.password_confirmation)) {
				$('#register #message').text('Password does not match').show()
				return
			}
			app.http.post(app.base_url + '/auth/register', form).then((res) => {
				if (res.response.sessionId) {
					app.session.set(res.response.sessionId)
					setTimeout(() => {
						window.location.href = '<%- config.redirect || "/admin" %>'
					}, 500)
				} else {
					$('#register #message').text(res.message).show()
				}
			})
		})
	},

	logout() {
		app.session.clear()
	},

}