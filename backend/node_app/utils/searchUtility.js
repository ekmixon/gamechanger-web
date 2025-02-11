const LOGGER = require('../lib/logger');
const sparkMD5Lib = require('spark-md5');
const constantsFile = require('../config/constants');
const { MLApiClient } = require('../lib/mlApiClient');
const { DataLibrary} = require('../lib/dataLibrary');
const neo4jLib = require('neo4j-driver');
const fs = require('fs');
const { include } = require('underscore');

const TRANSFORM_ERRORED = 'TRANSFORM_ERRORED';

class SearchUtility {

	constructor(opts = {}) {

		const {
			logger = LOGGER,
			sparkMD5 = sparkMD5Lib,
			constants = constantsFile,
			mlApi = new MLApiClient(opts),
			dataApi = new DataLibrary(opts)
		} = opts;

		this.logger = logger;
		this.sparkMD5 = sparkMD5;
		this.constants = constants;
		this.mlApi = mlApi;
		this.dataLibrary = dataApi;

		this.combineExpansionTerms = this.combineExpansionTerms.bind(this);
		this.getEsSearchTerms = this.getEsSearchTerms.bind(this);
		this.getElasticsearchQueryForGraphCache = this.getElasticsearchQueryForGraphCache.bind(this);
		this.getElasticsearchQuery = this.getElasticsearchQuery.bind(this);
		this.getESHighlightContent = this.getESHighlightContent.bind(this);
		this.cleanUpIdEsResults = this.cleanUpIdEsResults.bind(this);
		this.cleanUpEsResults = this.cleanUpEsResults.bind(this);
		this.cleanUpIdEsResultsForGraphCache = this.cleanUpIdEsResultsForGraphCache.bind(this);
		// this.combinedSearchHandler = this.combinedSearchHandler.bind(this);
		this.intelligentSearchHandler = this.intelligentSearchHandler.bind(this);
		this.documentSearchOneID = this.documentSearchOneID.bind(this);
		this.documentSearch = this.documentSearch.bind(this);
		this.makeAliasesQuery = this.makeAliasesQuery.bind(this);
		this.findAliases = this.findAliases.bind(this);
		this.makeBigramQueries = this.makeBigramQueries.bind(this);
		this.phraseQAQuery = this.phraseQAQuery.bind(this);
		this.expandParagraphs = this.expandParagraphs.bind(this);
		this.queryOneDocQA = this.queryOneDocQA.bind(this);
		this.getQAContext = this.getQAContext.bind(this);
		this.filterEmptyDocs = this.filterEmptyDocs.bind(this);
		this.cleanQAResults = this.cleanQAResults.bind(this);
	}

	createCacheKeyFromOptions({ searchText, cloneName = 'gamechangerDefault', index, cloneSpecificObject = {} }){
		// order matters for json stringify, adjusting this order will make a different cache key
		const options = JSON.stringify({ searchText, index, cloneSpecificObject });
		const hashed = this.sparkMD5.hash(options);
		return `${cloneName}_${hashed}`;
	}

	combineExpansionTerms(expansionDict, synonyms, key, abbreviationExpansions, userId) {
		try {
			let result = {};
			let toReturn;

			let nextSynIndex = 0;
			let nextAbbIndex = 0;
			let nextMlIndex = 0;
			let nextIsSyn = false;
			let nextIsAbb = true;
			let timesSinceLastAdd = 0;
			result = {};
			result[key] = [];
			while (result[key].length < 6 && timesSinceLastAdd < 18) {
				if (nextIsSyn && synonyms && synonyms[nextSynIndex]) {
					let syn = synonyms[nextSynIndex];
					let found = false;
					result[key].forEach((r) => {
						if (r.phrase === syn) {
							found = true;
						}
					});
					if (!found) {
						result[key].push({phrase: syn, source: 'thesaurus'});
					}
					nextSynIndex++;
				} else if (nextIsAbb && abbreviationExpansions && abbreviationExpansions[nextAbbIndex]) {
					let abb = abbreviationExpansions[nextAbbIndex];
					let found = false;
					result[key].forEach((r) => {
						if (r.phrase === abb) {
							found = true;
						}
					});
					if (!found) {
						result[key].push({phrase: abb, source: 'abbreviations'});
					}
					nextAbbIndex++;
				} else if (!nextIsAbb && !nextIsSyn && expansionDict && expansionDict[key] && expansionDict[key][nextMlIndex]) {
					let phrase = expansionDict[key][nextMlIndex];
					let cleanedPhrase = this.removeOriginalTermFromExpansion(key, phrase);
					if (cleanedPhrase && cleanedPhrase !== '') {
						let found = false;
						result[key].forEach((r) => {
							if (r.phrase === cleanedPhrase) {
								found = true;
							}
						});
						if (!found) {
							result[key].push({phrase: cleanedPhrase, source: 'ML-QE'});
						}
					}
					nextMlIndex++;
				} else {
					timesSinceLastAdd++;
				}

				if (nextIsSyn) {
					nextIsSyn = false;
				} else if (nextIsAbb) {
					nextIsAbb = false;
					nextIsSyn = true;
				} else {
					nextIsAbb = true;
				}
			}
			toReturn = result;
			let cleaned = this.cleanExpansions(key, toReturn);
			// this.logger.info('cleaned: ' + cleaned);
			return cleaned;
		} catch (err) {
			const { message } = err;
			this.logger.error(message, 'NOIROJE', userId);
		}
	}

	cleanExpansions(key, toReturn) {
		let cleaned = {};
		cleaned[key] = [];
		if (toReturn && toReturn[key] && toReturn[key].length) {
			let phrases = [];
			toReturn[key].forEach((x) => {
				phrases.push(x.phrase);
			});

			phrases = phrases.sort();
			let ordered = [];
			phrases.forEach((phr) => {
				toReturn[key].forEach((y) => {
					if (y.phrase === phr) {
						y.phrase = this.removeOriginalTermFromExpansion(key, y.phrase);
						if (y.phrase && y.phrase !== '' && y.phrase !== key) {
							ordered.push(y);
						}
					}
				});
			});

			cleaned[key] = ordered;
		}

		return cleaned;
	}

	removeOriginalTermFromExpansion(key, phrase) {
		let cleanKey = key.toLowerCase();
		let cleanPhrase = phrase.replace(/\"/g, '');
		cleanPhrase = cleanPhrase.toLowerCase();
		cleanPhrase = cleanPhrase.replace(cleanKey, '');
		cleanPhrase = cleanPhrase.trim();
		if (cleanPhrase.includes(' ')) {
			cleanPhrase = `"${cleanPhrase}"`;
		}
		return cleanPhrase;
	}

	getQueryVariable(name, url) {
		name = name.replace(/[[\]]/g, '\\$&');
		const regex = new RegExp('[?&]' + name + '(=([^&#]*)|&|#|$)');
		const results = regex.exec(url);
		if (!results) return null;
		if (!results[2]) return '';
		return decodeURIComponent(results[2].replace(/\+/g, ' '));
	}

	remove_stopwords = (str) => {
		const stopwords = ["a", "about", "above", "after", "again", "against", "ain", "all", "am", "an", "and", "any", "are", "aren", "aren't", "as", "at", "be", "because", "been", "before", "being", "below", "between", "both", "but", "by", "can", "couldn", "couldn't", "d", "did", "didn", "didn't", "do", "does", "doesn", "doesn't", "doing", "don", "don't", "down", "during", "each", "few", "for", "from", "further", "had", "hadn", "hadn't", "has", "hasn", "hasn't", "have", "haven", "haven't", "having", "he", "her", "here", "hers", "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is", "isn", "isn't", "it", "it's", "its", "itself", "just", "ll", "m", "ma", "me", "mightn", "mightn't", "more", "most", "mustn", "mustn't", "my", "myself", "needn", "needn't", "no", "nor", "not", "now", "o", "of", "off", "on", "once", "only", "or", "other", "our", "ours", "ourselves", "out", "over", "own", "re", "s", "same", "shan", "shan't", "she", "she's", "should", "should've", "shouldn", "shouldn't", "so", "some", "such", "t", "than", "that", "that'll", "the", "their", "theirs", "them", "themselves", "then", "there", "these", "they", "this", "those", "through", "to", "too", "under", "until", "up", "ve", "very", "was", "wasn", "wasn't", "we", "were", "weren", "weren't", "what", "when", "where", "which", "while", "who", "whom", "why", "will", "with", "won", "won't", "wouldn", "wouldn't", "y", "you", "you'd", "you'll", "you're", "you've", "your", "yours", "yourself", "yourselves", "could", "he'd", "he'll", "he's", "here's", "how's", "i'd", "i'll", "i'm", "i've", "let's", "ought", "she'd", "she'll", "that's", "there's", "they'd", "they'll", "they're", "they've", "we'd", "we'll", "we're", "we've", "what's", "when's", "where's", "who's", "why's", "would"];
    let res = [];
    const words = str.toLowerCase().split(' ');
    for(let i=0;i<words.length;i++) {
       const word_clean = words[i].split(".").join("")
       if(!stopwords.includes(word_clean)) {
           res.push(word_clean);
       }
    }
    return(res.join(' '));
} 

	getEsSearchTerms({ searchText, questionFlag }) {
		let terms = searchText;
		if (questionFlag){
			const stopwordsRemoved = this.remove_stopwords(searchText);
			const cleanedText = stopwordsRemoved.replace(/\?/g, '');
			terms = cleanedText
		}
		return this.getQueryAndSearchTerms(terms);
	}

	getQueryAndSearchTerms (searchText) {

		// change all text to lower case, need upper case AND/OR for solr search so easier if everything is lower
		const searchTextLower = searchText.toLowerCase();

		// finds quoted phrases separated by and/or and allows nested quotes of another kind eg "there's an apostrophe"
		const rawSequences = this.findQuoted(searchTextLower);

		let searchTextWithPlaceholders = searchTextLower;
		// replace phrases with __#__ placeholder
		rawSequences.forEach((phrase, index) => {
			searchTextWithPlaceholders = searchTextWithPlaceholders.replace(phrase, `__${index}__`);
		});

		// replace and/or with ' AND ' ' OR ' as required for solr search, one space is required
		searchTextWithPlaceholders = searchTextWithPlaceholders.replace(/(\s+)and(\s+)/g, ` AND `);
		searchTextWithPlaceholders = searchTextWithPlaceholders.replace(/(\s+)or(\s+)/g, ` OR `);

		// find unquoted words after replacing and/or
		// combine all terms to return for snippet highlighting
		const termsArray = this.findLowerCaseWordsOrAcronyms(searchTextWithPlaceholders);

		// fill back in double quoted phrases for solr search
		rawSequences.forEach((phrase, index) => {
			const replacementSequence = this.convertPhraseToSequence(phrase);
			termsArray.push(replacementSequence);
			searchTextWithPlaceholders = searchTextWithPlaceholders.replace(`__${index}__`, `${replacementSequence}`);
		});

		const solrSearchText = searchTextWithPlaceholders;

		// return solr query and list of search terms after parsing
		return [solrSearchText, termsArray];
	}

	findQuoted (searchText) {
		// finds quoted phrases separated by and/or and allows nested quotes of another kind eg "there's an apostrophe"
		return searchText.match(/(?!\s*(and|or))(?<words>(?<quote>'|").*?\k<quote>)/g) || [];
	}

	findLowerCaseWordsOrAcronyms (searchText) {
		// finds lower case words, acronyms with . and with digits eg c2 or a.i.
		return searchText.match(/\b([a-z\d\.])+(\b|)/g) || [];
	}

	convertPhraseToSequence (phrase) {
		// force double quotes then
		// let json parser escape nested quotes
		// and then read back
		return JSON.parse(JSON.stringify(`"${phrase.slice(1, -1)}"`));
	}

	getElasticsearchQueryForGraphCache ({ limit = 1000, offset = 0, searchAfter = null }, user) {
		try {
			const query = {
				_source: false,
				stored_fields: [
					'filename',
					'title',
					'page_count',
					'doc_type',
					'doc_num',
					'ref_list',
					'id',
					'summary_30',
					'keyw_5',
					'type',
				],
				track_total_hits: true,
				size: limit,
				query: {
					match_all: {}
				},
				sort: [
					{id: 'asc'}
				]
			};

			if (searchAfter) {
				query.search_after = searchAfter;
			}

			return query;
		} catch (err) {
			this.logger.error(err, '2OQQD7Ddd', user);
		}
	}

	getElasticsearchQuery(
		{ 
			searchText, 
			searchTerms, 
			parsedQuery, 
			orgFilterString = '', 
			typeFilterString = '',
			index, 
			offset = 0, 
			limit = 20, 
			format = 'json', 
			getIdList = false, 
			expandTerms = false, 
			isClone = false, 
			cloneData = {}, 
			charsPadding = 90, 
			operator = 'and', 
			searchFields = {}, 
			accessDateFilter = [], 
			publicationDateFilter = [], 
			publicationDateAllTime = true, 
			storedFields = [
				'filename',
				'title',
				'page_count',
				'doc_type',
				'doc_num',
				'ref_list',
				'id',
				'summary_30',
				'keyw_5',
				'p_text',
				'type',
				'p_page',
				'display_title_s',
				'display_org_s',
				'display_doc_type_s',
				'is_revoked_b',
				'access_timestamp_dt',
				'publication_date_dt',
				'crawler_used_s',
				'download_url_s',
				'source_page_url_s',
				'source_fqdn_s'
			], 
			extStoredFields = [], 
			extSearchFields = [], 
			includeRevoked = false,
			sort = 'Relevance', 
			order = 'desc',
			includeHighlights = true,
			docIds = {}
		 }, 
		 user) {

		try {
			// add additional search fields to the query
			const mustQueries = [];
			for (const key in searchFields) {
				const searchField = searchFields[key];
				if (searchField.field && searchField.field.name && searchField.input && searchField.input.length !== 0) {
					const wildcard = { query_string: { query: `${searchField.field.name}:*${searchField.input}*` } };
					// wildcard.wildcard[`${searchField.field.name}${searchField.field.searchField ? '.search' : ''}`] = { value: `*${searchField.input}*` };

					mustQueries.push(wildcard);
				}
			}
			storedFields = [...storedFields, ...extStoredFields];
			const verbatimSearch = searchText.startsWith('"') && searchText.endsWith('"');
			const default_field = (verbatimSearch ? 'paragraphs.par_raw_text_t' :  'paragraphs.par_raw_text_t.gc_english')
			const analyzer = (verbatimSearch ? 'standard' :  'gc_english');
			let query = {
				_source: {
					includes: ['pagerank_r', 'kw_doc_score_r', 'orgs_rs', 'topics_rs']
				},
				stored_fields: storedFields,
				from: offset,
				size: limit,
				aggregations: {
					doc_type_aggs: {
						terms: {
							field: 'display_doc_type_s',
							size: 10000
						}
					},
					doc_org_aggs: {
						terms: {
							field: 'display_org_s',
							size: 10000
						}
					}
				},
				track_total_hits: true,
				query: {
					bool: {
						must:[],
						should: [
							{
								nested: {
									path: 'paragraphs',
									inner_hits: {
										_source: false,
										stored_fields: [
											'paragraphs.page_num_i',
											'paragraphs.par_raw_text_t'
										],
										from: 0,
										size: 5,
										highlight: {
											fields: {
												'paragraphs.par_raw_text_t': {
													fragment_size: 3 * charsPadding,
													number_of_fragments: 1,
													type: 'plain'


												},
												'paragraphs.par_raw_text_t.gc_english': {
													fragment_size: 3 * charsPadding,
													number_of_fragments: 1,
													type: 'plain'

												},
											},
											fragmenter: 'span'
										}
									},
									query: {
										bool: {
											should: [
												{
													query_string: {
														query: `${parsedQuery}`,
														default_field,
														default_operator: `${operator}`,
														fuzzy_max_expansions: 100,
														fuzziness: 'AUTO',
														analyzer
													}
												}
											]										
										}
									}
								}
							},
							{
								wildcard: {
									'keyw_5': {
										value: `*${parsedQuery}*`
									}
								}
							},
							{
								wildcard: {
									'title.search': {
										value: `*${parsedQuery}*`,
										boost: 4
									}
								}
							},
							{
								wildcard: {
									'filename.search': {
										value: `*${parsedQuery}*`,
										boost: 4

									}
								}
							},
							{
								multi_match: {
									query: `${parsedQuery}`,
									fields: ['title.search', 'filename.search'],
									operator: 'AND',
									type: 'phrase',
									boost: 2
								  }
							}
						],
						minimum_should_match: 1,

						filter: []
						
					}
				},
				highlight: {
					require_field_match: false,
					fields: {
						'title.search': {},
						'keyw_5': {},
						'id': {},
						'filename.search': {}
					},
					fragment_size: 10,
					fragmenter: 'simple',
					type: 'unified',
					boundary_scanner: 'word'

				}
			};

			switch(sort){
				case 'Relevance':
					query.sort = [ {"_score": {"order" : order}} ]
					break;
				case 'Publishing Date':
					query.sort = [ {"publication_date_dt": {"order" : order}} ]
					break;
				case 'Alphabetical':
					query.sort = [ {"display_title_s": {"order" : order}} ]
					break;
				case 'References':
					query.sort = [{"_script": {
						"type": "number",
						"script": "doc.ref_list.size()",
						"order": order
					}}]
				default: 
					break;
			} 

			if (extSearchFields.length > 0){
				const extQuery = {
					multi_match: {
						query: searchText,
						fields: [],
						operator: 'or'
					}
				};
				extQuery.multi_match.fields = extSearchFields.map((field) => field.toLowerCase());
				query.query.bool.should = query.query.bool.should.concat(extQuery);
			}

			if (this.constants.GAME_CHANGER_OPTS.allow_daterange && !publicationDateAllTime && publicationDateFilter[0] && publicationDateFilter[1]){
				if (!publicationDateAllTime && publicationDateFilter[0] && publicationDateFilter[1]) {
					query.query.bool.must.push({
						range: {
							publication_date_dt: {
								gte: publicationDateFilter[0].split('.')[0],
								lte: publicationDateFilter[1].split('.')[0]
							}
						}
					});
				}
			}

			if (!includeRevoked && !isClone) { // if includeRevoked, get return cancelled docs
				query.query.bool.filter.push({
					term: {
						is_revoked_b: 'false'
					}
				});
			}

			if (mustQueries.length > 0) {
				query.query.bool.must = query.query.bool.must.concat(mustQueries);

			}

			if ((!isClone) && (orgFilterString.length > 0)) {
				query.query.bool.filter.push(
					{
						terms: {
							display_org_s: orgFilterString
						}
					}
				);
			}
			if ((!isClone) && (typeFilterString.length > 0)) {
				query.query.bool.filter.push(
					{
						terms: {
							display_doc_type_s: typeFilterString
						}
					}
				);
			}
			if (includeHighlights == false) {
				delete query.query.bool.should[0].nested.inner_hits;
				delete query.highlight;
			}
			if (Object.keys(docIds).length !== 0){
				query.query.bool.must.push(
					{terms: {id: docIds}}
					)

			}
			return query;
		} catch (err) {
			this.logger.error(err, '2OQQD7D', user);
		}
	}

	getESQueryUsingOneID(id, user, limit = 100, maxLength=200) {
		try {
			return {
				_source: {
					includes: [
						'pagerank_r',
						'kw_doc_score_r',
						'pagerank',
						'topics_rs'
					]
				},
				stored_fields: [
					'filename',
					'title',
					'page_count',
					'doc_type',
					'doc_num',
					'ref_list',
					'id',
					'summary_30',
					'keyw_5',
					'p_text',
					'type',
					'p_page',
					'display_title_s',
					'display_org_s',
					'display_doc_type_s',
					'is_revoked_b',
					'access_timestamp_dt',
					'publication_date_dt',
					'crawler_used_s'
				],
				track_total_hits: true,
				size: limit,
				query: {
					bool: {
						should: {
							nested: {
								path: 'paragraphs',
								inner_hits: {
									_source: false,
									stored_fields: [
										'paragraphs.page_num_i',
										'paragraphs.filename',
										'paragraphs.par_raw_text_t'
									],
									from: 0,
									size: 5,
									highlight: {
									  fields: {
										'paragraphs.filename.search': {
										  number_of_fragments: 0
										},
										'paragraphs.par_raw_text_t': {
										  fragment_size: maxLength,
										  number_of_fragments: 1
										}
									  },
									  fragmenter: 'span'
									}
								},
								query: {
									bool: {
										must: [{
											terms: {
												'paragraphs.id': [
													id
												]
											}
										}],
										should: [
											{
												wildcard: {
													'paragraphs.filename.search': {
														value: id + '*',
														boost: 15
													}
												}
											}
										]
									}
								}
							}
						}
					}
				}
			};
		} catch (err) {
			this.logger.error(err, 'TA9GH5F', user);
		}

	}

	getESQueryOneDoc (id, userId) {
	// get contents of single document searching by doc id
	try {
		return {
			size: 1,
			query: {
				match: {
					id: id
				}
			}
		}
	} catch (err) {
		this.logger.error(err, 'TJKFH5F', userId);
		}
	}

	// makes phrases to add to ES queries for entities or gamechanger indices
	makeBigramQueries (searchTextList, alias) {

		try {
			let bigrams = [];
			let searchText = searchTextList.join(' ');
			let length = searchTextList.length - 2;
			for (let i =0; i <= length; i++) {
				bigrams.push(searchTextList.slice(i, i+2).join(' '));
			}

			// if alias search came back with a result, this adds the full unabbreviated name
			try {
				if (alias._source) {
					bigrams.push(alias._source.name);
				}
			} catch (e) {
				this.logger.error(e, 'DYWPQMCSW', '');
			}

			// make one object for all queries
			const bigramQueries = {entityShouldQueries: [],  docMustQueries: [], 
				docShouldQueries: [
					{
						multi_match: {
							query: searchText,
							fields: [
							'keyw_5^2',
							'id^2',
							'summary_30',
							'paragraphs.par_raw_text_t'
							],
							operator: 'or'
						}
					}
				]
			}
			
			// make phrase queries for each bigram
			for (const element of bigrams) {

				// documents
				const wildcard = {
					wildcard: {
						'paragraphs.filename.search': { 
							value:  element,
							boost: 15
						}
					}
				}
				bigramQueries.docMustQueries.push(wildcard);

				const qs = {
					query_string: {
					query: element,
					default_field: 'paragraphs.par_raw_text_t',
					default_operator: 'AND',
					fuzzy_max_expansions: 100,
					fuzziness: 'AUTO'
					}
				}
				bigramQueries.docMustQueries.push(qs);

				const mm = {
					multi_match: {
					query: element,
					fields: ["summary_30","title", "keyw_5"],
					type: "phrase",
					boost: 5
					}
				}
				bigramQueries.docShouldQueries.push(mm);

				// entities 
				const nameEntityQuery = {
					match_phrase: {
						'name': {
							query: element,
							slop: 2,
							boost: 0.5
						}
					}
				}
				bigramQueries.entityShouldQueries.push(nameEntityQuery);

				const multiEntityQuery = {
					multi_match: {
						fields: ['name', 'aliases.name'], // 'information'
						query: element,
						type: 'phrase_prefix'
					}
				}
				bigramQueries.entityShouldQueries.push(multiEntityQuery);
			};
			return bigramQueries;

		} catch (e) {
			this.logger.error(e, 'LWPOT5F', '');
		}
	}

	// make ES query for QA documents/entities/aliases
	phraseQAQuery (bigramQueries, queryType, entityLimit, maxLength, user) {

		let query;
		try {
			if (queryType === 'alias_only') {
				query = {
					from: 0,
					size: entityLimit,
						query: {
							bool: {
								should: bigramQueries.aliasQuery
							}
						}
					};
			} else if (queryType === 'entities') {
				query = {
					from: 0,
					size: entityLimit,
						query: {
							bool: {
								should: bigramQueries.entityShouldQueries
							}
						}
					};
			} else if (queryType === 'documents') {
				query = {
					query: {
						bool: {
							must: [
								{
									nested: {
										path: 'paragraphs',
										inner_hits: {
											_source: false,
											stored_fields: [
												'paragraphs.page_num_i',
												'paragraphs.filename',
												'paragraphs.par_raw_text_t'
											],
											from: 0,
											size: 5,
											highlight: {
												fields: {
													'paragraphs.filename.search': {
														number_of_fragments: 0
													},
													'paragraphs.par_raw_text_t': {
														fragment_size: maxLength,
														number_of_fragments: 1
													}
												},
												fragmenter: 'span'
											}
										},
										query: {
											bool: {
												should: bigramQueries.docMustQueries
											}
										}
									}
								}
							],
							should: bigramQueries.docShouldQueries
						}
					}
				}
			};
			return query;
		} catch (e) {
		this.logger.error(e, 'TJDDKH5F', user);
		}
	}

	makeAliasesQuery (searchTextList, entityLimit) {

		try {
			// make alias queries for each word
			const mustQueries = [];

			for (const word of searchTextList) {
				const alias = {
					match: { 'aliases.name': word }
				}
				mustQueries.push(alias);
			};

			const aliasQuery = {
				nested: {
					path: "aliases",
					query: {
						bool: {
							should: mustQueries
						}
					}
				}
			};
			return {
					from: 0,
					size: entityLimit,
						query: {
							bool: {
								should: aliasQuery
							}
						}
					};
		} catch (e) {
			this.logger.error(e, 'LQPRYTUOF', '');
		}
	}

	async findAliases (searchTextList, entityLimit, esClientName, entitiesIndex, user) {

		let matchingAlias = {};
		try {
			let aliasQuery = this.makeAliasesQuery(searchTextList, entityLimit);
			let aliasResults = await this.dataLibrary.queryElasticSearch(esClientName, entitiesIndex, aliasQuery, user);
			if (aliasResults.body.hits.hits[0]) {
				let aliases = aliasResults.body.hits.hits[0]._source.aliases.map(item => item.name);
				for (var i = 0; i < aliases.length; i++) {
					if (aliases[i].split(/\s+/).length === 1 && aliases[i] === aliases[i].toUpperCase()) {
						matchingAlias = aliasResults.body.hits.hits[0];
						matchingAlias.match = aliases[i]
						break
					}
				}
			};
			return matchingAlias
		} catch (e) {
		this.logger.error(e, 'MBWYH5F', user);
		}
	}

	filterEmptyDocs(docs, filterLength) {
		// filters out results that have no text or very short amount of text in the paragraphs
		try {
			let filteredResults = [];
			for (let i = 0; i < docs.length; i++) {
				let paragraphs = docs[i]._source.paragraphs;
				let parText = paragraphs.map(item => item.par_raw_text_t).join(" ");
				if (parText.trim() !== '' && parText.trim().split(/\s+/).length > filterLength) {
					filteredResults.push(docs[i])
				} else { // pass
					//console.log("REMOVING DOC: ", docs[i])
				}
			};
			return filteredResults;
		} catch (e) {
			this.logger.error(e, 'SPW29NTY', '');
		}
	}

	expandParagraphs (singleResult, parIdx, minLength) {
		// adds context around short paragraphs to make them longer
		let qaResults = singleResult._source.paragraphs; // get just the paragraph text into list
		let qaTextList = qaResults.map(item => item.par_raw_text_t);
		let start = parIdx;
		let end = +start + +1;
		let text = qaTextList[start];
		let total_pars = qaTextList.length;
		let context = []
		let arr = text.split(/\s+/);
		try {
			for (start,end; start>=0,end<=total_pars; --start,++end) {
				if (start <= 1) {
					start = 1
				}
				if (end >= total_pars) {
					end = total_pars
				}
				context = qaTextList.slice(start, end);
				text = context.join(' ');
				arr = text.split(/\s+/);
				if (arr.length > minLength) {
					break
				}
			}
			return context;
		} catch (e) {
			LOGGER.error(e.message, 'BVD4546JN', '');
		}
	}

	async queryOneDocQA(docId, esClientName, esIndex, userId) {
		// query entire docs to expand short paragraphs/get beginning of doc
		try {
			let newQuery = this.getESQueryOneDoc(docId, userId); // query ES for single doc
			let singleResult = await this.dataLibrary.queryElasticSearch(esClientName, esIndex, newQuery, userId);
			return singleResult.body.hits.hits[0];
		} catch (e) {
			LOGGER.error(e.message, 'COP4546JN', userId);
		}
	}

	cleanParagraph (paragraph) {
		// remove extra punctuation/weird characters
		try {
			paragraph = paragraph.replace(/((\.)(\s)?(?=\.))/g,''); // remove TOC periods
			paragraph = paragraph.replace(/([xX](\s)?(?=[xX]))/g,''); // remove TOC periods
			paragraph = paragraph.replace(/[^a-zA-Z0-9 \(\)\/-:;,"?!\.]/g, ' '); // ascii
			paragraph = paragraph.replace(/(\s\s+)/g, ' '); // replace multiple spaces with one space
		} catch (e) {
			LOGGER.error(e.message, 'NQODF78X', '');
		};
		return paragraph;
	}

	async formatQAquery (searchText, entityLimit, esClientName, entitiesIndex, userId) {
		try {
			let text = searchText.toLowerCase().replace('?', ''); // lowercase/ remove ? from query
			let display = text + '?';
			let list = text.split(/\s+/); // get list of query terms
			let alias = await this.findAliases(list, entityLimit, esClientName, entitiesIndex, userId);
			if (alias._source) {
				text = text.replace(alias.match.toLowerCase(), alias._source.name);
			};
			let qaQueries = {text: text, display: display, list: list, alias: alias};
			return qaQueries;
		} catch (e) {
			LOGGER.error(e.message, 'SRUVBNX', '');
		};
	}

	async getQAEntities (qaQueries, bigramQueries, qaParams, esClientName, entitiesIndex, userId) {
		try {
			let entities = {};
			if (qaQueries.alias._source) {
				entities.QAResults = qaQueries.alias;
			} else {
				let queryType='entities';
				let qaEntityQuery = this.phraseQAQuery(bigramQueries, queryType, qaParams.entityLimit, qaParams.maxLength, userId);
				entities.allResults = await this.dataLibrary.queryElasticSearch(esClientName, entitiesIndex, qaEntityQuery, userId);
			};
			if (entities.allResults) {
				entities.QAResults = entities.allResults.body.hits.hits[0]
			};
			return entities;
		} catch (e) {
			this.logger.error(e.message, 'I9XPQL2W');
		}
	}

	cleanQAResults (searchResults, shortenedResults, context) {
		// formats QA results
		try {
			if (shortenedResults.answers.length > 0 && shortenedResults.answers[0].status) {
				shortenedResults.answers = shortenedResults.answers.filter(function(i) {
					return i['status'] == 'passed' && i['text'] !== '';
				});
			} else {
				shortenedResults.answers = shortenedResults.answers.filter(function(i) {
					return i['text'] !== '';
				});
			}
			let contextIds = shortenedResults.answers.map(item => 'Source: ' + context[item.context].filename.toUpperCase() + ' (' + context[item.context].resultType.toUpperCase() + ')');
			let cleanedResults = shortenedResults.answers.map(item => item.text);
			searchResults.qaResults.answers = cleanedResults;
			searchResults.qaResults.filenames = contextIds;
			searchResults.qaResults.docIds = shortenedResults.answers.map(item => context[item.context].docId);
			searchResults.qaResults.resultTypes = shortenedResults.answers.map(item => context[item.context].resultType);
		} catch (e) {
			LOGGER.error(e.message, 'AJEPRUTY', '');
		};
		return searchResults;
	}

	getInnerHitHighlight (paragraph) {
		// gets just the highlight from an inner hit
		try {
			return paragraph.highlight['paragraphs.par_raw_text_t'][0]
		} catch (e) {
			LOGGER.error(e.message, 'NPLWDQCX', '');
		}
	}

	getInnerHitParagraph (paragraph) {
		// get the paragraph text from an inner hit
		try {
			return paragraph.fields['paragraphs.par_raw_text_t'][0]
		} catch (e) {
			LOGGER.error(e.message, 'NQCPQBX', '');
		}
	}

	processQAEntity (entity, context, userId) {
		try {
			let docId = '';
			let resultType = '';
			if (entity._source.entity_type === 'topic') {
				docId = entity._source.name.toLowerCase();
				resultType = 'topic';
			} else {
				docId = entity._source.name;
				resultType = 'entity';
			}
			let entityObj = {filename: entity._source.name, docId: docId, docScore: entity._score, retrievedDate: entity._source.information_retrieved, type: entity._source.entity_type, resultType: resultType, source: "entity search", text: entity._source.information};
			context.unshift(entityObj);
			return context;
		} catch (e) {
			LOGGER.error(e.message, 'PQXUOSDF9', userId);
		}
	}

	async processQASentenceResults (sentResults, context, esClientName, esIndex, userId, qaParams) {
		for (var i = 0; i < sentResults.length; i++) {
			try {
				let [docId, parIdx] = sentResults[i].id.split('_');
				docId = docId + '_0';
				let resultDoc = await this.queryOneDocQA(docId, esClientName, esIndex, userId); // this adds the beginning of the doc
				let contextPara = {filename: resultDoc._source.display_title_s, docId: resultDoc._source.id, docScore: resultDoc._score, docTypeDisplay: resultDoc._source.display_doc_type_s, pubDate: resultDoc._source.publication_date_dt, pageCount: resultDoc._source.page_count, docType: resultDoc._source.doc_type, org: resultDoc._source.display_org_s, resultType: 'document', source: 'intelligent search', parIdx: parIdx};
				let paraHit = resultDoc._source.paragraphs[parIdx];
				let para = this.cleanParagraph(paraHit.par_raw_text_t);
				if (para.length > qaParams.maxLength) { // if paragraph is too long, take beginning
					contextPara.text = para.substring(0,qaParams.maxLength);
				} else if (para.length > 200) { // only keep actual paragraphs not empty strings/titles/headers
					contextPara.text = para;
				} else {
					let qaSubset = await this.expandParagraphs(resultDoc, parIdx, qaParams.minLength); // get only text around the hit paragraph up to the max length
					contextPara.text = this.cleanParagraph(qaSubset.join(' ')); 
				}
				if (sentResults[i].score >= 0.95) { // if sentence result scores hidh, push to top of context
					context.unshift(contextPara);
				} else {
					context.push(contextPara);
				};
				return context;
			} catch (e) {
				LOGGER.error(e.message, 'LOQXIPY', userId);
			}
		}
	}

	async processQADocumentResults (docResults, context, esClientName, esIndex, userId, qaParams) {

		let filterLength = 15;
		let docs = docResults.body.hits.hits
		let filteredResults = this.filterEmptyDocs(docs, filterLength);
		let docLimit = Math.min(qaParams.maxDocContext, filteredResults.length);
		try {
			for (var i = 0; i < docLimit; i++) {
				let resultDoc = filteredResults[i];
				if (resultDoc._score > qaParams.scoreThreshold) { // if doc scores high, retrieve paragraphs
					let paraHits = resultDoc.inner_hits.paragraphs.hits.hits;
					let paraLimits = Math.min(qaParams.maxParaContext, paraHits.length);
					for (var x = 0; x < paraLimits; x++) { // for each doc, add the paragraph hits
						if (paraHits[x]) {
							let contextPara = {filename: resultDoc._source.display_title_s, docId: resultDoc._source.id, docScore: resultDoc._score, docTypeDisplay: resultDoc._source.display_doc_type_s, pubDate: resultDoc._source.publication_date_dt, pageCount: resultDoc._source.page_count, docType: resultDoc._source.doc_type, org: resultDoc._source.display_org_s, resultType: 'document', source: 'context search', parIdx: paraHits[x]._nested.offset};
							let para = this.cleanParagraph(this.getInnerHitParagraph(paraHits[x]));
							if (para.length > qaParams.maxLength) { // if paragraph is too long, take highlight
								contextPara.text = this.cleanParagraph(this.getInnerHitHighlight(paraHits[x]));
							} else if (para.length > 200) { // only keep actual paragraphs not empty strings/titles/headers
								contextPara.text = para
							}
							context.push(contextPara);
						}
					}
				} else { // if doc doesn't score high, retrieve the intro
					let contextPara = {filename: resultDoc._source.display_title_s, docId: resultDoc._source.id, docScore: resultDoc._score, docTypeDisplay: resultDoc._source.display_doc_type_s, pubDate: resultDoc._source.publication_date_dt, pageCount: resultDoc._source.page_count, docType: resultDoc._source.doc_type, org: resultDoc._source.display_org_s, resultType: 'document', source: 'context search', parIdx: 0};
					let singleResult = await this.queryOneDocQA(resultDoc._source.id, esClientName, esIndex, userId); // this adds the beginning of the doc
					let qaSubset = await this.expandParagraphs(singleResult, contextPara.parIdx, qaParams.minLength); // get only text around the hit paragraph up to the max length
					let text = this.cleanParagraph(qaSubset.join(' ')); 
					if (text.length > 200) {
						contextPara.text = text;
						context.push(contextPara); // only keep actual paragraphs not empty strings/titles/headers
					}
				}
			};
			return context;
		} catch (e) {
			LOGGER.error(e.message, 'QAPTFJN', userId);
		}
	}
	
	async getQAContext(docResults, entity, sentResults, esClientName, esIndex, userId, qaParams) {
		
		let context = [];
		try {
			if (docResults.body) {
				context = await this.processQADocumentResults (docResults, context, esClientName, esIndex, userId, qaParams);
			};
			if (sentResults && sentResults.length > 0) { // if sentence results, add them to context
				context = await this.processQASentenceResults(sentResults, context, esClientName, esIndex, userId, qaParams);
			};
			if (entity) { // if entity, add to context
				context = this.processQAEntity(entity, context, userId);
			};
			return context;
		} catch (e) {
			LOGGER.error(e.message, 'CPQ4FFJN', userId);
		}
	}

	addSearchReport(query, params, saveResults, userId) {
		try {
			var today = new Date();
			var date = today.getFullYear()+'-'+(today.getMonth()+1)+'-'+today.getDate();
			let dir = './scripts/search-testing/' + date + '/';
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, {
					recursive: true
				});
			}
			let filedir = dir  + date + '_' + query.replace(/[^ 0-9a-z]/gi, '').replace(/ /g, "_") + '_search_reports.txt'
			let report = {query: query, userId: userId, date: today, params: params, saveResults: saveResults};
			fs.writeFile(filedir, JSON.stringify(report), (err) => { 
				if (err) { 
					LOGGER.error(err, 'CPQ4KSLN', userId); 
				}
			});
		} catch (e) {
			LOGGER.error(e.message, 'WWKLNQPN', userId);
		}
	}

	getESSuggesterQuery({ searchText, field = 'paragraphs.par_raw_text_t', sort = 'frequency', suggest_mode = 'popular' }) {
		// multi search in ES if text is more than 3
		if (searchText.length >= 3){
			return {
				suggest: {
					suggester: {
						text: searchText,
						term: {
							field: field,
							sort: sort,
							suggest_mode: suggest_mode
						}
					}
				}
			};
		} else {
			throw new Error('searchText required to construct query or not long enough');
		}
	}

	getESpresearchMultiQuery({ searchText, filename = 'filename', title = 'title', name = 'name', aliases = 'aliases' }) {
		// need to caps all search text for ID and Title since it's stored like that in ES
		const searchTextCaps = searchText.toUpperCase();
		// multi search in ES if text is more than 3
		if (searchText.length >= 3){
			return [
				{
					index: this.constants.GAME_CHANGER_OPTS.index
				},
				{
					size: 2,
					_source: [filename],
					query: {
						bool: {
							must: [
								{
									wildcard: {
										'filename.search': {
											value: `*${searchTextCaps}*`,
											boost: 1.0,
											rewrite: 'constant_score'
										}
									}
								}
							],
							filter: [
								{
									term: {
										'is_revoked_b': false
									}
								}
							]
						}
					}
				},
				{
					index: this.constants.GAME_CHANGER_OPTS.index
				},
				{
					size: 2,
					_source: [title],
					query: {
						bool: {
							must: [
								{
									wildcard: {
										'title.search': {
											value: `*${searchTextCaps}*`,
											boost: 1.0,
											rewrite: 'constant_score'
										}
									}
								}
							],
							filter: [
								{
									term: {
										'is_revoked_b': false
									}
								}
							]
						}
					}
				},
				{
					index: this.constants.GAME_CHANGER_OPTS.historyIndex
				},
				{
					size: 1,
					query: {
						prefix: {
							search_query: {
								value: `${searchText}`
							}

						}
					},
					aggs: {
						search_query: {
							terms: {
								field: 'search_query',
								min_doc_count: 5
							},
							aggs: {
								user: {
									terms: {field: 'user_id', size: 3}
								}
							}
						}
					}
				},
				{
					index: this.constants.GAME_CHANGER_OPTS.entityIndex
				},
				{
					size: 2,
					_source: {
						includes: [name, aliases, 'entity_type']
					},
					query: {
						prefix: {
							name: {
								value: `${searchText}`
							}

						}
					},
				}
			];


		} else {
			throw new Error('searchText required to construct query or not long enough');
		}
	}


	cleanUpIdEsResultsForGraphCache(raw, user) {
		try {
			let results = {
				totalCount: raw.body.hits.total.value,
				docs: []
			};
			raw.body.hits.hits.forEach((r) => {
				let result = this.transformEsFields(r.fields);

				result.pageHits = [];
				const pageSet = new Set();

				result.pageHits.sort((a, b) => a.pageNumber - b.pageNumber);
				result.pageHitCount = pageSet.size;
				if (Array.isArray(result['keyw_5'])){
					result['keyw_5'] = result['keyw_5'].join(', ');
				} else {
					result['keyw_5'] = '';
				}
				if (!result.ref_list) {
					result.ref_list = [];
				}
				results.docs.push(result);

			});
			return results;
		} catch (err) {
			this.logger.error(err.message, 'VW8QE1Z', user);
		}
	}

	cleanUpEsResults(raw, searchTerms, user, selectedDocuments, expansionDict, index, query) {
		try {
			let results = {
				query,
				totalCount: (selectedDocuments && selectedDocuments.length > 0) ? selectedDocuments.length : raw.body.hits.total.value,
				docs: [],
			};

			let docTypes = [];
			let docOrgs = [];

			const { body = {} } = raw;
			const { aggregations = {} } = body;
			const { doc_type_aggs = {}, doc_org_aggs = {} } = aggregations;
			const type_buckets = doc_type_aggs.buckets ? doc_type_aggs.buckets : [];
			const org_buckets = doc_org_aggs.buckets ? doc_org_aggs.buckets : [];

			type_buckets.forEach((agg) => {
				docTypes.push(agg);
			});

			org_buckets.forEach((agg) => {
				docOrgs.push(agg);
			});

			results.doc_types = docTypes;
			results.doc_orgs = docOrgs;

			raw.body.hits.hits.forEach((r) => {
				let result = this.transformEsFields(r.fields);
				const { _source = {} } = r;
				const { topics_rs = {} } = _source;
				result.topics_rs = Object.keys(topics_rs);

				if (!selectedDocuments || selectedDocuments.length === 0 || (selectedDocuments.indexOf(result.filename) !== -1)) {
					result.pageHits = [];
					const pageSet = new Set();
					if (r.inner_hits) {
						if (r.inner_hits.paragraphs) {
							r.inner_hits.paragraphs.hits.hits.forEach((parahit) => {
								const pageIndex = parahit.fields['paragraphs.page_num_i'][0];
								let pageNumber = pageIndex + 1;
								// one hit per page max
								if (!pageSet.has(pageNumber)) {
									const [snippet, usePageZero] = this.getESHighlightContent(parahit, user);
									// use page 0 for title matches or errors
									// but only allow 1
									if (usePageZero) {
										if (pageSet.has(0)) {
											return;
										} else {
											pageNumber = 0;
											pageSet.add(0);
										}
									}
									
									pageSet.add(pageNumber);
									result.pageHits.push({snippet, pageNumber});
								}
							});
							
							result.pageHits.sort((a, b) => a.pageNumber - b.pageNumber);
							if(r.highlight){
								if(r.highlight['title.search']){
									result.pageHits.push({title: 'Title', snippet: r.highlight['title.search'][0]});
								}
								if(r.highlight.keyw_5){
									result.pageHits.push({title: 'Keywords', snippet: r.highlight.keyw_5.join(', ')});
								}
								if(r.highlight['filename.search']){
									result.pageHits.push({title: 'Filename', snippet: r.highlight['filename.search'][0]});
								}
							}
							result.pageHitCount = pageSet.size;
							
						} else {
							r.inner_hits.pages.hits.hits.forEach((phit) => {
								const pageIndex = phit._nested.offset;
								// const snippet =  phit.fields["pages.p_raw_text"][0];
								let pageNumber = pageIndex + 1;
								// one hit per page max
								if (!pageSet.has(pageNumber)) {
									const [snippet, usePageZero] = this.getESHighlightContent(phit, user);
									if (usePageZero) {
										if (pageSet.has(0)) {
											return;
										} else {
											pageNumber = 0;
											pageSet.add(0);
										}
									}
									pageSet.add(pageNumber);
									result.pageHits.push({snippet, pageNumber});
								}
							});
							
							result.pageHits.sort((a, b) => a.pageNumber - b.pageNumber);
							if(r.highlight){
								if(r.highlight['title.search']){
									result.pageHits.push({title: 'Title', snippet: r.highlight['title.search'][0]});
								}
								if(r.highlight.keyw_5){
									result.pageHits.push({title: 'Keywords', snippet: r.highlight.keyw_5[0]});
								}
								if(r.highlight['filename.search']){
									result.pageHits.push({title: 'Filename', snippet: r.highlight['filename.search'][0]});
								}
							}
							result.pageHitCount = pageSet.size;
						}
					}

					result.esIndex = index;

					if (Array.isArray(result['keyw_5'])){
						result['keyw_5'] = result['keyw_5'].join(', ');
					} else {
						result['keyw_5'] = '';
					}
					if (!result.ref_list) {
						result.ref_list = [];
					}
					results.docs.push(result);
				}
			});
			results.searchTerms = searchTerms;
			results.expansionDict = expansionDict;

			return results;
		} catch (err) {
			this.logger.error(err.message, 'GL7EDI3', user);
		}
	}
	
	cleanUpIdEsResults(raw, searchTerms, user, expansionDict) {
		try {
			if (!raw.body || !raw.body.hits || !raw.body.hits.total || !raw.body.hits.total.value || raw.body.hits.total.value === 0) {
				return { totalCount: 0, docIds: [], pubIds: [] };
			}

			let results = {};

			results.totalCount = raw.body.hits.total.value;
			results.docs = [];
			results.docIds = [];
			results.pubIds = [];

			raw.body.hits.hits.forEach((r) => {
				let result = this.transformEsFields(r.fields);
				results.docIds.push(result.id);
				if (results.pubIds.indexOf(`${result.doc_type} ${result.doc_num}`) === -1) {
					results.pubIds.push(`${result.doc_type} ${result.doc_num}`);
				}
				results.docs.push(result);
			});

			results.searchTerms = searchTerms;
			results.expansionDict = expansionDict;

			return results;
		} catch (err) {
			this.logger.error(err, 'BG9peM4', user);
		}
	}

	getESHighlightContent(parahit, user) {
		try {
			const { highlight = {} } = parahit;
			const { 'paragraphs.par_raw_text_t': highlightTextArray = [], 'paragraphs.filename.search': fieldFilenameArray = [] } = highlight;
			const { 'paragraphs.par_raw_text_t.gc_english': verbatimHighlightTextArray = [], 'paragraphs.filename.search': verbatimFieldFilenameArray = [] } = highlight;

			// If not paragraphs then look at nested pages.
			const { 'pages.p_raw_text': pageHighlightTextArray = [], 'pages.filename.search': pageFieldFilenameArray = [] } = highlight;

			// if neither of these exist (sentence mode search), pull from fields
			const { fields = {} } = parahit;
			const { 'paragraphs.par_raw_text_t': fieldTextArray = [], 'paragraphs.filename': fieldFilenameArray2 = [] } = fields;

			if (highlightTextArray.length > 0 && highlightTextArray[0]) {
				return [highlightTextArray[0], false];
			} else if (fieldFilenameArray.length > 0 && fieldFilenameArray[0]) {
				return [fieldFilenameArray[0].replace(/.pdf/g, ''), true];
			} else if (verbatimHighlightTextArray.length > 0 && verbatimHighlightTextArray[0]) {
				return [verbatimHighlightTextArray[0], false];
			} else if (verbatimFieldFilenameArray.length > 0 && verbatimFieldFilenameArray[0]) {
				return [verbatimFieldFilenameArray[0].replace(/.pdf/g, ''), true];
			} else if (pageHighlightTextArray.length > 0 && pageHighlightTextArray[0]) {
				return [pageHighlightTextArray[0], false];
			} else if (pageFieldFilenameArray.length > 0 && pageFieldFilenameArray[0]) {
				return [pageFieldFilenameArray[0].replace(/.pdf/g, ''), true];
			} else if (fieldTextArray.length > 0 && fieldTextArray[0]) {
				return [fieldTextArray[0], false];
			} else if (fieldFilenameArray2.length > 0 && fieldFilenameArray2[0]) {
				return [fieldFilenameArray2[0].replace(/.pdf/g, ''), true];
			} {
				throw new Error('failed to highlight');
			}

		} catch (e) {
			this.logger.error(e, 'x983Nsiw', user);
			return ['Error highlighting', true];
		}
	}

	transformEsFields(raw) {
		let result = {};
		const arrayFields = ['keyw_5', 'ref_list', 'paragraphs', 'entities', 'abbreviations_n'];
		const edaArrayFields = ['pds_header_items_eda_ext_n','pds_line_items_eda_ext_n','syn_header_items_eda_ext_n','syn_line_items_eda_ext_n']
		for (let key in raw) {
			if ((raw[key] && raw[key][0]) || Number.isInteger(raw[key]) || typeof raw[key] === 'object' && raw[key] !== null) {
				if (arrayFields.includes(key) || edaArrayFields.includes(key)) {
					result[key] = raw[key];
				} else if (Array.isArray(raw[key])) {
					result[key] = raw[key][0];
				} else {
					result[key] = raw[key];
				}
			} else {
				result[key] = null;
			}
		}
		return result;
	}

	getSearchWikiQuery(searchTerm) {
		try {
			let query = {
				size: 5,
				query: {
					query_string: {
						query: searchTerm
					}
				}
			}
			return query;
		}
		catch {
			this.logger.error(e, '17I8XO8', user);
		}
	}

	// async combinedSearchHandler(searchText, userId, req, expansionDict, clientObj, operator, offset) {
	// 	let filename;
	// 	let sentenceResults = await this.mlApi.getSentenceTransformerResults(searchText, userId);
	// 	if (sentenceResults[0] !== undefined && sentenceResults[0].score >= 0.95){ // if there is a result, shift offset / limits accordingly. 
	// 		if(req.body.offset === 0){
	// 			req.body.limit = 5
	// 		} else {
	// 			req.body.offset -= 1;
	// 		}
	// 	}
	// 	let searchResults = await this.documentSearch(req, {...req.body, expansionDict, operator}, clientObj, userId);
	// 	if (sentenceResults[0] !== undefined && sentenceResults[0].score >= 0.95){
	// 		filename = sentenceResults[0].id;
	// 		searchResults.totalCount += 1;
	// 	}

	// 	const topSentenceFind = searchResults.docs.find((item) => item.id === filename);
	// 	if (sentenceResults === TRANSFORM_ERRORED) {
	// 		searchResults.transformFailed = true;
	// 	} else if (topSentenceFind && offset === 0){	// if the +95% result exists within the documentSearch results, reorder them
	// 		topSentenceFind.search_mode = 'Intelligent Search';
	// 		searchResults.docs.unshift(topSentenceFind);
	// 	} else if (offset === 0 && filename) { // if sentenceSearch is not found in the documentSearch results, and we're on the first page, find and add
	// 		try {
	// 			const sentenceSearchRes = await this.documentSearchOneID(req, {...req.body, id: filename}, clientObj, userId);
	// 			sentenceSearchRes.docs[0].search_mode = 'Intelligent Search';
	// 			searchResults.docs.unshift(sentenceSearchRes.docs[0]);
	// 		} catch (err) {
	// 			this.logger.error('Error with sentence search results', 'ALRATR8', userId);
	// 		}
	// 	}
	// 	searchResults.sentResults = sentenceResults;
	// 	return searchResults;
	// }

	async intelligentSearchHandler(searchText, userId, req, clientObj){
		let filename;
		let result;
		let sentenceResults = await this.mlApi.getSentenceTransformerResults(searchText, userId);
		if (sentenceResults[0] !== undefined && sentenceResults[0].score >= 0.95){
			filename = sentenceResults[0].id;
			const sentenceSearchRes = await this.documentSearchOneID(req, {...req.body, id: filename}, clientObj, userId);
			sentenceSearchRes.docs[0].search_mode = 'Intelligent Search';
			result = sentenceSearchRes.docs[0];
			return result;
		}
		return {};
	}

	async documentSearchOneID(req, body, clientObj, userId) {
		try {
	
			const { id = '', searchTerms = [], expansionDict = {}, limit = 20, maxLength = 200 } = body;
	
			const esQuery = this.getESQueryUsingOneID(id, userId, limit, maxLength);
			const { esClientName, esIndex } = clientObj;
	
			const esResults = await this.dataLibrary.queryElasticSearch(esClientName, esIndex, esQuery, userId);

			if (esResults && esResults.body && esResults.body.hits && esResults.body.hits.total && esResults.body.hits.total.value && esResults.body.hits.total.value > 0) {
				return this.cleanUpEsResults(esResults, searchTerms, userId, null, expansionDict, esIndex);
			} else {
				this.logger.error('Error with Elasticsearch results', 'RLNTXAR', userId);
				if (this.checkESResultsEmpty(esResults)) { this.logger.warn("Search has no hits") }
				return { totalCount: 0, docs: [] };
			}
	
		} catch (err) {
			const msg = (err && err.message) ? `${err.message}` : `${err}`;
			this.logger.error(msg, 'U1EIAR2', userId);
			throw msg;
		}
	
	}

	async documentSearch(req, body, clientObj, userId) {
		try {
			const {
				getIdList,
				selectedDocuments,
				expansionDict = {},
				forGraphCache = false,
				searchType
			} = body;
			const [parsedQuery, searchTerms] = this.getEsSearchTerms(body);
			body.searchTerms = searchTerms;
			body.parsedQuery = parsedQuery;
	
			let { esClientName, esIndex } = clientObj;
			let esQuery = '';
			if (esQuery === '') {
				if (forGraphCache) {
					esQuery = this.getElasticsearchQueryForGraphCache(body, userId);
				} else {
					esQuery = this.getElasticsearchQuery(body, userId);
				}
			}

			const results = await this.dataLibrary.queryElasticSearch(esClientName, esIndex, esQuery, userId);
			if (results && results.body && results.body.hits && results.body.hits.total && results.body.hits.total.value && results.body.hits.total.value > 0) {
	
				if (getIdList) {
					return this.cleanUpIdEsResults(results, searchTerms, userId, expansionDict);
				}
	
				if (forGraphCache){
					return this.cleanUpIdEsResultsForGraphCache(results, userId);
				} else {
					return this.cleanUpEsResults(results, searchTerms, userId, selectedDocuments, expansionDict, esIndex, esQuery);
				}
			} else {
				this.logger.error('Error with Elasticsearch results', 'MKZMJXD', userId);
				if (this.checkESResultsEmpty(results)) { this.logger.warn("Search has no hits") }

				return { totalCount: 0, docs: [], expansionDict: expansionDict ? expansionDict : {} };
			}
		} catch (e) {
			const { message } = e;
			this.logger.error(message, 'WBJNDK3', userId);
			throw e;
		}
		
		
	}
	
	getEntityQuery(searchText, offset = 0, limit = 6) {
		try {
			let query = {
				from: offset,
				size: limit,
					query: {
						bool: {
							should: [
								{
								match_phrase: {
									'name': {
										query: searchText,
										slop: 2,
										boost: 0.5
									}
								}
							},
							{
								match_phrase: {
									'aliases.name': {
										query: searchText,
										slop: 2,
										boost: 0.5
									}
								}
							},
							{
								multi_match: {
									fields: ['name', 'aliases.name'],
									query: searchText,
									type: 'phrase_prefix'
								}
						}
						],
						must_not: [ {term: {"entity_type.keyword": "topic"}} ]
						}
					}
				};
			return query;
			} catch (err) {
				this.logger.error(err, 'JAEIWMF', '');
			}
	}

	getTopicQuery(searchText, offset = 0, limit = 6) {
			try {
				let query = {
					from: offset,
					size: limit,
						query: {
							bool: {
								must: [ { match_phrase: { 'name': searchText } } ],
								filter: [ { term: { 'entity_type.keyword': 'topic'}}]
							}
						}
					};
				return query;
				} catch (err) {
					this.logger.error(err, 'YTP3YF0', '');
				}
	}

	getESClient(cloneName, permissions){
		let esClientName = 'gamechanger';
		let esIndex = 'gamechanger';

		switch (cloneName) {
			case 'eda':
				if (permissions.includes('View EDA') || permissions.includes('Webapp Super Admin')){
					esClientName = 'eda';
					esIndex = this.constants.EDA_ELASTIC_SEARCH_OPTS.index;
				} else {
					throw 'Unauthorized';
				}
				break;
			default:
				esClientName = 'gamechanger';
		}

		return { esClientName, esIndex };
	}
	checkESResultsEmpty(results){
		if (results && results.body && results.body.hits) {
			if (results.body.hits.total.value == 0){
				return true
			}
			else { return false }
		}
		else {return false}
	}

	cleanNeo4jData(result, isTest, user) {
		const nodes = {};
		const nodeIds = [];
		const edgeIds = [];
		const edges = {};
		const labels = [];
		const nodeProperties = {};
		const relationships = [];
		const relProperties = {};
		const docIds = [];
		const graphMetaData = [];
		
		try {
			const addNode = (node) => {
				nodes[node.id] = node;
				if (nodeIds.indexOf(node.id) === -1) {
					nodeIds.push(node.id);
					if (labels.indexOf(node.label) === -1) {
						labels.push(node.label);
						nodeProperties[node.label] = node.properties;
					}
				}
			};

			const addEdge = (edge) => {
				try {
					edges[edge.id] = edge;
					if (edgeIds.indexOf(edge.id) === -1) {
						edgeIds.push(edge.id);
						if (relationships.indexOf(edge.label) === -1) {
							relationships.push(edge.label);
							relProperties[edge.label] = edge.properties;
						}
					}

					const tmpEdges = edgeIds.filter(edgeId => {
						if (edges[edgeId].source === edge.source && edges[edgeId].target === edge.target){
							return edgeId;
						}
					});

					const edgeCount = tmpEdges.length;
					const oddEdges = (edgeCount % 2 !== 0);
					tmpEdges.forEach((edgeId, index) => {
						if (oddEdges && index === 0){
							edges[edgeId].rotation = 0;
							edges[edgeId].curvature = 0;
						} else {
							edges[edgeId].rotation = Math.PI * (index / 6);
							edges[edgeId].curvature = (edgeCount / 10) * ((index % 2 !== 0) ? -1 : 1);
						}
					});
				} catch (err) {
					console.log(edge);
				}
			};

			result.records.forEach(record => {
				const recObj = record.toObject();

				if (recObj.hasOwnProperty('entityScore')) {
					const node = this.buildNodeVisObject(recObj.node, isTest, user);
					node.entityScore = recObj.entityScore;
					node.mentions = recObj.mentions.low;
					addNode(node);
				} else if (recObj.hasOwnProperty('topicScore')) {
					const node = this.buildNodeVisObject(recObj.node, isTest, user);
					node.topicScore = recObj.topicScore;
					addNode(node);
				} else if (recObj.hasOwnProperty('doc_id')) {
					docIds.push({doc_id: recObj.doc_id, mentions: recObj.mentions.low});
				} else if (recObj.hasOwnProperty('primary_key')) {
					graphMetaData.push({
						label: recObj.label,
						property: recObj.property,
						type: recObj.type,
						primary_key: recObj.primary_key
					});
				} else if (recObj.hasOwnProperty('relTypesCount')) {
					graphMetaData.push({
						relationship_counts: recObj.relTypesCount,
						node_counts: recObj.labels
					});
				} else if (recObj.hasOwnProperty('topic')) {
					addNode(this.buildNodeVisObject(recObj.topic, isTest, user));
					nodeProperties.documentCountsForTopic = recObj.documentCountsForTopic;
				} else if (recObj.hasOwnProperty('topic_name')) {
					recObj.doc_count = recObj.doc_count.low;
					graphMetaData.push(recObj);
				} else if (recObj.hasOwnProperty('doc_count')) {
					graphMetaData.push({
						documents: recObj.doc_count.low
					});
				} else {
					Object.values(recObj).map(async (v) => {
						const recType = this.getNeo4jType(v, isTest);
						if (recType === 'Node') {
							addNode(this.buildNodeVisObject(v, isTest, user));
						} else if (recType === 'Relationship') {
							addEdge(this.buildEdgeVisObject(v, isTest, user));
						} else if (recType === 'Path') {
							addNode(this.buildNodeVisObject(v.start, isTest, user));
							addNode(this.buildNodeVisObject(v.end, isTest, user));

							for (let obj of v.segments) {
								addNode(this.buildNodeVisObject(obj.start, isTest, user));
								addNode(this.buildNodeVisObject(obj.end, isTest, user));
								addEdge(this.buildEdgeVisObject(obj.relationship, isTest, user));
							}
						} else if (recType === 'Array') {
							for (let obj of v) {
								const recType = this.getNeo4jType(obj, isTest);
								if (recType === 'Node') {
									addNode(this.buildNodeVisObject(obj, isTest, user));
								} else if (recType === 'Relationship') {
									addEdge(this.buildEdgeVisObject(obj, isTest, user));
								}
							}
						} else {
							if (v !== null) {
								console.log(v);
							}
						}
					});
				}
			});

			if (docIds.length > 0) {
				return { doc_ids: docIds };
			} else if (graphMetaData.length > 0) {
				return { graph_metadata: graphMetaData };
			} else if (Object.keys(nodes).length <= 0 && result.records[0]){
				const record = result.records[0].toObject();
				Object.keys(record).forEach(key => {
					if (record[key].hasOwnProperty('low')) {
						record[key] = record[key].low;
					}
				});
				return {...record};
			}
			
			const pr = require('pagerank.js');
			const rtnEdges = Object.values(edges);
			const rtnNodes = Object.values(nodes);
			const idToPRMap = {};

			pr.reset();

			rtnEdges.forEach(edge => {
				pr.link(edge.source, edge.target, 1.0);
			});

			pr.rank(0.85, 0.000001, function (node, rank) {
				idToPRMap[node] = rank;
			});

			rtnNodes.forEach(node => {
				node.pageRank = idToPRMap[node.id] || 1;
			});

			return { nodes: Object.values(nodes), edges: Object.values(edges), labels, relationships, nodeProperties, relProperties };

		} catch (err) {
			this.logger.error(err, '193UPTH', user);
			return { nodes: Object.values(nodes), edges: Object.values(edges), labels, relationships, nodeProperties, relProperties };
		}
	}

	buildNodeVisObject(neo4jNode, isTest, user) {
		let node = {};
		try {

			let label = neo4jNode.labels[0];

			node.id = !isTest ? neo4jNode.identity.toInt() : neo4jNode.identity.low;
			node.label = label;

			const title_properties = Object.keys(neo4jNode.properties);
			node.properties = [];

			for (const key of title_properties) {
				if (neo4jNode.properties.hasOwnProperty(key)) {
					if (!isTest && neo4jLib.isInt(neo4jNode.properties[key])){
						node[key] = neo4jNode.properties[key].toNumber();
					} else if (isTest && neo4jNode.properties[key] && neo4jNode.properties[key].hasOwnProperty('low')) {
						node[key] = neo4jNode.properties[key].low;
					} else {
						node[key] = neo4jNode.properties[key];
					}
					node.properties.push(key);
				}
			}

			if (!node.hasOwnProperty('value')) node.value = 1;

		} catch (err) {
			this.logger.error(err, 'BSCU681', user);
		}

		return node;
	}

	buildEdgeVisObject(neo4jRel, isTest, user) {
		let edge = {};

		try {
			edge.id = !isTest ? neo4jRel.identity.toInt() : neo4jRel.identity.low;
			edge.source = !isTest ? neo4jRel.start.toInt() : neo4jRel.start.low;
			edge.target = !isTest ? neo4jRel.end.toInt() : neo4jRel.end.low;
			edge.label = neo4jRel.type;

			const title_properties = Object.keys(neo4jRel.properties);
			edge.properties = [];

			for (const key of title_properties) {
				if (neo4jRel.properties.hasOwnProperty(key)) {
					if (!isTest && neo4jLib.isInt(neo4jRel.properties[key])){
						edge[key] = neo4jRel.properties[key].toNumber();
					} else if (isTest && neo4jRel.properties[key] && neo4jRel.properties[key].hasOwnProperty('low')) {
						edge[key] = neo4jRel.properties[key].low;
					} else {
						edge[key] = neo4jRel.properties[key];
					}
					edge.properties.push(key);
				}
			}

			if (!edge.hasOwnProperty('value')) edge.value = 1;
		} catch (err) {
			this.logger.error(err, 'UPKARU0', user);
		}

		return edge;
	}

	getNeo4jType(v, isTest) {

		if (v === null) return false;

		if (isTest) {
			const keys = Object.keys(v);
			if (keys.includes('identity') && keys.includes('labels') && keys.includes('properties')) return 'Node';
			else if (keys.includes('identity') && keys.includes('start') && keys.includes('end') && keys.includes('type') && keys.includes('properties')) return 'Relationship';
			else if (keys.includes('start') && keys.includes('end') && keys.includes('segments')) return 'Path';
			else if (v instanceof Array) return 'Array';
			else return false;
		} else {
			if (v instanceof neo4jLib.types.Node) return 'Node';
			else if (v instanceof neo4jLib.types.Relationship) return 'Relationship';
			else if (v instanceof neo4jLib.types.Path) return 'Path';
			else if (v instanceof Array) return 'Array';
			else return false;
		}
	}

	isQuestion(searchText){
		const questionWords = ['who', 'what', 'where', 'when', 'how', 'why', 'can', 'may', 'will', 'won\'t', 'does', 'doesn\'t'];
		const searchTextList = searchText.toLowerCase().trim().split(/\s|\b/);
		const question = questionWords.find(item => item === searchTextList[0]) !== undefined || searchTextList[searchTextList.length - 1] === '?';
	return question;
	}

}

module.exports = SearchUtility;
