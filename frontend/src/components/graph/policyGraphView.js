import React, {useEffect, useRef} from "react";
import {MemoizedNodeCluster2D, StyledLegendClickable} from "./GraphNodeCluster2D";
import {
	generateRandomColors, getLines,
	getNodeOutlineColors,
	getTextColorBasedOnBackground
} from "../../graphUtils";
import {
	convertHexToRgbA,
	getDocTypeStyles, getLinkColor,
	getTrackingNameForFactory,
	typeColorMap
} from "../../gamechangerUtils";
import GCTooltip from "../common/GCToolTip";
import {trackEvent} from "../telemetry/Matomo";
import Config from "../../config/config";
import styled from "styled-components";
import GameChangerAPI from "../api/gameChanger-service-api";

import {Card} from "../cards/GCCard";
import {backgroundWhite} from "../common/gc-colors";
const _ = require('lodash');

const gameChangerAPI = new GameChangerAPI();

const DEGREE_REL_TO_GET = 1;
const ZOOM_LIMIT = 8;
const HIDDEN_NODE_ALPHA = 0.08;
const NODE_ALPHA = 1;
const LINK_ALPHA = 0.5;
const NO_RESULTS_MESSAGE = 'No results found! Please try refining your search.';

const StyledCircularMenu = styled.nav`
	width: 250px;
	height: 250px;
	margin: 0 auto;
	position: relative;
	pointer-events: none;
	
	> .circle {
		width: 250px;
		height: 250px;
		opacity: 0;
		-webkit-transform: scale(0);
		-moz-transform: scale(0);
		transform: scale(0);
		-webkit-transition: all 0.4s ease-out;
		-moz-transition: all 0.4s ease-out;
		transition: all 0.4s ease-out;
		position: relative;
		
		> .items {
			position: absolute;
			left: -20px;
			top: -20px;
			width: 250px;
    		height: 250px;
			
			> .graph-contextItem {
				position: absolute;
				width: 50px;
				height: 50px;
				pointer-events: auto;
				cursor: pointer;
				
				> .graph-contextBackground {
					background-color: rgb(210, 213, 218);
					border-radius: 50px;
					width: 100%;
					height: 100%;
				}
				
				&:hover {
					> .graph-contextBackground {
						border-color: rgb(185, 185, 185) transparent transparent transparent;
						background-color: rgb(185, 185, 185);
					}
				}
				
				> div {
					position: absolute;
					    width: 50px;
						height: 50px;
						text-align: center;
					> .graph-contextIcon {
						color: black;
						    padding: 10px 0;
					}
				}
				
			}
		}
		
	}
	
	> .open {
		opacity: 1;
		-webkit-transform: scale(1);
		-moz-transform: scale(1);
		transform: scale(1);
	}
`;

const setFixedCoordsBasedOnView = (is2D, nodes) => {
	nodes.forEach((node, idx) => {
		if (is2D) {
			if (node.coords2d && nodes.length > 1000) {
				nodes[idx].fx = node.coords2d.fx;
				nodes[idx].fy = node.coords2d.fy;
			} else {
				nodes[idx].x = null;
				nodes[idx].y = null;
			}
		} else {
			if (node.coords3d && nodes.length > 500) {
				node.fx = node.coords3d.fx;
				node.fy = node.coords3d.fy;
				node.fz = node.coords3d.fz;
			} else {
				nodes[idx].x = null;
				nodes[idx].y = null;
				nodes[idx].z = null;
			}
		}
	});
}

const makeGraphCollections = (graph) => {
	const { nodes } = graph;
	const docOrgNumbers = {};
	const collections = {};

	nodes.forEach(node => {

		const displayOrg = node['display_org_s'] ? node['display_org_s'] : 'Uncategorized';
		const displayType = node['display_doc_type_s'] ? node['display_doc_type_s'] : 'Document';
		
		switch (node.label) {
			case 'Entity':
				if (docOrgNumbers.hasOwnProperty('Entity')) {
					docOrgNumbers['Entity'] += 1;
				} else {
					docOrgNumbers['Entity'] = 1;
				}
				
				if (!collections.hasOwnProperty('Entity')) {
					collections['Entity'] = [];
				}
	
				collections['Entity'].push(node);
				break;
			case 'Topic':
				if (docOrgNumbers.hasOwnProperty('Topic')) {
					docOrgNumbers['Topic'] += 1;
				} else {
					docOrgNumbers['Topic'] = 1;
				}
				
				if (!collections.hasOwnProperty('Topic')) {
					collections['Topic'] = [];
				}
	
				collections['Topic'].push(node);
				break;
			case 'UKN_Document':
				if (docOrgNumbers.hasOwnProperty('UKN_Document')) {
					docOrgNumbers['UKN_Document'] += 1;
				} else {
					docOrgNumbers['UKN_Document'] = 1;
				}
				
				if (!collections.hasOwnProperty('UKN_Document')) {
					collections['UKN_Document'] = [];
				}
	
				collections['UKN_Document'].push(node);
				break;
			case 'Document':
				node.orgType = getDocTypeStyles(displayType, displayOrg).docOrg;
	
				if (docOrgNumbers.hasOwnProperty(displayType)) {
					docOrgNumbers[displayType] += 1;
				} else {
					docOrgNumbers[displayType] = 1;
				}
		
				if (!collections.hasOwnProperty(`${node.doc_type} ${node.doc_num}`)) {
					collections[`${node.doc_type} ${node.doc_num}`] = [];
				}
	
				collections[`${node.doc_type} ${node.doc_num}`].push(node);
				break;
			default:
				break;
		}
	});
	
	return { collections, docOrgNumbers };
}

const makeFilteredGraph = (is2D, graph, collections) => {
	const { nodes, edges, timeFound = 0 } = graph;
	let documentsFound = 0;

	const gT0 = new Date().getTime();

	const { filteredGraph, docOrgNumbers } = filterGraphData(nodes, edges);

	setFixedCoordsBasedOnView(is2D, filteredGraph.nodes);

	Object.keys(collections).forEach(key => {
		documentsFound += collections[key].length;
	});

	const gT1 = new Date().getTime();
	
	return { filteredGraph, documentsFound, docOrgNumbersTmp: docOrgNumbers, timeFound: (((gT1 - gT0) / 1000) + timeFound).toFixed(2) };
}

const filterGraphData = (nodes, edges) => {
	
	const filteredGraph = { nodes: [], edges: [], relationships: [] };

	const docOrgNumbers = {};
	
	const edgeCount = edges.length;
	const edgeIds = [];
	
	const idToNodeMap = {};
	const edgeToNodeCountMap = {};
	
	_.forEach(nodes, (node) => {
			filteredGraph.nodes.push(node);
			idToNodeMap[node.id] = node;
			edgeToNodeCountMap[node.id] = 0;
			
			const displayOrg = node['display_org_s'] ? node['display_org_s'] : 'Uncategorized';
			
			switch (node.label) {
				case 'Entity':
					if (docOrgNumbers.hasOwnProperty('Entity')) {
						docOrgNumbers['Entity'] += 1;
					} else {
						docOrgNumbers['Entity'] = 1;
					}
					break;
				case 'Topic':
					if (docOrgNumbers.hasOwnProperty('Topic')) {
						docOrgNumbers['Topic'] += 1;
					} else {
						docOrgNumbers['Topic'] = 1;
					}
					break;
				case 'UKN_Document':
					if (docOrgNumbers.hasOwnProperty('UKN_Document')) {
						docOrgNumbers['UKN_Document'] += 1;
					} else {
						docOrgNumbers['UKN_Document'] = 1;
					}
					break;
				default:
					if (docOrgNumbers.hasOwnProperty(displayOrg)) {
						docOrgNumbers[displayOrg] += 1;
					} else {
						docOrgNumbers[displayOrg] = 1;
					}
					break;
			}
	});

	_.forEach(edges, (edge) => {
		if (!edgeIds.includes(edge.id)) {
			try {
				filteredGraph.edges.push(edge);
				edgeIds.push(edge.id);
				
				const source = edge.source.hasOwnProperty('id') ? edge.source.id : edge.source;
				const target = edge.target.hasOwnProperty('id') ? edge.target.id : edge.target;
				
				edgeToNodeCountMap[source] += 1;
				edgeToNodeCountMap[target] += 1;
				
				idToNodeMap[source].edgePercent = edgeToNodeCountMap[source] / edgeCount;
				idToNodeMap[target].edgePercent = edgeToNodeCountMap[target] / edgeCount;
				
				if (!filteredGraph.relationships.includes(edge.label)) {
					filteredGraph.relationships.push(edge.label);
				}
			} catch (e) {
				gameChangerAPI.sendFrontendErrorPOST(e.stack);
			}
		}
	});

	return { filteredGraph, docOrgNumbers };
}

export default function PolicyGraphView(props) {
	
	const {
		width,
		height,
		graphData,
		runningSearchProp,
		notificationCountProp = 0,
		setDocumentsFound = (docs) => {},
		setTimeFound = (time) => {},
		expansionTerms = false,
		cloneData,
		setNumOfEdges = (num) => {},
		dispatch = () => {},
		showSideFilters = false,
		searchText = '',
		showBasic = false,
		hierarchyView = false,
		detailsView = false
	} = props;
	
	const graph2DRef = useRef();
	
	const [notificationCount, setNotificationCount] = React.useState(0);
	const [show2DView, setShow2DView] = React.useState(true);
	const [contextOpen, setContextOpen] = React.useState(false);
	const [shouldRender, setShouldRender] = React.useState(true);
	const [graph, setGraph] = React.useState({ nodes: [], edges: [] });
	const [highlightNodes, setHighlightNodes] = React.useState(new Set());
	const [runSimulation, setRunSimulation] = React.useState(true);
	const [reloadGraph, setReloadGraph] = React.useState(false);
	const [legendData, setLegendData] = React.useState({});
	const [collections, setCollections] = React.useState({});
	const [filteredGraph, setFilteredGraph] = React.useState({edges: [], nodes: []});
	const [docOrgNumbers, setDocOrgNumbers] = React.useState({});
	const [orgTypeSelected, setOrgTypeSelected] = React.useState(null);
	const [mouseXY, setMouseXY] = React.useState({x: 0, y: 0});
	const [selectedID, setSelectedID] = React.useState(null);
	const [shouldCenter, setShouldCenter] = React.useState(true);
	const [showGraphCard, setShowGraphCard] = React.useState(false);
	const [nodeHoverID, setNodeHoverID] = React.useState(-1);
	const [degreeConnected, setDegreeConnected] = React.useState({ 0: [], 1: [], 2: [] });
	const [graphCardData, setGraphCardData] = React.useState({});
	const [selectedItem, setSelectedItem] = React.useState({});
	const [runningSearch, setRunningSearch] = React.useState({});
	const [zoom, setZoom] = React.useState(1);
	
	const [nodeRelSize, setNodeRelSize] = React.useState(5);
	const [communityView, setCommunityView] = React.useState(false);
	
	useEffect(() => {
		if (!graphData || graphData.nodes?.length <= 0) return;
		setContextOpen(false);
		setShouldRender(true);
		setShow2DView(true);
		setGraph(graphData);
		setHighlightNodes(new Set());
		setRunSimulation(true);
		setReloadGraph(true);
	}, [graphData]);
	
	useEffect(() => {
		if (runningSearch !== runningSearchProp) {
			setRunningSearch(runningSearchProp);
			setContextOpen(false);
			//setRunSimulation(true);
		}
	}, [runningSearchProp, runningSearch]);
	
	useEffect(() => {
		setNotificationCount(notificationCountProp);
	}, [notificationCountProp]);
	
	useEffect(() => {
		if (!graph || !graph.nodes) return;
		
		const tmpLegendData = {};
		
		if (communityView) {
			const communities = Array.from(new Set(graph.nodes.map(node => {
				return node.community;
			})));
			const nodeColors = generateRandomColors(communities.length);
			
			graph.nodes.forEach(node => {
				node.color = nodeColors[communities.indexOf(node.community)];
				if (!tmpLegendData[node.community]) {
					tmpLegendData[node.community] =  { color: node.color, name: node.community };
				}
			});
			
		} else {
			graph.nodes.forEach(node => {
				const displayOrg = node['display_org_s'] ? node['display_org_s'] : 'Uncategorized';
				const displayType = node['display_doc_type_s'] ? node['display_doc_type_s'] : 'Document';
				switch (node.label) {
					case 'Entity':
						if (!tmpLegendData['Entity']) {
							tmpLegendData['Entity'] =  { color: typeColorMap.organization, name: 'Entity' };
						}
						node.color = typeColorMap.organization;
						break;
					case 'Topic':
						if (!tmpLegendData['Topic']) {
							tmpLegendData['Topic'] =  { color: typeColorMap.topic, name: 'Topic' };
						}
						node.color = typeColorMap.topic;
						break;
					case 'UKN_Document':
						if (!tmpLegendData['UKN_Document']) {
							tmpLegendData['UKN_Document'] =  { color: typeColorMap.uknDocument, name: 'UKN_Document' };
						}
						node.color = typeColorMap.uknDocument;
						break;
					default:
						const docData = getDocTypeStyles(displayType, displayOrg);
						node.color = docData.docOrgColor !== '' ? docData.docOrgColor : '#964B00';
						if (!tmpLegendData[docData.docOrg]) {
							tmpLegendData[docData.docOrg] = { color: docData.docOrgColor, name: docData.docOrg };
						}
						break;
				}
			});
		}
		
		setLegendData(tmpLegendData);
		
		const { collections } = makeGraphCollections(graph);
		setCollections(collections);
		
		const { filteredGraph, documentsFound, docOrgNumbersTmp, timeFound} = makeFilteredGraph(show2DView, graph, collections);
		
		setFilteredGraph(filteredGraph);
		setDocumentsFound(documentsFound);
		setDocOrgNumbers(docOrgNumbersTmp);
		setTimeFound(timeFound);
		setNumOfEdges(filteredGraph.edges.length);
	}, [graph, show2DView, reloadGraph, communityView, setDocumentsFound, setTimeFound, setNumOfEdges]);
	
	/**
	 * Node Interactions
	 */
	
	const handleNodeHover = (node) => {
		const elem = document.getElementById('graph2dContainer');
		elem.style.cursor = node ? 'pointer' : null;
		setNodeHoverID(node ? node.id : -1);
		
		if (node) {
			highlightSelectedNodes(node, filteredGraph.edges);
		} else {
			highlightNodes.clear();
		}
	}
	
	const highlightSelectedNodes = (node, filteredEdges) => {
		
		highlightNodes.clear();

		// Get nth degree relationships
		const alreadyVisitedNodes = [node];
		let newNodes = [node];
		for (let i = 0; i <= DEGREE_REL_TO_GET; i++) {
			degreeConnected[i] = [];
			const tmpNewNodes = [];
			_.forEach(newNodes, (tmpNode) => {
				_.forEach(filteredEdges, (edge) => {
					if (edge.source === tmpNode) {
						if (!_.includes(alreadyVisitedNodes, edge.target) && !_.includes(tmpNewNodes, edge.target)) {
							tmpNewNodes.push(edge.target);
							alreadyVisitedNodes.push(edge.target);
							highlightNodes.add(edge.target);
							degreeConnected[i].push(edge.target)
						}
					} else if (edge.target === tmpNode) {
						if (!_.includes(alreadyVisitedNodes, edge.source) && !_.includes(tmpNewNodes, edge.source)) {
							tmpNewNodes.push(edge.source);
							alreadyVisitedNodes.push(edge.source);
							highlightNodes.add(edge.source);
							degreeConnected[i].push(edge.source);
						}
					}
				});
			});
			newNodes = tmpNewNodes;
		}
	}
	
	const handleNodeClick = async (node, event) => {
		trackEvent(getTrackingNameForFactory(cloneData.clone_name), 'GraphNodeClicked', node.name);
		setShouldCenter(false);
		
		// Sleep until node is in place
		const sleep = (milliseconds) => {
		  return new Promise(resolve => setTimeout(resolve, milliseconds));
		}
		
		if (selectedID !== node.id && contextOpen) {
			setContextOpen(false);
			await sleep(500);
		}
		
		if (selectedID !== node.id) {
			setSelectedID(node.id);
		} else {
			setSelectedID(null);
			setShowGraphCard(false);
			setContextOpen(false);
			return;
		}
		
		// Zoom and center node
		graph2DRef.current.centerAt(node.x, node.y, 500);
		graph2DRef.current.zoom(ZOOM_LIMIT, 500);
		
		sleep(500).then(() => {
			const {x, y} = graph2DRef.current.graph2ScreenCoords(node.x, node.y);
			setMouseXY({x: x, y: y});
			setContextOpen(true);
		});
		
		lockNodeInPlace(node, true);
	}
	
	const showNodeContextMenu = () => {
		const myStyle = {
			position: 'absolute',
			top: `${mouseXY.y + 99 + (notificationCount * 50) + (expansionTerms ? 41 : 0) + (detailsView ? -175 : 0)}px`,
			left:`${mouseXY.x - 20 + (showSideFilters ? 372 : detailsView ? -100 : 0)}px`,
			zIndex: 99
		};
		
		if (!graph || !graph.nodes) return;
		
		const node = graph.nodes.filter(node => {
			return node.id === selectedID;
		})[0];
		
		const nodeLabel = node ? node.label : '';
		const notInOriginal = node ? node.notInOriginalSearch : '';
		
		const menuItems = [];
		let cardText = '';
		
		switch (nodeLabel) {
			case 'Publication':
			case 'Document':
				cardText = 'document';
				break;
			case 'Entity':
				cardText = 'entity';
				break;
			case 'Topic':
				cardText = 'topic';
				break;
			default:
				break;
		}
		
		menuItems.push({ className: "fa fa-book fa-2x", onClick: () => handleContextMenuButtonClicked(() =>
				handleShowGraphCard(), false, 'showGraphCard'), tooltip: `Display the ${cardText} card`});
		
		if (nodeLabel === 'Publication' && !notInOriginal) {
			menuItems.push({ className: "fa fa-sitemap  fa-2x", onClick: () => handleContextMenuButtonClicked(() =>
				showChildDocuments(), true, 'showChildDocuments'), tooltip: 'Display child documents'});
		}
		if (nodeLabel === 'Document' && !notInOriginal) {
			menuItems.push({ className: "fa fa-address-card fa-2x", onClick: () => handleContextMenuButtonClicked(() =>
				showEntitiesForNode(), true, 'showEntities'), tooltip: 'Display entity nodes for this document'});
			if (Config.GAMECHANGER.SHOW_TOPICS) {
				menuItems.push({
					className: "fa fa-lightbulb-o fa-2x", onClick: () => handleContextMenuButtonClicked(() =>
						showTopicsForNode(), true, 'showTopics'), tooltip: 'Display topic nodes for this document'
				});
			}
		}
		
		if (!notInOriginal && nodeLabel === 'Document') {
			menuItems.push({
				className: "fa fa-code-fork fa-2x", onClick: () => handleContextMenuButtonClicked(() =>
					showReferencesForNode(false), true, 'showReference'), tooltip: 'Display reference nodes for this document'
			});
		}
		
		if (!notInOriginal && nodeLabel === 'UKN_Document') {
			menuItems.push({
				className: "fa fa-code-fork fa-2x", onClick: () => handleContextMenuButtonClicked(() =>
					showReferencesForNode(true), true, 'showReference'), tooltip: 'Display reference nodes for this document'
			});
		}
		
		menuItems.push({ className: "fa fa-unlock fa-2x", onClick: () => handleContextMenuButtonClicked(() =>
					lockNodeInPlace(null, false), true, 'lockUnlockNode'), tooltip: 'Unlock the node'});
		menuItems.push({ className: "fa fa-eye-slash fa-2x", onClick: () => handleContextMenuButtonClicked(() =>
					hideNode(), true, 'hideNode'), tooltip: 'Dismiss the node from the graph'});
		
		return (
			<StyledCircularMenu style={myStyle}>
				<div className={`circle ${contextOpen ? 'open' : null}`}>
					<div className={"items"}>
						{menuItems.map((item, idx) => {
							const leftBack = (50 - 31*Math.cos(-0.5 * Math.PI - 2*(1/menuItems.length)*idx*Math.PI)).toFixed(4) + "%";
							const topBack = (50 + 31*Math.sin(-0.5 * Math.PI - 2*(1/menuItems.length)*idx*Math.PI)).toFixed(4) + "%";
							return (
								<GCTooltip title={item.tooltip} arrow enterDelay={30} key={`tooltip-${idx}`}>
									<div className={"graph-contextItem"} onClick={item.onClick} style={{left: leftBack, top: topBack}}>
										<div className={"graph-contextBackground"} style={{transform: `rotate(${idx*(360/menuItems.length)}deg)`}}>
										</div>
										<div>
											<i className={`graph-contextIcon ${item.className}`}/>
										</div>
									</div>
								</GCTooltip>
							);
						})}
					</div>
				</div>
			</StyledCircularMenu>
		)
	}
	
	const handleContextMenuButtonClicked = (funcToRun, removeSelectedID, name) => {
		trackEvent(getTrackingNameForFactory(cloneData.clone_name), 'GraphContextMenuClicked', name)
		funcToRun();
		setContextOpen(false);
		if (removeSelectedID) {
			setSelectedID(-1);
		}
	}
	
	const hideNode = () => {
		const node = graph.nodes.filter(node => {
			return node.id === selectedID;
		})[0];
		
		node.hidden = true;
		
		setShouldRender(true);
		setReloadGraph(!reloadGraph);
	}
	
	const lockNodeInPlace = (node, lock) => {
		
		if (!node) {
			node = graph.nodes.filter(node => {
				return node.id === selectedID;
			})[0];
		}
		
		if (lock) {
			node.fx = node.x;
			node.fy = node.y;
			node.fz = node.z;
		} else {
			node.fx = null;
			node.fy = null;
			node.fz = null;
		}
	}
	
	const handleOnZoom = (event) => {
		// trackEvent('Graph', 'onZoom', 'zoom', event.k);
		if (event.k > ZOOM_LIMIT) {
			graph2DRef.current.zoom(ZOOM_LIMIT);
		}
		if (zoom !== event.k) {
			setZoom(event.k);
		}
	}
	
	/**
	 * Graph Card Functions
	 */
	
	const handleShowGraphCard = async () => {
		
		const node = graph.nodes.filter(node => {
			return node.id === selectedID;
		})[0];
		
		let cardItem = {};
		
		setGraphCardData({done: false});
		
		const ignoreLabels = ['Publication', 'Entity', 'Topic'];
		if (!ignoreLabels.includes(node?.label)) {
			const resp = await gameChangerAPI.callGraphFunction({
				functionName: 'getSingleDocument',
				cloneName: cloneData.clone_name,
				options: {
					docIds: [node.doc_id],
					searchText: searchText
				}
			})
			
			cardItem = resp.data.docs[0];
		}
		
		let item = {
			id: node.id,
			title: node.name,
			label: node.label
		};
		node.properties.forEach(prop => {
			item[prop] = node[prop];
		});
		
		let cardType = '';
		switch (node.label) {
			case 'Document':
			case 'Publication':
				cardType = node.label === 'Document' ? 'document' : 'publication';
				item = {
					...node,
					...cardItem,
					id: node.doc_id,
					title: node.label === 'Publication' ? `${node.name}` : `${node.display_title_s}`,
					type: cardType,
					doc_ids: [],
					label: node.label,
					name: node.name,
					isCollection: node.label === 'Publication',
				};
				setSelectedItem(item);
				break;
			case 'Entity':
				cardType = 'organization';
				item.description = '';
				item.type = cardType;
				setSelectedItem(item);
				break
			case 'Topic':
				cardType = 'topic';
				item.type = cardType;
				setSelectedItem(item);
				break;
			default:
				break;
		}
		
		setShowGraphCard(true);
	}
	
	const displayGraphCard = () => {
		
		switch (selectedItem.label) {
			case 'Publication':
				return (
					<Card
						idx={0}
						item={selectedItem}
						closeGraphCard={handleCloseGraphCard}
						state={{cloneData, selectedDocuments: new Map(), componentStepNumbers: {}, searchText}}
						dispatch={dispatch}
						graphView={true}
						collection={collections[selectedItem.id]}
					/>
				);
			case 'Document':
				return (
					<Card
						idx={0}
						item={selectedItem}
						closeGraphCard={handleCloseGraphCard}
						state={{cloneData, selectedDocuments: new Map(), componentStepNumbers: {}, searchText}}
						dispatch={dispatch}
						graphView={true}
					/>
				);
			case 'Entity':
				if (!graphCardData.done) {
					getEntityCardData();
				} else {
					selectedItem.description = graphCardData.description;
				}
				return (
					<Card
						idx={0}
						item={selectedItem}
						closeGraphCard={handleCloseGraphCard}
						state={{cloneData, selectedDocuments: new Map(), componentStepNumbers: {}, searchText}}
						dispatch={dispatch}
						graphView={true}
					/>
				)
			case 'Topic':
				if (!graphCardData.done) {
					getTopicCardData();
				} else {
					selectedItem.relatedTopics = graphCardData.relatedTopics;
					selectedItem.documentCount = graphCardData.documentCount;
				}
				return (
					<Card
						idx={0}
						item={selectedItem}
						closeGraphCard={handleCloseGraphCard}
						state={{cloneData, selectedDocuments: new Map(), componentStepNumbers: {}, searchText}}
						dispatch={dispatch}
						graphView={true}
					/>
				)
			default:
				break;
		}
	}
	
	const handleCloseGraphCard = () => {
		const filteredNodes = filteredGraph.nodes;
		const filteredEdges = filteredGraph.edges;
		
		clearSelection();
		
		setShowGraphCard(!showGraphCard);
		setFilteredGraph({ nodes: filteredNodes, edges: filteredEdges });
	}
	
	const clearSelection = () => {
		highlightNodes.clear();
		setSelectedID(null);
		setDegreeConnected({0: [], 1: [], 3: [] });
	}
	
	const getEntityCardData = () => {
		gameChangerAPI.getDescriptionFromWikipedia(selectedItem.name).then(resp => {
			const desc = resp.query?.pages[Object.keys(resp.query.pages)[0]]?.extract;
			if (selectedItem) {
				selectedItem.description = desc;
				selectedItem.done = true;
			}
			setGraphCardData({
				description: desc,
				done: true
			});
		});
	}
	
	const getTopicCardData = async () => {
		const topicDocumentCount = gameChangerAPI.graphQueryPOST(
			`MATCH (t:Topic) where t.name = $name
				OPTIONAL MATCH (t) <-[:CONTAINS]-(d:Document)-[:CONTAINS]->(t2:Topic)
				RETURN t2.name as topic_name, count(d) as doc_count
				ORDER BY doc_count DESC LIMIT 5;`, 'S484S8B', cloneData.clone_name, {params: {name: selectedItem.name.toLowerCase()}}
		);
		
		const documentCount = gameChangerAPI.graphQueryPOST(
			`MATCH (t:Topic) where t.name = $name
				OPTIONAL MATCH (t) <-[:CONTAINS]-(d:Document)
				RETURN count(d) as doc_count`, 'NTDC5KE', cloneData.clone_name, {params: {name: selectedItem.name.toLowerCase()}}
		);
		
		const results = await Promise.all([topicDocumentCount, documentCount]);
		
		const relatedTopics = results[0].data.graph_metadata;
		const documentCountData = results[1].data.graph_metadata;
		
		if (selectedItem) {
			selectedItem.relatedTopics = relatedTopics;
			selectedItem.documentCount = documentCountData;
			selectedItem.done = true;
		}
		setGraphCardData({
			relatedTopics,
			documentCount: documentCountData,
			done: true
		});
	}
	
	/**
	 * Show More Nodes Functions
	 */
	
	const showEntitiesForNode = () => {
		
		const node = graph.nodes.filter(node => {
			return node.id === selectedID;
		})[0];
		
		if (node.showingEntities) {
			
			const entityIDs = [];
			const edgesToRemove = [];
			graph.edges.forEach(edge => {
				if (edge.label === 'MENTIONS' && edge.notInOriginalSearch) {
					entityIDs.push(edge.target.id);
					edgesToRemove.push(edge.id);
				}
			});
			
			graph.edges = graph.edges.filter(edge => {
				return !edgesToRemove.includes(edge.id);
			});
			
			graph.nodes = graph.nodes.filter(node => {
				return !entityIDs.includes(node.id);
			});
			
			lockNodeInPlace(node, false);
			reloadAndRunSimulation();
			
			node.showingEntities = false;
			return;
		}
		
		gameChangerAPI.graphQueryPOST(
			'MATCH pt=(d:Document)-[m:MENTIONS]->(e:Entity) ' +
			'WHERE d.doc_id = $doc_id ' +
			'RETURN pt;', 'I1JJI2D', cloneData.clone_name, {params: {doc_id: node.doc_id}}
		).then((data) => {
			const graphData = data.data;
			const nodeIds = graph.nodes.map(node => {
				return node.id;
			});
			const parentId = node.id;
			graphData.nodes.forEach(tmpNode => {
				if (tmpNode.label === 'Document') {
					tmpNode.id = parentId;
				} else {
					tmpNode.id = 200000 + tmpNode.id;
				}
				if (!nodeIds.includes(tmpNode.id)) {
				 	graph.nodes.push(tmpNode);
				 	nodeIds.push(tmpNode.id);
				}
			});
			const edgeIds = [];
			graphData.edges.forEach(edge => {
				edge.source = parentId;
				edge.target = 200000 + edge.target;
				if (!edgeIds.includes(`${edge.source},${edge.target}`)) {
					edge.notInOriginalSearch = true;
					graph.edges.push(edge);
					edgeIds.push(`${edge.source},${edge.target}`)
				}
			});
			
			lockNodeInPlace(node, true);
			reloadAndRunSimulation();
			
			node.showingEntities = true;
		});
	}
	
	const showReferencesForNode = (isUKN = false) => {
		
		const node = graph.nodes.filter(node => {
			return node.id === selectedID;
		})[0];
		
		if (node.showingReferences) {
			
			const edgesToRemove = [];
			graph.edges.forEach(edge => {
				if (edge.label === 'REFERENCES' && edge.notInOriginalSearch) {
					edgesToRemove.push(edge.id);
				}
			});

			graph.edges = graph.edges.filter(edge => {
				return !edgesToRemove.includes(edge.id);
			});
			
			graph.nodes = graph.nodes.filter(node => {
				return !node.notInOriginalSearch;
			});
			
			reloadAndRunSimulation();
			
			node.showingReferences = false;
			return;
		}
		
		const refName = node.ref_name;
		
		gameChangerAPI.graphQueryPOST(`MATCH ref = (d:Document)<-[:${isUKN ? 'REFERENCES_UKN' : 'REFERENCES'}]-(d2:${isUKN ? 'UKN_Document' : 'Document'})
				WHERE d2.ref_name = $ref_name AND NOT d = d2
				RETURN ref;`, 'RX1V6Q8', cloneData.clone_name, {params: {ref_name: refName}}).then((data) => {
			const graphData = data.data;
			const nodeIds = graph.nodes.map(node => {
				return node.id;
			});
			const parentId = node.id;
			graphData.nodes.forEach(node => {
				if (!nodeIds.includes(node.id)) {
					node.notInOriginalSearch = true;
				 	graph.nodes.push(node);
				 	nodeIds.push(node.id);
				}
			});
			const edgeIds = [];
			graphData.edges.forEach(edge => {
				edge.source = parentId;
				edge.target = 200000 + edge.target;
				if (!edgeIds.includes(`${edge.source},${edge.target}`)) {
					edge.notInOriginalSearch = true;
					graph.edges.push(edge);
					edgeIds.push(`${edge.source},${edge.target}`)
				}
			});
			
			reloadAndRunSimulation();
			
			node.showingReferences = true;
		});
	}
	
	const showTopicsForNode = () => {
		
		const node = graph.nodes.filter(node => {
			return node.id === selectedID;
		})[0];
		
		if (node.showingTopics) {
			
			const edgesToRemove = [];
			const entityIDs = [];
			graph.edges.forEach(edge => {
				if (edge.label === 'CONTAINS' && edge.notInOriginalSearch) {
					entityIDs.push(edge.target.id);
					edgesToRemove.push(edge.id);
				}
			});

			graph.edges = graph.edges.filter(edge => {
				return !edgesToRemove.includes(edge.id);
			});
			
			graph.nodes = graph.nodes.filter(node => {
				return !entityIDs.includes(node.id);
			});
			
			lockNodeInPlace(node, false);
			reloadAndRunSimulation();
			
			node.showingTopics = false;
			return;
		}
		
		gameChangerAPI.graphQueryPOST(
			'MATCH mt = (d:Document)-[c:CONTAINS]->(:Topic) ' +
			'WHERE d.doc_id = $doc_id RETURN mt;', '5YPYYUX', cloneData.clone_name, {params: {doc_id: node.doc_id}}
		).then((data) => {
			const graphData = data.data;
			const nodeIds = graph.nodes.map(node => {
				return node.id;
			});
			const parentId = node.id;
			graphData.nodes.forEach(tmpNode => {
				if (tmpNode.label === 'Document') {
					tmpNode.id = parentId;
				} else {
					tmpNode.id = 200000 + tmpNode.id;
				}
				if (!nodeIds.includes(tmpNode.id)) {
				 	graph.nodes.push(tmpNode);
				 	nodeIds.push(tmpNode.id);
				}
			});
			const edgeIds = [];
			graphData.edges.forEach(edge => {
				edge.source = parentId;
				edge.target = 200000 + edge.target;
				if (!edgeIds.includes(`${edge.source},${edge.target}`)) {
					edge.notInOriginalSearch = true;
					graph.edges.push(edge);
					edgeIds.push(`${edge.source},${edge.target}`)
				}
			});
			
			lockNodeInPlace(node, true);
			reloadAndRunSimulation();
			
			node.showingTopics = true;
		});
	}
	
	const showChildDocuments = () => {
		
		const node = graph.nodes.filter(node => {
			return node.id === selectedID;
		})[0];
		
		if (node.label === 'Publication') {
			const { filteredGraph } = hideShowChildren(node);
			
			node.showingChildren = !node.showingChildren;

			// Count num of nodes visible
			lockNodeInPlace(node, true);
			setFilteredGraph(filteredGraph);
			doRunSimulation();
		}
	}
	
	const hideShowChildren = (node) => {
		
    	const filteredNodes = filteredGraph.nodes;
		const filteredEdges = filteredGraph.edges;
		
    	// Select or De-Select Collection
		if (node.showingChildren) {
			// Collapse the child nodes
			removeChildren(node.id, filteredNodes, filteredEdges);
			countDocTypes(filteredNodes);
			return {
				filteredGraph: {nodes: filteredNodes, edges: filteredEdges}
			};
		}

		// Expand child nodes
		expandChildren(node.id, filteredNodes, filteredEdges);
		countDocTypes(filteredNodes);

		return{
			filteredGraph: {nodes: filteredNodes, edges: filteredEdges}
		};
	}
	
	const removeChildren = (nodeId, filteredNodes, filteredEdges) => {
		const nodeIsToRemove = [];
		_.forEach(graph.nodes, tmpNode => {
			if (_.includes(collections[nodeId], tmpNode)){
				nodeIsToRemove.push(tmpNode.id);
				_.remove(filteredNodes, (n) => {
					return n === tmpNode;
				});
			}
		});

		_.forEach(graph.edges, (edge) => {
			const sourceHasNode = edge.source.hasOwnProperty('id');
			if(_.includes(nodeIsToRemove, sourceHasNode ? edge.source.id : edge.source)) {
				_.remove(filteredEdges, (n) => {
					return n.id === edge.id;
				});
			}
		});
	};
	
	const expandChildren = (nodeID, filteredNodes, filteredEdges) => {

		const nodeIdsToAdd = [];
		const collectDocIds = collections[nodeID].map(doc => {
			return doc.id;
		})
		
		graph.nodes.forEach(tmpNode => {
			if (collectDocIds.includes(tmpNode.id)){
				filteredNodes.push(tmpNode);
				nodeIdsToAdd.push(tmpNode.id);
			}
		});
		
		// Expand child edges
		graph.edges.forEach((edge) => {
			const sourceHasNode = edge.source.hasOwnProperty('id');
			const targetHasNode = edge.target.hasOwnProperty('id');
			const sourceID = sourceHasNode ? edge.source.id : edge.source;
			const targetID = targetHasNode ? edge.target.id : edge.target;
			if(nodeIdsToAdd.includes(sourceID)) {
				let source;
				let target;
				graph.nodes.forEach(node => {
					if (node.id === sourceID) {
						source = node;
					} else if (node.id === targetID) {
						target = node;
					}
				})
				
				if (target.hasOwnProperty('id') && source.hasOwnProperty('id')) {
					edge.source = source;
					edge.target = target;
					filteredEdges.push(edge);
				}
			}
		});
	};
	
	/**
	 * Graph Legend Functions
	 */
	
	const renderNodeLegendItems = () => {
		return (
			<>
			{ !runningSearch &&
				Object.keys(legendData).sort().map(key => {
					return (
						<GCTooltip key={key} title={`${docOrgNumbers[key]} node${docOrgNumbers[key] > 1 ? 's' : ''} associated`} arrow enterDelay={30}>
							<StyledLegendClickable
								key={legendData[key].name}
								onClick={() => handleLegendNodeClick(key)}
								typeSelected={orgTypeSelected}
								type={key}
							>
								<div style={{
									backgroundColor: legendData[key].color,
									width: '1em',
									height: '1em',
									borderRadius: '50%',
									marginTop: '4px',
								}}>
								</div>
								<div style={{ marginLeft: '2em', width: '80%' }}>{legendData[key].name}</div>
							</StyledLegendClickable>
						</GCTooltip>
					)
				})
			}
			</>
		);
	}
	
	const handleLegendNodeClick = (legendKey) => {
		trackEvent(getTrackingNameForFactory(cloneData.clone_name), 'GraphLegendClicked', legendKey, legendKey !== orgTypeSelected);
		setOrgTypeSelected(legendKey === orgTypeSelected ? null : legendKey);
	}
	
	/**
	 * Graph Functions
	 */
	
	const handleBackgroundClick = (event) => {
		// Close any open context menu
		setContextOpen(false);
		setSelectedID(-1);
	}
	
	const create2dGraphNode = (node, ctx, globalScale) => {
		let outlineThickness = 3;
		let connectedLevel = -1;

		if (highlightNodes.size > 0 && highlightNodes.has(node)) {
			if (_.includes(degreeConnected[0], node)){
				connectedLevel = 0;
			} else if (_.includes(degreeConnected[1], node)) {
				connectedLevel = 1;
			}
			outlineThickness += 2;
		}

		if (_.includes(collections[selectedID], node)) {
			outlineThickness += 2;
		}

		if (selectedID === node.id){
			outlineThickness += 2;
		}
		
		
		const combinedTypes = ['Topic', 'Entity', 'UKN_Document'];
		const nodeType = communityView ? String(node.community) : combinedTypes.includes(node.label) ? node.label : node.orgType;

		const nodeColor = (orgTypeSelected !== null && orgTypeSelected !== nodeType) ?
			convertHexToRgbA(node.color, HIDDEN_NODE_ALPHA) :
			convertHexToRgbA(node.color, NODE_ALPHA);
		const outlineColor = (orgTypeSelected !== null && orgTypeSelected !== nodeType) ?
			getNodeOutlineColors(node, HIDDEN_NODE_ALPHA, node.color, connectedLevel) :
			getNodeOutlineColors(node, NODE_ALPHA, node.color, connectedLevel);

		ctx.beginPath();
		let nodeSize = nodeRelSize;
		if (!detailsView){
			const scalingParam = Math.max(filteredGraph.nodes.length, 150);
			nodeSize =  nodeRelSize + (combinedTypes.includes(node.label) ? 1 : Math.max(((node.pageRank * node.edgePercent) * (scalingParam / zoom)), 1));
		}
		node.nodeSize = nodeSize;

		ctx.fillStyle = nodeColor;
		ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
		ctx.fill();
		ctx.strokeStyle = outlineColor
		ctx.lineWidth = outlineThickness / globalScale;
		ctx.arc(node.x, node.y, nodeSize, 0, 2 * Math.PI, false);
		ctx.stroke();
		
		// Selected/Hovered Outline
		if (node.id === selectedID || node.id === nodeHoverID) {
			ctx.strokeStyle = convertHexToRgbA('#6ac6ff',
				(orgTypeSelected !== null && orgTypeSelected !== nodeType) ? HIDDEN_NODE_ALPHA : NODE_ALPHA);
			ctx.lineWidth = (outlineThickness + 0.5) / globalScale;
			ctx.arc(node.x, node.y, nodeSize + 0.2, 0, 2 * Math.PI, false);
			ctx.stroke();
		}

		handleCreateNodeText(node, ctx, globalScale, null);
	}
	
	const handleCreateNodeText = (node, ctx, globalScale, nodeTextColor) => {
		const label = createNodeLabel(node);
		const MAX_FONT_SIZE = (nodeRelSize / 5) * 1.5
		
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillStyle = nodeTextColor || getTextColorBasedOnBackground(node.color);

		if (label && globalScale > (3 / (nodeRelSize / 5))) {
			const lines = getLines(ctx, label,  node.value * nodeRelSize);
			lines.lines.forEach(function(line, i) {
				const fontSize = Math.min(MAX_FONT_SIZE, (node.value * nodeRelSize + 1.5) / lines.lines.length );
				ctx.font = `${fontSize}px Sans-Serif`;

				const mid = lines.lines.length / 2;
				if (lines.lines.length % 2 === 0) { // Even so no middle
					if (i <= mid) {
						ctx.fillText(line, node.x, node.y - (fontSize * Math.floor(mid - i)) + (lines.lines.length > 1 ? (fontSize / lines.lines.length) : 0));
					} else {
						ctx.fillText(line, node.x, node.y + (fontSize * Math.floor(i - mid)) + (lines.lines.length > 1 ? (fontSize / lines.lines.length) : 0));
					}
				} else { // Odd So middle
					if (i < mid) {
						ctx.fillText(line, node.x, node.y - (fontSize * Math.floor(mid - i)) + (lines.lines.length > 1 ? (fontSize / lines.lines.length) : 0));
					} else {
						ctx.fillText(line, node.x, node.y + (fontSize * Math.floor((i+1) - mid)) + (lines.lines.length > 1 ? (fontSize / lines.lines.length) : 0));
					}
				}
			});
		}
	}
	
	const createNodeLabel = (node) => {
		const useNameOnly = ['Entity', 'Topic', 'UKN_Document'];
		return useNameOnly.includes(node.label) ? node.name : `${node.doc_type} ${node.doc_num}`;
	}
	
	const handleGetLinkColor = (link) => {
		const start = link.source;
		const end = link.target;
		
		if (orgTypeSelected !== null && (start.orgType !== orgTypeSelected || end.orgType !== orgTypeSelected) ) {
			return getLinkColor(link, HIDDEN_NODE_ALPHA);
		} else {
			return getLinkColor(link, LINK_ALPHA);
		}
	}
	
	const resetGraph = () => {
		
		// Remove Remove visible child documents and unlock any locked nodes
		graph.nodes.forEach(node => {
			if (node.label === 'Publication') {
				node.showingChildren = false;
			}
			node.fx = null;
			node.fy = null;
			node.fz = null;
		})
		
		setShouldRender(true);
		setReloadGraph(true);
		setRunSimulation(!runSimulation);
	}
	
	/**
	 * Util Functions
	 */
	
	const countDocTypes = (nodes) => {

		_.forEach(_.keys(docOrgNumbers), key => {
			docOrgNumbers[key] = 0;
		});

		_.forEach(nodes, (node) => {
			if (docOrgNumbers.hasOwnProperty(node.orgType)) {
				docOrgNumbers[node.orgType] += 1;
			} else {
				docOrgNumbers[node.orgType] = 1;
			}
		});

		return docOrgNumbers;
	}
	
	const reloadAndRunSimulation = () => {
		setShouldRender(true);
		setRunSimulation(!runSimulation);
		setReloadGraph(!reloadGraph);
	}
	
	const doRunSimulation = () => {
		setShouldRender(true);
		setRunSimulation(!runSimulation);
	}
	
	const updateNodeSize = (size) => {
		setNodeRelSize(size);
	}
	
	const handleSetCommunityView = (show) => {
		setCommunityView(show);
	}
	
	return (
		<>
			{show2DView &&
				<MemoizedNodeCluster2D renderContextMenu={showNodeContextMenu} runningQuery={runningSearch} cloneData={cloneData}
					graph={filteredGraph} graphRefProp={graph2DRef} createGraphNode={create2dGraphNode}
					onGetLinkColor={handleGetLinkColor} onNodeHover={handleNodeHover} renderNodeLegendItems={renderNodeLegendItems}
					onNodeClick={handleNodeClick} onBackgroundClick={handleBackgroundClick}
					runSimulation={shouldRender} zoomLimit={ZOOM_LIMIT} updateNodeSize={updateNodeSize}
					contextMenuOpen={contextOpen} createNodeLabel={createNodeLabel} reloadGraphProp={reloadGraph}
					resetGraph={() => resetGraph()} runSimulationProp={runSimulation} runningSearch={runningSearch}
					nodeRelativeSizeProp={nodeRelSize} graphWidth={width} graphHeight={height} nodeHoverIDProp={nodeHoverID}
					shouldCenterProp={shouldCenter} handleSetCommunityView={handleSetCommunityView} showCommunities={communityView}
				    showBasic={showBasic} hierarchyView={hierarchyView} onZoom={handleOnZoom}
				/>
			}
			{showGraphCard && <div style={styles.graphCard}>
				{displayGraphCard()}
			</div>}
			{(graphData.nodes.length === 0 && !runningSearch) && (
				<div style={styles.centeredContent}>
					<div style={styles.noResultsMessage}>{NO_RESULTS_MESSAGE}</div>
				</div>
			)}
		</>
	);
}

const styles = {
	centeredContent: {
		position: 'absolute',
		zIndex: '99',
		left: '50%',
		top: '70%',
		transform: 'translate(-50%, -50%)',
	},
	graphCard: {
		position: 'absolute',
		zIndex: '99',
		right: '4%',
		top: '40%',
		backgroundColor: backgroundWhite,
		perspective: '1000px',
		width: 415
	},
	noResultsMessage: {
		fontWeight: 'bold',
		fontSize: '20px',
		margin: 'auto'
	}
};

export const MemoizedPolicyGraphView = React.memo(PolicyGraphView);
