const assert = require('assert');
const { ExternalAPIController } = require('../../../node_app/controllers/externalAPI/externalAPIController');
const { constructorOptionsMock, resMock } = require('../../resources/testUtility');

describe('ExternalAPIController', function () {

	describe('#getAPIKeyRequests()', () => {

		const apiKeyList = [
			{id: 0, apiKey: 'aklfjdkh', username: 'test', active: 'true'}
		];
		const apiKeys = {
			findAll: async (data) => {
				const returnKeys = [];
				apiKeyList.forEach(key => {
					if (key.username === data.where.username) returnKeys.push(key);
				});
				return Promise.resolve(returnKeys);
			}
		};

		const apiKeyRequestList = [
			{id: 0, username: 'test', name: 'Test Test', email: 'test@test.com', reason: 'For testing', approved: true, rejected: false},
			{id: 0, username: 'bad', name: 'Test Test', email: 'bad@test.com', reason: 'For testing', approved: false, rejected: true},
			{id: 1, username: 'john', name: 'Test Test', email: 'john@test.com', reason: 'For testing', approved: false, rejected: false}
		];
		const apiKeyRequests = {
			findAll: async (data) => {
				return Promise.resolve(apiKeyRequestList);
			}
		};

		const opts = {
			...constructorOptionsMock,
			apiKeys,
			apiKeyRequests
		};

		const target = new ExternalAPIController(opts);

		let resData;
		const res = {
			...resMock,
			send: (data) => {
				resData = data;
				return data;
			}
		};

		const req = {
			headers: {
				SSL_CLIENT_S_DN_CN: 'john'
			},
			get(key) {
				return this.headers[key];
			}
		};

		it('should return all api requests that are not rejected', (done) => {
			const expected = {
				approved: [
					{approved: true, email: 'test@test.com', id: 0, keys: ['aklfjdkh'], name: 'Test Test', reason: 'For testing', rejected: false},
				],
				pending: [
					{approved: false, email: 'john@test.com', id: 1, name: 'Test Test', reason: 'For testing', rejected: false}
				]
			};

			target.getAPIKeyRequests(req, res).then(() => {
				assert.deepStrictEqual(resData, expected);
				done();
			});
		});
	});

	describe('#approveRejectAPIKeyRequest()', () => {

		const apiKeyList = [
			{id: 0, apiKey: 'aklfjdkh', username: 'test', active: 'true'}
		];
		const apiKeys = {
			create: async (data) => {
				apiKeyList.push(data);
				return Promise.resolve(data);
			}
		};

		const apiKeyRequestList = [
			{id: 0, username: 'test', name: 'Test Test', email: 'test@test.com', reason: 'For testing', approved: true, rejected: false},
			{id: 2, username: 'bad', name: 'Test Test', email: 'bad@test.com', reason: 'For testing', approved: false, rejected: true},
			{id: 3, username: 'john', name: 'Test Test', email: 'john@test.com', reason: 'For testing', approved: false, rejected: false}
		];
		const apiKeyRequests = {
			findOne: async (data) => {
				let returnRequest = {};
				apiKeyRequestList.forEach(request => {
					if (request.id === data.where.id) returnRequest = request;
				});
				return Promise.resolve(returnRequest);
			},
			update: async (data, where) => {
				apiKeyRequestList.forEach(request => {
					if (request.id === where.where.id) {
						request.rejected = data.rejected;
						request.approved = data.approved;
					}
				});
				return Promise.resolve();
			}
		};

		const opts = {
			...constructorOptionsMock,
			apiKeys,
			apiKeyRequests
		};

		const target = new ExternalAPIController(opts);

		let resData;
		let resCode;
		const res = {
			...resMock,
			send: (data) => {
				resData = data;
				return data;
			},
			sendStatus: (code) => {
				resCode = code;
				return code;
			}
		};

		const req = {
			headers: {
				SSL_CLIENT_S_DN_CN: 'john'
			},
			body: {
				id: 0,
				approve: true
			},
			get(key) {
				return this.headers[key];
			}
		};

		it('should approve the request', (done) => {
			target.approveRejectAPIKeyRequest(req, res).then(() => {
				assert.deepStrictEqual(resCode, 200);
				done();
			});
		});

		it('should reject the request', (done) => {
			req.body.approve = false;
			target.approveRejectAPIKeyRequest(req, res).then(() => {
				assert.deepStrictEqual(resData, {status: 'rejected'});
				done();
			});
		});
	});

	describe('#revokeAPIKeyRequest()', () => {

		const apiKeyList = [
			{id: 0, apiKey: 'aklfjdkh', username: 'test', active: 'true'}
		];
		const apiKeys = {
			update: async (data, where) => {
				apiKeyList.forEach(key => {
					if (key.id === where.where.id) {
						key.active = data.active;
					}
				});
				return Promise.resolve();
			}
		};

		const apiKeyRequestList = [
			{id: 0, username: 'test', name: 'Test Test', email: 'test@test.com', reason: 'For testing', approved: true, rejected: false}
		];
		const apiKeyRequests = {
			findOne: async (data) => {
				let returnRequest = {};
				apiKeyRequestList.forEach(request => {
					if (request.id === data.where.id) returnRequest = request;
				});
				return Promise.resolve(returnRequest);
			},
			update: async (data, where) => {
				apiKeyRequestList.forEach(request => {
					if (request.id === where.where.id) {
						request.rejected = data.rejected;
						request.approved = data.approved;
					}
				});
				return Promise.resolve();
			}
		};

		const opts = {
			...constructorOptionsMock,
			apiKeys,
			apiKeyRequests
		};

		const target = new ExternalAPIController(opts);

		let resCode;
		const res = {
			...resMock,
			sendStatus: (code) => {
				resCode = code;
				return code;
			}
		};

		const req = {
			headers: {
				SSL_CLIENT_S_DN_CN: 'john'
			},
			body: {
				id: 0
			},
			get(key) {
				return this.headers[key];
			}
		};

		it('should revoke the request', (done) => {
			target.revokeAPIKeyRequest(req, res).then(() => {
				assert.deepStrictEqual(resCode, 200);
				assert.deepStrictEqual(apiKeyList, [{active: 'true', apiKey: 'aklfjdkh', id: 0, username: 'test'}]);
				assert.deepStrictEqual(apiKeyRequestList, [{approved: false, email: 'test@test.com', id: 0, name: 'Test Test', reason: 'For testing', rejected: true, username: 'test'}]);
				done();
			});
		});
	});

	describe('#createAPIKeyRequest()', () => {

		const apiKeys = {
			create: async (data) => {
				return data;
			}
		};

		const apiKeyRequest = [];
		const apiKeyRequests = {
			create: async (data) => {
				let duplicateFound = false;
				apiKeyRequest.forEach(keyRequest => {
					if (data.username === keyRequest.username) duplicateFound = true;
				});

				if (duplicateFound) {
					throw new Error('Duplicate found');
				} else {
					apiKeyRequest.push(data);
					return Promise.resolve(data);
				}
			}
		};

		const opts = {
			...constructorOptionsMock,
			apiKeys,
			apiKeyRequests
		};

		const target = new ExternalAPIController(opts);

		let resData;
		let resCode;
		const res = {
			...resMock,
			send: (data) => {
				resData = data;
				return data;
			},
			sendStatus: (code) => {
				resCode = code;
				return code;
			}
		};

		const req = {
			headers: {
				SSL_CLIENT_S_DN_CN: 'john'
			},
			body: {
				name: 'Test',
				email: 'Test',
				reason: 'Test'
			},
			get(key) {
				return this.headers[key];
			}
		};

		it('should successfully create an api request', (done) => {
			target.createAPIKeyRequest(req, res).then(() => {
				assert.strictEqual(resCode, 200);
				done();
			});
		});

		it('should not create an api request as one already exists', (done) => {
			target.createAPIKeyRequest(req, res).then(() => {
				assert.deepStrictEqual(resData, {status: 'request already exists'});
				done();
			});
		});
	});

	describe('#getAPIKey()', () => {

		const apiKeyList = [
			{id: 0, apiKey: 'aklfjdkh', username: 'john', active: 'true'},
			{id: 1, apiKey: 'sfskalsf', username: 'john', active: 'false'},
			{id: 2, apiKey: 'dsklfsdf', username: 'cliff', active: 'false'},
		];

		const apiKeys = {
			findOne: async (data) => {
				let userKey = {};
				apiKeyList.forEach(key => {
					if (key.username === data.where.username && key.active === 'true') userKey = key;
				});
				return Promise.resolve(userKey);
			},
		}

		const opts = {
			...constructorOptionsMock,
			apiKeys,
		};

		const target = new ExternalAPIController(opts);

		it('should return API key if user exists and active is true', async () => {
			const testUser = 'john';
			const expectedKey = await target.getAPIKey(testUser);
			assert.equal(expectedKey, 'aklfjdkh');
		});

		it('should return an empty string if user does not exist', async () => {
			const testUser = 'test';
			const expectedKey = await target.getAPIKey(testUser);
			assert.equal(expectedKey, '');
		});

		it('should return an empty string if user exists but active is false', async () => {
			const testUser = 'cliff';
			const expectedKey = await target.getAPIKey(testUser);
			assert.equal(expectedKey, '');
		})
	})

	describe('sendApprovalEmail()', () => {

		const target = new ExternalAPIController(constructorOptionsMock);

		const request = {id:0, name:'john', email:'test@test', username:'john', reason: 'testing', approved:'true', rejected:'false'}
		const apiKey = 'sjkdfasf';
		
		it("Should not throw", async () => {
			await expect(target.sendApprovalEmail(request,apiKey)).resolves.not.toThrow();
		  });

	})

});
