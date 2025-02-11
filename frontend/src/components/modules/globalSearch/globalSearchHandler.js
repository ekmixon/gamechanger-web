import _ from "lodash";

import {
	getQueryVariable,
	getTrackingNameForFactory,
	PAGE_DISPLAYED, RECENT_SEARCH_LIMIT, RESULTS_PER_PAGE
} from "../../../gamechangerUtils";
import { trackSearch } from "../../telemetry/Matomo";
import {
	checkUserInfo,
	createTinyUrl,
	getUserData,
	isDecoupled,
	setState,
} from "../../../sharedFunctions";
import GameChangerAPI from "../../api/gameChanger-service-api";

const gameChangerAPI = new GameChangerAPI();

const GlobalSearchHandler = {
	async handleSearch(state, dispatch) {
		setState(dispatch, {runSearch: false});
		
		const {
			searchText = "",
			resultsPage,
			listView,
			userData,
			searchSettings,
			tabName,
			cloneData,
			showTutorial,
			selectedCategories
		} = state;
		
		if (isDecoupled && userData && userData.search_history && userData.search_history.length > 9) {
			if (checkUserInfo(state, dispatch)) {
				return;
			}
		}
		
		const favSearchUrls = userData.favorite_searches.map(search => {
			return search.url;
		});
		
		this.setSearchURL(state);
		
		let url = window.location.hash.toString();
		url = url.replace("#/", "");
		
		const searchFavorite = favSearchUrls.includes(url);
		
		setState(dispatch, {
			isFavoriteSearch: searchFavorite,
			runningSearch: true,
			expansionDict: {},
			isDataTracker: false,
			isCachedResult: false,
			pageDisplayed: PAGE_DISPLAYED.main,
			trending: ''
		});
		
		const trimmed = searchText.trim();
		if (_.isEmpty(trimmed)) return;
		
		const recentSearches = localStorage.getItem(`recent${cloneData.clone_name}Searches`) || '[]';
		const recentSearchesParsed = JSON.parse(recentSearches);
	
		if (!recentSearchesParsed.includes(searchText)) {
			recentSearchesParsed.unshift(searchText);
			if (recentSearchesParsed.length === RECENT_SEARCH_LIMIT) recentSearchesParsed.pop();
			localStorage.setItem(`recent${cloneData.clone_name}Searches`, JSON.stringify(recentSearchesParsed));
		}
		
		const t0 = new Date().getTime();
	
		let searchResults = [];
		
		setState(dispatch, {
			selectedDocuments: new Map(),
			loading: true,
			metricsLoading: true,
			noResultsMessage: null,
			autocompleteItems: [],
			rawSearchResults: [],
			docSearchResults: [],
			searchResultsCount: 0,
			count: 0,
			resultsDownloadURL: '',
			timeFound: 0.0,
			iframePreviewLink: null,
			graph: { nodes: [], edges: [] },
			runningSearch: true,
			showFullGraph: false,
			docTypeData: {},
			runningEntitySearch: true,
			runningTopicSearch: true,
			hideTabs: true
		});
		
		const offset = ((resultsPage - 1) * RESULTS_PER_PAGE)
	
		const charsPadding = listView ? 750 : 90;
	
		const useGCCache = JSON.parse(localStorage.getItem('useGCCache'));
	
		const tiny_url = await createTinyUrl(cloneData);
		
		const categoryMetadata =
			{
				Applications: {total: 0},
				Dashboards: {total: 0},
				DataSources: {total: 0},
				Databases: {total: 0},
				Documentation: {total: 0},
				Organizations: {total: 0},
				Services: {total: 0},
			};
		
		try {
			
			// Make the global search calls
			let totalCount = 0;
			
			try {
				const {data} = await gameChangerAPI.modularSearch({
					cloneName: cloneData.clone_name,
					searchText: searchText,
					offset,
					options: {
						charsPadding,
						showTutorial,
						useGCCache,
						tiny_url,
						getApplications: selectedCategories.Applications,
						getDashboards: selectedCategories.Dashboards,
						getDataSources: selectedCategories.DataSources,
						getDatabases: selectedCategories.Databases
					},
				});
				
				
				
				data.applications.hits.forEach(hit => {
					hit.type = 'application';
					searchResults.push(hit);
				})
				totalCount += data.applications.totalCount;
				categoryMetadata.Applications.total = data.applications.totalCount || 0;
				
				data.dashboards.hits.forEach(hit => {
					hit.type = 'dashboard';
					searchResults.push(hit);
				})
				totalCount += data.dashboards.totalCount;
				categoryMetadata.Dashboards.total = data.dashboards.totalCount || 0;
				
				data.dataSources.results.forEach(hit => {
					hit.type = 'dataSource';
					searchResults.push(hit);
				})
				totalCount += data.dataSources.total;
				categoryMetadata.DataSources.total = data.dataSources.total || 0;
				
				data.databases.results.forEach(hit => {
					hit.type = 'database';
					searchResults.push(hit);
				})
				totalCount += data.databases.total;
				categoryMetadata.Databases.total = data.databases.total || 0;
				console.log(data)
			} catch (err) {
				console.error(err);
			}
			
			const t1 = new Date().getTime();
			
			let getUserDataFlag = true;
	
			if (searchResults && searchResults.length > 0) {
				
				if (!offset) {
					trackSearch(
						searchText,
						`${getTrackingNameForFactory(cloneData.clone_name)}`,
						totalCount,
						false
					);
				}

				setState(dispatch, {
					timeFound: ((t1 - t0) / 1000).toFixed(2),
					prevSearchText: searchText,
					loading: false,
					count: totalCount,
					rawSearchResults: searchResults,
					searchResultsCount: searchResults.length,
					autocompleteItems: [],
					isCachedResult: false,
					metricsLoading: false,
					metricsCounted: true,
					loadingTinyUrl: false,
					hideTabs: false,
					categoryMetadata
				});
				
			} else {
				if (!offset) {
					trackSearch(
						searchText,
						`${getTrackingNameForFactory(cloneData.clone_name)}`,
						0,
						false
					);
				}
				
				setState(dispatch, {
					loading: false,
					count: 0,
					rawSearchResults: [],
					docSearchResults: [],
					searchResultsCount: 0,
					runningSearch: false,
					prevSearchText: searchText,
					isCachedResult: false,
					loadingTinyUrl: false,
					hasExpansionTerms: false
				});
			}
	
			this.setSearchURL({...state, searchText, resultsPage, tabName, cloneData, searchSettings});
	
			if (getUserDataFlag) {
				getUserData(dispatch);
			}
	
		} catch(e) {
			console.log(e);
			setState(dispatch, {
				prevSearchText: null,
				unauthorizedError: true,
				loading: false,
				autocompleteItems: [],
				searchResultsCount: 0,
				runningSearch: false,
				loadingTinyUrl: false,
				hasExpansionTerms: false
			});
		}
	},

	parseSearchURL(defaultState, url) {
		if (!url) url = window.location.href;

		const parsed = {};

		const keyword = getQueryVariable("keyword", url);
		const categoriesURL = getQueryVariable("categories", url);

		if (keyword) {
			parsed.searchText = keyword;
		}

		if (categoriesURL) {
			const categories = categoriesURL.split("_");
			const selectedCategories = _.cloneDeep(defaultState.selectedCategories || {});
			for (const category in selectedCategories) {
				selectedCategories[category] = categories.includes(category);
			}
			if (!_.isEmpty(selectedCategories)) {
				parsed.selectedCategories = selectedCategories;
			}
		}

		return parsed;
	},

	setSearchURL(state) {
		const { searchText,  resultsPage } = state;
		const offset = ((resultsPage - 1) * RESULTS_PER_PAGE);

		const categoriesText = (state.selectedCategories
			? Object.keys(_.pickBy(state.selectedCategories, value => !!value)).join('_')
			: undefined);

		const params = new URLSearchParams();
		if (searchText) params.append('keyword', searchText);
		if (offset) params.append('offset', String(offset)); // 0 is default
		if (categoriesText !== undefined) params.append('categories', categoriesText); // '' is different than undefined

		const linkString = `/#/${state.cloneData.url.toLowerCase()}?${params}`;

		window.history.pushState(null, document.title, linkString);
	},
};

export default GlobalSearchHandler;
