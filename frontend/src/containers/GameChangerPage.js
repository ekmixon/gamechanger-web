import React, {useContext, useEffect} from 'react';
import './gamechanger.css';
import MainView from "../components/mainView/MainView";
import {getContext} from "../components/factories/contextFactory";
import {setState} from "../sharedFunctions";
import SideNavigation from "../components/navigation/SideNavigation";
import Alerts from "../components/notifications/Alerts";
import Notifications from "../components/notifications/Notifications";
import UserFeedback from "../components/user/UserFeedback";
import {gcOrange} from "../components/common/gc-colors";
import GameChangerAssist from "../components/crowdAssist/GameChangerAssist";
import Tutorial from "../components/tutorial/Tutorial";
import SearchBar from "../components/searchBar/SearchBar";
import GCUserInfoModal from "../components/user/GCUserInfoModal";
import {Snackbar} from "@material-ui/core";

export const gcColors = {
	buttonColor1: '#131E43',
	buttonColor2: '#E9691D'
};

export const scrollToContentTop = () => {
	document.getElementById("game-changer-content-top").scrollIntoView({ behavior: 'smooth', block: "center", inline: "nearest" })
}

const GameChangerPage = (props) => {
	
	const {
		cloneData,
		history,
		jupiter
	} = props;
	
	
	const cloneName = cloneData.clone_name;
	const context = useContext(getContext(cloneName));
	const {state, dispatch} = context;

	useEffect(() => {
		if (!state.cloneDataSet) {
			setState(dispatch, {cloneData: cloneData, cloneDataSet: true});
		}
		
		if (!state.historySet) {
			setState(dispatch, {history: history, historySet: true});
		}

	}, [cloneData, state, dispatch, history]);
	
	return (
		<div className="main-container">
			{state.cloneDataSet &&
				<>
					{/* Side Navigation */}
					<SideNavigation context={context} />
					
					{/* Alerts */}
					<Alerts context={context} />
					
					{/* Notifications */}
					<Notifications context={context} />
					
					{/* User Feedback */}
					<UserFeedback context={context} className="feedback-modal" />
					
					{/* Crowd Sourcing */}
					{ cloneData.show_crowd_source && <GameChangerAssist context={context} primaryColor={gcOrange} /> }
					
					{/* Tutorial Overlay */}
					{ cloneData.show_tutorial && <Tutorial context={context} /> }
					
					{/* Search Banner */}
					{ state.cloneDataSet && <SearchBar context={context} jupiter={jupiter} /> }
					
					<GCUserInfoModal context={context} />
					
					{/* Main View */}
					{state.historySet && <MainView context={context} />}
					
					{/* Snack BAr Messages */}
					<div>
						<Snackbar
							style={{marginTop: 20}}
							anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
							open={state.showSnackbar}
							autoHideDuration={3000}
							onClose={() => setState(dispatch, {showSnackbar: false})}
							message={state.snackBarMsg}
						/>
					</div>
				</>
			}
		</div>
	);
	
};

export default GameChangerPage;
