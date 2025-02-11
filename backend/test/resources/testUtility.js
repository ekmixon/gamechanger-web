const redisApi = {
	del(name) {

	},
	set(name, value) {

	},
	select(value){

	},
	get(name){

	}
};

class AsyncRedisMock {
	constructor() {
		this.store = {};
		this.db = -1;
	}

	select(dbNum) {
		this.db = dbNum;
		return Promise.resolve(`[MOCKED REDIS]- Selected ${dbNum}`);
	}

	get(key) {
		return Promise.resolve(this.store[key]);
	}

	set(key, value) {
		this.store[key] = value;
		return Promise.resolve();
	}

	flushdb() {
		return Promise.resolve();
	}
}


const constructorOptionsMock = {
	constants: {},
	axios: {},
	gcHistory: {},
	logger: {
		info: (data) => {
			// console.log('MOCKED LOGGER-[info]:', data);
		},
		error: (data, code) => {
			console.log(`MOCKED LOGGER-[error][${code}]:`, data);
		},
		metrics: (data) => {
			// console.log('MOCKED LOGGER-[metrics]:', data);
		}
	},
	fs: {},
	redis: redisApi,
	async_redis: {
		createClient(){
			return new AsyncRedisMock();
		},
		select() {},
		get() {}
	},
	sep_async_redis: {
		createClient(){
			return new AsyncRedisMock();
		},
		select() {},
		get() {}
	},
	emailUtility: {
		sendEmail(){

		}
	},
	mlApi: {
		getExpandedSearchTerms(){
			return Promise.resolve({});
		},
		transformResults(data){
			return Promise.resolve(data);
		}
	},
	dataApi: {}
};

const reqMock = {
	headers: {
		SSL_CLIENT_S_DN_CN: 'testsuite'
	},
	get(key) {
		return this.headers[key];
	}
};

const resMock = {
	status(msg){
		return this;
	},
	send(data){

	}
};

module.exports = { constructorOptionsMock, AsyncRedisMock, reqMock, resMock };
