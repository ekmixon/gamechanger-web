import React, { useReducer } from 'react';
import {orgFilters, typeFilters} from "../../../gamechangerUtils";

const initState = {
	cloneDataSet: false,
	cloneData: {
		clone_name: 'gamechanger',
		search_module: 'policy/policySearchHandler',
		export_module: 'simple/simpleExportHandler',
		title_bar_module: 'policy/policyTitleBarHandler',
		navigation_module: 'policy/policyNavigationHandler',
		card_module: 'policy/policyCardHandler',
		main_view_module: 'policy/policyMainViewHandler',
		display_name: 'GAMECHANGER',
		is_live: true,
		url: 'gamechanger',
		permissions_required: false,
		clone_to_advana: true,
		clone_togamchanger: true,
		clone_to_jupiter: true,
		clone_to_sipr: false,
		show_tutorial: true,
		show_graph: true,
		show_crowd_source: true,
		show_feedback: true,
		config: {esIndex: 'gamechanger'}
	},
	history: undefined,
	historySet: false,
	
	// Notifications
	notifications: [],
	notificationIds: [],
	alerts: {
		noResultsMessage: null,
		unauthorizedError: false,
		transformFailed: false,
	},
	
	// User
	userData: { favorite_searches: [], favorite_documents: [], favorite_topics: [], search_history: [], export_history: [], api_key:'' },
	newUser: false,
	userInfoModalOpen: false,
	userInfo: {
		email: '',
		org: '',
		q1: '',
		q2: ''
	},
	
	// Tutorial
	showTutorial: false,
	clickedTutorial: false,
	tutorialStepIndex: 0,
	componentStepNumbers: {},
	tutorialJoyrideSteps: [],
	
	// Show Modals
	showFeedbackModal: false,
	showAssistModal: false,
	assistVoluntary: true,
	loginModalOpen: false,
	showSnackbar: false,
	exportDialogVisible: false,
	showEsQueryDialog: false,
	showEsDocDialog: false,
	
	selectedDoc: {},
	
	loading: false,
	isResetting: false,
	documentProperties: [],
	pageDisplayed: 'main',
	listView: false,
	
	// Documents
	iframePreviewLink: null,
	detailViewId: 0,
	
	// Export
	selectedDocuments: new Map(),
	docsDrawerOpen: false,
	isSelectedDocs: false,
	isDrawerReady: false,
	
	// Navigation
	menuOpen: false,
	tabName: '',
	hideTabs: true,
	
	// Graph
	runGraphSearch: false,
	
	// SideBar
	sidebarDocTypes: [],
	sidebarOrgs: [],
	runningEntitySearch: false,
	metricsCounted: false,
	metricsLoading: false,
	entitiesForSearch: [],
	topicsForSearch: [],
	runningTopicSearch: false,
	showSideFilters: true,
	
	// Search
	offset: 0,
	esIndex: '',
	autoCompleteItems: [],
	didYouMean: '',
	timeSinceCache: 0,
	isCachedResult: false,
	transformFailed: false,
	timeFound: 0.0,
	hasExpansionTerms: false,
	noSearches: true,

	count: 0,
	resultsPage: 1,
	docsPagination: false,
	docsLoading: false,	

	entityCount: 0,
	entityPage: 1,
	entityPagination: false,
	entitiesLoading: false,

	topicCount: 0,
	topicPage: 1,
	topicPagination: false,
	topicsLoading: false,

	replaceResults: true,
	infiniteScrollPage: 1,

	searchText: '',
	prevSearchText: null,
	runSearch: false,
	runningSearch: false,
	expansionDict: {},
	rawSearchResults: [],
	docSearchResults: [],
	qaResults: {question: '', answers: []},
	qaContext: {params: {}, context: []},
	isFavoriteSearch: false,
	resetSettingsSwitch: false,
	snackBarMsg: '',
	searchSettings: {
		orgFilter: orgFilters,
		typeFilter: typeFilters,
		allOrgsSelected: true,
		searchFields: {'initial': {field: null, input: ''}},
		specificOrgsSelected: false,
		allTypesSelected: true,
		specificTypesSelected: false,
		publicationDateAllTime: true,
		publicationDateFilter: [null, null],
		accessDateFilter: [null, null],
		includeRevoked: false
	},

	// Categories
	selectedCategories: {
		Documents: true,
		Organizations: true,
		Topics: false
	},

	categorySorting: {
		Documents: ['Relevance','Publishing Date', 'Alphabetical', 'References']
	},
	currentSort: 'Relevance',
	currentOrder: 'desc',

	// category totals
	categoryMetadata: {},
	activeCategoryTab: 'all'
};

const init = (initialState) => {
	return initialState;
};

const handleSetAlert = (state, action) => {
	const alerts = {
		...state.alerts,
		...action.payload
	}
	return {
		...state,
		alerts
	};
}

const handleSetMultipleStates = (state, action) => {
	return {
		...state,
		...action.payload
	}
}

function reducer(state, action) {
	switch (action.type) {
		case 'SET_STATE':
			return handleSetMultipleStates(state, action);
		case 'SET_ALERT':
			return handleSetAlert(state, action);
		case 'SET_EXPORT_DIALOG_VISIBLE':
			return {
				...state,
				exportDialogVisible: action.payload,
				isSelectedDocs: action.payload
			};
		case 'RESET_SEARCH_SETTINGS':
			return {
				...state,
				searchSettings: initState.searchSettings
			};
		case 'RESET_STATE':
			window.location.href = `#/${state.cloneData.url}`;
			return {
				...initState,
				searchSettings: state.searchSettings,
				componentStepNumbers: state.componentStepNumbers,
				tutorialJoyrideSteps: state.tutorialJoyrideSteps,
				userData: state.userData,
				documentProperties: state.documentProperties
			};
		default:
			return state;
	}
}

const PolicyContext = React.createContext(initState);

const PolicyProvider = React.memo((props) => {
	const [state, dispatch] = useReducer(reducer, initState, init);
	
	return (
		<PolicyContext.Provider value={{state, dispatch}}>
			{props.children}
		</PolicyContext.Provider>
	);
});

export { PolicyContext, PolicyProvider };
