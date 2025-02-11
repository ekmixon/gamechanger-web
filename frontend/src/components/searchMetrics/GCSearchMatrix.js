import React, {useEffect, useState} from "react";
import PropTypes from 'prop-types';
import styled from "styled-components";
import { trackEvent } from '../telemetry/Matomo';
import {makeStyles} from '@material-ui/core/styles';
import {getTrackingNameForFactory, exactMatch} from '../../gamechangerUtils';
import {setState} from "../../sharedFunctions";
import _ from "lodash";
import SearchMatrixFactory from "../factories/searchMatrixFactory";
import {
	FormControl,
	FormGroup,
	FormControlLabel,
	Checkbox
} from '@material-ui/core';
import CheckBoxOutlineBlankIcon from '@material-ui/icons/CheckBoxOutlineBlank';

const styles = {
	innerContainer: {
		display: 'flex',
		height: '100%',
		flexDirection: 'column'
	},
	cardBody: {
        padding: '10px 0px',
		fontSize: '1.1em',
		fontFamily: 'Noto Sans',
	},
	subHead: {
		fontSize: "1.0em",
		display: 'flex',
		position: 'relative'
	},
	headerColumn: {
		fontSize: "1.0em",
		width: '100%',
		padding: '8px 8px',
		backgroundColor: 'rgb(50,53,64)',
		display: 'flex',
		alignItems: 'center'
	}
};

const useStyles = makeStyles({
	radioButtonLabel: {
		position: 'relative',
		backgroundColor: '#ffffff',
		padding: '5px 10px 10px 10px',
		marginRight: '20px',
		fontSize: '26px',
		height: '90px',
		lineHeight: '150px',
		display: 'block',
		cursor: 'pointer',
		boxSizing: 'border-box',
		borderRadius: '10px',
		border: '2px solid #bdccde',
	},
	titleText: {
		fontWeight: 900,
		fontSize: '14px'
	},
	tipText: {
		maxWidth: '250px',
		width: '250px',
		margin: '0 auto',
		fontSize: '12px',
		lineHeight: '20px'
	},
	optionText: {
		margin: '20px 75px 0px',
		fontSize: '14px',
		lineHeight: '20px'
	},
	dateOptionText: {
		margin: '20px 0px 0px',
		fontSize: '14px',
		lineHeight: '20px'
	},
	title: {
		margin: '20px 75px 0px',
		fontSize: '20px',
		lineHeight: '20px',
		fontWeight: 600
	},
	rootButton: {
		visibility: 'hidden',
		width: '0px',
		padding: '0px',
		border: '0px',
		cursor: 'default'
	},
	filterBox: {
		backgroundColor: '#ffffff',
		borderRadius: '5px',
		padding: '2px',
		border: '2px solid #bdccde',
		pointerEvents: 'none',
		marginLeft: '5px',
		marginRight: '5px'
	},
	checkBox: {
		visibility: 'hidden',
		backgroundColor: '#ffffff',
		borderRadius: '5px',
		padding: '2px',
		border: '2px solid #bdccde',
	},
	checkedButton: {
		'& + $radioButtonLabel': {
			backgroundColor: '#313541',
			boxShadow: '0px 0px 15px grey',
			border: '2px solid #313541',
			borderRadius: '10px',
			'&, $tipText,$titleText': {
				color: '#ffffff'
			},
			'&::after': {
				fontFamily: 'FontAwesome',
				content: "'\\f00c'",
				width: '20px',
				height: '20px',
				lineHeight: '10px',
				borderRadius: '100%',
				fontSize: '15px',
				border: '2px solid #333',
				backgroundColor: '#ffffff',
				color: '#E9691D',
				zIndex: 999,
				position: 'absolute',
				top: '10px',
				right: '10px',
				paddingTop: '3px',
			}
		},
		'& + $checkboxPill': {
			backgroundColor: '#313541',
			boxShadow: '0px 0px 5px grey',
			border: '2px solid #313541',
			borderRadius: '10px',
			color: '#ffffff',
		}
	},
	checkboxPill: {
		width: '145px',
		textAlign: 'center',
		borderRadius: '10px',
		lineHeight: 1.2,
		fontSize: '12px',
		marginBottom: '15px',
		marginRight: '10px',
		border: '2px solid #bdccde',
		backgroundColor: 'white',
		boxSizing: 'border-box',
		color: 'black',
		minHeight: '35px',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center'
	},
	disabledButton: {
		'& + $checkboxPill': {
			backgroundColor: 'rgba(0, 0, 0, 0.38)',
			border: '2px solid grey',
			borderRadius: '10px',
			color: '#ffffff',
		}
	}
});

export const StyledTopEntities = styled.div`
	display: flex;
	margin: ${({ margin }) => margin ? `${margin}` : '0 0 10px 0'};
	flex-flow: wrap;
	
	.entity-div {
		flex-direction: column;
    	display: flex;
		width: 20%;
    	align-items: center;
    	cursor: pointer;
    	margin-top: 10px;
    
		> img {
			width: ${({ width }) => width ? `${width}px` : '80px'};
			height: ${({ height }) => height ? `${height}px` : '80px'};
		}
		
		> span {
			text-align: center;
		}
	}
`;

export const StyledTopTopics = styled.div`
	display: flex;
	margin: ${({ margin }) => margin ? `${margin}` : '0 0 10px 0'};
	flex-flow: wrap;
	
	.topic-button {
		border: none;
		height: 25px;
		border-radius: 15px;
		background-color: white;
		color: black;
		white-space: nowrap;
		text-align: center;
		display: inline-block;
		padding-left: 5px;
		padding-right: 5px;
		margin-left: 6px;
		margin-right: 6px;
		margin-bottom: 3px;
		cursor: pointer;

		> i {
			color: ${({ favorited }) => favorited? '#E9691D' : '#B0B9BE'};
		}
		
		&:hover {
			background-color: #E9691D;
			color: white;
			> i {
				 color: ${({ favorited }) => favorited? '#FFFFFF' : '#B0B9BE'};
			}
		};
	}
`;

export const StyledAddTermButton = styled.button`
	border: none;
	height: 30px;
	border-radius: 15px;
	background-color: white;
	color: black;
	white-space: nowrap;
	text-align: center;
	display: inline-block;
	padding-left: 15px;
	padding-right: 15px;
	margin-left: 6px;
	margin-right: 6px;
	margin-bottom: 6px;
	cursor: pointer;
	border: 1px solid darkgray;

	&:hover {
		background-color: #E9691D;
		color: white;
	};
`;

export default function SearchMatrix(props) {
	
	const {
		context
	} = props;
	
	const {state, dispatch} = context;
	
	const classes = useStyles();

	const [matrixHandler, setMatrixHandler] = useState();
	const [loaded, setLoaded] = useState(false);
	const [expansionTerms, setExpansionTerms] = React.useState([]);

	const comparableExpansion = JSON.stringify(state.expansionDict);
	
	useEffect(() => {
		// Create the factory
		if (state.cloneDataSet && !loaded) {
			const factory = new SearchMatrixFactory(state.cloneData.main_view_module);
			const handler = factory.createHandler();
			
			setMatrixHandler(handler)
			setLoaded(true);
		}
	}, [state, loaded]);

	useEffect(() => {
		// nested arrays of expanded terms from each searchTerm
		let expansion = {};
		if(comparableExpansion) {
			expansion = JSON.parse(comparableExpansion)
		}
		let expandedTerms = Object.values(expansion || {});
		const keys = Object.keys(expansion || {});
		const quotedKeys = keys.map((term) => `"${term}"`);
		const exclude = new Set([...keys, ...quotedKeys]);
		let topFive = new Set();

		while(topFive.size < 7){
			if(expandedTerms.length === 0){
				break;
			}
			const frontArr = expandedTerms[0];
			const term = frontArr.shift();
			const [a, ...rest] = expandedTerms;
			if(!term){
				expandedTerms = [...rest];
			} else {
				if(!exclude.has(term)){
					topFive.add(term);
				}
				expandedTerms = [...rest, a];
			}
		}
		let topFiveArr = Array.from(topFive)
		topFiveArr = topFiveArr.map(term => {return {...term, checked:exactMatch(state.searchText, term.phrase)}})
		setExpansionTerms(topFiveArr);

	}, [state, comparableExpansion]);

	const handleSubmit = (event) => {
		if (event) {
			event.preventDefault();
		}
		let newSearchText = state.searchText.trim()
		expansionTerms.forEach(({phrase, source, checked}) => {
			if(checked && !exactMatch(newSearchText, phrase)) {
				trackEvent(getTrackingNameForFactory(state.cloneData.clone_name), 'QueryExpansion', 'SearchTermAdded', `${phrase}_${source}`);
				newSearchText = newSearchText.trim() ? `${newSearchText} OR ${phrase}` : phrase;
			} 
			else if(!checked && exactMatch(newSearchText,`${phrase}`)) {
				newSearchText = newSearchText.replace(` OR ${phrase}`, "").trim()
			}

		})
		setState(dispatch, { searchText: newSearchText, runSearch: true });
	}

	const handleSelectCategory = (event) => {
		if(state.activeCategoryTab === event.target.name){
			setState(dispatch, { 
				selectedCategories: {...state.selectedCategories, [event.target.name]:event.target.checked},
				activeCategoryTab: 'all'
			})
		}
		setState(dispatch, { selectedCategories: {...state.selectedCategories, [event.target.name]:event.target.checked}})
	}

	const handleAddSearchTerm = (phrase,source,idx) => {
		const temp = _.cloneDeep(expansionTerms)
		temp[idx].checked = !temp[idx].checked
		setExpansionTerms(temp);
	}
	
	const renderCategories = () => {
		return (
			<FormControl style={{ padding: '10px', paddingTop: '10px', paddingBottom: '10px' }}>
				{Object.keys(state.selectedCategories).map(category => {
					return (
						<FormGroup key={`${category}-key`} row style={{ marginBottom: '10px' }}>
							<FormControlLabel
								name={category}
								value={category}
								classes={{ label: classes.titleText }}
								control={<Checkbox
									classes={{ root: classes.filterBox }}
									onClick={handleSelectCategory}
									icon={<CheckBoxOutlineBlankIcon style={{ visibility: 'hidden' }} />}
									checked={state.selectedCategories[category]}
									checkedIcon={<i style={{ color: '#E9691D' }} className="fa fa-check" />}
									name={category}
									style={styles.filterBox}
								/>}
								label={category}
								labelPlacement="end"
								style={styles.titleText}
							/>
						</FormGroup>
					)
				})}
			</FormControl>
		)
	}
	
	return (
		<div className={''} style={{ height: 'fit-content', minWidth: '100%', marginRight: -10 }}>
			<div className={''}>
				<div style={styles.innerContainer}>
					<div style={styles.cardBody} className={`tutorial-step-${state.componentStepNumbers["Advanced Settings"]}`}>
						<div style={styles.innerContainer}>
							{loaded && matrixHandler.getSearchMatrixItems({
								renderCategories,
								state,
								classes,
								dispatch,
								expansionTerms,
								handleAddSearchTerm,
								handleSubmit
							})}
                        </div>
					</div>
				</div> 
			</div>
		</div>
	);
}

SearchMatrix.propTypes = {
	context: PropTypes.shape({
		state: PropTypes.shape({
			expansionDict: PropTypes.object,
			cloneDataSet: PropTypes.bool,
			cloneData: PropTypes.shape({
				main_view_module: PropTypes.string,
				clone_name: PropTypes.string
			}),
			searchText: PropTypes.string,
			activeCategoryTab: PropTypes.string,
			selectedCategories: PropTypes.objectOf(PropTypes.bool),
			componentStepNumbers: PropTypes.objectOf(PropTypes.number)
		})
	})
}