const LOGGER = require('../lib/logger');
const constantsFile = require('../config/constants');
const SearchUtility = require('../utils/searchUtility');
const { ExportHistoryController } = require('./exportHistoryController');
const GC_HISTORY = require('../models').gc_history;
const FAVORITE_SEARCH = require('../models').favorite_searches;
const GC_SEARCH_URLS = require('../models').gc_search_urls;
const APP_SETTINGS = require('../models').app_settings;
const { MLApiClient } = require('../lib/mlApiClient');
const {Thesaurus} = require('../lib/thesaurus');
const asyncRedisLib = require('async-redis');
const sparkMD5Lib = require('spark-md5');
const _ = require('lodash');
const { DataLibrary} = require('../lib/dataLibrary');
const { Reports } = require('../lib/reports');
const { DataTrackerController } = require('../controllers/dataTrackerController');
const { getTenDigitUserId } = require('../utils/userUtility');

const redisAsyncClientDB = 7;
const abbreviationRedisAsyncClientDB = 9;
const separatedRedisAsyncClientDB = 4;

const TRANSFORM_ERRORED = 'TRANSFORM_ERRORED';

class SearchController {

	constructor(opts = {}) {
		const {
			constants = constantsFile,
			logger = LOGGER,
			searchUtility = new SearchUtility(opts),
			gcHistory = GC_HISTORY,
			mlApi = new MLApiClient(opts),
			thesaurus = new Thesaurus(opts),
			async_redis,
			favoriteSearch = FAVORITE_SEARCH,
			sparkMD5 = sparkMD5Lib,
			dataApi = new DataLibrary(opts),
			exportHistoryController = new ExportHistoryController(opts),
			reports = new Reports(opts),
			gcSearchURLs = GC_SEARCH_URLS,
			appSettings = APP_SETTINGS,
			dataTracker = new DataTrackerController(opts)
		} = opts;

		this.logger = logger;
		this.searchUtility = searchUtility;
		this.gcHistory = gcHistory;
		this.mlApi = mlApi;
		this.thesaurus = thesaurus;
		this.favoriteSearch = favoriteSearch;
		this.sparkMD5 = sparkMD5;
		this.constants = constants;
		this.dataApi = dataApi;
		this.exportHistory = exportHistoryController;
		this.reports = reports;
		this.gcSearchURLs = gcSearchURLs;
		this.dataTracker = dataTracker;
		this.appSettings = appSettings;

		if (!async_redis){
			this.redisAsyncClient = asyncRedisLib.createClient(process.env.REDIS_URL || 'redis://localhost');
			this.separatedRedisAsyncClient = asyncRedisLib.createClient(process.env.REDIS_URL || 'redis://localhost');
		} else {
			this.redisAsyncClient = async_redis.createClient(process.env.REDIS_URL || 'redis://localhost');
			this.separatedRedisAsyncClient = async_redis.createClient(process.env.REDIS_URL || 'redis://localhost');
		}

		this.redisAsyncClient.select(redisAsyncClientDB);
		this.separatedRedisAsyncClient.select(separatedRedisAsyncClientDB);

		this.genericDocumentSearch = this.genericDocumentSearch.bind(this);
		this.documentSearchPOST = this.documentSearchPOST.bind(this);
		this.documentSearchHelper = this.documentSearchHelper.bind(this);
		this.documentSearchDownload = this.documentSearchDownload.bind(this);
		this.storeRecordOfSearchInPg = this.storeRecordOfSearchInPg.bind(this);
		this.transformDocumentSearchResults = this.transformDocumentSearchResults.bind(this);
		this.convertTinyURL = this.convertTinyURL.bind(this);
		this.shortenSearchURL = this.shortenSearchURL.bind(this);
		this.getElasticSearchIndex = this.getElasticSearchIndex.bind(this);
		this.setElasticSearchIndex = this.setElasticSearchIndex.bind(this);
		this.documentSearchOneID = this.documentSearchOneID.bind(this);
		this.combinedSearch = this.combinedSearch.bind(this);
		this.queryEs = this.queryEs.bind(this);
		this.getWikiQuery = this.getWikiQuery.bind(this);
	}

	async genericDocumentSearch(req, res) {
		let userId = 'webapp_unknown';
		const historyRec = {
			user_id: userId,
			searchText: '',
			startTime: new Date().toISOString(),
			numResults: -1,
			endTime: null,
			hadError: false,
			isSemanticSearch: false,
			tiny_url: '',
			cachedResult: false
		};

		try {
			const { searchText, cloneData = {}, orgFilter = 'Department of Defense_Joint Chiefs of Staff_Intelligence Community_United States Code', tiny_url } = req.body;
			userId = req.get('SSL_CLIENT_S_DN_CN');
			historyRec.user_id = userId;
			historyRec.userId = userId;
			historyRec.searchText = searchText;
			historyRec.orgFilters = JSON.stringify(orgFilter);
			historyRec.tiny_url = tiny_url;
			let esIndex = cloneData.clone_data.project_name;

			// get results
			let searchResults = {totalCount: 0, docs: []};
			try {
				const permissions = req.permissions ? req.permissions : [];
				const { offset = 0, limit = 20 } = req.body;
				const [parsedQuery, searchTerms] = this.searchUtility.getEsSearchTerms(req.body);
				req.body.searchTerms = searchTerms;
				req.body.parsedQuery = parsedQuery;
				const { clone_data = {} } = cloneData;
				const { auxSearchFields = [], auxRetrieveFields = [], auxIndex } = clone_data;

				let esQuery = {
					from: offset,
					size: limit,
					query: {
						query_string: {
							query: searchText
						}
					}
				};

				if (auxSearchFields.length > 0 && !(auxSearchFields.length === 1 && auxSearchFields[0] === '')) {
					esQuery = {
						from: offset,
						size: limit,
						aggregations: {
							doc_type_aggs: {
								terms: {
									field: 'doc_type',
									size: 10000
								}
							}
						},
						query: {
							multi_match: {
								query: searchText,
								fields: []
							}
						}
					};
					esQuery.query.multi_match.fields = auxSearchFields.map((field) => field.toLowerCase());
					esQuery.stored_fields = auxRetrieveFields.map((field) => field.toLowerCase());

				}

				let esClientName = 'gamechanger';

				// temp for when cloning is changed
				if (cloneData && cloneData.clone_data.project_name.toLowerCase() === 'hermes') {
					esQuery.highlight = {
						fragment_size: 200,
						fields: {
							Subject: {},
							Body: {},
							originator: {},
							receiver: {}
						}
					};
				}

				switch (cloneData.clone_data.esCluster) {
					case 'eda':
						if (permissions.includes('View EDA') || permissions.includes('Webapp Super Admin')){
							esClientName = 'eda';
						} else {
							throw 'Unauthorized';
						}
						break;
					default:
						esClientName = 'gamechanger';
				}

				if (req.body.index) {
					esIndex = req.body.index;
				}
				

				const esResults = await this.dataApi.queryElasticSearch(esClientName, esIndex, esQuery, userId);
				const { body = {} } = esResults;
				const { hits: esHits = {} } = body;
				const { hits = [], total: { value } } = esHits;

				searchResults.totalCount = value;

				hits.forEach((hit) => {
					let result = {};
					for (let key in hit.fields) {
						result[key] = hit.fields[key][0];
					}
					for (let key in hit._source) {
						result[key] = hit._source[key];
					}
					result.esIndex = auxIndex;
					result.is_aux_gc_result = true;
					result.highlight = hit.highlight;
					searchResults.docs.push(result);
				});
			} catch (e) {
				const { message } = e;
				this.logger.error(message, 'BFCEE5U', userId);
				return res.status(message === 'Unauthorized' ? 401 : 500).send(message);
			}

			return res.send(searchResults);

		} catch (err) {
			const { message } = err;
			this.logger.error(message, 'IUUROJE', userId);
			historyRec.endTime = new Date().toISOString();
			historyRec.hadError = true;
			res.status(message === 'Unauthorized' ? 401 : 500).send(message);
		}
	}

	async documentSearchPOST(req, res) {
		let userId = 'webapp_unknown';
		try {
			userId = req.get('SSL_CLIENT_S_DN_CN');
			let result = await this.documentSearchHelper(req, userId);
			res.status(200).send(result);
		} catch (err) {
			const { message } = err;
			this.logger.error(message, 'NBBROJE', userId);
			res.status(message === 'Unauthorized' ? 401 : 500).send(message);
		}
	}

	async documentSearchHelper(req, userId) {
		const historyRec = {
			user_id: userId,
			clone_name: undefined,
			search: '',
			startTime: new Date().toISOString(),
			numResults: -1,
			endTime: null,
			hadError: false,
			tiny_url: '',
			cachedResult: false,
			search_version: 1,
			request_body: {},
		};

		const {
			searchText,
			searchType,
			searchVersion,
			cloneData = {},
			offset,
			orgFilter = 'Department of Defense_Joint Chiefs of Staff_Intelligence Community_United States Code',
			typeFilter,
			useGCCache,
			showTutorial = false,
			tiny_url,
			forCacheReload = false,
			searchFields = {},
			includeRevoked = false
		} = req.body;

		const { clone_name } = cloneData;

		try {
			historyRec.search = searchText;
			historyRec.searchText = searchText;
			historyRec.orgFilters = JSON.stringify(orgFilter);
			historyRec.tiny_url = tiny_url;
			historyRec.clone_name = clone_name;
			historyRec.searchType = searchType;
			historyRec.search_version = searchVersion;
			historyRec.request_body = req.body;
			let index = cloneData.clone_data.project_name ? cloneData.clone_data.project_name : (req.body.index ? req.body.index : this.constants.GAME_CHANGER_OPTS.index);

			if (cloneData && cloneData.clone_data) {
				if (cloneData.clone_data.gcIndex) {
					index = cloneData.clone_data.gcIndex;
				} else if (cloneData.clone_data.project_name) {
					index = cloneData.clone_data.project_name;
				}
			}
			const permissions = req.permissions ? req.permissions : [];
			const operator = 'and';

			// ## try to get cached results
			const options = { searchType, searchText, orgFilter, clone_name, searchFields: Object.values(searchFields), index, includeRevoked };
			const redisKey = this.searchUtility.createCacheKeyFromOptions(options);
			const separatedClones = ['EDA', 'eda'];

			const redisDB = separatedClones.includes(clone_name) ? this.separatedRedisAsyncClient : this.redisAsyncClient;

			let clientObj = this.getESClient(cloneData, permissions, index);

			// log query to ES
			this.storeEsRecord(clientObj.esClientName, offset, clone_name, userId, searchText);

			if (!forCacheReload && useGCCache && offset === 0) {
				try {
					// check cache for search (first page only)
					const cachedResults = JSON.parse(await redisDB.get(redisKey));
					const timestamp = await redisDB.get(redisKey + ':time');
					const timeDiffHours = Math.floor((new Date().getTime() - timestamp) / (1000 * 60 * 60));
					if (cachedResults) {
						const { totalCount } = cachedResults;
						historyRec.endTime = new Date().toISOString();
						historyRec.numResults = totalCount;
						historyRec.cachedResult = true;
						await this.storeRecordOfSearchInPg(historyRec, cloneData, showTutorial);
						return { ...cachedResults, isCached: true, timeSinceCache: timeDiffHours };
					}

				} catch (e) {
					// don't reject if cache errors just log
					this.logger.error(e.message, 'UA0YFKY', userId);
				}
			}
			// try to get search expansion
			const [parsedQuery, termsArray] = this.searchUtility.getEsSearchTerms({searchText});
			let expansionDict = {};
			try {
				expansionDict = await this.mlApi.getExpandedSearchTerms(termsArray, userId);
			} catch (e) {
				// log error and move on, expansions are not required
				if (forCacheReload){
					throw Error('Cannot get expanded search terms in cache reload');
				}
				this.logger.error('Cannot get expanded search terms, continuing with search', '93SQB38', userId);
			}

			let lookUpTerm = searchText.replace(/\"/g, '');
			let useText = true;
			if (termsArray && termsArray.length && termsArray[0]) {
				useText = false;
				lookUpTerm = termsArray[0].replace(/\"/g, '');
			}
			const synonyms = this.thesaurus.lookUp(lookUpTerm);
			let text = searchText;
			if (!useText && termsArray && termsArray.length && termsArray[0]) {
				text = termsArray[0];
			}

			// get expanded abbreviations
			await this.redisAsyncClient.select(abbreviationRedisAsyncClientDB);
			let abbreviationExpansions = [];
			let i = 0;
			for (i = 0; i < termsArray.length; i++) {
				let term = termsArray[i];
				let upperTerm = term.toUpperCase().replace(/['"]+/g, '');
				let expandedTerm = await this.redisAsyncClient.get(upperTerm);
				let lowerTerm = term.toLowerCase().replace(/['"]+/g, '');
				let compressedTerm = await this.redisAsyncClient.get(lowerTerm);
				if (expandedTerm) {
					if (!abbreviationExpansions.includes('"' + expandedTerm.toLowerCase() + '"')) {
						abbreviationExpansions.push('"' + expandedTerm.toLowerCase() + '"');
					}
				}
				if (compressedTerm) {
					if (!abbreviationExpansions.includes('"' + compressedTerm.toLowerCase() + '"')) {
						abbreviationExpansions.push('"' + compressedTerm.toLowerCase() + '"');
					}
				}
			}

			// removing abbreviations of expanded terms (so if someone has "dod" AND "department of defense" in the search, it won't show either in expanded terms)
			let cleanedAbbreviations = [];
			abbreviationExpansions.forEach(abb => {
				let cleaned = abb.toLowerCase().replace(/['"]+/g, '');
				let found = false;
				termsArray.forEach((term) => {
					if (term.toLowerCase().replace(/['"]+/g, '') === cleaned) {
						found = true;
					}
				});
				if (!found) {
					cleanedAbbreviations.push(abb);
				}
			});

			// this.logger.info(cleanedAbbreviations);

			expansionDict = this.searchUtility.combineExpansionTerms(expansionDict, synonyms, text, cleanedAbbreviations, userId);
			// this.logger.info('exp: ' + expansionDict);
			await this.redisAsyncClient.select(redisAsyncClientDB);

			let searchResults;
			// combined search: run if not clone + flag enabled
			const noFilters = _.isEqual(searchFields, { initial: { field: null, input: '' } });
			const noSourceSpecified = _.isEqual({}, orgFilter);
			const noTypeSpecified = _.isEqual({}, typeFilter);
			const noPubDateSpecified = req.body.publicationDateAllTime;
			let combinedSearch = await this.appSettings.findOrCreate({where: { key: 'combined_search'}, defaults: {value: 'true'} });
			if (combinedSearch.length > 0){
				combinedSearch = combinedSearch[0].dataValues.value === 'true';
			}

			if (combinedSearch && !isClone && noFilters && noSourceSpecified && noTypeSpecified && noPubDateSpecified){
				try {
					searchResults = await this.combinedSearch(searchText, userId, req, expansionDict, index, operator, offset);
				} catch (e) {
					if (forCacheReload) {
						throw Error('Cannot transform document search terms in cache reload');
					}
					this.logger.error(`Error sentence transforming document search results ${e.message}`, '5WQ8YXU', userId);

					const { message } = e;
					this.logger.error(message, 'A8C13N1', userId);
					throw e;
				}
			} else {
				searchResults = await this.documentSearch(req, {...req.body, expansionDict, index, operator}, userId);
			}


			let wikiResults;
			searchResults.wikiResults = {question: '', answers: []};
			if (permissions.includes('Gamechanger Admin') || permissions.includes('Webapp Super Admin')){
				// check if search is a question
				let intelligentQuestions = await this.appSettings.findOrCreate({where: { key: 'intelligent_answers'}, defaults: {value: 'true'} });
				if (intelligentQuestions.length > 0){
					intelligentQuestions = intelligentQuestions[0].dataValues.value === 'true';
				}
				const questionWords = ['who', 'what', 'where', 'when', 'how', 'why', 'can', 'may', 'will', 'won\'t', 'does', 'doesn\'t'];
				const searchTextList = searchText.trim().split(/\s|\b/);
				const isQuestion = questionWords.find(item => item === searchTextList[0]) !== undefined || searchTextList[searchTextList.length - 1] === '?';

				if (intelligentQuestions && isQuestion){
					wikiResults = await this.getWikiQuery(searchText);
					const wikiTextList = wikiResults.map(item => item._source.text);
					if (wikiTextList.length > 0){
						const shortenedResults = await this.mlApi.getIntelAnswer(searchText, wikiTextList, userId);
						searchResults.wikiResults = shortenedResults;
					}
				}
			}

			// insert crawler dates into search results
			searchResults = await this.dataTracker.crawlerDateHelper(searchResults, userId);


			// try to store to cache
			if (useGCCache && searchResults && redisKey) {
				try {
					const timestamp = new Date().getTime();
					this.logger.info(`Storing new keyword cache entry: ${redisKey}`);
					await redisDB.set(redisKey, JSON.stringify(searchResults));
					await redisDB.set(redisKey + ':time', timestamp);
					historyRec.cachedResult = false;
				} catch (e) {
					if (forCacheReload) {
						throw Error('Storing to cache failed in cache reload');
					}
					this.logger.error(e.message, 'WVVCLPX', userId);
				}
			}

			// try storing results record
			if (!forCacheReload) {
				try {
					const { totalCount } = searchResults;
					historyRec.endTime = new Date().toISOString();
					historyRec.numResults = totalCount;
					await this.storeRecordOfSearchInPg(historyRec, cloneData, showTutorial);
				} catch (e) {
					this.logger.error(e.message, 'MPK1GGN', userId);
				}
			} else {

				try {

					// if doing a cache reload, check favorite search stats
					const hashed_user = this.sparkMD5.hash(userId);

					// check if this search is a favorite
					const favoriteSearch = await this.favoriteSearch.findOne({
						where: {
							user_id: hashed_user,
							tiny_url: tiny_url
						}
					});

					if (favoriteSearch !== null) {

						let updated = false;
						let count = favoriteSearch.document_count;

						// favorite search is updated
						if (searchResults.totalCount > favoriteSearch.document_count) {
							updated = true;
							count = searchResults.totalCount;
						}

						// update the favorite search info
						this.favoriteSearch.update({
							run_by_cache: true,
							updated_results: updated,
							document_count: count
						}, {
							where: {
								id: favoriteSearch.id
							}
						});
					}

				} catch (err) {
					this.logger.error(err.message, 'K361YCJ', userId);
				}
			}

			return searchResults;

		} catch (err) {
			if (!forCacheReload){
				const { message } = err;
				this.logger.error(message, 'F7K52I8', userId);
				historyRec.endTime = new Date().toISOString();
				historyRec.hadError = true;
				await this.storeRecordOfSearchInPg(historyRec, cloneData, showTutorial);
			}
			throw err;
		}
	}

	async getWikiQuery(searchText, userId) {
		const esClientName = 'gamechanger';
		const esIndex = 'simple-wiki';
		const esQuery = this.searchUtility.getSearchWikiQuery(searchText);
		const esResults = await this.dataApi.queryElasticSearch(esClientName, esIndex, esQuery, userId);

		return esResults.body.hits.hits;
	}

	async combinedSearch(searchText, userId, req, expansionDict, index, operator, offset) {
		let filename;
		let sentenceResults = this.mlApi.getSentenceTransformerResults(searchText, userId);
		let searchResults = this.documentSearch(req, {...req.body, expansionDict, index, operator}, userId);
		const resultArray = await Promise.all([sentenceResults, searchResults]);
		sentenceResults = resultArray[0];
		searchResults = resultArray[1];

		if (sentenceResults[0] !== undefined && sentenceResults[0].score >= 0.95){
			filename = sentenceResults[0].id;
			searchResults.totalCount += 1;
		}
		const topSentenceFind = searchResults.docs.find((item) => item.id === filename);
		if (sentenceResults === TRANSFORM_ERRORED) {
			searchResults.transformFailed = true;
		} else if (topSentenceFind && offset === 0){	// if the +95% result exists within the documentSearch results, reorder them
			topSentenceFind.search_mode = 'Intelligent Search';
			searchResults.docs.unshift(topSentenceFind);
		} else if (offset === 0 && filename) { // if sentenceSearch is not found in the documentSearch results, and we're on the first page, find and add
			const sentenceSearchRes = await this.documentSearchOneID(req, {...req.body, id: filename}, userId);
			sentenceSearchRes.docs[0].search_mode = 'Intelligent Search';
			searchResults.docs.unshift(sentenceSearchRes.docs[0]);
		}
		return searchResults;
	}

	async documentSearch(req, body, userId) {
		try {
			const permissions = req.permissions ? req.permissions : [];
			const {
				getIdList,
				selectedDocuments,
				expansionDict = {},
				forGraphCache = false,
				cloneData = {},
				searchType,
				index = ''
			} = body;
			const [parsedQuery, searchTerms] = this.searchUtility.getEsSearchTerms(body);
			body.searchTerms = searchTerms;
			body.parsedQuery = parsedQuery;

			let esClientName = 'gamechanger';
			let esIndex = index;
			let esQuery = '';

			if (cloneData.clone_data) {
				switch (cloneData.clone_data.esCluster) {
					case 'eda':
						if (permissions.includes('View EDA') || permissions.includes('Webapp Super Admin')) {

							const {extSearchFields = [], extRetrieveFields = [] } = this.constants.EDA_ELASTIC_SEARCH_OPTS;

							body.extSearchFields = extSearchFields.map((field) => field.toLowerCase());
							body.extStoredFields = extRetrieveFields.map((field) => field.toLowerCase());
							esQuery = this.searchUtility.getElasticsearchPagesQuery(body, userId);

							esClientName = 'eda';
						} else {
							throw 'Unauthorized';
						}
						break;
					default:
						esClientName = 'gamechanger';
				}
			}

			if (esQuery === '') {
				if (forGraphCache) {
					esQuery = this.searchUtility.getElasticsearchQueryForGraphCache(body, userId);
				} else if (searchType === 'Simple') {
					esQuery = this.searchUtility.getSimpleSyntaxElasticsearchQuery(body, userId);
					esIndex = this.constants.GAME_CHANGER_OPTS.simpleIndex;
				} else {
					esQuery = this.searchUtility.getElasticsearchQuery(body, userId);
				}
			}

			const results = await this.dataApi.queryElasticSearch(esClientName, esIndex, esQuery, userId);
			if (results && results.body && results.body.hits && results.body.hits.total && results.body.hits.total.value && results.body.hits.total.value > 0) {

				if (getIdList) {
					return this.searchUtility.cleanUpIdEsResults(results, searchTerms, userId, expansionDict);
				}

				if (forGraphCache){
					return this.searchUtility.cleanUpIdEsResultsForGraphCache(results, userId);
				} else {
					return this.searchUtility.cleanUpEsResults(results, searchTerms, userId, selectedDocuments, expansionDict, esIndex, esQuery);
				}
			} else {
				this.logger.error('Error with Elasticsearch results', 'M91NVGW', userId);
				return { totalCount: 0, docs: [] };
			}
		} catch (e) {
			const { message } = e;
			this.logger.error(message, 'KCYH5Z5', userId);
			throw e;
		}
	}

	async documentSearchOneID(req, body, userId) {
		try {
			const permissions = req.permissions ? req.permissions : [];

			const { cloneData = {}, id = '', searchTerms = [], expansionDict = {}, limit = 20 } = body;

			const {index} = this.constants.EDA_ELASTIC_SEARCH_OPTS;
			const esQuery = this.searchUtility.getESQueryUsingOneID(id, userId, limit);

			let esClientName = 'gamechanger';
			let esIndex = 'gamechanger';

			const esResults = await this.dataApi.queryElasticSearch(esClientName, esIndex, esQuery, userId);
			if (esResults && esResults.body && esResults.body.hits && esResults.body.hits.total && esResults.body.hits.total.value && esResults.body.hits.total.value > 0) {
				return this.searchUtility.cleanUpEsResults(esResults, searchTerms, userId, null, expansionDict, esIndex, esQuery);
			} else {
				this.logger.error('Error with Elasticsearch results', 'RLNTXAR', userId);
				return { totalCount: 0, docs: [] };
			}

		} catch (err) {
			const msg = (err && err.message) ? `${err.message}` : `${err}`;
			this.logger.error(msg, 'U1EIAR2', userId);
			throw msg;
		}

	}

	async documentSearchUsingParaId(req, body, userId) {
		try {
			const permissions = req.permissions ? req.permissions : [];

			const { cloneData = {}, filenames = [], expansionDict = {} } = body;

			const [parsedQuery, searchTerms] = await this.searchUtility.getEsSearchTerms(body);
			body.searchTerms = searchTerms;
			body.parsedQuery = parsedQuery;
			body.paraIds = filenames;

			const {index} = this.constants.EDA_ELASTIC_SEARCH_OPTS;

			const esQuery = this.searchUtility.getElasticsearchQueryUsingParagraphId(body, userId);

			let clientObj = this.getESClient(cloneData, permissions, index);

			const esResults = await this.dataApi.queryElasticSearch(clientObj.esClientName, clientObj.esIndex, esQuery, userId);
			if (esResults && esResults.body && esResults.body.hits && esResults.body.hits.total && esResults.body.hits.total.value && esResults.body.hits.total.value > 0) {

				return this.searchUtility.cleanUpEsResults(esResults, searchTerms, userId, null, expansionDict, clientObj.esIndex, esQuery);

			} else {
				this.logger.error('Error with Elasticsearch results', 'JBVXMP6', userId);
				return { totalCount: 0, docs: [] };
			}

		} catch (err) {
			const msg = (err && err.message) ? `${err.message}` : `${err}`;
			this.logger.error(msg, 'A5TS6ST', userId);
			throw msg;
		}
	}

	async storeSearchES(historyRec) {
		const { user_id, searchText, startTime, endTime, hadError, numResults, searchType, cachedResult, orgFilters, tiny_url, request_body, search_version, clone_name } = historyRec;

	}
	
	async storeRecordOfSearchInPg(historyRec, cloneData = {}, showTutorial) {
		let userId = 'Unknown';
		try {
			const { user_id, searchText, startTime, endTime, hadError, numResults, searchType, cachedResult, orgFilters, tiny_url, request_body, search_version, clone_name } = historyRec;
			const hashed_user = this.sparkMD5.hash(user_id);
			const new_id = getTenDigitUserId(user_id);
			const new_hashed_user = new_id ? this.sparkMD5.hash(new_id) : null;

			if (user_id) userId = user_id;

			const obj = {
				user_id: hashed_user,
				new_user_id: new_hashed_user,
				search: searchText,
				run_at: startTime,
				completion_time: endTime,
				had_error: hadError,
				num_results: numResults,
				search_type: searchType,
				cached_result: cachedResult,
				org_filters: orgFilters,
				is_tutorial_search: showTutorial,
				tiny_url: tiny_url,
				clone_name,
				request_body,
				search_version
			};

			this.gcHistory.create(obj);

		} catch (err) {
			this.logger.error(err, 'UQ5B8CP', userId);
		}
	}

	async storeEsRecord(esClient, offset, clone_name, userId, searchText){
		try {
			// log search query to elasticsearch
			if (offset === 0){
				let clone_log = clone_name || 'policy';
				const searchLog = {
					user_id: this.sparkMD5.hash(userId),
					search_query: searchText,
					run_time: new Date().getTime(),
					clone_name: clone_log

				};
				let search_history_index = this.constants.GAME_CHANGER_OPTS.historyIndex;

				this.dataApi.putDocument(esClient, search_history_index, searchLog);
			}
		} catch (e) {
			this.logger.error(e.message, 'UA0YDAL');
		}
	}

	async transformDocumentSearchResults(docs, searchText, userId) {
		try {
			let flatHits = [];
			let rankedDocs = [];

			// removing the highlighting that comes from elasticsearch and adds pagenumber to the id
			docs.forEach(doc => {
				const updatedHits = doc.pageHits.map(hit => {
					return { id: `${doc.id}+${hit.pageNumber}`, text: hit.snippet.replace(/<em>(.*?)<\/em>/g, '$1')};
				});
				flatHits = flatHits.concat(updatedHits);
			});
			const transformedResults = await this.mlApi.transformResults(searchText, flatHits, userId);

			const aggregated = new Map();

			// highlights context and aggregates the flattened pageHits to their respective docIds
			transformedResults.answers.forEach(r => {
				const {text, answer, id} = r;
				const [docId, parNum] = id.split('+');
				const highlightedText = text.replace(answer, `<em>${answer}</em>`);
				if (!aggregated.get(docId)){
					aggregated.set(docId, [{pageNumber: parNum, snippet: highlightedText}]);
				} else {
					const arr = aggregated.get(docId);
					arr.push({pageNumber: parNum, snippet: highlightedText});
					aggregated.set(docId, arr);
				}
			});

			// pushes newly aggregated docs to an array in new ranked order
			for (let [docId, hits] of aggregated) {
				const d = docs.filter(doc => doc.id === docId);
				const updatedDoc = {...d[0], pageHits: hits};
				rankedDocs.push(updatedDoc);
			}

			return rankedDocs;
		} catch (err) {
			const { message } = err;
			this.logger.error(message, '3NF4CE8', userId);
			return TRANSFORM_ERRORED;
		}
	}

	async documentSearchDownload(req, res) {
		let userId = 'webapp_unknown';

		const handleErr = (err, code) => {
			this.logger.error(err.message, code, userId);
			res.status(500).send(err);
		};

		try {
			userId = req.get('SSL_CLIENT_S_DN_CN');

			const { searchText, index, format, historyId, cloneData = {}, limit = 20, searchFields = {}, orgFilter, typeFilter, operator, offset, ...rest } = req.body;
			// const data = { searchText, format, limit: downloadLimit, offset: 0, selectedDocuments, index, cloneData, ...rest };
			const permissions = req.permissions ? req.permissions : [];
			const { selectedDocuments = [], expansionDict = {} } = req.body;
			const [parsedQuery, searchTerms] = this.searchUtility.getEsSearchTerms(req.body);
			req.body.searchTerms = searchTerms;
			req.body.parsedQuery = parsedQuery;

			let searchResults;
			try {
				let clientObj = this.getESClient(cloneData, permissions, index);
				if(clientObj.esClientName === 'eda' ){

					// Using getESClient check to enable eda export. Verify whether permissible
					const {extSearchFields = [], extRetrieveFields = [] } = this.constants.EDA_ELASTIC_SEARCH_OPTS;

					req.body.extSearchFields = extSearchFields.map((field) => field.toLowerCase());
					req.body.extStoredFields = extRetrieveFields.map((field) => field.toLowerCase());
					const esQuery = this.searchUtility.getElasticsearchPagesQuery(req.body, userId);

					const results = await this.dataApi.queryElasticSearch(clientObj.esClientName, clientObj.esIndex, esQuery);

					if (results && results.body && results.body.hits && results.body.hits.total && results.body.hits.total.value && results.body.hits.total.value > 0) {
						searchResults = this.searchUtility.cleanUpEsResults(results, searchTerms, userId, selectedDocuments, expansionDict, clientObj.esIndex);
					} else {
						this.logger.error('Error with Elasticsearch download results', 'T5GRJ4Lzdf', userId);
						searchResults = { totalCount: 0, docs: [] };
					}
				} else {
					const noFilters = _.isEqual(searchFields, { initial: { field: null, input: '' } });
					const noSourceSpecified = _.isEqual({}, orgFilter);
					const noTypeSpecified = _.isEqual({}, typeFilter);
					const noPubDateSpecified = req.body.publicationDateAllTime;
					let combinedSearch = await this.appSettings.findAll({ attributes: ['value'], where: { key: 'combined_search'} });
					if (combinedSearch.length > 0){
						combinedSearch = combinedSearch[0].dataValues.value === 'true';
					}
					if (combinedSearch && noFilters && noSourceSpecified && noTypeSpecified && noPubDateSpecified){
						try {
							searchResults = await this.combinedSearch(searchText, userId, req, expansionDict, index, operator, offset);
						} catch (e) {
							this.logger.error(`Error sentence transforming document search results ${e.message}`, '57CSA5T', userId);

							const { message } = e;
							this.logger.error(message, 'FSFU29O', userId);
							throw e;
						}
					} else {
						searchResults = await this.documentSearch(req, {...req.body, expansionDict, index, operator: 'and'}, userId);
					}
				}
			} catch (e) {
				this.logger.error(`Error sentence transforming document search results ${e.message}`, '4ZPDBVT', userId);
				const { message } = e;
				this.logger.error(message, 'CSQDCW9', userId);
				throw e;
			}

			try {
				const { docs } = searchResults;
				if (historyId) {
					await this.exportHistory.updateExportHistoryDate(res, historyId, userId);
				} else {
					await this.exportHistory.storeExportHistory(res, req.body, {
						totalCount: docs.length,
						searchTerms
					}, userId);
				}

				if (format === 'pdf') {
					const sendDataCallback = (buffer) => {
						const pdfBase64String = buffer.toString('base64');
						res.contentType('application/pdf');
						res.status(200);
						res.send(pdfBase64String);
					};
					rest.index = index;
					rest.orgFilter = orgFilter;
					this.reports.createPdfBuffer(searchResults, userId, rest, sendDataCallback);
				} else if (format === 'csv') {
					const csvStream = this.reports.createCsvStream(searchResults, userId);
					res.status(200);
					csvStream.pipe(res);
				} else {
					res.end(JSON.stringify(searchResults));
					res.status(200);
				}
			} catch (err) {
				handleErr(err, 'BKCR4JE');
			}

		} catch (err) {
			handleErr(err, 'SLVY51Y');
		}
	}

	async convertTinyURL(req, res) {
		const userId = req.get('SSL_CLIENT_S_DN_CN');
		const { url } = req.body;

		try {
			const tinyUrl = await this.convertTiny(url);

			if (tinyUrl && tinyUrl.url) {
				res.status(200).send({url: tinyUrl.url});
			} else {
				res.status(200).send({url: null});
			}
		} catch (err) {
			this.logger.error(err.message, 'X3R6DI5', userId);
			res.status(500).send(err);
		}
	}

	async convertTiny(url) {
		const id = parseInt(url, 10);
		if (isNaN(id)) {
			return null;
		}
		const tinyUrl = await this.gcSearchURLs.findOne({
			where: {
				id
			},
			raw: true
		});

		return tinyUrl;
	}

	async shortenSearchURL(req, res) {
		let userId = 'webapp_unknown';
		try {
			const { url } = req.body;
			userId = req.get('SSL_CLIENT_S_DN_CN');
			const [tiny] = await this.gcSearchURLs.findOrCreate(
				{
					where: { url: url },
					defaults: {
						url: url,
					},
					raw: true
				}
			);

			const tinyURL = tiny ? tiny.id : '';

			res.status(200).send({tinyURL});

		} catch (err) {
			this.logger.error(err.message, '8NA29ET', userId);
			res.status(500).send(err);
		}
	}

	async getElasticSearchIndex(req, res) {
		let userId = 'webapp_unknown';

		try {
			userId = req.get('SSL_CLIENT_S_DN_CN');
			const index = await this.redisAsyncClient.get('esIndex');
			res.status(200).send(index);
		} catch (err) {
			this.logger.error(err.message, 'US6Q4ON', userId);
			res.status(500).send(err);
		}
	}

	async queryEs(req, res) {
		let userId = 'webapp_unknown';
		try {
			userId = req.get('SSL_CLIENT_S_DN_CN');
			const {query, esClient} = req.body;
			let safeEsClient = esClient;
			let index = this.constants.GAME_CHANGER_OPTS.index;
			if (req.permissions.includes('View EDA') || req.permissions.includes('Webapp Super Admin')) {
				safeEsClient = esClient;
				if (safeEsClient === 'eda') {
					index = this.constants.EDA_ELASTIC_SEARCH_OPTS.index;
				}
			} else {
				safeEsClient = 'gamechanger';
			}
			console.log(`Querying ${esClient} with index ${index}`);
			const esResults = await this.dataApi.queryElasticSearch(esClient, index, query, userId);
			res.status(200).send(esResults);
		} catch (err) {
			this.logger.error(err.message, 'XLG7Z0K', userId);
			res.status(500).send(err);
		}
	}

	async setElasticSearchIndex(req, res) {
		let userId = 'webapp_unknown';

		try {
			userId = req.get('SSL_CLIENT_S_DN_CN');
			const { index } = req.body;
			await this.redisAsyncClient.del('esIndex');
			await this.redisAsyncClient.set('esIndex', index);
			res.status(200).send('Set Elasticsearch Index');
		} catch (err) {
			this.logger.error(err.message, 'XLG7Z0K', userId);
			res.status(500).send(err);
		}
	}
	getESClient(cloneData, permissions, index) {
		let esClientName = 'gamechanger';
		let esIndex = 'gamechanger';
		switch (cloneData.clone_name) {
			case 'eda':
				if (permissions.includes('View EDA') || permissions.includes('Webapp Super Admin')){
					esClientName = 'eda';
					esIndex = this.constants.EDA_ELASTIC_SEARCH_OPTS.index;
					return { esClientName, esIndex };
				} else {
					throw 'Unauthorized';
				}
			default:
				esClientName = 'gamechanger';
		}

		if (index) {
			esIndex = index;
		} else if (this.constants.GAME_CHANGER_OPTS.index) {
			esIndex = this.constants.GAME_CHANGER_OPTS.index;
		}

		return { esClientName, esIndex };
	}

	async documentSearchHelperOld(req, userId) {
		const historyRec = {
			user_id: userId,
			clone_name: undefined,
			search: '',
			startTime: new Date().toISOString(),
			numResults: -1,
			endTime: null,
			hadError: false,
			tiny_url: '',
			cachedResult: false,
			search_version: 1,
			request_body: {},
		};

		const {
			searchText,
			searchType,
			searchVersion,
			isClone = false,
			cloneData = {},
			offset,
			orgFilter = 'Department of Defense_Joint Chiefs of Staff_Intelligence Community_United States Code',
			useGCCache,
			showTutorial = false,
			tiny_url,
			forCacheReload = false,
			searchFields = {},
			includeRevoked = false
		} = req.body;

		const { clone_name } = cloneData;

		try {
			historyRec.search = searchText;
			historyRec.searchText = searchText;
			historyRec.orgFilters = JSON.stringify(orgFilter);
			historyRec.tiny_url = tiny_url;
			historyRec.clone_name = clone_name;
			historyRec.searchType = searchType;
			historyRec.search_version = searchVersion;
			historyRec.request_body = req.body;
			let index = isClone ? cloneData.clone_data.project_name : (req.body.index ? req.body.index : this.constants.GAME_CHANGER_OPTS.index);

			if (isClone && cloneData && cloneData.clone_data) {
				if (cloneData.clone_data.gcIndex) {
					index = cloneData.clone_data.gcIndex;
				} else if (cloneData.clone_data.project_name) {
					index = cloneData.clone_data.project_name;
				}
			}

			const operator = 'and';

			// ## try to get cached results
			const options = { searchType, searchText, orgFilter, clone_name, searchFields: Object.values(searchFields), index, includeRevoked };
			const redisKey = this.searchUtility.createCacheKeyFromOptions(options);
			const separatedClones = ['EDA', 'eda'];

			const redisDB = separatedClones.includes(clone_name) ? this.separatedRedisAsyncClient : this.redisAsyncClient;
			if (!forCacheReload && useGCCache && offset === 0) {
				try {
					// check cache for search (first page only)
					const cachedResults = JSON.parse(await redisDB.get(redisKey));
					const timestamp = await redisDB.get(redisKey + ':time');
					const timeDiffHours = Math.floor((new Date().getTime() - timestamp) / (1000 * 60 * 60));
					if (cachedResults) {
						const { totalCount } = cachedResults;
						historyRec.endTime = new Date().toISOString();
						historyRec.numResults = totalCount;
						historyRec.cachedResult = true;
						await this.storeRecordOfSearchInPg(historyRec, isClone, cloneData, showTutorial);
						return { ...cachedResults, isCached: true, timeSinceCache: timeDiffHours };
					}

				} catch (e) {
					// don't reject if cache errors just log
					this.logger.error(e.message, 'UA0YFKY', userId);
				}
			}

			// try to get search expansion
			const [parsedQuery, termsArray] = this.searchUtility.getEsSearchTerms({searchText});
			let expansionDict = {};
			try {
				expansionDict = await this.mlApi.getExpandedSearchTerms(termsArray, userId);
			} catch (e) {
				// log error and move on, expansions are not required
				if (forCacheReload){
					throw Error('Cannot get expanded search terms in cache reload');
				}
				this.logger.error('Cannot get expanded search terms, continuing with search', '93SQB38', userId);
			}

			let lookUpTerm = searchText.replace(/\"/g, '');
			let useText = true;
			if (termsArray && termsArray.length && termsArray[0]) {
				useText = false;
				lookUpTerm = termsArray[0].replace(/\"/g, '');
			}
			const synonyms = this.thesaurus.lookUp(lookUpTerm);
			let text = searchText;
			if (!useText && termsArray && termsArray.length && termsArray[0]) {
				text = termsArray[0];
			}

			// get expanded abbreviations
			await this.redisAsyncClient.select(abbreviationRedisAsyncClientDB);
			let abbreviationExpansions = [];
			let i = 0;
			for (i = 0; i < termsArray.length; i++) {
				let term = termsArray[i];
				let upperTerm = term.toUpperCase().replace(/['"]+/g, '');
				let expandedTerm = await this.redisAsyncClient.get(upperTerm);
				let lowerTerm = term.toLowerCase().replace(/['"]+/g, '');
				let compressedTerm = await this.redisAsyncClient.get(lowerTerm);
				if (expandedTerm) {
					if (!abbreviationExpansions.includes('"' + expandedTerm.toLowerCase() + '"')) {
						abbreviationExpansions.push('"' + expandedTerm.toLowerCase() + '"');
					}
				}
				if (compressedTerm) {
					if (!abbreviationExpansions.includes('"' + compressedTerm.toLowerCase() + '"')) {
						abbreviationExpansions.push('"' + compressedTerm.toLowerCase() + '"');
					}
				}
			}

			// removing abbreviations of expanded terms (so if someone has "dod" AND "department of defense" in the search, it won't show either in expanded terms)
			let cleanedAbbreviations = [];
			abbreviationExpansions.forEach(abb => {
				let cleaned = abb.toLowerCase().replace(/['"]+/g, '');
				let found = false;
				termsArray.forEach((term) => {
					if (term.toLowerCase().replace(/['"]+/g, '') === cleaned) {
						found = true;
					}
				});
				if (!found) {
					cleanedAbbreviations.push(abb);
				}
			});

			// this.logger.info(cleanedAbbreviations);

			expansionDict = this.searchUtility.combineExpansionTerms(expansionDict, synonyms, text, cleanedAbbreviations, userId);
			// this.logger.info('exp: ' + expansionDict);
			await this.redisAsyncClient.select(redisAsyncClientDB);

			let searchResults;
			if (searchType === 'Sentence'){

				try {
					const sentenceResults = await this.mlApi.getSentenceTransformerResults(searchText, userId);
					const filenames = sentenceResults.map(({ id }) => id);

					const docSearchRes = await this.documentSearchUsingParaId(req, {...req.body, expansionDict, index, filenames}, userId);

					if (sentenceResults === TRANSFORM_ERRORED) {
						searchResults.transformFailed = true;
					} else {
						searchResults = docSearchRes;
					}
				} catch (e) {
					if (forCacheReload) {
						throw Error('Cannot transform document search terms in cache reload');
					}
					this.logger.error(`Error sentence transforming document search results ${e.message}`, '7EYPXX7', userId);
				}


			} else {
				// get results
				try {
					searchResults = await this.documentSearch(req, {...req.body, expansionDict, index, operator}, userId);
				} catch (e) {
					const { message } = e;
					this.logger.error(message, 'U04K9H3', userId);
					throw e;
				}
			}

			// insert crawler dates into search results
			searchResults = await this.dataTracker.crawlerDateHelper(searchResults, userId);

			// use transformer on results
			if (searchType === 'Intelligent') {
				try {
					const { docs } = searchResults;
					const transformed = await this.transformDocumentSearchResults(docs, searchText, userId);
					if (transformed === TRANSFORM_ERRORED) {
						searchResults.transformFailed = true;
					} else {
						searchResults.docs = transformed;
					}
				} catch (e) {
					if (forCacheReload) {
						throw Error('Cannot transform document search terms in cache reload');
					}
					this.logger.error(`Error transforming document search results ${e.message}`, 'U64MDOA', userId);
				}
			}

			// try to store to cache
			if (useGCCache && searchResults && redisKey) {
				try {
					const timestamp = new Date().getTime();
					this.logger.info(`Storing new keyword cache entry: ${redisKey}`);
					await redisDB.set(redisKey, JSON.stringify(searchResults));
					await redisDB.set(redisKey + ':time', timestamp);
					historyRec.cachedResult = false;
				} catch (e) {
					if (forCacheReload) {
						throw Error('Storing to cache failed in cache reload');
					}

					this.logger.error(e.message, 'WVVCLPX', userId);
				}
			}

			// try storing results record
			if (!forCacheReload) {
				try {
					const { totalCount } = searchResults;
					historyRec.endTime = new Date().toISOString();
					historyRec.numResults = totalCount;
					await this.storeRecordOfSearchInPg(historyRec, isClone, cloneData, showTutorial);
				} catch (e) {
					this.logger.error(e.message, 'MPK1GGN', userId);
				}
			} else {

				try {

					// if doing a cache reload, check favorite search stats
					const hashed_user = this.sparkMD5.hash(userId);

					// check if this search is a favorite
					const favoriteSearch = await this.favoriteSearch.findOne({
						where: {
							user_id: hashed_user,
							tiny_url: tiny_url
						}
					});

					if (favoriteSearch !== null) {

						let updated = false;
						let count = favoriteSearch.document_count;

						// favorite search is updated
						if (searchResults.totalCount > favoriteSearch.document_count) {
							updated = true;
							count = searchResults.totalCount;
						}

						// update the favorite search info
						this.favoriteSearch.update({
							run_by_cache: true,
							updated_results: updated,
							document_count: count
						}, {
							where: {
								id: favoriteSearch.id
							}
						});
					}

				} catch (err) {
					this.logger.error(err.message, 'K361YCJ', userId);
				}
			}

			return searchResults;

		} catch (err) {
			if (!forCacheReload){
				const { message } = err;
				this.logger.error(message, 'NCCROJE', userId);
				historyRec.endTime = new Date().toISOString();
				historyRec.hadError = true;
				await this.storeRecordOfSearchInPg(historyRec, isClone, cloneData, showTutorial);
			}
			throw err;
		}
	}

}

module.exports.SearchController = SearchController;
