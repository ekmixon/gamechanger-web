import React from "react";
import _ from "lodash";

import GameChangerSearchMatrix from "../../searchMetrics/GCSearchMatrix";
import { trackEvent } from "../../telemetry/Matomo";
import { setState } from "../../../sharedFunctions";
import SearchSection from "../globalSearch/SearchSection";
import LoadingIndicator from "advana-platform-ui/dist/loading/LoadingIndicator";
import { backgroundWhite, gcOrange } from "../../common/gc-colors";
import { Card } from "../../cards/GCCard";
import Pagination from "react-js-pagination";
import {
	getTrackingNameForFactory,
	RESULTS_PER_PAGE,
	StyledCenterContainer,
} from "../../../gamechangerUtils";
import { Typography } from '@material-ui/core';
import '../../../containers/gamechanger.css';
import ResultView from "../../mainView/ResultView";
import AppsIcon from '@material-ui/icons/Apps';
import ListIcon from '@material-ui/icons/List';
import GCButton from "../../common/GCButton";

const fullWidthCentered = {
	width: "100%",
	display: "flex",
	flexDirection: "column",
	justifyContent: "center",
	alignItems: "center"
};

const styles = {
	listViewBtn: {
		minWidth: 0,
		margin: '20px 0px 0px',
		marginLeft: 10,
		padding: '0px 7px 0',
		fontSize: 20,
		height: 34
	},
	cachedResultIcon: {
		display: 'flex',
		justifyContent: 'center',
		padding: '0 0 1% 0'
	},
	searchResults: fullWidthCentered,
	paginationWrapper: fullWidthCentered,
	tabContainer: {
		alignItems: 'center',
		marginBottom: '14px',
		height: '600px',
		margin: '0px 4% 0 65px'
	},
	tabButtonContainer: {
		width: '100%',
		padding: '0em 1em',
		alignItems: 'center'
	},
	spacer: {
		flex: '0.375'
	},
	showingResultsRow: {
		width: '100%',
		display: 'inline-flex',
		justifyContent: 'space-between',
		marginBottom: 15,
		marginTop: 10
	},
	container: {
		minWidth: 148
	},
	text: {
		margin: 'auto 0px'
	},
	buttons: {
		height: 50,
		width: 64,
		margin: '0px 5px',
		minWidth: 64
	},
	unselectedButton: {
		border: 'solid 2px #DFE6EE',
		color: '#8091A5'
	},
	icon: {
		fontSize: 30
	}
}

const getViewHeader = (state, dispatch) => {
	return (
		<div style={styles.showingResultsRow}>
			<div>
				{state.searchText && !_.isEmpty(state.categoryMetadata) &&
					<Typography variant="h3" style={styles.text}>
						{_.sum(_.map(Object.values(state.categoryMetadata), 'total')) ?
							'Showing results for ' :
							"Looks like we don't have any matches for "
						}
						<b>{state.searchText}</b>
					</Typography>
				}
			</div>
			<div className={`tutorial-step-${state.componentStepNumbers["Tile Buttons"]}`}>
				<div style={styles.container}>
					<GCButton
						onClick={() => setState(dispatch, {listView: false})}
						style={{
							...styles.buttons,
							...(!state.listView ? styles.unselectedButton : {})
						}}
						textStyle={{color: !state.listView ? backgroundWhite : '#8091A5'}}
						buttonColor={!state.listView ? gcOrange : backgroundWhite}
						borderColor={!state.listView ? gcOrange : '#B0B9BE'}
					>
						<div style={{marginTop: 5}}>
							<AppsIcon style={styles.icon} />
						</div>
						
					</GCButton>
		
					<GCButton
						onClick={() => setState(dispatch, {listView: true})}
						style={{
							...styles.buttons,
							...(!state.listView ? {} : styles.unselectedButton)
						}}
						textStyle={{color: !state.listView ? '#8091A5' : backgroundWhite}}
						buttonColor={!state.listView ? backgroundWhite : gcOrange}
						borderColor={!state.listView ? '#B0B9BE' :  gcOrange}
					>
						<div style={{marginTop: 5}}>
							<ListIcon style={styles.icon} />
						</div>
					</GCButton>
				</div>
			</div>
		</div>
	);
}

const getSearchResults = (searchResultData, state, dispatch) => {
	return _.map(searchResultData, (item, idx) => {
		return (
			<Card key={idx}
				item={item}
				idx={idx}
				state={state}
				dispatch={dispatch}
			/>
		);
	});
}


const GlobalSearchMainViewHandler = {
	async handlePageLoad(props) {
		const {
			state,
			dispatch,
			searchHandler,
		} = props;

		const parsedURL = searchHandler.parseSearchURL(state);
		if (parsedURL.searchText) {
			const newState = { ...state, ...parsedURL, runSearch: true };
			setState(dispatch, newState);
			
			searchHandler.setSearchURL(newState);
		}
	},
	
	getMainView(props) {
		const {
			state,
			dispatch,
			pageLoaded,
			getViewPanels
		} = props;
		
		const {loading, rawSearchResults, viewNames} = state;
		
		const noResults = Boolean(rawSearchResults?.length === 0);
		const hideSearchResults = noResults && !loading;
		
		return(
			<div style={styles.tabButtonContainer}>
				<div key={'cardView'}>
					<div key={'cardView'} style={{marginTop: 'auto'}}>
						<div>
							<div id="game-changer-content-top"/>
							<StyledCenterContainer showSideFilters={state.showSideFilters}>
								<div className={'left-container'}>
										<div className={'side-bar-container'}>
											<GameChangerSearchMatrix context={{state, dispatch}} />
										</div>
								</div>
								<div className={'right-container'}>
										{loading &&
											<div style={{ margin: '0 auto' }}>
												<LoadingIndicator customColor={gcOrange} containerStyle={{paddingTop: 100}} />
											</div>
										}
										{(!hideSearchResults && pageLoaded) &&
											<>
												{!loading && getViewHeader(state, dispatch)}
												<ResultView context={{state, dispatch}} viewNames={viewNames} viewPanels={getViewPanels()} />
												<div style={styles.spacer} />
											</>
										}
								</div>
							</StyledCenterContainer>
						</div>
					</div>
				</div>
			</div>
		)
	},
	
	handleCategoryTabChange(props) {
		const {
			tabName,
			dispatch
		} = props;
		
		setState(dispatch,{activeCategoryTab:tabName, resultsPage: 1});
	},
	
	getViewNames(props) {
		return [];
	},
	
	getExtraViewPanels(props) {
		return [];
	},

	getCardViewPanel(props) {
		const { context } = props;
		const { state, dispatch } = context;
		const { 
			activeCategoryTab,
			componentStepNumbers,
			iframePreviewLink,
			selectedCategories,
			rawSearchResults,
			applicationsPage,
			dashboardsPage,
			dataSourcesPage,
			databasesPage
		} = state;
		
		const applications = rawSearchResults.filter(result => {
			return result.type === 'application';
		});
		
		const dashboards = rawSearchResults.filter(result => {
			return result.type === 'dashboard';
		});
		
		const dataSources = rawSearchResults.filter(result => {
			return result.type === 'dataSource';
		});
		
		const databases = rawSearchResults.filter(result => {
			return result.type === 'database';
		});
		
		let sideScroll = {
			height: '72vh'
		}
		if (!iframePreviewLink) sideScroll = {};

		return (
			<div className={`row tutorial-step-${componentStepNumbers["Search Results Section"]} card-container`} style={{marginTop: 0}}>
				<div className={"col-xs-12"} style={{...sideScroll, padding: 0}}>
					{/*{!loading && (activeCategoryTab === 'Applications' || activeCategoryTab === 'All') && selectedCategories['Applications'] &&*/}
					{/*	<div className={"col-xs-12"} style={{marginTop: 10, marginLeft: 0, marginRight: 0}}>*/}
					{/*		<SearchSection*/}
					{/*			section={'Applications'}*/}
					{/*			color={'#131E43'}*/}
					{/*		>*/}
					{/*			{activeCategoryTab === 'All' ? <>*/}
					{/*				{!applicationsLoading ?*/}
					{/*					getSearchResults(applications, state, dispatch) :*/}
					{/*					<div className='col-xs-12'>*/}
					{/*						<LoadingIndicator customColor={gcOrange} />*/}
					{/*					</div>*/}
					{/*				}*/}
					{/*				<div className='gcPagination col-xs-12 text-center'>*/}
					{/*					<Pagination*/}
					{/*						activePage={applicationsPage}*/}
					{/*						itemsCountPerPage={RESULTS_PER_PAGE}*/}
					{/*						totalItemsCount={applications.length}*/}
					{/*						pageRangeDisplayed={8}*/}
					{/*						onChange={async page => {*/}
					{/*							trackEvent(getTrackingNameForFactory(state.cloneData.clone_name), 'PaginationChanged', 'page', page);*/}
					{/*							setState(dispatch, { applicationsLoading: true, applicationsPage: page, applicationsPagination: true });*/}
					{/*						}}/>*/}
					
					{/*				</div>*/}
					{/*				</>*/}
					{/*				:*/}
					{/*				<>*/}
					{/*					{*/}
					{/*						getSearchResults(applications, state, dispatch)*/}
					{/*				*/}
					{/*					}*/}
					{/*					{*/}
					{/*						applicationsPagination && <div className='col-xs-12'>*/}
					{/*							<LoadingIndicator customColor={gcOrange} containerStyle={{margin:'-100px auto'}}/>*/}
					{/*						</div>*/}
					{/*					}*/}
					{/*				</>*/}
					{/*			}*/}
					{/*		</SearchSection>*/}
					{/*	</div>*/}
					{/*}*/}
					
					{applications && applications.length > 0 && (activeCategoryTab === 'Applications' || activeCategoryTab === 'all') && selectedCategories['Applications'] &&
						<div className={"col-xs-12"} style={{marginTop: 10, marginLeft: 0, marginRight: 0}}>
							<SearchSection
							section={'Applications'}
							color={'rgb(50, 18, 77)'}
							>
								{getSearchResults(applications, state, dispatch)}
								<div className='gcPagination col-xs-12 text-center'>
									<Pagination
										activePage={applicationsPage}
										itemsCountPerPage={RESULTS_PER_PAGE}
										totalItemsCount={applications.length}
										pageRangeDisplayed={8}
										onChange={async page => {
											trackEvent(getTrackingNameForFactory(state.cloneData.clone_name), 'PaginationChanged', 'page', page);
											setState(dispatch, {applicationsLoading: true, applicationsPage: page, applicationsPagination: true });
										}}/>
								</div>
							</SearchSection>
						</div>
					}
					
					{dashboards && dashboards.length > 0 && (activeCategoryTab === 'Dashboards' || activeCategoryTab === 'all') && selectedCategories['Dashboards'] &&
						<div className={"col-xs-12"} style={{marginTop: 10, marginLeft: 0, marginRight: 0}}>
							<SearchSection
							section={'Dashboards'}
							color={'rgb(11, 167, 146)'}
							>
								{getSearchResults(dashboards, state, dispatch)}
								<div className='gcPagination col-xs-12 text-center'>
									<Pagination
										activePage={dashboardsPage}
										itemsCountPerPage={RESULTS_PER_PAGE}
										totalItemsCount={dashboards.length}
										pageRangeDisplayed={8}
										onChange={async page => {
											trackEvent(getTrackingNameForFactory(state.cloneData.clone_name), 'PaginationChanged', 'page', page);
											setState(dispatch, {dashboardsLoading: true, dashboardsPage: page, dashboardsPagination: true });
										}}/>
								</div>
							</SearchSection>
						</div>
					}
					
					{dataSources && dataSources.length > 0 && (activeCategoryTab === 'DataSources' || activeCategoryTab === 'all') && selectedCategories['DataSources'] &&
						<div className={"col-xs-12"} style={{marginTop: 10, marginLeft: 0, marginRight: 0}}>
							<SearchSection
							section={'Data Sources'}
							color={'rgb(5, 159, 217)'}
							>
								{getSearchResults(dataSources, state, dispatch)}
								<div className='gcPagination col-xs-12 text-center'>
									<Pagination
										activePage={dataSourcesPage}
										itemsCountPerPage={RESULTS_PER_PAGE}
										totalItemsCount={dataSources.length}
										pageRangeDisplayed={8}
										onChange={async page => {
											trackEvent(getTrackingNameForFactory(state.cloneData.clone_name), 'PaginationChanged', 'page', page);
											setState(dispatch, {dataSourcesLoading: true, dataSourcesPage: page, dataSourcesPagination: true });
										}}/>
								</div>
							</SearchSection>
						</div>
					}

					{databases && databases.length > 0 && (activeCategoryTab === 'Databases' || activeCategoryTab === 'all') && selectedCategories['Databases'] &&
						<div className={"col-xs-12"} style={{marginTop: 10, marginLeft: 0, marginRight: 0}}>
							<SearchSection
							section={'Databases'}
							color={'rgb(233, 105, 29)'}
							>
								{getSearchResults(databases, state, dispatch)}
								<div className='gcPagination col-xs-12 text-center'>
									<Pagination
										activePage={databasesPage}
										itemsCountPerPage={RESULTS_PER_PAGE}
										totalItemsCount={databases.length}
										pageRangeDisplayed={8}
										onChange={async page => {
											trackEvent(getTrackingNameForFactory(state.cloneData.clone_name), 'PaginationChanged', 'page', page);
											setState(dispatch, {databasesLoading: true, databasesPage: page, databasesPagination: true });
										}}/>
								</div>
							</SearchSection>
						</div>
					}
				</div>
			</div>
		)
	}
}

export default GlobalSearchMainViewHandler;
