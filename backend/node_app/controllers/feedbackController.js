const FEEDBACK = require('../models').feedback;
const LOGGER = require('../lib/logger');
const Sequelize = require('sequelize');

class FeedbackController {
	constructor(opts = {}) {
		const {
			logger = LOGGER,
			feedback = FEEDBACK,
		} = opts;

		this.logger = logger;
		this.feedback = feedback;

		this.sendIntelligentSearchFeedback = this.sendIntelligentSearchFeedback.bind(this);
		this.sendQAFeedback = this.sendQAFeedback.bind(this);
		this.getFeedbackData = this.getFeedbackData.bind(this);
	}

  async sendIntelligentSearchFeedback(req, res) {
		let userId = req.get('SSL_CLIENT_S_DN_CN');
    const { eventName, intelligentSearchTitle, searchText } = req.body;
		try {
			const feedback = await this.feedback.create({ event_name: eventName, user_id: userId, value_1: 'search_text: ' + searchText, value_2: 'title_returned: ' + intelligentSearchTitle });
			res.status(200).send( eventName + ' feedback sent.' );
		} catch (err) {
			this.logger.error(err, '9YVI7BH', userId);
			res.status(500).send(err);
		}
	}

	async sendQAFeedback(req, res) {
		let userId = req.get('SSL_CLIENT_S_DN_CN');
    const { eventName, question, answer } = req.body;
		try {
			const feedback = await this.feedback.create({ event_name: eventName, user_id: userId, value_1: 'question: ' + question, value_2: 'QA answer: ' + answer });
			res.status(200).send( eventName + ' feedback sent.' );
		} catch (err) {
			this.logger.error(err, 'QO32DTK', userId);
			res.status(500).send(err);
		}
	}

	async getFeedbackData(req, res) {
		let userId = req.get('SSL_CLIENT_S_DN_CN');
		try {
			const {limit = 100, offset = 0, order = [], where = {}} = req.body;
			const results = await this.feedback.findAndCountAll({
				limit,
				offset,
				order,
				where,
				attributes: [
					'event_name',
					'user_id',
					'createdAt',
					'value_1',
					'value_2',
				]
			});
			res.status(200).send({totalCount: results.count, results: results.rows});
		} catch (err) {
			this.logger.error(err, '9FCQYV2', userId);
			res.status(500).send(err);
		}
	}
}

module.exports.FeedbackController = FeedbackController;
