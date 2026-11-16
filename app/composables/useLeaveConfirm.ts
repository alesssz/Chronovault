import LeaveDialog from '~/components/LeaveDialog.vue'

/** The question LeaveDialog asks. */
export interface LeaveQuestion {
  /** "Unsaved changes", "Uploads in progress". */
  title: string
  /** What leaving loses. */
  description: string
  /** The button that leaves anyway ("Leave without saving", "Leave"). */
  leaveLabel: string
  /** Offer "Save and leave" too (an editor that can save first). */
  canSave?: boolean
}

/** The answer: save first then leave, leave as it is, or stay on the page. */
export type LeaveAnswer = 'save' | 'leave' | 'stay'

/**
 * Asks in the app's own dialog (LeaveDialog) whether to leave a page that
 * holds unsaved work, for the pages' route-leave guards (useEditForm, the
 * upload page), rather than `window.confirm`, whose grey box offers only OK
 * and Cancel and looks like no other question in the app. Closing the
 * dialog any other way (Esc, a click outside, the Android back button) is
 * "stay". Reloading or closing the tab still gets the browser's own question:
 * `beforeunload` cannot show anything else.
 */
export function useLeaveConfirm(): (question: LeaveQuestion) => Promise<LeaveAnswer> {
  const overlay = useOverlay()
  return async (question) => {
    // A dialog per question, removed once closed: an editor opened many times leaves none behind.
    const dialog = overlay.create(LeaveDialog, { destroyOnClose: true })
    return (await dialog.open(question)) ?? 'stay'
  }
}
