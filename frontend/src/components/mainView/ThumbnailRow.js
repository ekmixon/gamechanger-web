import React, { useState, useEffect, useRef } from "react";
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
const ThumbnailRowItem = styled.div`
	border: 1px solid ${grey300};
	cursor: pointer;
	color: #386F94;
`;

const GameChangerThumbnailRow = (props) => {
	const {
		links = [],
		title = 'Thumbnail Row',
		onLinkClick = _.noop,
		styles,
		thumbnailWidth = 225,
		thumbnailHeight,
		isImgRow = true,
		children
	} = props;
	const [itemsPerPage, setItemsPerPage] = useState(5)
	const [maxPage, setMaxPage] = useState(0)
	const [page, setPage] = useState(0)
	const [currLinks, setCurrLinks] = useState(links.slice(0,5))
	const rowRef = useRef(null);

	// Calculate the max items per page using row width
	useEffect(() => {
		const rowWidth = rowRef.current.offsetWidth;
		const tWidth = parseInt(thumbnailWidth)
		let items = Math.floor(rowWidth/tWidth);
		const thumbnailMargin = (items-1)*20;
		if( rowWidth < (items*tWidth)+thumbnailMargin ){
			items -= 1;
		}
		setMaxPage(Math.ceil(links.length/items)-1);
		setCurrLinks(links.slice(0,items));
		setItemsPerPage(items);

	},[links, setCurrLinks, setMaxPage, setItemsPerPage])

	// Handle Pagination
	useEffect(() => {
		const start = page*itemsPerPage;
		setCurrLinks(links.slice(start, start+itemsPerPage));
	},[page,itemsPerPage, setCurrLinks])

	const childStyles = styles ? styles : {
		thumbnailStyles: {
			width: thumbnailWidth ? thumbnailWidth : '225px',
			height: thumbnailHeight ? thumbnailHeight: null
		}
	}
	
	return (
		<div>
			<div style={{display:'flex', justifyContent:'space-between'}}>
				<Typography variant="h3" style={{ marginBottom: 10, fontSize: 20 }}>{title}</Typography>
				<div>
					{ maxPage > 0 && 
					[<IconButton onClick={()=>setPage(page-1)} disabled={page===0}>
						<CheveronLeftIcon/>
					</IconButton>,
					<IconButton onClick={()=>setPage(page+1)} disabled={page===maxPage}>
						<CheveronRightIcon/>
					</IconButton>]
				}
				</div>
			</div>
			<ThumbnailRow ref={rowRef}>  
			{isImgRow ? 
			_.map(currLinks, (link, idx) =>
			<ThumbnailRowItem onClick={() => onLinkClick(link)} style={{marginLeft:idx===0?'0px':'20px'}} key={idx}>
				<img src={template} style={childStyles.thumbnailStyles} alt="thumbnail" title={link}/>
			</ThumbnailRowItem> )
			:
			children}
			</ThumbnailRow>
		</div>
	);
}

export default GameChangerThumbnailRow;