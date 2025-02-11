const assert = require('assert');
const { FavoritesController } = require('../../node_app/controllers/favoritesController');
const { constructorOptionsMock, reqMock } = require('../resources/testUtility');

describe('FavoritesController', function () {
	describe('#checkFavoritedSearches', () => {

		const req = {
			headers: {
				SSL_CLIENT_S_DN_CN: 'john'
			},
			get(key) {
				return this.headers[key];
			}
		};

		const mockUser = [
			{
				user_id: 'abc'
			}
		];

		const gcUser = {
			findAll: async () => {
				return mockUser;
			}
		};

		it('should not update any favorite searches updated_results property since caching has already covered it', (done) => {

			const mockFavoriteSearches = [
				{
					run_by_cache: true
				}
			];

			let searchUpdated = 0;
			let run_by_cache = mockFavoriteSearches[0].run_by_cache;
			let document_count = 0;

			const favoriteSearch = {
				findAll: async () => {
					return mockFavoriteSearches;
				},
				update: async (data) => {
					if (data.updated_results) {
						searchUpdated += 1;
						document_count = data.document_count;
					}
					run_by_cache = false;
				}
			};


			let resData;
			const res = {
				status(msg){
					return this;
				},
				send: (data) => {
					resData = data;
					return data;
				}
			};

			const opts = {
				...constructorOptionsMock,
				gcUser,
				favoriteSearch
			};

			const target = new FavoritesController(opts);

			target.checkFavoritedSearches(req, res).then(() => {
				assert.equal(run_by_cache, false);
				assert.equal(document_count, 0);
				assert.equal(resData, 'checked favorited searches for new results');
				assert.equal(searchUpdated, 0);
				done();
			});
		});

		it('should not update any favorite searches updated_results since their document counts are not greater', (done) => {

			const mockFavoriteSearches = [
				{
					run_by_cache: false,
					document_count: 10
				}
			];

			let searchUpdated = 0;
			let run_by_cache = mockFavoriteSearches[0].run_by_cache;
			let document_count = 0;

			const favoriteSearch = {
				findAll: async () => {
					return mockFavoriteSearches;
				},
				update: async (data) => {
					if (data.updated_results) {
						searchUpdated += 1;
						document_count = data.document_count;
					}
					run_by_cache = false;
				}
			};


			const mockHistory = {
				dataValues: {
					request_body: {
						id: 1
					}
				}
			};

			const gcHistory = {
				findOne: async () => {
					return mockHistory;
				}
			};

			const opts = {
				...constructorOptionsMock,
				gcUser,
				favoriteSearch,
				gcHistory
			};

			const target = new FavoritesController(opts);

			const searchResultsMock = {
				totalCount: 10
			};

			target.documentSearchHelper = () => {
				return searchResultsMock;
			};

			let resData;
			const res = {
				status(msg){
					return this;
				},
				send: (data) => {
					resData = data;
					return data;
				}
			};


			target.checkFavoritedSearches(req, res).then(() => {
				assert.equal(run_by_cache, false);
				assert.equal(document_count, 0);
				assert.equal(resData, 'checked favorited searches for new results');
				assert.equal(searchUpdated, 0);
				done();
			});
		});

		it('should update some of the updated_results in favoriteSearch since some of them have greater counts and have not been run by cache creation', (done) => {
			const mockFavoriteSearches = [
				{
					run_by_cache: false,
					document_count: 10,
				}
			];

			let searchUpdated = 0;
			let run_by_cache = mockFavoriteSearches[0].run_by_cache;
			let document_count = 0;

			const favoriteSearch = {
				findAll: async () => {
					return mockFavoriteSearches;
				},
				update: async (data) => {
					if (data.updated_results) {
						searchUpdated += 1;
						document_count = data.document_count;
					}
					run_by_cache = false;
				}
			};

			const mockHistory = {
				request_body: {
					id: 1
				}
			};

			const gcHistory = {
				findOne: async () => {
					return mockHistory;
				}
			};

			const searchResultsMock = {
				totalCount: 20
			};

			const search = {
				documentSearchHelper: async () => {
					return Promise.resolve(searchResultsMock);
				}
			};

			const opts = {
				...constructorOptionsMock,
				gcUser,
				favoriteSearch,
				gcHistory,
				search
			};

			const target = new FavoritesController(opts);

			let resData;
			const res = {
				status(msg){
					return this;
				},
				send: (data) => {
					resData = data;
					return data;
				}
			};

			target.checkFavoritedSearches(req, res).then(() => {
				assert.equal(run_by_cache, false);
				assert.equal(document_count, searchResultsMock.totalCount);
				assert.equal(resData, 'checked favorited searches for new results');
				assert.equal(searchUpdated, 1);
				done();
			});
		});
	});

	describe('#favoriteTopicPOST', () => {
		it('should create a favorite topic', (done) => {
			const apiResMock = [{}, true];
			const expectedReturn = {};
			const statusMock = 200;
			const constants = {
				env: {
					GAME_CHANGER_OPTS: {
						version: 'version'
					}
				}
			};

			const favoriteTopic = {
				findOrCreate() {
					return Promise.resolve(apiResMock);
				}
			};

			const opts = {
				...constructorOptionsMock,
				constants,
				favoriteTopic
			};
			const target = new FavoritesController(opts);

			const req = {
				...reqMock,
				body: {
					is_favorite: true,
					topic: 'national security'
				}
			};

			let resMsg;
			let resCode;
			const res = {
				status(code) {
					resCode = code;
					return this;
				},
				send(msg) {
					resMsg = msg;
				}
			};

			try {
				target.favoriteTopicPOST(req, res).then(() => {
					assert.equal(resCode, statusMock);
					assert.deepEqual(resMsg, expectedReturn);
					done();
				});
			} catch (e) {
				assert.fail(e);
			}
		});
	});

	describe('#favoriteDocumentPOST', () => {
		it('should create a favorite document', (done) => {
			const apiResMock = [{}, true];
			const expectedReturn = {};
			const statusMock = 200;
			const constants = {
				env: {
					GAME_CHANGER_OPTS: {
						version: 'version'
					}
				}
			};

			const favoriteDocument = {
				findOrCreate() {
					return Promise.resolve(apiResMock);
				}
			};

			const opts = {
				...constructorOptionsMock,
				constants,
				favoriteDocument
			};
			const target = new FavoritesController(opts);

			const req = {
				...reqMock,
				body: {
					is_favorite: true,
					topic: 'national security'
				}
			};

			let resMsg;
			let resCode;
			const res = {
				status(code) {
					resCode = code;
					return this;
				},
				send(msg) {
					resMsg = msg;
				}
			};

			try {
				target.favoriteDocumentPOST(req, res).then(() => {
					assert.equal(resCode, statusMock);
					assert.deepEqual(resMsg, expectedReturn);
					done();
				});
			} catch (e) {
				assert.fail(e);
			}
		});
	});

	describe('#clearFavoriteSearchUpdate', () => {
		it('should clear a favorite search update flag', (done) => {
			const expectedReturn = [
				{
					user_id: '27d1ca9e10b731476b7641eae2710ac0',
					tiny_url: 'Test',
					updated_results: false
				}
			];
			const statusMock = 200;
			const constants = {
				env: {
					GAME_CHANGER_OPTS: {
						version: 'version'
					}
				}
			};

			const favorites = [
				{
					user_id: '27d1ca9e10b731476b7641eae2710ac0',
					tiny_url: 'Test',
					updated_results: true
				}
			];
			const favoriteSearch = {
				update(data, where) {
					favorites.forEach(favorite => {
						if (favorite.user_id === where.where.user_id && favorite.tiny_url === where.where.tiny_url) {
							favorite.updated_results = data.updated_results;
						}
					});
					return Promise.resolve(true);
				}
			};

			const opts = {
				...constructorOptionsMock,
				constants,
				favoriteSearch
			};
			const target = new FavoritesController(opts);

			const req = {
				...reqMock,
				body: {
					tinyurl: 'Test',
				}
			};

			let resMsg;
			let resCode;
			const res = {
				status(code) {
					resCode = code;
					return this;
				},
				send(msg) {
					resMsg = msg;
				}
			};

			try {
				target.clearFavoriteSearchUpdate(req, res).then(() => {
					assert.equal(resCode, statusMock);
					assert.deepEqual(favorites, expectedReturn);
					done();
				});
			} catch (e) {
				assert.fail(e);
			}
		});
	});
});
