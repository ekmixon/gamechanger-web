const constants = require('../config/constants');
const loggerLib = require('../lib/logger');
const axiosLib = require('axios');

const mlBaseUrl = constants.GAMECHANGER_ML_API_BASE_URL;
const transformerBaseUrl = constants.GAMECHANGER_ML_API_BASE_URL;

const MLRoutes = {
	'getCurrentTransformer':`${transformerBaseUrl}/getCurrentTransformer`,
	'getS3List':`${transformerBaseUrl}/s3?function=models`,
	'downloadDependencies':`${transformerBaseUrl}/getCurrentTransformer`,
	'getAPIInformation':`${transformerBaseUrl}/`,
	'getModelsList': `${transformerBaseUrl}/getModelsList`,

	'expandTerms':`${mlBaseUrl}/expandTerms`,
	'questionAnswer':`${mlBaseUrl}/questionAnswer`,
	'transSentenceSearch':`${transformerBaseUrl}/transSentenceSearch`,
	'transformResults':`${transformerBaseUrl}/transformerSearch`,
	'setTransformerModel':`${transformerBaseUrl}/updateModel`,
	'reloadModels':`${transformerBaseUrl}/reloadModels`,
	'downloadCorpus':`${transformerBaseUrl}/downloadCorpus`,
	'trainModel':`${transformerBaseUrl}/trainModel`,
	
}
/**
 * @class MLApiClient
 */
class MLApiClient {
	constructor(opts = {}) {
		const {
			logger = loggerLib,
			axios = axiosLib,
		} = opts;

		this.logger = logger;
		this.axios = axios;

		this.getExpandedSearchTerms = this.getExpandedSearchTerms.bind(this);
		this.transformResults = this.transformResults.bind(this);
		this.getSentenceTransformerResults = this.getSentenceTransformerResults.bind(this);
		
		
		// Get methods
		this.getModelsList = this.getData.bind(this, 'getModelsList');
		this.getAPIInformation = this.getData.bind(this, 'getAPIInformation');
		this.getS3List = this.getData.bind(this, 'getS3List');
		this.getCurrentTransformer = this.getData.bind(this, 'getCurrentTransformer');
		this.downloadDependencies = this.getData.bind(this, 'downloadDependencies');
		// Post methods
		this.setTransformerModel = this.postData.bind(this, 'setTransformerModel');
		this.downloadCorpus = this.postData.bind(this, 'downloadCorpus');
		this.trainModel = this.postData.bind(this, 'trainModel');
		this.reloadModels = this.postData.bind(this, 'reloadModels');
	}

	async getExpandedSearchTerms(termsList, userId = 'unknown') {
		const data = { termsList, docIdsOnly: true }
		return await this.postData('expandTerms', userId, data);
	}

	async getIntelAnswer(searchQuery, searchContext, userId = 'unknown') {
		const data = { query: searchQuery, search_context: searchContext }
		return await this.postData('questionAnswer', userId, data);
	}

	async getSentenceTransformerResults(searchText, userId = 'unknown') {
		const data = { text: searchText }
		return await this.postData('transSentenceSearch', userId, data);
	}

	async transformResults(searchText, docs, userId = 'unknown') {
		const data = { query: searchText, documents: docs}
		return await this.postData('transformResults', userId, data);
	}
	/**
	 * A generic get method to query the ML API. 
	 * @method getData
	 * @param {string} key - a string mapping to a ml route
	 * @param {string} userId - the id of the user
	 * @returns an object with the ml api response data
	 */
	async getData(key, userId) {
		const headers = {
			ssl_client_s_dn_cn: userId
		};
		try {
			const url = MLRoutes[key];
			const { data } = await this.axios({
				url,
				method: 'get',
				headers
			});
			return data;
		} catch (e) {
			this.logger.error(e, 'VY3FQBN', userId);
			throw e;
		}
	}
	/**
	 * A generic post method to update the ML API
	 * @method postData
	 * @param {string} key - a string mapping to a ml route
	 * @param {string} userId - the id of the user
	 * @param {Object} postData 
	 * @returns an object with the ml api response data
	 */
	async postData(key, userId, postData) {
		const headers = {
			ssl_client_s_dn_cn: userId
		};
		try {
			const url = MLRoutes[key];
			const { data } = await this.axios({
				url,
				method: 'post',
				headers,
				data: postData
			});
			return data;
		} catch (e) {
			this.logger.error(e, 'QWU3KOP', userId);
			throw e;
		}
	}
}

module.exports.MLApiClient = MLApiClient;
