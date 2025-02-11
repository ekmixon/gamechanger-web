import React from 'react';
import PropTypes from 'prop-types';
import UOTDialog from '../common/GCDialog';
import { Typography } from '@material-ui/core'
import '../export/export-results-dialog.css';
import GCButton from "../common/GCButton";

const DocDialog = ({ open, handleClose, doc }) => {
	return (
		<UOTDialog
			open={open}
			title={<Typography variant="h3" display="inline">Selected Doc</Typography>}
			onRequestClose={handleClose}
			width="1000px"
			primaryLabel=''
			primaryAction={() => { }}
		> 
		<div>
			<p style={{fontSize: '12px'}}>{JSON.stringify(doc)}</p>
		</div>
		<div>
			<GCButton
				onClick={handleClose}
			>
				Close
			</GCButton>
		</div>
		</UOTDialog>
	)
}

DocDialog.propTypes = {
	open: PropTypes.bool.isRequired,
	handleClose: PropTypes.func.isRequired,
	doc: PropTypes.object.isRequired
}

export default DocDialog