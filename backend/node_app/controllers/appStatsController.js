const mysql = require('mysql');
const LOGGER = require('../lib/logger');
const constantsFile = require('../config/constants');

/**
 * This class queries matomo for app stats and passes
 * them back to REST requests.
 * @class AppStatsController
 */
class AppStatsController {
	constructor(opts = {}) {
		const {
			mysql_lib = mysql,
			logger = LOGGER,
			constants = constantsFile
		} = opts;
		this.logger = logger;
		this.constants = constants;
		this.mysql = mysql_lib;
		this.getAppStats = this.getAppStats.bind(this);
		this.getSearchPdfMapping = this.getSearchPdfMapping.bind(this);
		this.getAvgSearchesPerSession = this.getAvgSearchesPerSession.bind(this);
		this.getTopSearches = this.getTopSearches.bind(this);
		this.getDateNDaysAgo = this.getDateNDaysAgo.bind(this);
	}
	/**
	 *
	 * @param {Number} daysAgo
	 * @returns
	 */
	getDateNDaysAgo(daysAgo) {
		const now = new Date();
		const last = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
		let day = last.getDate();
		day = ('0' + day).slice(-2);
		let month = last.getMonth() + 1;
		month = ('0' + month).slice(-2);
		let year = last.getFullYear();
		return `${year}-${month}-${day}`;
	}
	/**
	 *
	 * @param {Number} daysAgo
	 * @returns
	 */
	async getAvgSearchesPerSession(daysAgo = 3, connection) {
		return new Promise((resolve, reject) => {
			const startDate = this.getDateNDaysAgo(daysAgo);
			connection.query(`select SUM(search_count)/COUNT(search_count) as avg_search_count from (select distinct idvisit, 0 as search_count
				from matomo_log_link_visit_action where idaction_name in (select idaction from matomo_log_action where name = 'GamechangerPage') 
				and server_time > '${startDate}' and idvisit not in (select a.idvisit from matomo_log_link_visit_action a, matomo_log_action b, matomo_log_visit c 
					where a.idaction_name = b.idaction and a.idvisit = c.idvisit and a.search_cat like 'GAMECHANGER%' group by a.idvisit, c.user_id) 
					UNION select a.idvisit, count(a.search_cat) as search_count from matomo_log_link_visit_action a, matomo_log_action b, matomo_log_visit c 
					where a.idaction_name = b.idaction and a.idvisit = c.idvisit and c.visit_last_action_time > '${startDate}' and a.search_cat like 'GAMECHANGER%' 
					group by a.idvisit, c.user_id)x;`, (error, results, fields) => {
				if (error) {
					this.logger.error(error, '5LR23WU');
					throw error;
				}
				resolve(results[0].avg_search_count);
			});
		});
	}


	/**
	 *
	 * @param {Number} daysAgo
	 * @param {Number} topN
	 * @param {Boolean} isClone
	 * @returns
	 */
	async getTopSearches(cloneData = {}, daysAgo = 3, excluding = [], blacklist = [], topN = 10, connection) {
		return new Promise((resolve, reject) => {
			let cloneNameAdd = cloneData.clone_name.toLowerCase();

			let excludingString = '\'placeholder\',';
			if (excluding.length > 0) {
				excluding.forEach(user => {
					excludingString += '\'' + user + '\'' + ',';
				});
			}

			excludingString = excludingString.slice(0, -1);

			let blacklistString = 'lower(b.name) not like ';
			if (blacklist.length > 0) {
				blacklist.forEach(q => {
					blacklistString += '\'%' + q.toLowerCase() + '%\'' + ' and b.name not like ';
				});
			}

			blacklistString += '\'%placeholder%\'';

			const startDate = this.getDateNDaysAgo(daysAgo);
			const query = `select trim(lower(b.name)) as search, count(b.name) as count from matomo_log_link_visit_action a, matomo_log_action b, matomo_log_visit c where a.idaction_name = b.idaction and a.idvisit = c.idvisit and lower(search_cat) like 'gamechanger_${cloneNameAdd}%' and a.server_time > '${startDate}' and c.user_id not in (${excludingString}) and ${blacklistString} group by b.name order by count desc limit ${topN};`;
			connection.query(query, (error, results, fields) => {
				if (error) {
					this.logger.error(error, 'BAP9ZIP');
					throw error;
				}
				resolve(results);
			});
		});
	}

	htmlDecode(encodedString) {
		var translate_re = /&(nbsp|amp|quot|lt|gt);/g;
		var translate = {
			"nbsp":" ",
			"amp" : "&",
			"quot": "\"",
			"lt"  : "<",
			"gt"  : ">"
		};
		return encodedString.replace(translate_re, function(match, entity) {
			return translate[entity];
		}).replace(/&#(\d+);/gi, function(match, numStr) {
			var num = parseInt(numStr, 10);
			return String.fromCharCode(num);
		});
	}

	/**
	 *
	 * @param {*} req
	 * @param {*} res
	 */
	async getAppStats(req, res) {
		let connection;
		try {
			connection = this.mysql.createConnection({
				host: this.constants.MATOMO_DB_CONFIG.host,
				user: this.constants.MATOMO_DB_CONFIG.user,
				password: this.constants.MATOMO_DB_CONFIG.password,
				database: this.constants.MATOMO_DB_CONFIG.database
			});
			connection.connect();

			const {
				cloneData = {},
				daysAgo = 3,
				internalUsers = [],
				blacklist = []
			} = req.body;

			const results = {
				daysBack: daysAgo,
				data: {
					avgSearchesPerSession: null,
					topSearches: {
						topN: 10,
						data: null
					},
					cloneData: cloneData,
					excluding: internalUsers,
					blacklist: blacklist
				}
			};
			results.data.avgSearchesPerSession = await this.getAvgSearchesPerSession(3, connection);
			results.data.topSearches.data = await this.getTopSearches(cloneData, daysAgo, internalUsers, blacklist, 10, connection);
			let cleanedTopSearches = [];
			results.data.topSearches.data.forEach((d) => {
				cleanedTopSearches.push({search: this.htmlDecode(d.search), count: d.count});
			});
			results.data.topSearches.data = cleanedTopSearches;
			res.status(200).send(results);
		} catch (err) {
			this.logger.error(err, '80ZIUHU');
			res.status(500).send(err);
		} finally {
			try {
				connection.end();
			} catch (e) {
				// do nothing
			}
		}
	}
	/**
	 * This method gets an array of PDFs opened with a timestamp and idvisit
	 * depending on how many days back
	 * @method queryPdfOpend
	 * @param {Date} startDate
	 * @returns
	 */
	async queryPdfOpend(startDate, connection) {
		return new Promise((resolve, reject) => {
			const self = this;
			connection.query(`
				select 
					a.idvisit as idvisit, 
					idaction_name, 
					b.name as document, 
					a.server_time as documenttime 
				from 
					matomo_log_link_visit_action a, 
					matomo_log_action b 
				where 
					a.idaction_name = b.idaction  
					and b.name like 'PDFViewer%'
					and a.server_time > '${startDate}'
				order by 
					idvisit,
					documenttime desc;`,
				(error, results, fields) => {
					if (error) {
						this.logger.error(error, 'BAP9ZIP');
						throw error;
					}
					resolve(self.cleanFilePath(results));
				});
		});
	}
	/**
	 * This method gets an array of searches made with a timestamp and idvisit
	 * depending on how many days back
	 * @method querySearches
	 * @param {Date} startDate
	 * @returns
	 */
	async querySearches(startDate, connection) {
		return new Promise((resolve, reject) => {
			connection.query(`
				select
					a.idvisit as idvisit,
					idaction_name,
					a.search_cat,
					b.name as search,
					a.server_time as searchtime
				from
					matomo_log_link_visit_action a,
					matomo_log_action b
				where
					a.idaction_name = b.idaction
					and (search_cat = 'GAMECHANGER_gamechanger_combined' or search_cat = 'GAMECHANGER_gamechanger')
					and a.server_time > '${startDate}'
				order by
					idvisit,
					searchtime desc;`,
				(error, results, fields) => {
					if (error) {
						this.logger.error(error, 'BAP9ZIP');
						throw error;
					}
					resolve(results);
				});
		});
	}
	/**
	 * This method takes in options from the endpoint and queries matomo with those parameters.
	 * @param {Object} opts - This object is of the form {daysBack=3, offset=0, limit=50, filters, sorting, pageSize}
	 * @returns an array of data from Matomo.
	 */
	async querySearchPdfMapping(opts, connection) {
		const startDate = this.getDateNDaysAgo(opts.daysBack);
		const searches = await this.querySearches(startDate, connection);
		const documents = await this.queryPdfOpend(startDate, connection);

		const searchMap = {};
		const searchPdfMapping = [];

		for (let search of searches) {
			if (!searchMap[search.idvisit]) {
				searchMap[search.idvisit] = [];
			}
			searchMap[search.idvisit].push(search);
		}
		for (let document of documents) {
			if (searchMap[document.idvisit]) {
				const idSearches = searchMap[document.idvisit];
				for (let i = 0; i < idSearches.length; i++) {
					if (idSearches[i].searchtime < document.documenttime) {
						searchPdfMapping.push({ ...document, ...idSearches[i], visited: undefined });
						searchMap[document.idvisit][i].visited = true;
						break;
					}
				}
			}
		}
		for (const [key, value] of Object.entries(searchMap)) {
			for ( let search of value){
				if(search.visited === undefined){
					searchPdfMapping.push(search);
				}
			}
		}
		return searchPdfMapping;
	}
	/**
	 * Looks for a property called document and replaces the
	 * file path with the file name
	 * @param {Object[]} results  where each result has result['document']
	 * @returns
	 */
	cleanFilePath(results) {
		for (let result of results) {
			let filename = result['document'].replace(/^.*[\\\/]/, '').replace('PDFViewer - ', '');
			result['document'] = filename;
		}
		return results;
	}
	/**
	 * This method is called by an endpoint to query matomo for a search to document mapping.
	 * It first makes the connection with matomo then populates the data for the results.
	 * @param {*} req
	 * @param {*} res
	 */
	async getSearchPdfMapping(req, res) {
		const { daysBack = 3, offset = 0, filters, sorting, pageSize } = req.query;
		const opts = { daysBack, offset, filters, sorting, pageSize };
		let connection;
		try {
			connection = this.mysql.createConnection({
				host: this.constants.MATOMO_DB_CONFIG.host,
				user: this.constants.MATOMO_DB_CONFIG.user,
				password: this.constants.MATOMO_DB_CONFIG.password,
				database: this.constants.MATOMO_DB_CONFIG.database
			});
			connection.connect();
			const results = {
				daysBack,
				data: []
			};
			results.data = await this.querySearchPdfMapping(opts, connection);
			res.status(200).send(results);
		} catch (err) {
			this.logger.error(err, '88ZHUHU');
			res.status(500).send(err);
		} finally {
			connection.end();
		}
	}
}
module.exports.AppStatsController = AppStatsController;
