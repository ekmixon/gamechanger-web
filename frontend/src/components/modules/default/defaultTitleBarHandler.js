import React from "react";
import {Typography} from "@material-ui/core";

const DefaultTitleBarHandler = {
	getTitleBar: (props) => {
		const {
			onTitleClick,
			componentStepNumbers,
			cloneData
		} = props;
		return (
			<div className={`tutorial-step-${componentStepNumbers[`${cloneData.display_name} Title`]}`}
				 onClick={onTitleClick}>
				<Typography variant="h1" style={styles.wording} display="inline">
					{cloneData.display_name}
				</Typography>
				<Typography variant="h6" style={styles.wording} display="inline">
					Powered by GAMECHANGER
				</Typography>
			</div>
		);
	},
	
	getCategoryTabs(props) {
		return <></>
	},
	
	getTitleBarStyle(props) {
		const {
			rawSearchResults,
			pageDisplayed
		} = props;
		return {
			...styles.titleBar,
			borderBottom: (rawSearchResults.length > 0 && pageDisplayed === 'main') ? '2px solid rgb(176, 186, 197)' : ''
		};
	}
}

export default DefaultTitleBarHandler;

const styles = {
	wording: {
		color: '#131E43',
		marginRight: 15
	},
	titleBar: {
		padding: '0 1em',
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
		flex: 1,
		minHeight: 80,
		width: '100%'
	},
};
