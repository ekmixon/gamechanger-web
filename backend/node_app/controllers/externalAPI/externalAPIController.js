const LOGGER = require('../../lib/logger');
const ApiKey = require('../../models').api_key;
const ApiKeyRequests = require('../../models').api_key_request;
const EmailUtility = require('../../utils/emailUtility');
const constantsFile = require('../../config/constants');
const hat = require('hat');

module.exports.SwaggerDefinition = {
	swaggerDefinition: {
		openapi: '3.0.1',
		info: {
			title: 'Gamechanger External Routes',
			description: 'This is the swagger interface for all of the external routes. Click on the apis below to test them and examine results.'
		},
		basePath: '/api/external',
		produces: ['application/json'],
		schemes: ['http', 'https'],
		components: {
			securitySchemes: {
				apiKey: {
					type: 'apiKey',
					in: 'header',
					name: 'X-API-KEY'
				}
			},
			responses: {
				UnauthorizedError: {
					description: 'API key is missing or invalid'
				}
			},
			requestBodies: {
				Search: {
					description: 'A JSON object containing search information',
					required: true,
					content: {
						'application/json': {
							schema: {
								type: 'object',
								properties: {
									cloneName: {
										type: 'string',
										required: true,
										default: 'gamechanger'
									},
									searchText: {
										type: 'string',
										required: true
									},
									offset: {
										type: 'integer',
										required: false,
										default: 0
									},
									limit: {
										type: 'integer',
										required: false,
										default: 20
									}
								}
							}
						}
					}
				}
			}
		},
		security: [
			{
				apiKey: []
			}
		]
	},
	apis: ['./node_app/routes/externalSearchRouter.js', './node_app/routes/externalGraphRouter.js'],
};

module.exports.SwaggerOptions = {
	customSiteTitle: 'GAMECHANGER DOCS',
	customCss: '.topbar { display: none }',
	customFavIcon: './node_app/routes/favicon.ico'
};

class ExternalAPIController {
	constructor(opts = {}) {
		const {
			logger = LOGGER,
			constants = constantsFile,
			apiKeys = ApiKey,
			apiKeyRequests = ApiKeyRequests,
			emailUtility = new EmailUtility({
				fromName: constants.ADVANA_EMAIL_CONTACT_NAME,
				fromEmail: constants.ADVANA_NOREPLY_EMAIL_ADDRESS,
				transportOptions: constants.ADVANA_EMAIL_TRANSPORT_OPTIONS
			})
		} = opts;

		this.constants = constants;
		this.logger = logger;
		this.apiKeys = apiKeys;
		this.apiKeyRequests = apiKeyRequests;
		this.emailUtility = emailUtility;

		this.getAPIKeyRequests = this.getAPIKeyRequests.bind(this);
		this.approveRejectAPIKeyRequest = this.approveRejectAPIKeyRequest.bind(this);
		this.revokeAPIKeyRequest = this.revokeAPIKeyRequest.bind(this);
		this.createAPIKeyRequest = this.createAPIKeyRequest.bind(this);
		this.getAPIKey = this.getAPIKey.bind(this);
		this.sendApprovalEmail = this.sendApprovalEmail.bind(this);
	}

	async getAPIKeyRequests(req, res) {
		let userId = 'webapp_unknown';
		try {
			userId = req.get('SSL_CLIENT_S_DN_CN');

			const requests = await this.apiKeyRequests.findAll({ raw: true });

			const pending = []; const approved = [];

			for (const request of requests) {
				if (request.approved) {
					const keys = await this.apiKeys.findAll({ raw: true, where: { username: request.username }});
					request.keys = keys.map(key => { return key.apiKey; });
					delete request.username;
					approved.push(request);
				} else if (!request.approved && !request.rejected) {
					delete request.username;
					pending.push(request);
				}
			}

			res.status(200).send({pending, approved});

		} catch (err) {
			this.logger.error(err, '8K7PYSG', userId);
			res.status(500).send({pending: [], approved: []});
		}
	}

	async approveRejectAPIKeyRequest(req, res) {
		let userId = 'webapp_unknown';
		try {
			userId = req.get('SSL_CLIENT_S_DN_CN');
			const {id, approve = false} = req.body;

			if (id >= 0) {
				const request = await this.apiKeyRequests.findOne({ where: { id }, raw: true });

				if (request) {
					if (approve) {
						// Create an APIKey and store it then approve
						const apiKey = hat();
						const key = await this.apiKeys.create({
							username: request.username,
							apiKey,
							active: true
						});

						if (key) {
							await this.apiKeyRequests.update({ approved: true, rejected: false }, { where: { id } });
							this.sendApprovalEmail(request, apiKey, userId);
							res.sendStatus(200);
						} else {
							res.sendStatus(400);
						}
					} else {
						// Reject the request
						await this.apiKeyRequests.update({ rejected: true, approved: false }, { where: { id } });
						res.status(200).send({status: 'rejected'});
					}
				} else {
					// request not found
					res.sendStatus(404);
				}
			} else {
				res.sendStatus(400);
			}

		} catch (err) {
			this.logger.error(err, 'DUHQD90', userId);
			res.status(500).send(err);
		}
	}

	async revokeAPIKeyRequest(req, res) {
		let userId = 'webapp_unknown';
		try {
			userId = req.get('SSL_CLIENT_S_DN_CN');
			const {id} = req.body;

			if (id >= 0) {
				const request = await this.apiKeyRequests.findOne({ where: { id }, raw: true });

				// Find the API keys associated and make them not active
				await this.apiKeys.update({active: false}, { where: { username: request.username } });

				// Reject request
				await this.apiKeyRequests.update({ rejected: true, approved: false }, { where: { id } });
				res.sendStatus(200);

			} else {
				res.sendStatus(400);
			}

		} catch (err) {
			this.logger.error(err, 'OHLSKSC', userId);
			res.status(500).send(err);
		}
	}

	async createAPIKeyRequest(req, res) {
		let userId = 'webapp_unknown';
		try {
			userId = req.get('SSL_CLIENT_S_DN_CN');
			const {name, email, reason} = req.body;

			if (name && email && reason) {
				try {
					const request = await this.apiKeyRequests.create({
						username: userId,
						name,
						email,
						reason
					});

					if (request) res.sendStatus(200);
					else res.sendStatus(400);
				} catch (err) {
					res.status(400).send({status: 'request already exists'});
				}
			} else {
				res.sendStatus(400);
			}

		} catch (err) {
			this.logger.error(err, 'GUJ8UVG', userId);
			res.status(500).send(err);
		}
	}

	async getAPIKey(userId) {
		try {
			const active = await this.apiKeys.findOne({
				where: {
					username: userId,
					active: true
				}
			})
			if (active && 'apiKey' in active) {
				return active.apiKey
			} else {
				return '';
			}
		} catch (err) {
			this.logger.error(err, 'A0YE55C', userId);
		}
	}

	async sendApprovalEmail(request, apiKey, userId) {
		try {
			const emailBody = `
			<img src="cid:gc-api-access" width="100%"/><br/>
			<p>Hello ${request.name},</p>
			<p>We are pleased to let you know that your request for API access to GAMECHANGER has been approved!</p>
			<p>Please be advised that API access is still in an Alpha phase. While we continue improving on it, note that major changes may 
			affect the way you use the API and we cannot yet guarantee 100% up-time. We hope to reach a stable point within the next 
			couple of weeks to maintain a beta stage. Be on the lookout for some announcements on this in the near future.
			</p>
			<p>
			In the meantime, we do encourage you to use the API and run it through its paces. Any feedback that you have would be 
			appreciated and you can reach us at <b>osd.pentagon.ousd-c.mbx.advana-gamechanger@mail.mil</b>.
			</p>
			<p>
			---------------------------------------------------------------------------------------------------------------------------<br/>
			API Key: ${apiKey}<br/>
			Documentation: <a href="https://gamechanger.advana.data.mil/api/gamechanger/external/docs/">GAMECHANGER Documentation</a><br/>
			---------------------------------------------------------------------------------------------------------------------------
			</p>
			<p>
			How to use your API Key:<br/>
			1. Input your API Key in the authorization section for access<br/>
			2. Please do not share this key with any other users; this is your personal API key, but we are happy to provide API keys to any user/s who may require them. <br/>
			3. Let us know if you have any questions or feedback at osd.pentagon.ousd-c.mbx.advana-gamechanger@mail.mil <br/>
			</p>
			<p>
			Sincerely,<br/>
			The GAMECHANGER team
			</p>
			<img src="cid:gc-footer" width="100%"/><br/>`
			const attachment = [
				{
					filename: 'GC-api-access.png',
					path: __dirname + '/../../images/email/GC-api-access.png',
					cid: 'gc-api-access'
				},
				{
					filename: 'GC-footer.png',
					path: __dirname + '/../../images/email/GC-footer.png',
					cid: 'gc-footer'
				}
			]
			await this.emailUtility.sendEmail(emailBody,"GAMECHANGER API Key",request.email, this.constants.GAME_CHANGER_OPTS.emailAddress, attachment, userId)
		} catch (err) {
			this.logger.error(JSON.stringify(err), 'S6ED9GF', userId);
		}
	}
}

module.exports.ExternalAPIController = ExternalAPIController;
