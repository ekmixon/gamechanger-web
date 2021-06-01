import React, { useState, useEffect } from "react";
import _ from 'underscore';
import {grey300} from 'material-ui/styles/colors';
import { IconButton } from '@material-ui/core';
import styled from 'styled-components';
import { Typography } from '@material-ui/core';
import template from './Title 1.png';
import CheveronRightIcon from '@material-ui/icons/ChevronRight';
import CheveronLeftIcon from '@material-ui/icons/ChevronLeft';


const ThumbnailRow = styled.div`
	padding-left: 0;
	font-family: Noto Sans;
	display: flex;
	flex-direction: row;
	margin-bottom: 20px;
`;
const ThumbnailRowItem = styled.rect`
	border: 1px solid ${grey300};
	cursor: pointer;
	color: #386F94;
`;

const GameChangerThumbnailRow = (props) => {
	const {
		links = [],
		title = 'Thumbnail Row',
		onLinkClick = _.noop,
		padding = 0,
	} = props;
	const MAX_PAGE = Math.floor(links.length/4)
	const [page, setPage] = useState(0)
	const [currLinks, setCurrLinks] = useState(links.slice(0,4))

	useEffect(()=> {
		setCurrLinks(links.slice(page*4,page*4+4))
	},[page, links, setCurrLinks])

	return (
		<div>
			<div style={{display:'flex', justifyContent:'space-between'}}>
				<Typography variant="h3" style={{ marginBottom: 10, fontSize: 20 }}>{title}</Typography>
				<div>
					<IconButton onClick={()=>setPage(page-1)} disabled={page===0}>
						<CheveronLeftIcon/>
					</IconButton>
					<IconButton onClick={()=>setPage(page+1)} disabled={page===MAX_PAGE}>
						<CheveronRightIcon/>
					</IconButton>
				</div>
			</div>
			<ThumbnailRow>
			{_.map(currLinks, (link, idx) =>
			<ThumbnailRowItem onClick={() => onLinkClick(link)} style={{marginLeft:idx===0?'0px':'20px'}} key={idx}>
				<img src={template} style={{ width: '225px'}} alt="thumbnail" title={link}/>
			</ThumbnailRowItem> )}
			</ThumbnailRow>
		</div>
	);
}

export default GameChangerThumbnailRow;