// Router for /api/ac routes
const express = require('express');
const router = express.Router();

const { DocumentController } = require('../controllers/documentController');
const { SearchController } = require('../controllers/searchController');
const { ExportHistoryController } = require('../controllers/exportHistoryController');
const { MegaMenuController } = require('../controllers/megaMenuController');
const { UserController } = require('../controllers/userController');
const { FavoritesController } = require('../controllers/favoritesController');
const { CacheController } = require('../controllers/cacheController');
const { CloneController } = require('../controllers/cloneController');
const { DataTrackerController } = require('../controllers/dataTrackerController');
const { AdminController } = require('../controllers/adminController');
const { NotificationController } = require('../controllers/notificationController');
const { TransformerController } = require('../controllers/transformerController');
const { TutorialOverlayController } = require('../controllers/tutorialOverlaysController');
const { TextSuggestionController } = require('../controllers/textSuggestionController');
const { ExternalAPIController } = require('../controllers/externalAPI/externalAPIController');
const { ResponsibilityController } = require('../controllers/responsibilityController');
const { AppStatsController } = require('../controllers/appStatsController');
const { TrendingSearchesController } = require('../controllers/trendingSearchesController');
const { AppSettingsController } = require('../controllers/appSettingsController');
const { FeedbackController } = require('../controllers/feedbackController');

const tutorialOverlay = new TutorialOverlayController();
const document = new DocumentController();
const search = new SearchController();
const exportHistory = new ExportHistoryController();
const user = new UserController();
const favorites = new FavoritesController();
const cache = new CacheController();
const clone = new CloneController();
const dataTracker = new DataTrackerController();
const admin = new AdminController();
const notification = new NotificationController();
const megamenu = new MegaMenuController();
const transformer = new TransformerController();
const textSuggest = new TextSuggestionController();
const apiController = new ExternalAPIController();
const appStatsController = new AppStatsController();
const responsibility = new ResponsibilityController();
const trending = new TrendingSearchesController();
const appSettings = new AppSettingsController();
const feedback = new FeedbackController();

router.post('/documentSearch/download', (req, res) => {
	req.setTimeout(720000);
	search.documentSearchDownload(req, res);
});
router.post('/shortenSearchURL', search.shortenSearchURL);
router.post('/convertTinyURL', search.convertTinyURL);
router.get('/admin/getElasticSearchIndex', search.getElasticSearchIndex);
router.post('/admin/setElasticSearchIndex', search.setElasticSearchIndex);
router.post('/admin/queryEs', search.queryEs);

router.post('/dataTracker/getTrackedData', dataTracker.getTrackedData);
router.post('/dataTracker/getBrowsingLibrary', dataTracker.getBrowsingLibrary);

router.post('/dataTracker/getTrackedSource', dataTracker.getTrackedSource);
router.post('/getCrawlerMetadata', dataTracker.getCrawlerMetadata);

router.get('/admin/getAdminData', admin.getGCAdminData);
router.post('/admin/storeAdminData', admin.storeGCAdminData);
router.post('/admin/deleteAdminData', admin.deleteGCAdminData);

router.get('/getDocumentProperties', document.getDocumentProperties);
router.get('/v2/data/storage/download', document.getPDF);
router.post('/assist/getDocumentsToAnnotate', document.getDocumentsToAnnotate);
router.post('/assist/saveDocumentAnnotationsPOST', document.saveDocumentAnnotations);
router.get('/getThumbnail', document.getThumbnail);

router.post('/responsibilities/get', responsibility.getResponsibilityData);
router.get('/responsibilities/getOtherEntityFilterList', responsibility.getOtherEntResponsibilityFilterList);
router.post('/responsibilities/storeReport', responsibility.storeResponsibilityReports);

router.post('/admin/reloadModels', transformer.reloadModels);
router.get('/admin/downloadDependencies', transformer.downloadDependencies);
router.get('/admin/getAPIInformation', transformer.getAPIInformation);
router.get('/admin/getS3List', transformer.getS3List);
router.get('/admin/getModelsList', transformer.getModelsList);
router.get('/admin/getCurrentTransformer', transformer.getCurrentTransformer);
router.post('/admin/setTransformerModel', transformer.setTransformerModel);
router.post('/admin/downloadCorpus', transformer.downloadCorpus);
router.post('/admin/trainModel', transformer.trainModel);

router.get('/getNotifications', notification.getNotifications);
router.post('/createNotification', notification.createNotification);
router.post('/deleteNotification', notification.deleteNotification);
router.post('/editNotificationActive', notification.editNotificationActive);

router.get('/megamenu/links', megamenu.getLinks);

router.get('/admin/createSearchHistoryCache', cache.createSearchHistoryCache);
router.get('/admin/clearSearchHistoryCache', cache.clearSearchHistoryCache);
router.get('/admin/createAbbreviationsCache', cache.createAbbreviationsCache);
router.get('/admin/clearAbbreviationsCache', cache.clearAbbreviationsCache);
router.get('/admin/getGCCacheStatus', cache.getGCCacheStatus);
router.get('/admin/toggleGCCacheStatus', cache.toggleGCCacheStatus);
router.get('/admin/createGraphDataCache', cache.createGraphDataCache);
router.get('/admin/clearGraphDataCache', cache.clearGraphDataCache);

router.get('/tutorialOverlay', tutorialOverlay.fetchTutorialOverlays);
router.post('/tutorialOverlay/save', tutorialOverlay.saveTutorialOverlays);

router.get('/user/exportHistory', exportHistory.getExportHistory);
router.delete('/user/exportHistory/:historyId', exportHistory.deleteExportHistory);

router.post('/favorites/document', favorites.favoriteDocumentPOST);
router.post('/favorites/search', favorites.favoriteSearchPOST);
router.post('/favorites/checkSearches', favorites.checkFavoritedSearches);
router.post('/favorites/topic', favorites.favoriteTopicPOST);
router.post('/clearFavoriteSearchUpdate', favorites.clearFavoriteSearchUpdate);

router.post('/trending/trendingSearches', trending.trendingSearchesPOST);
router.get('/trending/getTrendingBlacklist', trending.getTrendingBlacklist);
router.post('/trending/setTrendingBlacklist', trending.setTrendingBlacklist);
router.post('/trending/deleteTrendingBlacklist', trending.deleteTrendingBlacklist);

router.get('/user/getUserData', user.getUserData);
router.get('/getUserSettings', user.getUserSettings);
router.post('/setUserBetaStatus', user.setUserBetaStatus);
router.post('/user/submitUserInfo', user.submitUserInfo);
router.get('/getInternalUsers', user.getInternalUsers);
router.post('/addInternalUser', user.addInternalUser);
router.post('/deleteInternalUser', user.deleteInternalUser);
router.post('/sendFeedback', user.sendFeedback);
router.post('/sendClassificationAlert', user.sendClassificationAlert);
router.post('/clearDashboardNotification', user.clearDashboardNotification);
router.get('/updateUserAPIRequestLimit', user.updateUserAPIRequestLimit);
router.get('/admin/populateNewUserId', user.populateNewUserId);

router.post('/textSuggestion', textSuggest.getTextSuggestion);
// router.post('/presearchSuggestion', presearchSuggest.getpresearchSuggestion);

router.get('/admin/getAPIKeyRequests', apiController.getAPIKeyRequests);
router.post('/admin/approveRejectAPIKeyRequest', apiController.approveRejectAPIKeyRequest);
router.post('/admin/revokeAPIKeyRequest', apiController.revokeAPIKeyRequest);
router.post('/createAPIKeyRequest', apiController.createAPIKeyRequest);

router.post('/getAppStats', appStatsController.getAppStats);
router.get('/admin/getSearchPdfMapping', appStatsController.getSearchPdfMapping);

router.get('/appSettings/combinedSearch', appSettings.getCombinedSearchMode);
router.post('/appSettings/combinedSearch', appSettings.setCombinedSearchMode);
router.get('/appSettings/intelligentAnswers', appSettings.getIntelligentAnswersMode);
router.post('/appSettings/intelligentAnswers', appSettings.setIntelligentAnswersMode);
router.get('/appSettings/entitySearch', appSettings.getEntitySearchMode);
router.post('/appSettings/entitySearch', appSettings.setEntitySearchMode);
router.get('/appSettings/userFeedback', appSettings.getUserFeedbackMode);
router.post('/appSettings/userFeedback', appSettings.toggleUserFeedbackMode);
router.get('/appSettings/topicSearch', appSettings.getTopicSearchMode);
router.post('/appSettings/topicSearch', appSettings.setTopicSearchMode);
router.post('/sendFrontendError', appSettings.logFrontendError);

router.post('/sendFeedback/intelligentSearch', feedback.sendIntelligentSearchFeedback);
router.post('/sendFeedback/QA', feedback.sendQAFeedback);
router.get('/sendFeedback/getFeedbackData', feedback.getFeedbackData);


module.exports = router;
