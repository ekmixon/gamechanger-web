import React, { useState } from 'react';
import PropTypes from 'prop-types';
import styled from 'styled-components';
import ReactTable from 'react-table';
import "react-table/react-table.css";
import { Tabs, Tab, TabPanel, TabList } from "react-tabs";
import { Typography } from "@material-ui/core";
import { backgroundGreyDark, backgroundWhite} from "../../components/common/gc-colors";
import { gcOrange} from "../../components/common/gc-colors";
import moment from 'moment'
import Link from "@material-ui/core/Link";
import FiberManualRecordIcon from '@material-ui/icons/FiberManualRecord';
import { green, red, yellow, orange } from '@material-ui/core/colors';

import GameChangerAPI from '../api/gameChanger-service-api';
import {MemoizedNodeCluster2D}  from "../graph/GraphNodeCluster2D";
import {getTrackingNameForFactory} from "../../gamechangerUtils";
import {trackEvent} from "../telemetry/Matomo";
import {crawlerMappingFunc} from "../../gamechangerUtils";

const TableRow = styled.div`
	text-align: left;
	height: 20px;
`
const CenterRow = styled.div`
	text-align: center;
	height: 20px;
`
const GoalsLabel = styled.div`
	margin: 0px 0px 20px 80px
`

const StyledNeo4jTable = styled.div`
	margin: -10px 80px 20px 80px;
	height: 690px;
	
	> .details-paragraph {
		margin-bottom: 10px;
		font-size: 16px;
		font-family: Montesserat;
	}
	
	> .columns {
		display: flex;
		
		> .left-column {
			width: 40%;
			margin-right: 10px;
		}
		
		> .right-column {
			width: 60%;
			
			> .graph-schema {
				border: 1px solid rgba(0,0,0,0.1);
			}
			
			> .node-rel-counts {
				margin-top: 10px;
			}
		}
	}
`

const gameChangerAPI = new GameChangerAPI();

const PAGE_SIZE = 20;

const nextFriday = new Date();    
nextFriday.setDate(nextFriday.getDate() + (5+(7-nextFriday.getDay())) % 7);
nextFriday.setUTCHours(11,0,0);


const preventDefault = (event) => event.preventDefault();


const neo4jPropertiesColumns = [
	{
		Header: 'Label',
		accessor: 'label',
		Cell: row => (
			<TableRow>
				{row.value}
			</TableRow>
		),
	},
	{
		Header: 'Property',
		accessor: 'property',
		Cell: row => (
			<TableRow>
				{row.value}
			</TableRow>
		),
	},
	{
		Header: 'Type',
		accessor: 'type',
		Cell: row => (
			<TableRow>
				{row.value}
			</TableRow>
		),
	},
	{
		Header: 'Primary Key',
		accessor: 'primary_key',
		Cell: row => (
			<TableRow>
				{row.value ? 'TRUE' : 'FALSE'}
			</TableRow>
		),
	}
]

const neo4jCountsColumns = [
	{
		Header: 'Node/RELATIONSHIP',
		accessor: 'name',
		Cell: row => (
			<TableRow>
				{row.value}
			</TableRow>
		),
	},
	{
		Header: 'Count',
		accessor: 'count',
		Cell: row => (
			<TableRow>
				{row.value}
			</TableRow>
		),
	}
]

const getData = async ({ limit = PAGE_SIZE, offset = 0, sorted = [], filtered = [], tabIndex = 'documents', option = 'all' }) => {

	const order = sorted.map(({ id, desc }) => ([id, desc ? 'DESC' : 'ASC']));
	const where = filtered.map(({ id, value }) => ({ [id]: { '$iLike': `%${value}%`} }));

	try {
		if (tabIndex === 'documents') {
			const data = await gameChangerAPI.getDataTrackerData({ limit, offset, order, where });
			if(data && data.data) {
				return data.data;
			} else {
				return [];
			}
		} else if (tabIndex === 'crawler') {
			const data = await gameChangerAPI.gcCrawlerTrackerData({ limit, offset, order, where, option });
			if(data && data.data) {
				return data.data;
			} else {
				return [];
			}
		} else if (tabIndex === 'version' ){
			const data = await gameChangerAPI.getBrowsingLibrary({ limit, offset });
			if(data && data.data) {
				return data.data;
			} else {
				return [];
			}
		}
	} catch (e) {
		return []
	}

}

const GCDataStatusTracker = (props) => {
	
	const {state} = props;
	
	const [dataTableData, setDataTableData] = useState([]);
	const [crawlerTableData, setCrawlerTableData] = useState([]);
	const [crawlerTableUpdate, setCrawlerTableUpdate] = useState([]);
	const [neo4jPropertiesData, setNeo4jPropertiesData] = useState([]);
	const [neo4jCountsData, setNeo4jCountsData] = useState([]);
	const [neo4jGraphData, setNeo4jGraphData] = useState({nodes: [], edges: []});
	const [loading, setLoading] = useState(true);
	const [loadingNeo4jPropertiesData, setLoadingNeo4jPropertiesData] = useState(true);
	const [loadingNeo4jGraphData, setLoadingNeo4jGraphData] = useState(true);
	const [loadingNeo4jCounts, setLoadingNeo4jCounts] = useState(true);
	const [numPages, setNumPages] = useState(0);
	const [tabIndex, setTabIndex] = useState('documents');

	const handleFetchData = async ({ page, sorted, filtered }) => {
		try {
			setLoading(true);
			const { totalCount, docs = []} = await getData({ offset: page *  PAGE_SIZE, sorted, filtered });
			const pageCount = Math.ceil(totalCount / PAGE_SIZE);
			setNumPages(pageCount);
			setDataTableData(docs);
		} catch (e) {
			setDataTableData([]);
			setNumPages(0);
			console.error(e)
		} finally {
			setLoading(false);
		}
	}

	const handleFetchCrawlerData = async ({ page, sorted, filtered }) => {
		try {
			setLoading(true);
			const { totalCount, docs = []}  = await getData({ offset: page *  PAGE_SIZE, sorted, filtered, tabIndex:'crawler', option:'status' });
			const pageCount = Math.ceil(totalCount / PAGE_SIZE);
			setNumPages(pageCount);
			setCrawlerTableData(docs);
		}
		catch (e) {
			setCrawlerTableData([]);
			setNumPages(0);
			console.error(e)
		} finally {
			setLoading(false);
		}
	}

	const handleFetchCrawlerUpdate = async ({ page, sorted, filtered }) => {
		try {
			setLoading(true);
			const { totalCount, docs = []}  = await getData({ offset: page *  PAGE_SIZE, sorted, filtered, tabIndex:'crawler', option:'last' });
			const pageCount = Math.ceil(totalCount / PAGE_SIZE);
			setNumPages(pageCount);
			setCrawlerTableUpdate(docs);
		}
		catch (e) {
			setCrawlerTableUpdate([]);
			setNumPages(0);
			console.error(e)
		} finally {
			setLoading(false);
		}
	}

	const handleGetNeo4jData = async () => {
		setLoading(true);
		setLoadingNeo4jPropertiesData(true);
		setLoadingNeo4jCounts(true);
		gameChangerAPI.graphQueryPOST(
				'CALL apoc.meta.schema() YIELD value as schemaMap ' +
					'UNWIND keys(schemaMap) as label ' +
					'WITH label, schemaMap[label] as data ' +
					'WHERE data.type = "node" OR data.type = "relationship" ' +
					'UNWIND keys(data.properties) as property ' +
					'WITH label, property, data.properties[property] as propData ' +
					'RETURN label, ' +
					'property, ' +
					'propData.type as type, ' +
					'propData.indexed as primary_key;', '25QQM71', state.cloneData.clone_name, {}
		).then(resp => {
			setNeo4jPropertiesData(resp.data.graph_metadata || []);
			setLoadingNeo4jPropertiesData(false);
		});
		
		gameChangerAPI.graphQueryPOST(
			'call apoc.meta.graph', '5HVIT3C', state.cloneData.clone_name, {}
		).then(resp => {
			const edges = [];
			const nodes = resp.data.nodes;
			
			const usedIds = [];
			
			resp.data.edges.forEach(edge => {
				if (edge.source === edge.target) {
					const sourceNode = nodes.filter(node => {
						return node.id === edge.source;
					})[0];
					const targetNode = {};
					Object.keys(sourceNode).forEach(key => {
						if (key === 'id') {
							let newId = -sourceNode.id;
							while (usedIds.includes(newId)) {
								newId += 1;
							}
							usedIds.push(newId);
							targetNode.id = newId;
						} else {
							targetNode[key] = sourceNode[key];
						}
					})
					
					nodes.push(targetNode);
					edge.target = targetNode.id;
				} else {
					usedIds.push(edge.source);
					usedIds.push(edge.target);
				}
				
				edges.push(edge);
			})
			setNeo4jGraphData({nodes, edges});
			setLoadingNeo4jGraphData(false);
		});
		
		gameChangerAPI.graphQueryPOST(
			'CALL apoc.meta.stats() YIELD labels, relTypesCount', 'IJYSAEM00', state.cloneData.clone_name, {}).then(resp => {
				const metaData = resp.data.graph_metadata[0] || {};
				const countsTableData = [];
				
				Object.keys(metaData.node_counts).forEach(countKey => {
					countsTableData.push({
						name: countKey,
						count: metaData.node_counts[countKey].low
					});
				});
				Object.keys(metaData.relationship_counts).forEach(countKey => {
					countsTableData.push({
						name: countKey,
						count: metaData.relationship_counts[countKey].low
					});
				});
				setNeo4jCountsData(countsTableData);
				setLoadingNeo4jCounts(false);
		});
	}

	const handleTabClicked = (tabIndex) => {
		trackEvent(getTrackingNameForFactory(state.cloneData.clone_name), 'DataStatusTracker' , tabIndex);
		setTabIndex(tabIndex);
		if (tabIndex === 'neo4j') {
			handleGetNeo4jData();
		}
	}

	const crawl_download = (status) => {
		if (status === 'Crawl and Download Complete' ||
			status === 'Ingest In Progress' ||
			status === 'Ingest Complete' ){
			return true
		}
		return false 
	}
	const ingest_progress = (status) => {
		if (
			status === 'Ingest In Progress' ||
			status === 'Ingest Complete' ){
			return true
		}
		return false
	}
	const ingest_complete = (status) => {
		if (
			status === 'Ingest Complete' ){
			return true
		} 
		return false
	}
	const date_difference = (date) => {
		const diffTime = Math.abs(Date.now() - date);
		return  Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
	}

	const goal_difference = (days) => {
		if (days > 30){
			return <FiberManualRecordIcon fontSize="large" style={{ color: red[500] }}/>
		}else if (days > 14){
			return <FiberManualRecordIcon fontSize="large" style={{ color: orange[500] }}/>
		}else if (days > 7){
			return <FiberManualRecordIcon fontSize="large" style={{ color: yellow[500] }}/>
		}else{
			return <FiberManualRecordIcon fontSize="large" style={{ color: green[500] }}/>
		}
	}

	const renderDataTable = () => {

		const fileClicked = (filename) => {
			trackEvent(getTrackingNameForFactory(state.cloneData.clone_name), 'DataStatusTracker' , 'PDFOpen');
			window.open(`/#/pdfviewer/gamechanger?filename=${filename.replace(/'/g, '')}&cloneIndex=${state.cloneData.clone_name}`);
		};
		
		const dataColumns = [
			
			{
				Header: 'Type',
				accessor: 'pub_type',
				width: 100,
				Cell: row => (
					<TableRow>
						{row.value}
					</TableRow>
				),
			},
			{
				Header: 'Number',
				accessor: 'pub_number',
				width: 110,
				Cell: row => (
					<TableRow>
						{row.value}
					</TableRow>
				),
			},
			{
				Header: 'Title',
				accessor: 'pub_title',
				Cell: props => (
					<TableRow>
						<Link href={"#"} onClick={(event)=> {
							preventDefault(event);
							fileClicked(props.original.doc_filename);
								}}
							style={{ color: '#386F94' }}
						>
						<div>
							<p>{props.original.pub_title}</p>
						</div>
						</Link>
					</TableRow>
				),
			},
			{
				Header: 'Source',
				accessor: 'json_metadata',
				width: 350,
				Cell: props => (
					<TableRow>
						<Link href={"#"} onClick={(event)=> {
							preventDefault(event);
							window.open(JSON.parse(props.original.json_metadata).source_page_url);
								}}
							style={{ color: '#386F94' }}
						>
						<div>
							<p>{JSON.parse(props.original.json_metadata).crawler_used}</p>
						</div>
						</Link>
					</TableRow>
				),
			},
			{
				Header: 'Publication Date',
				accessor: 'publication_date',
				width: 150,
				Cell: row => (
					<TableRow>
						{moment(Date.parse(row.value)).format("YYYY-MM-DD")}
					</TableRow>
				),
			},
			{
				Header: 'Ingestion Date',
				accessor: 'upload_date',
				width: 150,
				Cell: row => (
					<TableRow>
						{moment(Date.parse(row.value)).format("YYYY-MM-DD")}
					</TableRow>
				),
			},
			{
				Header: 'Next update',
				width: 150,
				Cell: row => (
					<TableRow>
						{moment(Date.parse(nextFriday.toISOString())).format("YYYY-MM-DD")}
					</TableRow>
				),
			},
		
		];

		return(
			<ReactTable
			data={dataTableData}
			columns={dataColumns}
			style={{ margin: '0 80px 20px 80px', height: 700 }}
			pageSize={PAGE_SIZE}
			showPageSizeOptions={false}
			filterable={true}
			loading={loading}
			manual={true}
			pages={numPages}
			onFetchData={handleFetchData}
			defaultSorted={[
				{
					id: 'pub_type',
					desc: false
				}
			]}
			getTheadTrProps={() => {
				return { style: { height: 'fit-content', textAlign: 'left', fontWeight: 'bold' } };
			}}
			getTheadThProps={() => {
				return { style: { fontSize: 15, fontWeight: 'bold' } };
			}}
		/>
		);
	}

	const renderCrawlerData = () => {

		const crawlerColumns = [
			{
				Header: 'Source',
				accessor: 'crawler_name',
				width: 350,
				Cell: row => (
					<TableRow>
						{crawlerMappingFunc(row.value)}
					</TableRow>
				),
			},
			{
				Header: 'Status',
				accessor: 'status',
				Cell: row => (
					<TableRow>
						{row.value}
					</TableRow>
				),
			},
			{
				Header: 'Crawl and Download Complete',
				accessor: 'status',
				Cell: props => (
					<CenterRow>
						{crawl_download(props.original.status)? <FiberManualRecordIcon fontSize="large" style={{ color: green[500] }} />: <FiberManualRecordIcon fontSize="large" style={{ color: red[500] }} />}
					</CenterRow>
				),
			},
			{
				Header: 'Ingest In Progress',
				accessor: 'status',
				Cell: props => (
					<CenterRow>
						{ingest_progress(props.original.status)? <FiberManualRecordIcon fontSize="large" style={{ color: green[500] }} />: <FiberManualRecordIcon fontSize="large" style={{ color: red[500] }} />}
					</CenterRow>
				),
			},
			{
				Header: 'Ingest Complete',
				accessor: 'status',
				Cell: props => (
					<CenterRow>
						{ingest_complete(props.original.status)? <FiberManualRecordIcon fontSize="large" style={{ color: green[500] }} />: <FiberManualRecordIcon fontSize="large" style={{ color: red[500] }} />}
					</CenterRow>
				),
			},
			{
				Header: 'Last Action',
				accessor: 'datetime',
				width: 150,
				Cell: row => {
		
					return (
					<TableRow>
						{moment(Date.parse(row.value)).format("YYYY-MM-DD")}
					</TableRow>
				)},
			}
		]

		return(
			<ReactTable
			data={crawlerTableData}
			columns={crawlerColumns}
			style={{ margin: '0 80px 20px 80px', height: 1000 }}
			pageSize={20}
			showPageSizeOptions={false}
			filterable={false}
			loading={loading}
			manual={true}
			pages={numPages}
			onFetchData={handleFetchCrawlerData}
			getTheadTrProps={() => {
				return { style: { height: 'fit-content', textAlign: 'left', fontWeight: 'bold' } };
			}}
			getTheadThProps={() => {
				return { style: { fontSize: 15, fontWeight: 'bold' } };
			}}
		/>
		)
	}

	const renderVersionTable = () => {
		const crawlerColumns = [
			{
				Header: 'Source',
				accessor: 'crawler_name',
				width: 350,
				Cell: row => (
					<TableRow>
						{crawlerMappingFunc(row.value)}
					</TableRow>
				),
			},
			{
				Header: 'Last Successful Ingest',
				accessor: 'datetime',
				width: 200,
				Cell: row => {
					return (
					<TableRow>
						{moment(Date.parse(row.value)).format("YYYY-MM-DD")}
					</TableRow>
				)},
			},
			{
				Header: 'Days Since Last Ingest',
				accessor: 'datetime',
				width: 200,
				Cell: row => {
					return (
					<TableRow>
						{date_difference(Date.parse(row.value))}
					</TableRow>
				)},
			},
			{
				Header: 'Goal',
				accessor: 'datetime',
				width: 200,
				Cell: row => {
					return (
					<TableRow>
						{goal_difference(date_difference(Date.parse(row.value)))}
					</TableRow>
				)},
			}
		]

		return(
			<div>
				<GoalsLabel>
					<Typography variant ='body1'> Data Update Goals:</Typography>
					<div style={{
    					display: 'flex',
						alignItems: 'center',
						flexWrap: 'wrap',
					}}>
						<FiberManualRecordIcon fontSize="large" style={{ color: green[500], margin: '0px 0px 0px 5px' }} />
						<span>{"<"} 7 Days </span>
						<FiberManualRecordIcon fontSize="large" style={{ color: yellow[500], margin: '0px 0px 0px 15px' }}/> 
						<span>{"<"} 14 Days </span>
						<FiberManualRecordIcon fontSize="large" style={{ color: orange[500], margin: '0px 0px 0px 15px' }}/> 
						<span>{"<"} 30 Days </span>
						<FiberManualRecordIcon fontSize="large" style={{ color: red[500], margin: '0px 0px 0px 15px' }}/> 
						<span>{">"} 30 Days </span>
					</div>
				</GoalsLabel>
			<ReactTable
			data={crawlerTableUpdate}
			columns={crawlerColumns}
			style={{ margin: '0 80px 20px 80px', height: 1000 }}
			pageSize={20}
			showPageSizeOptions={false}
			filterable={false}
			loading={loading}
			manual={true}
			pages={numPages}
			onFetchData={handleFetchCrawlerUpdate}
			getTheadTrProps={() => {
				return { style: { height: 'fit-content', textAlign: 'left', fontWeight: 'bold' } };
			}}
			getTheadThProps={() => {
				return { style: { fontSize: 15, fontWeight: 'bold' } };
			}}
		/>
		</div>
		)
	}
	
	const renderNeo4jTable = () => {
		const width = window.innerWidth * 0.525;
		const height = 400;
		
		return(
			<StyledNeo4jTable>
				<div className={'details-paragraph'}>
					<Typography variant ='body2'>The following tables and chart describe the schema in the Knowledge Graph. The table on the left lists the Nodes and Relationships by "Label" along with the property names and the types of those properties.</Typography>
					<Typography variant ='body2'>The table in the bottom right lists the different Nodes and Relationships and the counts. The chart graphically describes the schema of the Knowledge Graph.</Typography>
				</div>
				<div className={'columns'}>
					<div className={'left-column'}>
					<div className={'properties-schema'}>
						<ReactTable
							data={neo4jPropertiesData}
							style={{ height: 670 }}
							columns={neo4jPropertiesColumns}
							showPageSizeOptions={false}
							showPagination={false}
							filterable={false}
							loading={loadingNeo4jPropertiesData}
							manual={true}
							pages={numPages}
							getTheadTrProps={() => {
								return { style: { height: 'fit-content', textAlign: 'left', fontWeight: 'bold' } };
							}}
							getTheadThProps={() => {
								return { style: { fontSize: 15, fontWeight: 'bold' } };
							}}
						/>
					</div>
				</div>
					<div className={'right-column'}>
					<div className={'graph-schema'}>
						<MemoizedNodeCluster2D graphWidth={width} graphHeight={height} runningQuery={loadingNeo4jGraphData}
							displayLinkLabel={true} graph={neo4jGraphData} hierarchyView={false} showSettingsMenu={false}
							shouldHighlightNodes={false} shouldShowLegend={false} showBasic={true} cloneData={state.cloneData} />
					</div>
					<div className={'node-rel-counts'}>
						<ReactTable
							data={neo4jCountsData}
							style={{ height: 251 }}
							columns={neo4jCountsColumns}
							showPageSizeOptions={false}
							showPagination={false}
							filterable={false}
							loading={loadingNeo4jCounts}
							manual={true}
							minRows={0}
							getTheadTrProps={() => {
								return { style: { height: 'fit-content', textAlign: 'left', fontWeight: 'bold' } };
							}}
							getTheadThProps={() => {
								return { style: { fontSize: 15, fontWeight: 'bold' } };
							}}
						/>
					</div>
				</div>
				</div>
				
			</StyledNeo4jTable>
		);
	}
	
	return (
		<div style={styles.tabContainer}>
			<Tabs>
				<div style={styles.tabButtonContainer}>
					<TabList style={styles.tabsList}>
						<Tab style={{...styles.tabStyle,
							...(tabIndex === 'documents' ? styles.tabSelectedStyle : {}),
							borderRadius: `5px 0 0 0`
							}} title="userHistory" onClick={() => handleTabClicked('documents')}>
							<Typography variant="h6" display="inline" title="cardView">DOCUMENTS</Typography>
						</Tab>
						<Tab style={{...styles.tabStyle,
							...(tabIndex === 'crawler' ? styles.tabSelectedStyle : {}),
							borderRadius: '0 0 0 0'}}
							title="crawlerTable" onClick={() => handleTabClicked('crawler')}>
							<Typography variant="h6" display="inline">PROGRESS</Typography>
						</Tab>
						<Tab style={{
							...styles.tabStyle,
							...(tabIndex === 'version' ? styles.tabSelectedStyle : {}),
							borderRadius: `0 0 0 0`
						}} title="versionDocs" onClick={() => handleTabClicked('version')}>
							<Typography variant="h6" display="inline" title="cardView">UPDATES</Typography>
						</Tab>
						<Tab style={{
							...styles.tabStyle,
							...(tabIndex === 'neo4j' ? styles.tabSelectedStyle : {}),
							borderRadius: `0 5px 0 0`
						}} title="neo4jDataTracker" onClick={() => handleTabClicked('neo4j')}>
							<Typography variant="h6" display="inline" title="cardView">KNOWLEDGE GRAPH</Typography>
						</Tab>
					</TabList>

					<div style={styles.spacer}  />
				</div>

				<div style={styles.panelContainer}>
					<TabPanel>
						{renderDataTable()}
					</TabPanel>
					<TabPanel>
						{renderCrawlerData()}
					</TabPanel>
					<TabPanel>
						{renderVersionTable()}
					</TabPanel>
					<TabPanel>
						{renderNeo4jTable()}
					</TabPanel>
				</div>
			</Tabs>
		</div>
	);
}

const styles = {
	tabsList: {
		borderBottom: `2px solid ${gcOrange}`,
		padding: 0,
		display: 'flex',
		alignItems: 'center',
		flex: 9,
		margin: '10px 0 10px 50px'
	},
	tabStyle: {
		width: '140px',
		border: '1px solid',
		borderColor: backgroundGreyDark,
		borderBottom: 'none !important',
		borderRadius: `6px 6px 0px 0px`,
		position: ' relative',
		listStyle: 'none',
		padding: '2px 12px',
		cursor: 'pointer',
		textAlign: 'center',
		backgroundColor: backgroundWhite,
		marginRight: '2px',
		marginLeft: '2px',
		height: 45,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center'
	},
	tabSelectedStyle: {
		border: '1px solid transparent',
		backgroundColor: gcOrange,
		borderColor: 'none',
		color: 'white',
	},
	tabContainer: {
		alignItems: 'center',
		minHeight: '613px',
	},
	tabButtonContainer: {
		backgroundColor: '#ffffff',
		width: '100%',
		display: 'flex',
		paddingLeft: '2em',
		paddingRight: '5em',
		paddingBottom: '5px',
		alignItems: 'center',
	},
	panelContainer: {
		alignItems: 'center',
		marginTop: 10,
		minHeight: 'calc(100vh - 600px)',
		paddingBottom: 20
	}
	

}

GCDataStatusTracker.propTypes = {
	state: PropTypes.shape({
		cloneData: PropTypes.shape({
			clone_name: PropTypes.string
		})
	})
}

export default GCDataStatusTracker;
