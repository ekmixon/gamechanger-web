const LOGGER = require('../lib/logger');
const { DataLibrary } = require('../lib/dataLibrary');
const constantsFile = require('../config/constants');
const SearchUtility = require('../utils/searchUtility');

class TextSuggestionController {
	constructor(opts = {}) {
		const {
			logger = LOGGER,
			constants = constantsFile,
			dataApi = new DataLibrary(opts),
			searchUtility = new SearchUtility(opts),
		} = opts;

		this.logger = logger;
		this.constants = constants;
		this.dataApi = dataApi;
		this.searchUtility = searchUtility;

		// need to bind to have <this> in context
		this.getTextSuggestion = this.getTextSuggestion.bind(this);
		this.textSuggestData = this.textSuggestData.bind(this);
		this.getPresearchSuggestion = this.getPresearchSuggestion.bind(this);
	}

	async getTextSuggestion(req, res) {
		let userId = 'webapp_unknown';

		try {
			userId = req.get('SSL_CLIENT_S_DN_CN');

			const index = req.body.index ? req.body.index : this.constants.GAME_CHANGER_OPTS.index;
			// const data = await this.dataApi.getTextSuggestion({ ...req.body, index }, userId);

			const data = await this.textSuggestData({ ...req.body, index }, userId);

			let corrected;
			try {
				corrected = this.getSingleCorrected(data.suggest.suggester);
			} catch (err) {
				const { message } = err;
				this.logger.error(message, 'JBVZKTP', userId);
			}
			if (corrected.length > 0){
				req.body.searchText = corrected;
			}
			const data_presearch = await this.getPresearchSuggestion({ ...req.body, index }, userId);

			let presearchFile;
			try {
				presearchFile = this.getPreFileCorrected(data_presearch.responses[0].hits.hits);
			} catch (err) {
				const { message } = err;
				this.logger.error(message, 'M341BKC', userId);
			}

			let presearchTitle;
			try {
				presearchTitle = this.getPreTitleCorrected(data_presearch.responses[1].hits.hits);
			} catch (err) {
				const { message } = err;
				this.logger.error(message, 'JBVZKTF', userId);
			}

			let presearchHistory;
			try {
				presearchHistory = this.getPreHistoryCorrected(data_presearch.responses[2].aggregations.search_query.buckets);
			} catch (err) {
				const { message } = err;
				this.logger.error(message, 'JBVZKTG', userId);
			}
			// for future use
			// let predictions = [];
			let presearchEntity;
			try {
				presearchEntity = this.getPreEntityCorrected(data_presearch.responses[3].hits.hits);
			} catch (err) {
				const { message } = err;
				this.logger.error(message, 'JBVZKTF', userId);
			}
			return res.send({
				autocorrect: corrected ? [corrected] : [],
				presearchFile: presearchFile || [],
				presearchTitle: presearchTitle || [],
				presearchTopic: presearchEntity.presearchTopic || [],
				presearchOrg: presearchEntity.presearchOrg || [],
				predictions: presearchHistory || []
			});

		} catch (err) {
			const { message } = err;
			this.logger.error(message, 'GV34YUM', userId);

			res.status(500).send(message);
		}
	}

	async textSuggestData(body, userId) {
		try {
			const esQuery = this.searchUtility.getESSuggesterQuery(body);

			let esClientName = 'gamechanger';
			// let esIndex = 'gamechanger';
			

			const results = await this.dataApi.queryElasticSearch(esClientName, this.constants.GAME_CHANGER_OPTS.textSuggestIndex, esQuery, userId);
			return results.body;

		} catch (err) {
			const { message } = err;
			this.logger.error(message, 'VLPOXOV', userId);
			throw message;
		}
	}

	async getPresearchSuggestion(body, userId) {
		try {
			const esQueryArray = this.searchUtility.getESpresearchMultiQuery(body);
			let esClientName = 'gamechanger';
			let esIndex = 'gamechanger';

			const results = await this.dataApi.mulitqueryElasticSearch(esClientName, this.constants.GAME_CHANGER_OPTS.textSuggestIndex, esQueryArray, userId);
			return results.body;

		} catch (err) {
			const { message } = err;
			this.logger.error(message, 'EMOSMUW', userId);
			throw message;
		}
	}
	getPreHistoryCorrected(suggesterArray) {
		const presearch = [];
		// amount of users need to be more than 1 (max shown = 3 for efficiency)
		if (suggesterArray.length > 0) {
			suggesterArray.forEach(term => {
				let usercount = term.user.buckets
				if ((usercount.length > 1) && (usercount[0].doc_count > 2)) {
					presearch.push(term["key"]);
				}
			 });
		}
		// incase same
		let unique = [...new Set(presearch)];
		// only first two terms
		unique = unique.slice(0, 2);

		return unique;
	}
	getSingleCorrected(suggesterArray) {
		const corrected = [];
		let hasCorrection = false;
		suggesterArray.forEach(suggestion => {
			if (suggestion.options.length > 0 && suggestion.options[0].score >= 0.85) {
				corrected.push(suggestion.options[0].text);
				hasCorrection = true;
			} else {
				corrected.push(suggestion.text);
			}
		});

		if (!hasCorrection){
			return '';
		} else {
			return corrected.join(' ');
		}
	}

	getPreFileCorrected(suggesterArray) {
		const presearch = [];
		suggesterArray.forEach(suggestion => {
			presearch.push(suggestion['_source'].filename.substr(0, suggestion['_source'].filename.lastIndexOf('.')));
		}
		);
		return presearch;
	}

	getPreTitleCorrected(suggesterArray) {
		const presearch = [];
		suggesterArray.forEach(suggestion => {
			presearch.push(suggestion['_source'].title);
		}
		);
		return presearch;
	}


	getPreEntityCorrected(suggesterArray) {
		const presearchTopic = [];
		const presearchOrg = [];

		suggesterArray.forEach(suggestion => {
			if(suggestion['_source'].type && suggestion['_source'].type === 'topic'){ // if topic, add to topic list. 
				presearchTopic.push(suggestion['_source'].name);
			} else {
				presearchOrg.push(suggestion['_source'].name);
			}
		});
		return {presearchTopic, presearchOrg};
	}

}

module.exports.TextSuggestionController = TextSuggestionController;
