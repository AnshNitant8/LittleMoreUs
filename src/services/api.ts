// Service layer (spec Section 13). The UI talks to the app only through the
// async functions exported here. Product rules live in the service modules
// and src/domain/rules, never in components.
//
// In server mode (see serverMode.ts) the functions the UI calls run on the
// server instead; otherwise they run against this browser's storage.
export * from './api.local'
import * as local from './api.local'
import { overrides, viaServer } from './remote/api'
import { SERVER_MODE } from './serverMode'

type Api = typeof local
function pick<K extends keyof Api>(name: K): Api[K] {
  if (!SERVER_MODE) return local[name]
  return (overrides[name] as Api[K] | undefined) ?? viaServer(name)
}

export const acceptInvitation = pick('acceptInvitation')
export const adminListPayments = pick('adminListPayments')
export const adminListReports = pick('adminListReports')
export const adminReviewReport = pick('adminReviewReport')
export const adminVerifyPayment = pick('adminVerifyPayment')
export const advanceClock = pick('advanceClock')
export const cancelAccountDeletion = pick('cancelAccountDeletion')
export const cancelInvitation = pick('cancelInvitation')
export const cancelOtp = pick('cancelOtp')
export const createGame = pick('createGame')
export const createInteraction = pick('createInteraction')
export const createInvitation = pick('createInvitation')
export const declineInteraction = pick('declineInteraction')
export const declineInvitation = pick('declineInvitation')
export const deleteAccount = pick('deleteAccount')
export const deleteStory = pick('deleteStory')
export const disconnectCouple = pick('disconnectCouple')
export const forgetInvite = pick('forgetInvite')
export const getAiStatus = pick('getAiStatus')
export const getCouple = pick('getCouple')
export const getDraft = pick('getDraft')
export const getEntitlement = pick('getEntitlement')
export const getExplore = pick('getExplore')
export const getHome = pick('getHome')
export const getInteraction = pick('getInteraction')
export const getInvitation = pick('getInvitation')
export const getMe = pick('getMe')
export const getMyInvitation = pick('getMyInvitation')
export const getNextGame = pick('getNextGame')
export const getNextMoment = pick('getNextMoment')
export const getOtpStatus = pick('getOtpStatus')
export const getPreferences = pick('getPreferences')
export const getSession = pick('getSession')
export const getStory = pick('getStory')
export const getSupportRegion = pick('getSupportRegion')
export const listAnalytics = pick('listAnalytics')
export const listInteractions = pick('listInteractions')
export const listNotifications = pick('listNotifications')
export const listStories = pick('listStories')
export const logout = pick('logout')
export const markNotificationsRead = pick('markNotificationsRead')
export const reactToStory = pick('reactToStory')
export const regenerateStory = pick('regenerateStory')
export const rememberInvite = pick('rememberInvite')
export const reportStory = pick('reportStory')
export const requestExport = pick('requestExport')
export const requestOtp = pick('requestOtp')
export const resetAllPrototypeData = pick('resetAllPrototypeData')
export const respondToGame = pick('respondToGame')
export const respondToInteraction = pick('respondToInteraction')
export const resumeGeneration = pick('resumeGeneration')
export const runScheduledJobs = pick('runScheduledJobs')
export const saveDraft = pick('saveDraft')
export const saveStory = pick('saveStory')
export const setSimulatedOffline = pick('setSimulatedOffline')
export const skipInviteStep = pick('skipInviteStep')
export const skipMoment = pick('skipMoment')
export const submitPaymentReference = pick('submitPaymentReference')
export const switchUser = pick('switchUser')
export const testGemini = pick('testGemini')
export const updateCouple = pick('updateCouple')
export const updateFlags = pick('updateFlags')
export const updateMe = pick('updateMe')
export const updatePreferences = pick('updatePreferences')
export const verifyOtp = pick('verifyOtp')
export const withdrawInteraction = pick('withdrawInteraction')
